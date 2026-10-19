import { useMemo } from "react";
import { toast } from "react-toastify";
import { financeRequest } from "services/api/request";
import {
  patchRequest,
  postRequest,
  putRequest,
  queryClient,
  showMutationError,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { todayBusinessDate, toFinanceMember } from "helpers/financeCompliance";
import {
  buildDuesCorrectionPayload,
  buildLevyCorrectionPayload,
  buildRecordPaymentPayload,
} from "helpers/financePayloads";
import { useMembers } from "hooks/useMembers";
import { handleExportError, openExportUrl } from "components/analytics/analyticsExport";
import {
  BulkStartDateResponse,
  ComplianceResponse,
  CorrectionGuard,
  FinanceMember,
  Obligation,
} from "components/finance/financeTypes";

const NO_OBLIGATIONS: Obligation[] = [];

export const useObligations = (
  organisationId: string,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const url = convertParamsToString(financeRequest.LIST_OBLIGATIONS, { organisationId });
  const { data, isLoading, isError, error, refetch } = useQueryWrapper(
    queryKeys.finance.obligations(organisationId),
    url,
    { enabled: enabled && Boolean(organisationId) },
  );
  const obligations: Obligation[] = data?.data ?? NO_OBLIGATIONS;
  return { obligations, hasData: data !== undefined, isLoading, isError, error, refetch };
};

/**
 * Arrears are measured as of the officer's own calendar date, not the
 * server's, so a late-evening view never jumps a month early or late.
 */
const withAsOf = (url: string, asOf: string) => `${url}?asOf=${asOf}`;

export const useCompliance = (organisationId: string, obligationId: string) => {
  const asOf = todayBusinessDate();
  const url = obligationId
    ? withAsOf(
        convertParamsToString(financeRequest.COMPLIANCE, { organisationId, id: obligationId }),
        asOf,
      )
    : "";
  const { data, isLoading, isError, error, refetch, isRefetching, dataUpdatedAt } = useQueryWrapper(
    queryKeys.finance.compliance(organisationId, obligationId, asOf),
    url,
    { enabled: Boolean(organisationId && obligationId) },
  );
  const compliance: ComplianceResponse | undefined = data?.data;
  return {
    compliance,
    isLoading: Boolean(obligationId) && isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    /** When the rows on screen were fetched; tells a reload apart from a stale render. */
    dataUpdatedAt: dataUpdatedAt as number,
  };
};

export type ExportFormat = "excel" | "pdf";
const EXPORT_LABEL: Record<ExportFormat, "Excel" | "PDF"> = { excel: "Excel", pdf: "PDF" };
const EXPORT_URL: Record<ExportFormat, string> = {
  excel: financeRequest.COMPLIANCE_EXPORT_EXCEL,
  pdf: financeRequest.COMPLIANCE_EXPORT_PDF,
};

/**
 * Manual-run export: the backend returns a file URL, opened in a new tab.
 * Sends the same `asOf` as the on-screen report so the figures match.
 */
export const useComplianceExport = (
  organisationId: string,
  obligationId: string,
  format: ExportFormat,
) => {
  const asOf = todayBusinessDate();
  const url = obligationId
    ? withAsOf(
        convertParamsToString(EXPORT_URL[format], { organisationId, id: obligationId }),
        asOf,
      )
    : "";
  const { refetch, isFetching } = useQueryWrapper(
    queryKeys.finance.complianceExport(organisationId, obligationId, format, asOf),
    url,
    {
      enabled: false,
      onSuccess: (response: unknown) => openExportUrl(response, EXPORT_LABEL[format]),
      onError: (err: unknown) => handleExportError(err, EXPORT_LABEL[format]),
    },
  );
  return { run: () => refetch(), isExporting: isFetching };
};

/** Members as finance reads them; shares the canonical members cache. */
export const useFinanceMembers = (organisationId: string) => {
  const { members, isLoading } = useMembers(organisationId);
  const financeMembers = useMemo<FinanceMember[]>(
    () =>
      members
        .map((m) => toFinanceMember(m))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );
  return { members: financeMembers, isLoading };
};

/**
 * Anything that moves money or liability changes compliance rows and the
 * obligation list's summaries — but only for this organisation.
 */
export const invalidateFinance = (organisationId: string) => {
  queryClient.invalidateQueries({ queryKey: queryKeys.finance.complianceRoot(organisationId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.finance.obligations(organisationId) });
};

interface PaymentTarget {
  organisationId: string;
  obligationId: string;
  memberId: string;
}

/**
 * Why the backend did not save a correction:
 * - `conflict` (409): the record, start date or obligation changed after the
 *   editor opened; the officer must review the latest figures.
 * - `outdated` (428): the request lacked a precondition the backend needs,
 *   so this app build is older than the backend.
 * - `unknown` (503, missing/unknown code): the server could not confirm the
 *   outcome. It may have saved. Never resend; reload and check first.
 * - `unavailable` (503, `FINANCE_TRANSACTIONS_UNAVAILABLE`): the database
 *   could not run transactions and nothing was written.
 * - `declined` (400): nothing was written and repeating the same save cannot
 *   succeed (e.g. no payment row yet, legacy duplicate rows).
 */
export type CorrectionRejectionReason = "conflict" | "outdated" | "unknown" | "unavailable" | "declined";

export interface CorrectionRejection {
  reason: CorrectionRejectionReason;
  /** The backend's explanation for a declined correction, when it sent one. */
  message?: string;
}

/** Stable codes on the two 503s only; every other correction error has none. */
export type FinanceCorrectionErrorCode =
  | "FINANCE_TRANSACTIONS_UNAVAILABLE"
  | "FINANCE_CORRECTION_OUTCOME_UNKNOWN";

const CORRECTION_REJECTIONS: Partial<Record<number, CorrectionRejectionReason>> = {
  400: "declined",
  409: "conflict",
  428: "outdated",
};

/** The only 503 that guarantees nothing was written. */
const TRANSACTIONS_UNAVAILABLE: FinanceCorrectionErrorCode = "FINANCE_TRANSACTIONS_UNAVAILABLE";

/** The backend's `{ error }` text, flattened from its array form. */
const correctionErrorMessage = (error: unknown) => {
  const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === "string").join(" ") || undefined;
  }
  return typeof message === "string" ? message : undefined;
};

/** The backend's stable `code`, if it sent one. */
const correctionErrorCode = (error: unknown) => {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === "string" ? code : undefined;
};

const hasResponse = (error: unknown) => !!(error as { response?: unknown } | null)?.response;

const responseStatusOf = (error: unknown) => {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === "number" ? status : undefined;
};

/**
 * The client cannot prove whether the write landed: no response at all
 * (network, timeout, cancellation, lost response), a server-reported timeout,
 * or an unexpected server/proxy failure. The correction-only 503 code is
 * handled separately because it proves nothing was written.
 */
const isAmbiguousOutcome = (error: unknown) => {
  if (!hasResponse(error)) return true;
  const status = responseStatusOf(error);
  return status === undefined || status === 408 || status >= 500;
};

/**
 * A correction's rejection, or undefined when the backend refused it with a
 * deterministic validation error that the default toast can explain.
 */
const correctionRejectionOf = (error: unknown): CorrectionRejectionReason | undefined => {
  // A lost response means the correction may already be stored.
  if (!hasResponse(error)) return "unknown";
  const status = responseStatusOf(error);
  if (status === undefined) return "unknown";
  if (status === 503) {
    return correctionErrorCode(error) === TRANSACTIONS_UNAVAILABLE ? "unavailable" : "unknown";
  }
  // Any other 5xx, or a server-reported timeout, may have been applied.
  if (status === 408 || status >= 500) return "unknown";
  return CORRECTION_REJECTIONS[status];
};

/**
 * Record (POST) and correct (PUT) a member's payment for one obligation.
 * A correction is an absolute overwrite, so it carries the guard of the row
 * the officer saw and is never retried: a rejected one is handed to
 * `onCorrectionRejected` and the officer decides what to do next.
 *
 * A collection is cumulative, so an error that cannot prove the server did
 * nothing is handed to `onRecordOutcomeUnknown` instead of inviting a retry.
 */
export const usePaymentMutations = (
  target: PaymentTarget,
  onSaved: () => void,
  onCorrectionRejected: (rejection: CorrectionRejection) => void,
  onRecordOutcomeUnknown: () => void,
) => {
  const done = () => {
    toast.success("Payment saved");
    invalidateFinance(target.organisationId);
    onSaved();
  };
  const correctionFailed = (error: unknown) => {
    const reason = correctionRejectionOf(error);
    if (!reason) {
      showMutationError(error);
      return;
    }
    // A conflict invalidates because the row moved. An unconfirmed outcome
    // also invalidates because the correction may have been stored and the
    // row on screen may no longer match. Both stay scoped to this organisation.
    if (reason === "conflict" || reason === "unknown") invalidateFinance(target.organisationId);
    onCorrectionRejected({
      reason,
      message: reason === "declined" ? correctionErrorMessage(error) : undefined,
    });
  };
  const recordFailed = (error: unknown) => {
    if (isAmbiguousOutcome(error)) {
      // A repeated collection is a second business action, not a retry: it
      // would add the money again. Refresh this organisation's figures and
      // make the officer check them before recording anything else.
      invalidateFinance(target.organisationId);
      onRecordOutcomeUnknown();
      return;
    }
    showMutationError(error);
  };
  const { mutate: record, isLoading: recording } = useMutationWrapper(postRequest, done, recordFailed);
  const { mutate: correct, isLoading: correcting } = useMutationWrapper(putRequest, done, correctionFailed);
  return {
    record: (amount: number) =>
      record({
        url: financeRequest.PAYMENTS,
        data: buildRecordPaymentPayload({ ...target, amount }),
      }),
    correctDues: (
      monthlyPaid: Record<string, number>,
      replaceUnappliedCredit: boolean,
      expectedCorrectionGuard: CorrectionGuard,
    ) =>
      correct({
        url: financeRequest.PAYMENTS,
        data: buildDuesCorrectionPayload({
          ...target,
          monthlyPaid,
          replaceUnappliedCredit,
          expectedCorrectionGuard,
        }),
      }),
    correctLevy: (amountPaid: number, replaceUnappliedCredit: boolean, expectedCorrectionGuard: CorrectionGuard) =>
      correct({
        url: financeRequest.PAYMENTS,
        data: buildLevyCorrectionPayload({ ...target, amountPaid, replaceUnappliedCredit, expectedCorrectionGuard }),
      }),
    isSaving: recording || correcting,
  };
};

export interface BulkResult {
  ok: number;
  /** Members the backend reported as failed, kept so the officer can retry. */
  failedIds: string[];
  /** The first per-member failure reason, for the summary toast. */
  firstError?: string;
  /** The whole request was rejected; the wrapper has already shown why. */
  rejected: boolean;
}

/**
 * Sets or clears members' financial start dates (finance-owned data). A
 * start-date change shifts liability, which changes how much of each recorded
 * payment applies (payments themselves are untouched), so every finance view
 * of this organisation is refreshed — along with the members list the date
 * lives on.
 */
export const useFinancialStartDate = (organisationId: string) => {
  const { mutateAsync: patchOne, isLoading: savingOne } = useMutationWrapper(patchRequest);
  const { mutateAsync: patchMany, isLoading: savingMany } = useMutationWrapper(patchRequest);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.members(organisationId) });
    invalidateFinance(organisationId);
  };

  /** One member. Resolves true on success; failures are toasted by the wrapper. */
  const setOne = async (memberId: string, date: string | null) => {
    try {
      await patchOne({
        url: convertParamsToString(financeRequest.FINANCIAL_START_DATE, { memberId }),
        data: { organisationId, financialStartDate: date },
      });
      toast.success(date ? "Start date set" : "Start date cleared");
      return true;
    } catch {
      return false;
    } finally {
      refresh();
    }
  };

  /**
   * Many members in one request. Partial success comes back as a 200 with
   * `failed` populated; a rejected request (e.g. validation) is toasted by
   * the wrapper and counts every member as failed.
   */
  const setMany = async (memberIds: readonly string[], date: string): Promise<BulkResult> => {
    try {
      const response = await patchMany({
        url: convertParamsToString(financeRequest.BULK_FINANCIAL_START_DATE, { organisationId }),
        data: { memberIds, financialStartDate: date },
      });
      const result: BulkStartDateResponse | undefined = response?.data;
      const failed = result?.failed ?? [];
      return {
        ok: result?.updated?.length ?? 0,
        failedIds: failed.map((f) => f.memberId),
        firstError: failed[0]?.error,
        rejected: false,
      };
    } catch {
      return { ok: 0, failedIds: [...memberIds], rejected: true };
    } finally {
      refresh();
    }
  };

  return { setOne, setMany, isSaving: savingOne || savingMany };
};

import { useMemo } from "react";
import { toast } from "react-toastify";
import { financeRequest } from "services/api/request";
import {
  patchRequest,
  postRequest,
  putRequest,
  queryClient,
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
  FinanceMember,
  Obligation,
} from "components/finance/financeTypes";

const NO_OBLIGATIONS: Obligation[] = [];

export const useObligations = (organisationId: string) => {
  const url = convertParamsToString(financeRequest.LIST_OBLIGATIONS, { organisationId });
  const { data, isLoading, isError, error, refetch } = useQueryWrapper(
    queryKeys.finance.obligations(organisationId),
    url,
    { enabled: Boolean(organisationId) },
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
  const { data, isLoading, isError, error, refetch, isRefetching } = useQueryWrapper(
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

/** Record (POST) and correct (PUT) a member's payment for one obligation. */
export const usePaymentMutations = (target: PaymentTarget, onSaved: () => void) => {
  const done = () => {
    toast.success("Payment saved");
    invalidateFinance(target.organisationId);
    onSaved();
  };
  const { mutate: record, isLoading: recording } = useMutationWrapper(postRequest, done);
  const { mutate: correct, isLoading: correcting } = useMutationWrapper(putRequest, done);
  return {
    record: (amount: number) =>
      record({
        url: financeRequest.PAYMENTS,
        data: buildRecordPaymentPayload({ ...target, amount }),
      }),
    correctDues: (monthlyPaid: Record<string, number>) =>
      correct({
        url: financeRequest.PAYMENTS,
        data: buildDuesCorrectionPayload({ ...target, monthlyPaid }),
      }),
    correctLevy: (amountPaid: number) =>
      correct({
        url: financeRequest.PAYMENTS,
        data: buildLevyCorrectionPayload({ ...target, amountPaid }),
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
 * start-date change shifts liability and re-applies (or, when cleared,
 * archives) payments, so every finance view of this organisation is
 * refreshed — along with the members list the date lives on.
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

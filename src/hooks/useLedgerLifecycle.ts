import {
  postRequest,
  putRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { financeRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { toLedgerStatus } from "helpers/ledger";
import { toLedgerAuditPage } from "helpers/ledgerLifecycle";
import {
  GapWindowAttestInput,
  LifecycleWriteResult,
  PeriodLockInput,
  SuspendResumeInput,
} from "components/finance/lifecycleTypes";

/**
 * F2A-3B lifecycle reads and writes (F2 Cashbook RFC v0.3 §4.2, §4.6, §4.7).
 *
 * Every key is organisation-scoped and every invalidation uses the ledger
 * prefix for that organisation only. The client sends only the contract
 * fields: the tenant comes from the route and the actor from the token. A
 * 2xx whose body is not a usable status is reported as an unknown result, so
 * no screen claims a suspension, a lock move or an attestation the server
 * did not confirm.
 *
 * `useMutationWrapper`'s hook-level error handler runs even when a per-call
 * handler exists, so a no-op is passed to keep the generic toast out of the
 * lifecycle-specific handling.
 */

const suppressGenericError = () => undefined;

/** The number of audit rows read for the lifecycle panel. */
export const LIFECYCLE_AUDIT_PAGE_SIZE = 20;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** The envelope `{ data: status }`; a malformed body leaves `status` null. */
const toWriteResult = (response: unknown): LifecycleWriteResult => {
  const envelope = asRecord(response);
  return { status: toLedgerStatus(envelope?.data) };
};

export interface LifecycleCallbacks {
  onSuccess?: (result: LifecycleWriteResult) => void;
  onError?: (error: unknown) => void;
}

/** The newest lifecycle audit rows, newest first. */
export const useLedgerAudit = (organisationId: string, enabled: boolean) => {
  const url = `${convertParamsToString(financeRequest.LEDGER_AUDIT, {
    organisationId,
  })}?limit=${LIFECYCLE_AUDIT_PAGE_SIZE}`;
  const { data, isLoading, isError, error, refetch, isFetching } =
    useQueryWrapper(queryKeys.finance.ledger.audit(organisationId), url, {
      enabled: Boolean(organisationId) && enabled,
    });
  const page = toLedgerAuditPage(data?.data);
  return {
    /** null when the audit read failed or its body was not usable. */
    page,
    entries: page?.items ?? null,
    /** Non-null means older rows exist; null when the page is unavailable. */
    nextCursor: page ? page.nextCursor : null,
    hasData: data !== undefined,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};

export const useLedgerLifecycleWrites = (organisationId: string) => {
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.finance.ledger.root(organisationId),
    });

  const suspendMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);
  const resumeMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);
  const lockMutation = useMutationWrapper(putRequest, undefined, suppressGenericError);
  const attestMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);

  const suspendUrl = convertParamsToString(financeRequest.LEDGER_SUSPEND, {
    organisationId,
  });
  const resumeUrl = convertParamsToString(financeRequest.LEDGER_RESUME, {
    organisationId,
  });
  const lockUrl = convertParamsToString(financeRequest.LEDGER_PERIOD_LOCK, {
    organisationId,
  });
  const attestUrl = convertParamsToString(financeRequest.LEDGER_GAP_WINDOW_ATTEST, {
    organisationId,
  });

  const run = (
    mutation: typeof suspendMutation,
    url: string,
    data: SuspendResumeInput | PeriodLockInput | GapWindowAttestInput,
    { onSuccess, onError }: LifecycleCallbacks,
  ) =>
    mutation.mutate(
      { url, data },
      {
        onSettled: invalidate,
        onSuccess: (response: unknown) => onSuccess?.(toWriteResult(response)),
        onError: onError ?? suppressGenericError,
      },
    );

  return {
    suspendLedger: (
      input: SuspendResumeInput,
      callbacks: LifecycleCallbacks = {},
    ) => run(suspendMutation, suspendUrl, input, callbacks),
    resumeLedger: (input: SuspendResumeInput, callbacks: LifecycleCallbacks = {}) =>
      run(resumeMutation, resumeUrl, input, callbacks),
    setPeriodLock: (input: PeriodLockInput, callbacks: LifecycleCallbacks = {}) =>
      run(lockMutation, lockUrl, input, callbacks),
    attestGapWindow: (
      input: GapWindowAttestInput,
      callbacks: LifecycleCallbacks = {},
    ) => run(attestMutation, attestUrl, input, callbacks),
    isSuspending: suspendMutation.isLoading,
    isResuming: resumeMutation.isLoading,
    isSettingLock: lockMutation.isLoading,
    isAttesting: attestMutation.isLoading,
  };
};

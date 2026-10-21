import { useMutationWrapper, useQueryWrapper } from "services/api/apiHelper";
import { financeRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { toLedgerStatus } from "helpers/ledger";
import {
  LifecycleAction,
  lifecycleConfirmation,
  toLedgerAuditPage,
} from "helpers/ledgerLifecycle";
import { savingFor } from "hooks/useLedgerSetup";
import { DurableIntentWrite, sendDurableIntentWrite } from "hooks/useLedgerWriteIntent";
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
 * 2xx whose status does not show the requested change keeps the write intent
 * unresolved, so no screen claims a suspension, a lock move or an attestation
 * the server did not confirm. Writes go through `sendDurableIntentWrite`.
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
    /**
     * True when a response arrived but its body was not a usable audit page
     * (bad items or unreadable pagination). Distinct from "still loading".
     */
    unreadable: data !== undefined && page === null,
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
  // Separate instances keep each control's loading state independent. The
  // intent and the cache reload are owned by the request promise.
  const suspendMutation = useMutationWrapper(sendDurableIntentWrite, undefined, suppressGenericError);
  const resumeMutation = useMutationWrapper(sendDurableIntentWrite, undefined, suppressGenericError);
  const lockMutation = useMutationWrapper(sendDurableIntentWrite, undefined, suppressGenericError);
  const attestMutation = useMutationWrapper(sendDurableIntentWrite, undefined, suppressGenericError);

  const urlFor = (template: string) => convertParamsToString(template, { organisationId });

  /** Only a status that shows the requested change proves it. */
  const confirmsChange =
    (action: LifecycleAction, lockedThrough?: string | null) => (response: unknown) =>
      lifecycleConfirmation({ action, result: toWriteResult(response), lockedThrough }) ===
      "confirmed";

  const run = (
    mutation: typeof suspendMutation,
    write: Omit<DurableIntentWrite, "organisationId">,
    { onSuccess, onError }: LifecycleCallbacks,
  ) =>
    mutation.mutate(
      // The organisation is captured here, when the officer confirms.
      { organisationId, ...write },
      {
        // Screen updates only; the durable write settles without them.
        onSuccess: (response: unknown) => onSuccess?.(toWriteResult(response)),
        onError: onError ?? suppressGenericError,
      },
    );

  return {
    suspendLedger: (input: SuspendResumeInput, callbacks: LifecycleCallbacks = {}) =>
      run(
        suspendMutation,
        {
          action: "suspend-ledger",
          method: "post",
          url: urlFor(financeRequest.LEDGER_SUSPEND),
          data: input,
          confirms: confirmsChange("suspend"),
        },
        callbacks,
      ),
    resumeLedger: (input: SuspendResumeInput, callbacks: LifecycleCallbacks = {}) =>
      run(
        resumeMutation,
        {
          action: "resume-ledger",
          method: "post",
          url: urlFor(financeRequest.LEDGER_RESUME),
          data: input,
          confirms: confirmsChange("resume"),
        },
        callbacks,
      ),
    setPeriodLock: (input: PeriodLockInput, callbacks: LifecycleCallbacks = {}) =>
      run(
        lockMutation,
        {
          action: "set-period-lock",
          method: "put",
          url: urlFor(financeRequest.LEDGER_PERIOD_LOCK),
          data: input,
          confirms: confirmsChange("period-lock", input.lockedThrough),
        },
        callbacks,
      ),
    attestGapWindow: (input: GapWindowAttestInput, callbacks: LifecycleCallbacks = {}) =>
      run(
        attestMutation,
        {
          action: "attest-gap-window",
          method: "post",
          url: urlFor(financeRequest.LEDGER_GAP_WINDOW_ATTEST),
          data: input,
          confirms: confirmsChange("attest-gap-window"),
        },
        callbacks,
      ),
    isSuspending: savingFor(organisationId, suspendMutation),
    isResuming: savingFor(organisationId, resumeMutation),
    isSettingLock: savingFor(organisationId, lockMutation),
    isAttesting: savingFor(organisationId, attestMutation),
  };
};

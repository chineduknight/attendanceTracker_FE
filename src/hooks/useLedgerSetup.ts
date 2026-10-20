import {
  patchRequest,
  postRequest,
  queryClient,
  useMutationWrapper,
} from "services/api/apiHelper";
import { financeRequest } from "services/api/request";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { toLedgerStatus } from "helpers/ledger";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  CreateAccountPayload,
  ledgerApiFailure,
  ledgerWriteOutcomeUnknown,
} from "helpers/ledgerSetup";
import {
  LedgerWriteAction,
  LedgerWriteOutcome,
  beginLedgerWrite,
  readLedgerWriteUncertainty,
  settleLedgerWrite,
} from "helpers/ledgerWriteUncertainty";

/**
 * F2A-2 ledger setup and chart-of-accounts mutations (RFC v0.3 §8.1).
 *
 * Every mutation touches only the current organisation's ledger caches. No
 * mutation posts a journal, activates a ledger or reads a balance.
 *
 * The routes these call are not deployed yet; the UI is gated behind
 * `config/ledgerSetup` and is exercised in tests with mocks.
 */

interface MutationCallbacks<T> {
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
}

/**
 * `useMutationWrapper`'s hook-level `onError` runs on every failure, even when
 * a per-call handler is supplied (the per-call handler runs separately). Its
 * default shows a generic toast, which would appear next to the ledger's own
 * "may or may not have been saved" warning. Passing a no-op at hook level is
 * the only way to suppress it without changing the shared wrapper app-wide.
 */
const suppressGenericError = () => undefined;

/**
 * A ledger configuration write that was never sent: either an earlier write
 * in this organisation is still pending or unresolved (`blocked`), or the
 * browser could not store the pending marker (`storage`). Nothing reached the
 * server, so this is never an unknown outcome.
 */
export class LedgerWriteNotSentError extends Error {
  constructor(readonly reason: "blocked" | "storage") {
    super(`Ledger write not sent (${reason})`);
    this.name = "LedgerWriteNotSentError";
  }
}

export interface DurableLedgerWrite {
  /** Captured when the officer confirmed; the screen may show another org later. */
  organisationId: string;
  action: LedgerWriteAction;
  method: "post" | "patch";
  url: string;
  data: unknown;
}

/**
 * The F3A write lifecycle (review of FE #140). Everything that must outlive
 * the screen happens inside this promise, not in `mutate` callbacks:
 * TanStack Query v4 drops those when the component unmounts (an organisation
 * switch remounts FinanceWorkspace), so a marker written there could be lost.
 *
 * 1. Store this organisation's pending marker; refuse to send without it.
 * 2. Send the request once. Mutations never retry (TanStack's default).
 * 3. Settle the marker: cleared on success or on a refusal that wrote
 *    nothing, latched as unresolved on an ambiguous outcome. A reload before
 *    this point leaves the pending marker, which then reads as unresolved.
 * 4. Reload the sending organisation's ledger caches, and no other.
 */
export const sendDurableLedgerWrite = async ({
  organisationId,
  action,
  method,
  url,
  data,
}: DurableLedgerWrite) => {
  const writeId = beginLedgerWrite(organisationId, action);
  if (!writeId) {
    throw new LedgerWriteNotSentError(
      readLedgerWriteUncertainty(organisationId) ? "blocked" : "storage",
    );
  }
  let outcome: LedgerWriteOutcome = "unknown";
  try {
    const response = await (method === "post" ? postRequest : patchRequest)({ url, data });
    outcome = "confirmed";
    return response;
  } catch (error) {
    outcome = ledgerWriteOutcomeUnknown(ledgerApiFailure(error)) ? "unknown" : "refused";
    throw error;
  } finally {
    settleLedgerWrite(organisationId, writeId, outcome);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.finance.ledger.root(organisationId),
    });
  }
};

export interface UpdateAccountChange {
  /** The account's `revision` from the read shape; required by the backend. */
  expectedRevision: number;
  name?: string;
  active?: boolean;
}

export const useLedgerSetup = (organisationId: string) => {
  // Every write goes through the durable lifecycle: the marker and the reload
  // are owned by the request promise, never by a component callback. Separate
  // mutation instances keep each control's loading state independent.
  const setupMutation = useMutationWrapper(
    sendDurableLedgerWrite,
    undefined,
    suppressGenericError,
  );
  const settingsMutation = useMutationWrapper(
    sendDurableLedgerWrite,
    undefined,
    suppressGenericError,
  );
  // Its own instance so the allocation toggle's loading state never shows on
  // the member-receipts button (both PATCH /settings).
  const allocationsMutation = useMutationWrapper(
    sendDurableLedgerWrite,
    undefined,
    suppressGenericError,
  );
  const memberIncomeAccountMutation = useMutationWrapper(
    sendDurableLedgerWrite,
    undefined,
    suppressGenericError,
  );
  const createAccountsMutation = useMutationWrapper(
    sendDurableLedgerWrite,
    undefined,
    suppressGenericError,
  );
  const updateAccountMutation = useMutationWrapper(
    sendDurableLedgerWrite,
    undefined,
    suppressGenericError,
  );

  const setupUrl = convertParamsToString(financeRequest.LEDGER_SETUP, {
    organisationId,
  });
  const settingsUrl = convertParamsToString(financeRequest.LEDGER_SETTINGS, {
    organisationId,
  });
  const accountsUrl = convertParamsToString(financeRequest.LEDGER_ACCOUNTS, {
    organisationId,
  });
  // The organisation is captured here, when the officer confirms.
  const durableWrite = (
    action: LedgerWriteAction,
    method: DurableLedgerWrite["method"],
    url: string,
    data: unknown,
  ): DurableLedgerWrite => ({ organisationId, action, method, url, data });
  const accountUrl = (accountId: string) =>
    convertParamsToString(financeRequest.LEDGER_ACCOUNT, {
      organisationId,
      accountId,
    });

  const startSetup = (
    memberReceiptsEnabled: boolean,
    { onSuccess, onError }: MutationCallbacks<LedgerStatus | null> = {},
  ) =>
    setupMutation.mutate(
      durableWrite("setup", "post", setupUrl, { memberReceiptsEnabled }),
      {
        // The write response is a status object; it is the only way to see
        // `setup` until GET /status adopts the F2 read shape (F2A-4). If this
        // screen is gone, the durable write still settles its marker.
        onSuccess: (response: { data?: unknown }) =>
          onSuccess?.(toLedgerStatus(response?.data)),
        onError: onError ?? suppressGenericError,
      },
    );

  const enableMemberReceipts = (
    expectedLedgerRevision: number,
    { onSuccess, onError }: MutationCallbacks<LedgerStatus | null> = {},
  ) =>
    settingsMutation.mutate(
      durableWrite("member-receipts", "patch", settingsUrl, {
        expectedLedgerRevision,
        memberReceiptsEnabled: true,
      }),
      {
        onSuccess: (response: { data?: unknown }) =>
          onSuccess?.(toLedgerStatus(response?.data)),
        onError: onError ?? suppressGenericError,
      },
    );

  /**
   * F3-2: switch member money allocations on or off. Exactly one setting per
   * request, never combined with `memberReceiptsEnabled` (the backend refuses
   * both). Durable (`sendDurableLedgerWrite`): the marker and the reload of
   * this organisation's ledger never depend on the screen staying mounted.
   * The callbacks below only update the screen that sent it, if still there.
   */
  const setMemberAllocations = (
    memberAllocationsEnabled: boolean,
    expectedLedgerRevision: number,
    { onSuccess, onError }: MutationCallbacks<LedgerStatus | null> = {},
  ) =>
    allocationsMutation.mutate(
      durableWrite("member-allocations", "patch", settingsUrl, { expectedLedgerRevision, memberAllocationsEnabled }),
      {
        onSuccess: (response: { data?: unknown }) =>
          onSuccess?.(toLedgerStatus(response?.data)),
        onError: onError ?? suppressGenericError,
      },
    );

  /** F3A: create one member income account, durably (one per request). */
  const createMemberIncomeAccount = (
    payload: CreateAccountPayload,
    { onSuccess, onError }: MutationCallbacks<void> = {},
  ) =>
    memberIncomeAccountMutation.mutate(
      durableWrite("create-accounts", "post", accountsUrl, { accounts: [payload] }),
      { onSuccess: () => onSuccess?.(), onError: onError ?? suppressGenericError },
    );

  /** F3A: reactivate an inactive member income account, durably. */
  const reactivateMemberIncomeAccount = (
    account: Pick<LedgerAccount, "id"> & { revision: number },
    { onSuccess, onError }: MutationCallbacks<void> = {},
  ) =>
    memberIncomeAccountMutation.mutate(
      durableWrite("update-account", "patch", accountUrl(account.id), { expectedRevision: account.revision, active: true }),
      { onSuccess: () => onSuccess?.(), onError: onError ?? suppressGenericError },
    );

  // A durable write keeps running after an organisation switch; it is only
  // "saving" for the organisation that sent it.
  const savingHere = (mutation: { isLoading?: boolean; variables?: DurableLedgerWrite }) =>
    Boolean(mutation.isLoading) && mutation.variables?.organisationId === organisationId;

  const createAccounts = (
    accounts: CreateAccountPayload[],
    { onSuccess, onError }: MutationCallbacks<void> = {},
  ) =>
    createAccountsMutation.mutate(
      durableWrite("create-accounts", "post", accountsUrl, { accounts }),
      {
        onSuccess: () => onSuccess?.(),
        onError: onError ?? suppressGenericError,
      },
    );

  const updateAccount = (
    accountId: string,
    change: UpdateAccountChange,
    { onSuccess, onError }: MutationCallbacks<void> = {},
  ) => {
    const { expectedRevision, ...fields } = change;
    return updateAccountMutation.mutate(
      durableWrite("update-account", "patch", accountUrl(accountId), {
        expectedRevision,
        ...fields,
      }),
      {
        onSuccess: () => onSuccess?.(),
        onError: onError ?? suppressGenericError,
      },
    );
  };

  return {
    startSetup,
    enableMemberReceipts,
    setMemberAllocations,
    createMemberIncomeAccount,
    reactivateMemberIncomeAccount,
    createAccounts,
    updateAccount,
    isStarting: savingHere(setupMutation),
    isEnablingReceipts: savingHere(settingsMutation),
    isChangingAllocations: savingHere(allocationsMutation),
    isSavingMemberIncomeAccount: savingHere(memberIncomeAccountMutation),
    isCreatingAccounts: savingHere(createAccountsMutation),
    isUpdatingAccount: savingHere(updateAccountMutation),
  };
};

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
import { LedgerStatus } from "components/finance/ledgerTypes";
import { CreateAccountPayload } from "helpers/ledgerSetup";

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

export interface UpdateAccountChange {
  /** The account's `revision` from the read shape; required by the backend. */
  expectedRevision: number;
  name?: string;
  active?: boolean;
}

export const useLedgerSetup = (organisationId: string) => {
  // One prefix invalidation covers status, accounts and journals for this
  // organisation only; other tenants' caches are never touched.
  const invalidateLedger = () =>
    queryClient.invalidateQueries({
      queryKey: queryKeys.finance.ledger.root(organisationId),
    });

  const setupMutation = useMutationWrapper(postRequest, undefined, suppressGenericError);
  const settingsMutation = useMutationWrapper(patchRequest, undefined, suppressGenericError);
  const createAccountsMutation = useMutationWrapper(
    postRequest,
    undefined,
    suppressGenericError,
  );
  const updateAccountMutation = useMutationWrapper(
    patchRequest,
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
      { url: setupUrl, data: { memberReceiptsEnabled } },
      {
        onSettled: invalidateLedger,
        // The write response is a status object; it is the only way to see
        // `setup` until GET /status adopts the F2 read shape (F2A-4).
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
      {
        url: settingsUrl,
        data: { expectedLedgerRevision, memberReceiptsEnabled: true },
      },
      {
        onSettled: invalidateLedger,
        onSuccess: (response: { data?: unknown }) =>
          onSuccess?.(toLedgerStatus(response?.data)),
        onError: onError ?? suppressGenericError,
      },
    );

  const createAccounts = (
    accounts: CreateAccountPayload[],
    { onSuccess, onError }: MutationCallbacks<void> = {},
  ) =>
    createAccountsMutation.mutate(
      { url: accountsUrl, data: { accounts } },
      {
        onSettled: invalidateLedger,
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
      { url: accountUrl(accountId), data: { expectedRevision, ...fields } },
      {
        onSettled: invalidateLedger,
        onSuccess: () => onSuccess?.(),
        onError: onError ?? suppressGenericError,
      },
    );
  };

  return {
    startSetup,
    enableMemberReceipts,
    createAccounts,
    updateAccount,
    isStarting: Boolean(setupMutation.isLoading),
    isEnablingReceipts: Boolean(settingsMutation.isLoading),
    isCreatingAccounts: Boolean(createAccountsMutation.isLoading),
    isUpdatingAccount: Boolean(updateAccountMutation.isLoading),
  };
};

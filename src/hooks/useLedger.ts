import { financeRequest } from "services/api/request";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  toLedgerAccounts,
  toLedgerJournals,
  toLedgerStatus,
} from "helpers/ledger";

/**
 * Read-only finance ledger queries (F1). Every key is tenant-scoped and every
 * request is a GET; this foundation has no write side.
 */

export const useLedgerStatus = (organisationId: string) => {
  const url = convertParamsToString(financeRequest.LEDGER_STATUS, {
    organisationId,
  });
  const { data, isLoading, isError, error, refetch, isFetching } =
    useQueryWrapper(queryKeys.finance.ledger.status(organisationId), url, {
      enabled: Boolean(organisationId),
    });
  return {
    /** null when the body is missing or not a shape this build understands. */
    status: toLedgerStatus(data?.data),
    hasData: data !== undefined,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};

/**
 * Accounts are only requested once a valid status exists, so an older
 * backend that lacks the ledger endpoints produces one neutral 404 instead
 * of three. A `not_active` status still reads the (empty) list so a real
 * account can never be hidden behind the gated explanation.
 */
export const useLedgerAccounts = (organisationId: string, enabled: boolean) => {
  const url = convertParamsToString(financeRequest.LEDGER_ACCOUNTS, {
    organisationId,
  });
  const { data, isLoading, isError, error, refetch, isFetching } =
    useQueryWrapper(queryKeys.finance.ledger.accounts(organisationId), url, {
      enabled: Boolean(organisationId) && enabled,
    });
  return {
    accounts: toLedgerAccounts(data?.data),
    hasData: data !== undefined,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};

export const useLedgerJournals = (organisationId: string, enabled: boolean) => {
  const url = convertParamsToString(financeRequest.LEDGER_JOURNALS, {
    organisationId,
  });
  const { data, isLoading, isError, error, refetch, isFetching } =
    useQueryWrapper(queryKeys.finance.ledger.journals(organisationId), url, {
      enabled: Boolean(organisationId) && enabled,
    });
  return {
    journals: toLedgerJournals(data?.data),
    hasData: data !== undefined,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};

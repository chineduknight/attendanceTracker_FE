import { financeRequest } from "services/api/request";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  CASHBOOK_PAGE_SIZE,
  reportQuery,
  toBalancesReport,
  toCashbookPage,
  toSummaryReport,
} from "helpers/ledgerReports";

/**
 * F2B-4 report reads (`finance.view`, GET only). Every key is scoped to the
 * organisation and carries each report parameter, so a page, window or date
 * never answers for another, and every key sits under `ledger.root` so ledger
 * writes refresh these for that organisation only.
 *
 * No `keepPreviousData`: after a filter change the old window's figures are
 * not shown while the new ones load. No polling: reports refresh on the
 * root invalidation each ledger write already performs (and React Query's
 * normal refetch on focus).
 */

/** What every report view needs to show its data and how fresh it is. */
export interface ReportQueryState<T> {
  /** null when nothing loaded yet, or the body is not a shape this build understands. */
  report: T | null;
  hasData: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  isFetching: boolean;
  /** When the shown data was received (ms); 0 before the first success. */
  dataUpdatedAt: number;
}

const reportQueryState = <T>(
  query: Omit<ReportQueryState<T>, "report" | "hasData"> & { data: unknown },
  report: T | null,
): ReportQueryState<T> => ({
  report,
  hasData: query.data !== undefined,
  isLoading: query.isLoading,
  isError: query.isError,
  error: query.error,
  refetch: query.refetch,
  isFetching: query.isFetching,
  dataUpdatedAt: query.dataUpdatedAt,
});

export interface CashbookParams {
  /** "" for no lower bound. */
  from: string;
  /** "" for no upper bound. */
  to: string;
  /** "" for the first page. */
  cursor: string;
}

export const useLedgerCashbook = (
  organisationId: string,
  accountId: string,
  params: CashbookParams,
  enabled: boolean,
) => {
  const keyParams = { ...params, limit: CASHBOOK_PAGE_SIZE };
  const url =
    convertParamsToString(financeRequest.LEDGER_CASHBOOK, { organisationId, accountId }) +
    reportQuery({
      from: params.from,
      to: params.to,
      limit: CASHBOOK_PAGE_SIZE,
      cursor: params.cursor,
    });
  const query = useQueryWrapper(
    queryKeys.finance.ledger.cashbook(organisationId, accountId, keyParams),
    url,
    { enabled: enabled && Boolean(organisationId) && Boolean(accountId) },
  );
  return reportQueryState(query, toCashbookPage(query.data?.data, accountId));
};

/** `asOf` "" asks for the server's default: today in Lagos. */
export const useLedgerBalances = (organisationId: string, asOf: string, enabled: boolean) => {
  const url =
    convertParamsToString(financeRequest.LEDGER_BALANCES, { organisationId }) +
    reportQuery({ asOf });
  const query = useQueryWrapper(queryKeys.finance.ledger.balances(organisationId, asOf), url, {
    enabled: enabled && Boolean(organisationId),
  });
  return reportQueryState(query, toBalancesReport(query.data?.data));
};

/** "" for either end asks for the server's default (opening date / today). */
export const useLedgerSummary = (
  organisationId: string,
  from: string,
  to: string,
  enabled: boolean,
) => {
  const url =
    convertParamsToString(financeRequest.LEDGER_SUMMARY, { organisationId }) +
    reportQuery({ from, to });
  const query = useQueryWrapper(queryKeys.finance.ledger.summary(organisationId, from, to), url, {
    enabled: enabled && Boolean(organisationId),
  });
  return reportQueryState(query, toSummaryReport(query.data?.data));
};

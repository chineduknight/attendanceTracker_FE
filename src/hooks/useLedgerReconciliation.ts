import { financeRequest } from "services/api/request";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { reportQuery } from "helpers/ledgerReports";
import {
  RECONCILIATION_PAGE_SIZE,
  toAllocationHistoryPage,
  toPositionsReport,
  toReconciliationSummary,
  toSourcesReport,
} from "helpers/ledgerReconciliation";
import { ReportQueryState } from "hooks/useLedgerReports";
import { LinkedAllocation, linkedAllocationOf } from "helpers/f0AllocationWarning";

/**
 * F3-4 allocation and reconciliation reads (`finance.view`, GET only).
 *
 * Every key is scoped to the organisation and carries every parameter, so a
 * filter, date or page never answers for another, and every key sits under
 * `ledger.root`: ledger writes refresh them for that organisation only. The
 * three reconciliation keys also sit under `ledger.reconciliation`, which F0
 * writes refresh, because positions read current F0 values.
 *
 * No `keepPreviousData`: after a filter change the old figures are not shown
 * while the new ones load.
 */

const stateOf = <T>(
  query: {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    isFetching: boolean;
    isFetchedAfterMount: boolean;
    dataUpdatedAt: number;
  },
  report: T | null,
): ReportQueryState<T> => ({
  report,
  hasData: query.data !== undefined,
  isLoading: query.isLoading,
  isError: query.isError,
  error: query.error,
  refetch: query.refetch,
  isFetching: query.isFetching,
  isFetchedAfterMount: query.isFetchedAfterMount,
  dataUpdatedAt: query.dataUpdatedAt,
});

export interface AllocationHistoryParams {
  sourceId: string;
  memberId: string;
  obligationId: string;
  from: string;
  to: string;
  cursor: string;
}

export const EMPTY_ALLOCATION_FILTERS: AllocationHistoryParams = {
  sourceId: "",
  memberId: "",
  obligationId: "",
  from: "",
  to: "",
  cursor: "",
};

export const useAllocationHistory = (
  organisationId: string,
  params: AllocationHistoryParams,
  enabled: boolean,
) => {
  const url =
    convertParamsToString(financeRequest.LEDGER_ALLOCATIONS, { organisationId }) +
    reportQuery({ ...params, limit: RECONCILIATION_PAGE_SIZE });
  const query = useQueryWrapper(queryKeys.finance.ledger.allocations(organisationId, params), url, {
    enabled: enabled && Boolean(organisationId),
  });
  return stateOf(query, toAllocationHistoryPage(query.data?.data));
};

export interface SourcesParams {
  /** "" asks for the server default (today in Lagos), which carries suggestions. */
  asOf: string;
  /** "true", "false" or "" (the server default: every source). */
  open: string;
  minAgeDays: string;
  cursor: string;
}

export const useReconciliationSources = (
  organisationId: string,
  params: SourcesParams,
  enabled: boolean,
) => {
  const url =
    convertParamsToString(financeRequest.LEDGER_RECONCILIATION_SOURCES, { organisationId }) +
    reportQuery({ ...params, limit: RECONCILIATION_PAGE_SIZE });
  const query = useQueryWrapper(
    queryKeys.finance.ledger.reconciliationSources(organisationId, params),
    url,
    { enabled: enabled && Boolean(organisationId) },
  );
  return stateOf(query, toSourcesReport(query.data?.data));
};

export interface PositionsParams {
  obligationId: string;
  memberId: string;
  flag: string;
  cursor: string;
}

export const usePositions = (
  organisationId: string,
  params: PositionsParams,
  enabled: boolean,
  { limit = RECONCILIATION_PAGE_SIZE }: { limit?: number } = {},
) => {
  const url =
    convertParamsToString(financeRequest.LEDGER_RECONCILIATION_POSITIONS, { organisationId }) +
    reportQuery({ ...params, limit });
  const query = useQueryWrapper(
    queryKeys.finance.ledger.reconciliationPositions(organisationId, params),
    url,
    // Positions read current F0: always re-read when a screen that needs one
    // mounts, never trust a cached copy from before an F0 change.
    { enabled: enabled && Boolean(organisationId), refetchOnMount: "always" },
  );
  return stateOf(query, toPositionsReport(query.data?.data));
};

export interface SummaryParams {
  from: string;
  to: string;
  minAgeDays: string;
}

export const useReconciliationSummary = (
  organisationId: string,
  params: SummaryParams,
  enabled: boolean,
) => {
  const url =
    convertParamsToString(financeRequest.LEDGER_RECONCILIATION_SUMMARY, { organisationId }) +
    reportQuery({ ...params });
  const query = useQueryWrapper(
    queryKeys.finance.ledger.reconciliationSummary(organisationId, params),
    url,
    { enabled: enabled && Boolean(organisationId) },
  );
  return stateOf(query, toReconciliationSummary(query.data?.data));
};

/**
 * O11(b): what the ledger has allocated to one F0 position, for the
 * read-only correction warning. Read fresh whenever the correction editor
 * opens; never written, never used to refuse anything.
 */
export const useLinkedAllocation = (
  organisationId: string,
  obligationId: string,
  memberId: string,
  enabled: boolean,
): LinkedAllocation | undefined => {
  const query = usePositions(
    organisationId,
    { obligationId, memberId, flag: "", cursor: "" },
    enabled && Boolean(obligationId && memberId),
  );
  if (!enabled) return undefined;
  if (!obligationId || !memberId) return { kind: "unavailable" };
  return linkedAllocationOf({
    report: query.report,
    isFetching: query.isFetching,
    isFetchedAfterMount: query.isFetchedAfterMount === true,
    isError: query.isError,
    memberId,
    obligationId,
  });
};

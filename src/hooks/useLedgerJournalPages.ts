import { useInfiniteQuery } from "@tanstack/react-query";
import axiosInstance from "services/api";
import { queryKeys } from "services/api/queryKeys";
import { financeRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { reportQuery } from "helpers/ledgerReports";
import { JournalDetail, toJournalDetail } from "helpers/ledgerReversals";
import { JournalFilters } from "helpers/booksTransactions";

export const JOURNAL_PAGE_SIZE = 50;

export const JOURNALS_UNREADABLE_MESSAGE =
  "The server's list of transactions couldn't be read, so none are shown.";

const toJournalPage = (value: unknown): { items: JournalDetail[]; nextCursor: string | null } | null => {
  const raw = value as { items?: unknown; nextCursor?: unknown } | null;
  if (!raw || !Array.isArray(raw.items)) return null;
  const items = raw.items.map(toJournalDetail);
  // One unreadable item makes the page unreadable: never show a page that
  // silently dropped an entry.
  if (items.some((entry) => entry === null)) return null;
  const nextCursor = typeof raw.nextCursor === "string" && raw.nextCursor ? raw.nextCursor : null;
  return { items: items as JournalDetail[], nextCursor };
};

/**
 * Books transactions from the paged journal read. Every filter is applied by
 * the server, and `hasMore` follows the server's cursor, so the list never
 * implies it is complete while pages remain.
 */
export const useLedgerJournalPages = (
  organisationId: string,
  filters: JournalFilters,
  enabled: boolean,
  limit = JOURNAL_PAGE_SIZE,
) => {
  const baseUrl = convertParamsToString(financeRequest.LEDGER_JOURNALS, { organisationId });
  const query = useInfiniteQuery(
    queryKeys.finance.ledger.journalPages(organisationId, filters, limit),
    async ({ pageParam }: { pageParam?: string }) => {
      const response = await axiosInstance.get(
        baseUrl +
          reportQuery({
            pagination: "cursor",
            limit,
            sourceType: filters.sourceType,
            accountId: filters.accountId,
            from: filters.from,
            to: filters.to,
            cursor: pageParam,
          }),
      );
      const page = toJournalPage(response?.data?.data);
      if (!page) throw new Error(JOURNALS_UNREADABLE_MESSAGE);
      return page;
    },
    {
      enabled: Boolean(organisationId) && enabled,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );
  return {
    /** null until the first page is read. */
    items: query.data ? query.data.pages.flatMap((page) => page.items) : null,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => void query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
};

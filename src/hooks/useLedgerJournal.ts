import { financeRequest } from "services/api/request";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { convertParamsToString } from "helpers/stringManipulations";
import { toJournalDetail } from "helpers/ledgerReversals";

/**
 * One journal's detail (`GET /ledger/journals/:journalId`, `finance.view`),
 * keyed by organisation and journal. It carries the reversal links the
 * journal list's F1 shape does not.
 */
export const useLedgerJournal = (organisationId: string, journalId: string | null) => {
  const url = convertParamsToString(financeRequest.LEDGER_JOURNAL, {
    organisationId,
    journalId: journalId ?? "",
  });
  const { data, isLoading, isError, error, refetch, isFetching } = useQueryWrapper(
    queryKeys.finance.ledger.journal(organisationId, journalId ?? ""),
    url,
    { enabled: Boolean(organisationId) && Boolean(journalId) },
  );
  return {
    /** null when not loaded yet or not a shape this build understands. */
    journal: toJournalDetail(data?.data),
    hasData: data !== undefined,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
};

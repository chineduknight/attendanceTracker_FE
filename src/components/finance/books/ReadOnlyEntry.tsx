import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { LedgerAccount } from "components/finance/ledgerTypes";
import JournalDetailCard from "components/finance/reversals/JournalDetailCard";
import { useLedgerJournal } from "hooks/useLedgerJournal";

/**
 * One entry's details, read-only: what the entry screen shows while the
 * reversals gate is off (no undo is offered then).
 */
const ReadOnlyEntry = ({
  organisationId,
  journalId,
  accounts,
  onOpenJournal,
}: {
  organisationId: string;
  journalId: string | null;
  accounts: readonly LedgerAccount[] | null;
  onOpenJournal: (journalId: string) => void;
}) => {
  const query = useLedgerJournal(organisationId, journalId);
  if (!journalId) return null;
  if (query.isLoading) return <PageLoader h="160px" label="Loading entry..." />;
  if (query.isError && !query.journal) {
    return (
      <ErrorState
        title="Couldn't load this entry"
        description={errorMessage(query.error)}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (!query.journal) return <EmptyState title="This entry isn't available" />;
  return <JournalDetailCard journal={query.journal} accounts={accounts} onOpenJournal={onOpenJournal} />;
};

export default ReadOnlyEntry;

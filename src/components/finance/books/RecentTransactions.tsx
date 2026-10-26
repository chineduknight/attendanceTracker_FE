import { Button, Flex, Stack, Text } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { LedgerAccount } from "components/finance/ledgerTypes";
import TransactionList from "components/finance/books/TransactionList";
import { EMPTY_JOURNAL_FILTERS } from "helpers/booksTransactions";
import { useLedgerJournalPages } from "hooks/useLedgerJournalPages";

export const RECENT_COUNT = 5;

/** The latest Books entries: the first page of the paged read, five rows. */
const RecentTransactions = ({
  organisationId,
  accounts,
  enabled,
  onSeeAll,
  onOpen,
}: {
  organisationId: string;
  accounts: readonly LedgerAccount[];
  enabled: boolean;
  onSeeAll: () => void;
  onOpen: (journalId: string) => void;
}) => {
  const pages = useLedgerJournalPages(organisationId, EMPTY_JOURNAL_FILTERS, enabled, RECENT_COUNT);
  const recent = pages.items?.slice(0, RECENT_COUNT) ?? null;

  return (
    <Stack gap={2} as="section" aria-label="Recent">
      <Flex justify="space-between" align="center">
        <Text as="h3" fontWeight="semibold">
          Recent
        </Text>
        <Button variant="ghost" size="sm" minH="44px" onClick={onSeeAll}>
          See all
        </Button>
      </Flex>
      {pages.isLoading ? (
        <PageLoader h="120px" label="Loading transactions..." />
      ) : pages.isError && !recent ? (
        <ErrorState
          title="Couldn't load transactions"
          description={errorMessage(pages.error)}
          onRetry={() => pages.refetch()}
          retrying={pages.isFetching}
        />
      ) : !recent?.length ? (
        <EmptyState title="No transactions yet" description="Money in, money out and transfers will show here." />
      ) : (
        <TransactionList journals={recent} accounts={accounts} onOpen={onOpen} label="Recent transactions" />
      )}
    </Stack>
  );
};

export default RecentTransactions;

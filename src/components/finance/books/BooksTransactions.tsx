import { useState } from "react";
import { Button, Field, Flex, Stack, Text, chakra } from "@chakra-ui/react";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { DateField } from "components/ui/date-field";
import { OptionSelect } from "components/ui/themed-select";
import FinanceSheet from "components/finance/FinanceSheet";
import { LedgerAccount } from "components/finance/ledgerTypes";
import TransactionList from "components/finance/books/TransactionList";
import { EMPTY_JOURNAL_FILTERS, JournalFilters, typeChips } from "helpers/booksTransactions";
import { todayInLagos } from "helpers/openingBalances";
import { useLedgerJournalPages } from "hooks/useLedgerJournalPages";

/**
 * Every Books entry, newest first, a page at a time. Each filter goes to the
 * server, and the footer only says the list is complete when the server's
 * cursor says so.
 */
const BooksTransactions = ({
  organisationId,
  accounts,
  enabled,
  memberReceipts,
  allocations,
  onOpen,
}: {
  organisationId: string;
  accounts: readonly LedgerAccount[];
  enabled: boolean;
  memberReceipts: boolean;
  allocations: boolean;
  onOpen?: (journalId: string) => void;
}) => {
  const [filters, setFilters] = useState<JournalFilters>(EMPTY_JOURNAL_FILTERS);
  const [draft, setDraft] = useState<JournalFilters>(EMPTY_JOURNAL_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pages = useLedgerJournalPages(organisationId, filters, enabled);
  const chips = typeChips({ memberReceipts, allocations });
  const narrowed = Boolean(filters.accountId || filters.from || filters.to);

  return (
    <Stack gap={3}>
      <Flex
        role="radiogroup"
        aria-label="Type of entry"
        gap={2}
        overflowX="auto"
        pb={1}
        css={{ scrollbarWidth: "none" }}
      >
        {chips.map((chip) => {
          const selected = chip.sourceType === filters.sourceType;
          return (
            <chakra.button
              key={chip.label}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setFilters((current) => ({ ...current, sourceType: chip.sourceType }))}
              flexShrink={0}
              minH="44px"
              px={4}
              borderRadius="full"
              borderWidth="1px"
              borderColor={selected ? "teal.solid" : "border"}
              bg={selected ? "teal.solid" : "bg.panel"}
              color={selected ? "teal.contrast" : "fg"}
              fontWeight="medium"
              cursor="pointer"
            >
              {chip.label}
            </chakra.button>
          );
        })}
      </Flex>
      <Flex justify="space-between" align="center" gap={2}>
        <Text fontSize="sm" color="fg.muted">
          {narrowed ? "Filtered by account or date" : "All accounts and dates"}
        </Text>
        <Button
          variant="outline"
          minH="44px"
          onClick={() => {
            setDraft(filters);
            setFiltersOpen(true);
          }}
        >
          Filter
        </Button>
      </Flex>

      {pages.isLoading ? (
        <PageLoader h="160px" label="Loading transactions..." />
      ) : pages.isError && !pages.items ? (
        <ErrorState
          title="Couldn't load transactions"
          description={errorMessage(pages.error)}
          onRetry={() => pages.refetch()}
          retrying={pages.isFetching}
        />
      ) : !pages.items?.length ? (
        <EmptyState title="No transactions match" description="Try another type, account or date." />
      ) : (
        <TransactionList
          journals={pages.items}
          accounts={accounts}
          onOpen={onOpen ?? (() => undefined)}
          label="Transactions"
        />
      )}

      {/* A page after the first failed: the rows already shown stay, and Load
          more retries it. */}
      {pages.items && pages.isError && (
        <Stack role="alert" gap={0.5} borderWidth="1px" borderColor="border.error" borderRadius="md" p={3}>
          <Text fontSize="sm" fontWeight="semibold">
            Couldn't load more transactions
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {errorMessage(pages.error)}
          </Text>
        </Stack>
      )}

      {pages.items && (
        pages.hasMore ? (
          <Button variant="outline" minH="44px" loading={pages.isLoadingMore} onClick={pages.loadMore}>
            Load more
          </Button>
        ) : (
          <Text fontSize="sm" color="fg.muted" textAlign="center">
            That's everything for these filters
          </Text>
        )
      )}

      <FinanceSheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter transactions"
        footer={
          <>
            <Button
              variant="outline"
              minH="44px"
              onClick={() => {
                setFilters((current) => ({ ...EMPTY_JOURNAL_FILTERS, sourceType: current.sourceType }));
                setFiltersOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              flex="1"
              minH="44px"
              onClick={() => {
                setFilters((current) => ({ ...draft, sourceType: current.sourceType }));
                setFiltersOpen(false);
              }}
            >
              Show results
            </Button>
          </>
        }
      >
        <Stack gap={4}>
          <Field.Root>
            <Field.Label>Account</Field.Label>
            <OptionSelect
              value={draft.accountId}
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              onChange={(accountId) => setDraft((current) => ({ ...current, accountId }))}
              onClear={() => setDraft((current) => ({ ...current, accountId: "" }))}
              placeholder="All accounts"
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>From</Field.Label>
            <DateField
              value={draft.from}
              max={draft.to || todayInLagos()}
              onChange={(from) => setDraft((current) => ({ ...current, from }))}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>To</Field.Label>
            <DateField
              value={draft.to}
              min={draft.from || undefined}
              max={todayInLagos()}
              onChange={(to) => setDraft((current) => ({ ...current, to }))}
            />
          </Field.Root>
        </Stack>
      </FinanceSheet>
    </Stack>
  );
};

export default BooksTransactions;

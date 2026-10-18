import { useId } from "react";
import { Badge, Box, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { formatKobo } from "helpers/financeConstants";
import { formatBusinessDate } from "helpers/financeCompliance";
import {
  isLedgerUnavailable,
  LEDGER_FORBIDDEN_NOTE,
  LEDGER_FORBIDDEN_TITLE,
  LEDGER_NOT_ACTIVE_NOTE,
  LEDGER_UNAVAILABLE_NOTE,
  LEDGER_UNAVAILABLE_TITLE,
  ledgerHttpStatus,
} from "helpers/ledger";
import { useLedgerAccounts, useLedgerJournals, useLedgerStatus } from "hooks/useLedger";
import { LedgerAccount, LedgerJournal } from "components/finance/ledgerTypes";

/**
 * The gated ledger shell. It reports only what the backend actually sent:
 * no derived cash balance, opening balance, totals or seeded example rows.
 */
const Unavailable = ({ forbidden = false }: { forbidden?: boolean }) => (
  <EmptyState
    title={forbidden ? LEDGER_FORBIDDEN_TITLE : LEDGER_UNAVAILABLE_TITLE}
    description={forbidden ? LEDGER_FORBIDDEN_NOTE : LEDGER_UNAVAILABLE_NOTE}
  />
);

const SectionHeading = ({ id, children }: { id: string; children: string }) => (
  <Text as="h3" id={id} fontSize="md" fontWeight="semibold" mb={2}>
    {children}
  </Text>
);

interface AccountsSectionProps {
  headingId: string;
  accounts: LedgerAccount[] | null;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  isFetching: boolean;
}

const AccountsSection = ({
  headingId,
  accounts,
  isError,
  error,
  refetch,
  isFetching,
}: AccountsSectionProps) => (
  <Box as="section" aria-labelledby={headingId}>
    <SectionHeading id={headingId}>Accounts</SectionHeading>
    {isError && accounts === null ? (
      isLedgerUnavailable(error) ? (
        <Unavailable forbidden={ledgerHttpStatus(error) === 403} />
      ) : (
        <ErrorState
          title="Couldn't load accounts"
          description={errorMessage(error)}
          onRetry={() => refetch()}
          retrying={isFetching}
        />
      )
    ) : accounts === null ? (
      <Unavailable />
    ) : accounts.length === 0 ? (
      <EmptyState title="No finance accounts configured" />
    ) : (
      <GroupedList aria-label="Finance accounts">
        {accounts.map((account) => (
          <GroupedListItem key={account.id}>
            <Flex justify="space-between" align="flex-start" gap={3} wrap="wrap">
              <Stack gap={0.5} minW={0}>
                <Text fontWeight="semibold">{account.name}</Text>
                <Text fontSize="sm" color="fg.muted">
                  {[account.class, account.subtype].filter(Boolean).join(" · ") ||
                    "Account type unavailable"}
                </Text>
              </Stack>
              <Stack align="flex-end" gap={0.5}>
                {account.currency && (
                  <Text fontSize="sm" color="fg.muted">
                    {account.currency}
                  </Text>
                )}
                {account.active !== null && (
                  <Badge
                    colorPalette={account.active ? "green" : "gray"}
                    variant="subtle"
                  >
                    {account.active ? "Active" : "Inactive"}
                  </Badge>
                )}
              </Stack>
            </Flex>
          </GroupedListItem>
        ))}
      </GroupedList>
    )}
  </Box>
);

interface JournalsSectionProps {
  headingId: string;
  journals: LedgerJournal[] | null;
  accounts: LedgerAccount[] | null;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
  isFetching: boolean;
}

const JournalsSection = ({
  headingId,
  journals,
  accounts,
  isError,
  error,
  refetch,
  isFetching,
}: JournalsSectionProps) => {
  const accountNames = new Map((accounts ?? []).map((account) => [account.id, account.name]));
  const accountName = (accountId: string) =>
    accountNames.get(accountId) ??
    (accountId ? `Unknown account (${accountId})` : "Unknown account");

  return (
    <Box as="section" aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Journal entries</SectionHeading>
      {isError && journals === null ? (
        isLedgerUnavailable(error) ? (
          <Unavailable forbidden={ledgerHttpStatus(error) === 403} />
        ) : (
          <ErrorState
            title="Couldn't load journal entries"
            description={errorMessage(error)}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        )
      ) : journals === null ? (
        <Unavailable />
      ) : journals.length === 0 ? (
        <EmptyState title="No journal entries yet" />
      ) : (
        <GroupedList aria-label="Journal entries">
          {journals.map((journal) => (
            <GroupedListItem key={journal.id}>
              <Stack gap={2}>
                <Flex justify="space-between" align="baseline" gap={2} wrap="wrap">
                  <Text fontWeight="semibold">
                    {journal.reference || "No reference"}
                  </Text>
                  <Text fontSize="sm" color="fg.muted">
                    {journal.businessDate
                      ? formatBusinessDate(journal.businessDate)
                      : "Date unavailable"}
                  </Text>
                </Flex>
                {journal.note && (
                  <Text fontSize="sm" color="fg.muted">
                    {journal.note}
                  </Text>
                )}
                {journal.sourceType && (
                  <Text fontSize="xs" color="fg.muted">
                    {`Source: ${journal.sourceType}`}
                  </Text>
                )}
                {journal.lines.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted">
                    No line detail available
                  </Text>
                ) : (
                  <Box
                    as="ul"
                    listStyleType="none"
                    m={0}
                    p={0}
                    borderTopWidth="1px"
                    borderColor="border.muted"
                  >
                    {journal.lines.map((line, index) => (
                      <Flex
                        as="li"
                        key={`${journal.id}-${index}`}
                        justify="space-between"
                        align="baseline"
                        gap={3}
                        py={1}
                        borderTopWidth={index === 0 ? 0 : "1px"}
                        borderColor="border.muted"
                      >
                        <Text fontSize="sm" flex="1" minW={0}>
                          {accountName(line.accountId)}
                        </Text>
                        <Text fontSize="sm" color="fg.muted">
                          {line.side === "debit"
                            ? "Debit"
                            : line.side === "credit"
                              ? "Credit"
                              : "Side unavailable"}
                        </Text>
                        <Text
                          fontSize="sm"
                          fontWeight="medium"
                          css={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {line.amountKobo === null
                            ? "Amount unavailable"
                            : formatKobo(line.amountKobo)}
                        </Text>
                      </Flex>
                    ))}
                  </Box>
                )}
              </Stack>
            </GroupedListItem>
          ))}
        </GroupedList>
      )}
    </Box>
  );
};

const BooksTab = ({ organisationId }: { organisationId: string }) => {
  const statusQuery = useLedgerStatus(organisationId);
  // Lists start only after a valid status, so an old backend gets one neutral
  // 404 rather than three. A `not_active` status still reads the (empty)
  // lists, so a real account can never hide behind the gated explanation.
  const listsEnabled = statusQuery.status !== null;
  const accountsQuery = useLedgerAccounts(organisationId, listsEnabled);
  const journalsQuery = useLedgerJournals(organisationId, listsEnabled);
  const accountsHeadingId = useId();
  const journalsHeadingId = useId();

  if (statusQuery.isLoading) {
    return <PageLoader h="30vh" label="Loading books..." />;
  }

  const status = statusQuery.status;
  // A failed background refetch keeps the last valid status on screen.
  const statusFailed = statusQuery.isError && !status;
  if (statusFailed) {
    return isLedgerUnavailable(statusQuery.error) ? (
      <Unavailable forbidden={ledgerHttpStatus(statusQuery.error) === 403} />
    ) : (
      <ErrorState
        title="Couldn't load books"
        description={errorMessage(statusQuery.error)}
        onRetry={() => statusQuery.refetch()}
        retrying={statusQuery.isFetching}
      />
    );
  }

  // A 200 with a body this build does not understand (e.g. an older mock or
  // proxy) is "not available yet", never an empty active book.
  if (!status) return <Unavailable />;

  // Wait for both lists to settle (success or failure) before painting the
  // shell, so a transient null can never look like "no accounts configured".
  const listsPending =
    listsEnabled &&
    ((!accountsQuery.hasData && !accountsQuery.isError) ||
      (!journalsQuery.hasData && !journalsQuery.isError));
  if (listsPending) {
    return <PageLoader h="30vh" label="Loading books..." />;
  }

  const active = status.state === "active";
  const statusNote = active
    ? status.openingBalancesVerified
      ? "Bookkeeping is active. Only recorded journal entries are shown; balances are not calculated here."
      : "Bookkeeping is active, but opening balances have not been verified. Only recorded journal entries are shown; balances are not calculated here."
    : LEDGER_NOT_ACTIVE_NOTE;

  return (
    <Stack gap={5}>
      <Box>
        <Flex align="center" gap={2} wrap="wrap">
          <Text as="h2" fontSize="lg" fontWeight="semibold">
            Books
          </Text>
          <Badge colorPalette={active ? "green" : "gray"} variant="subtle">
            {active ? "Active" : "Not active"}
          </Badge>
        </Flex>
        <Text fontSize="sm" color="fg.muted" mt={1}>
          {statusNote}
        </Text>
      </Box>

      <AccountsSection
        headingId={accountsHeadingId}
        accounts={accountsQuery.accounts}
        isError={accountsQuery.isError}
        error={accountsQuery.error}
        refetch={accountsQuery.refetch}
        isFetching={accountsQuery.isFetching}
      />
      <JournalsSection
        headingId={journalsHeadingId}
        journals={journalsQuery.journals}
        accounts={accountsQuery.accounts}
        isError={journalsQuery.isError}
        error={journalsQuery.error}
        refetch={journalsQuery.refetch}
        isFetching={journalsQuery.isFetching}
      />
    </Stack>
  );
};

export default BooksTab;

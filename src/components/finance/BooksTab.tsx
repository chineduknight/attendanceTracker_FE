import { useId } from "react";
import { Badge, Box, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import LedgerSetupPanel from "components/finance/LedgerSetupPanel";
import OpeningBalancesPanel from "components/finance/OpeningBalancesPanel";
import { LEDGER_SETUP_UI_ENABLED } from "config/ledgerSetup";
import { LEDGER_OPENING_BALANCES_UI_ENABLED } from "config/ledgerOpeningBalances";
import { formatKobo } from "helpers/financeConstants";
import { formatBusinessDate } from "helpers/financeCompliance";
import {
  isLedgerUnavailable,
  LEDGER_FORBIDDEN_NOTE,
  LEDGER_FORBIDDEN_TITLE,
  LEDGER_STATE_LABELS,
  LEDGER_UNAVAILABLE_NOTE,
  LEDGER_UNAVAILABLE_TITLE,
  ledgerHttpStatus,
  ledgerReadiness,
  ledgerStateKey,
  ledgerStatusNote,
} from "helpers/ledger";
import { useLedgerAccounts, useLedgerJournals, useLedgerStatus } from "hooks/useLedger";
import {
  LedgerAccount,
  LedgerJournal,
  LedgerKnownState,
  LedgerStatus,
} from "components/finance/ledgerTypes";

/**
 * The gated ledger shell. It reports only what the backend actually sent:
 * no derived cash balance, opening balance, totals or seeded example rows.
 *
 * F1 and the approved F2 read shape share these screens. Only a recognised
 * `active` state is ever presented as ready; every other known lifecycle state
 * and any unrecognised future state is not ready. `postingEnabled` is parsed
 * for information only and never enables a control: this shell stays
 * read-only even when a server claims active/posting-enabled books.
 */

/** Badge colour per state. `unknown` gets the warning colour, not success. */
const STATE_SCHEMES: Record<
  LedgerKnownState | "unknown",
  "green" | "gray" | "blue" | "orange" | "red" | "yellow"
> = {
  active: "green",
  not_active: "gray",
  setup: "blue",
  pending_verification: "orange",
  suspended: "red",
  unknown: "yellow",
};

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

/**
 * Additive F2 status facts, shown only when the server actually sent a usable
 * value. Missing fields render nothing rather than "none", "off" or "0", and
 * blocker codes are shown verbatim because this build may not know them yet.
 */
const StatusDetails = ({ status }: { status: LedgerStatus }) => {
  const facts: string[] = [];
  if (status.openingDate) {
    facts.push(`Opening date: ${formatBusinessDate(status.openingDate)}`);
  }
  if (status.lockedThrough) {
    facts.push(`Period locked through: ${formatBusinessDate(status.lockedThrough)}`);
  }
  if (status.hasPendingProposal === true) {
    facts.push("An opening proposal is open and awaiting verification.");
  }
  if (status.unconfirmedAttempts) {
    const count = status.unconfirmedAttempts;
    facts.push(
      count === 1
        ? "1 posting request has an unconfirmed outcome and needs resolution."
        : `${count} posting requests have unconfirmed outcomes and need resolution.`,
    );
  }
  if (status.memberReceiptsEnabled === true) {
    facts.push("Member receipts are enabled.");
  } else if (status.memberReceiptsEnabled === false) {
    facts.push("Member receipts are turned off.");
  }

  const blockers = status.blockers ?? [];
  if (!facts.length && !blockers.length) return null;

  return (
    <Box as="section" aria-label="Bookkeeping details" mt={2}>
      <Stack gap={1}>
        {facts.map((fact) => (
          <Text key={fact} fontSize="sm" color="fg.muted">
            {fact}
          </Text>
        ))}
        {blockers.length > 0 && (
          <>
            <Text fontSize="sm" color="fg.muted">
              Server-reported blockers:
            </Text>
            <Box as="ul" listStyleType="none" m={0} p={0}>
              {blockers.map((code, index) => (
                <Text
                  as="li"
                  key={`${code}-${index}`}
                  fontSize="sm"
                  color="fg.muted"
                  css={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {code}
                </Text>
              ))}
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
};

const StatusHeader = ({ status }: { status: LedgerStatus }) => {
  const stateKey = ledgerStateKey(status);
  return (
    <Box>
      <Flex align="center" gap={2} wrap="wrap">
        <Text as="h2" fontSize="lg" fontWeight="semibold">
          Books
        </Text>
        <Badge colorPalette={STATE_SCHEMES[stateKey]} variant="subtle">
          {LEDGER_STATE_LABELS[stateKey]}
        </Badge>
      </Flex>
      <Text fontSize="sm" color="fg.muted" mt={1}>
        {ledgerStatusNote(status)}
      </Text>
      {/* Unknown states get no configuration detail: this build cannot say
          what those fields would mean for them. */}
      {stateKey !== "unknown" && <StatusDetails status={status} />}
    </Box>
  );
};

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
  const status = statusQuery.status;
  const stateKey = status ? ledgerStateKey(status) : null;
  // Lists start only after a valid, recognised status, so an old backend gets
  // one neutral 404 rather than three. A `not_active` status still reads the
  // (empty) lists, so a real account can never hide behind the gated
  // explanation. An unrecognised state may have different list semantics, so
  // this build neither reads nor renders lists against it.
  const listsEnabled =
    status !== null && ledgerReadiness(status) !== "unknown";
  const accountsQuery = useLedgerAccounts(organisationId, listsEnabled);
  const journalsQuery = useLedgerJournals(organisationId, listsEnabled);
  const accountsHeadingId = useId();
  const journalsHeadingId = useId();

  if (statusQuery.isLoading) {
    return <PageLoader h="30vh" label="Loading books..." />;
  }

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
  if (!status || !stateKey) return <Unavailable />;

  if (stateKey === "unknown") {
    return (
      <Stack gap={5}>
        <StatusHeader status={status} />
        <Unavailable />
      </Stack>
    );
  }

  // Wait for both lists to settle (success or failure) before painting the
  // shell, so a transient null can never look like "no accounts configured".
  const listsPending =
    listsEnabled &&
    ((!accountsQuery.hasData && !accountsQuery.isError) ||
      (!journalsQuery.hasData && !journalsQuery.isError));
  if (listsPending) {
    return <PageLoader h="30vh" label="Loading books..." />;
  }

  return (
    <Stack gap={5}>
      <StatusHeader status={status} />

      {/* F2A-2 setup and chart-of-accounts controls are fully built but off
          until the backend routes and the F2 read shape are live. With the
          gate closed the Books tab is exactly what #131 shipped. */}
      {LEDGER_SETUP_UI_ENABLED && (
        <LedgerSetupPanel
          organisationId={organisationId}
          status={status}
          accounts={accountsQuery.accounts}
          accountsError={accountsQuery.isError ? accountsQuery.error : null}
          onRetryAccounts={accountsQuery.refetch}
          isRetryingAccounts={accountsQuery.isFetching}
          onRecheckLedger={() => {
            // Reconciliation after an unresolved write needs both the status
            // and the account list, not just the list that failed.
            statusQuery.refetch();
            accountsQuery.refetch();
          }}
        />
      )}

      {/* The managed chart of accounts replaces the plain read-only list when
          the setup panel is on; showing both would duplicate every account. */}
      {!LEDGER_SETUP_UI_ENABLED && (
        <AccountsSection
          headingId={accountsHeadingId}
          accounts={accountsQuery.accounts}
          isError={accountsQuery.isError}
          error={accountsQuery.error}
          refetch={accountsQuery.refetch}
          isFetching={accountsQuery.isFetching}
        />
      )}

      {/* F2A-3A opening balances and verification: its own gate, separate from
          the setup gate, and off until the corrected backend and F2A-4 ship. */}
      {LEDGER_OPENING_BALANCES_UI_ENABLED && (
        <OpeningBalancesPanel
          organisationId={organisationId}
          status={status}
          accounts={accountsQuery.accounts}
          onRecheckLedger={() => {
            statusQuery.refetch();
            accountsQuery.refetch();
          }}
        />
      )}
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

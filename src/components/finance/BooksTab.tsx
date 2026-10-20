import { useId, useState } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import LedgerSetupPanel from "components/finance/LedgerSetupPanel";
import OpeningBalancesPanel from "components/finance/OpeningBalancesPanel";
import LedgerLifecyclePanel from "components/finance/lifecycle/LedgerLifecyclePanel";
import CashbookPostingsPanel from "components/finance/postings/CashbookPostingsPanel";
import MemberMoneyPanel from "components/finance/postings/MemberMoneyPanel";
import JournalLines from "components/finance/JournalLines";
import ReversalsPanel from "components/finance/reversals/ReversalsPanel";
import UnconfirmedAttemptsPanel from "components/finance/attempts/UnconfirmedAttemptsPanel";
import LedgerReportsPanel from "components/finance/reports/LedgerReportsPanel";
import AllocationPanel from "components/finance/allocations/AllocationPanel";
import ReconciliationPanel, {
  ReconciliationFocus,
} from "components/finance/reconciliation/ReconciliationPanel";
import { LEDGER_SETUP_UI_ENABLED } from "config/ledgerSetup";
import { LEDGER_OPENING_BALANCES_UI_ENABLED } from "config/ledgerOpeningBalances";
import { LEDGER_LIFECYCLE_UI_ENABLED } from "config/ledgerLifecycle";
import { LEDGER_MEMBER_MONEY_UI_ENABLED } from "config/ledgerMemberMoney";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import { LEDGER_REVERSALS_UI_ENABLED } from "config/ledgerReversals";
import { LEDGER_REPORTS_UI_ENABLED } from "config/ledgerReports";
import { LEDGER_F3_RECONCILIATION_UI_ENABLED } from "config/ledgerF3Reconciliation";
import { LEDGER_F3_ALLOCATION_UI_ENABLED } from "config/ledgerF3Allocations";
import { AllocationStart } from "components/finance/ledgerReconciliationTypes";
import { usePermissions } from "rbac/usePermissions";
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
import { ledgerRecheckUsable } from "helpers/ledgerSetup";
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
  /** F2B-3: opens one journal's details (and its reversal, where offered). */
  onOpenJournal?: (journalId: string) => void;
}

const JournalsSection = ({
  headingId,
  journals,
  accounts,
  isError,
  error,
  refetch,
  isFetching,
  onOpenJournal,
}: JournalsSectionProps) => {
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
                <JournalLines
                  journalId={journal.id}
                  lines={journal.lines}
                  accounts={accounts}
                />
                {onOpenJournal && (
                  <Flex>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Details of the ${
                        journal.businessDate
                          ? formatBusinessDate(journal.businessDate)
                          : "undated"
                      } entry ${journal.reference || journal.id}`}
                      onClick={() => onOpenJournal(journal.id)}
                    >
                      Details
                    </Button>
                  </Flex>
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
  // F2B-3: the journal whose details (and reversal) are open.
  const [openJournalId, setOpenJournalId] = useState<string | null>(null);
  // F3: a request to show the reconciliation panel's allocation history, and
  // a request (e.g. a chosen suggestion) to start an allocation.
  const [reconciliationFocus, setReconciliationFocus] = useState<ReconciliationFocus | null>(null);
  const [allocationStart, setAllocationStart] = useState<AllocationStart | null>(null);
  const canManageFinance = usePermissions().has("finance.manage");

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

  // Both posting sections recheck the same reads: status, accounts, journals.
  const isRecheckingPostings =
    statusQuery.isFetching || accountsQuery.isFetching || journalsQuery.isFetching;
  const recheckPostings = () => {
    statusQuery.refetch();
    accountsQuery.refetch();
    journalsQuery.refetch();
  };

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
          isRefreshingLedger={statusQuery.isFetching || accountsQuery.isFetching}
          onRecheckLedger={async () => {
            // Reconciliation after an unresolved write needs both the status
            // and the account list, not just the list that failed. Only a
            // clean, usable reload of both counts as a recheck.
            const [statusResult, accountsResult] = await Promise.all([
              statusQuery.refetch(),
              accountsQuery.refetch(),
            ]);
            // A 200 with a body this build can't read is not a recheck.
            return (
              !statusResult.isError &&
              !accountsResult.isError &&
              ledgerRecheckUsable(statusResult.data?.data, accountsResult.data?.data)
            );
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

      {/* F2A-3B lifecycle (suspend/resume, period lock, gap-window
          attestation): its own gate, off until the lifecycle routes, the F2A-4
          reads and the server write flag are live. */}
      {LEDGER_LIFECYCLE_UI_ENABLED && (
        <LedgerLifecyclePanel
          organisationId={organisationId}
          status={status}
          onRecheckLedger={() => {
            statusQuery.refetch();
            accountsQuery.refetch();
            journalsQuery.refetch();
          }}
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

      {/* F2B-1 receipts, expenses and transfers: a separate gate, default off.
          The panel itself also refuses every form unless the server reports
          posting as ready, so a preview build can never post against a
          half-configured ledger. */}
      {LEDGER_POSTINGS_UI_ENABLED && (
        <CashbookPostingsPanel
          organisationId={organisationId}
          status={status}
          accounts={accountsQuery.accounts}
          isRechecking={isRecheckingPostings}
          onRecheckLedger={recheckPostings}
        />
      )}

      {/* F2B-2 member receipts and refunds: its own gate, default off. It
          shares the pending posting with "Record money" above. */}
      {LEDGER_MEMBER_MONEY_UI_ENABLED && (
        <MemberMoneyPanel
          organisationId={organisationId}
          status={status}
          accounts={accountsQuery.accounts}
          isRechecking={isRecheckingPostings}
          onRecheckLedger={recheckPostings}
        />
      )}

      {/* F3C allocation posting: its own gate, default off. It shares the one
          pending posting with every section above. */}
      {LEDGER_F3_ALLOCATION_UI_ENABLED && (
        <AllocationPanel
          organisationId={organisationId}
          status={status}
          accounts={accountsQuery.accounts}
          start={allocationStart}
          isRechecking={isRecheckingPostings}
          onRecheckLedger={recheckPostings}
          onViewHistory={
            LEDGER_F3_RECONCILIATION_UI_ENABLED
              ? (journalId, sourceId, sourceNumber) =>
                  setReconciliationFocus({
                    tab: "allocations",
                    history: {
                      sourceId: sourceId ?? "",
                      sourceNumber: sourceNumber ?? "",
                      highlightJournalId: journalId,
                    },
                    nonce: Date.now(),
                  })
              : undefined
          }
        />
      )}

      {/* F2B-3 unconfirmed attempts and reversals: one gate, default off.
          Resolving needs no posting readiness (it works while suspended or
          with writes off); a reversal is a posting and needs all of it. */}
      {LEDGER_REVERSALS_UI_ENABLED && (
        <UnconfirmedAttemptsPanel
          organisationId={organisationId}
          onOpenJournal={setOpenJournalId}
        />
      )}

      {LEDGER_REVERSALS_UI_ENABLED && (
        <ReversalsPanel
          organisationId={organisationId}
          status={status}
          accounts={accountsQuery.accounts}
          openJournalId={openJournalId}
          onOpenJournal={setOpenJournalId}
          onCloseJournal={() => setOpenJournalId(null)}
          isRechecking={isRecheckingPostings}
          onRecheckLedger={recheckPostings}
        />
      )}

      {/* F2B-4 cashbook, balances and summary: read-only, finance.view, its
          own gate (default off). Shown whatever the ledger state: the server
          answers unknown balances as unknown, and suspension never hides
          history. */}
      {LEDGER_REPORTS_UI_ENABLED && (
        <LedgerReportsPanel organisationId={organisationId} accounts={accountsQuery.accounts} />
      )}

      {/* F3B member-money reconciliation: read-only, finance.view, its own
          gate (default off), independent of the allocation posting gate. */}
      {LEDGER_F3_RECONCILIATION_UI_ENABLED && (
        <ReconciliationPanel
          organisationId={organisationId}
          focus={reconciliationFocus}
          onOpenJournal={LEDGER_REVERSALS_UI_ENABLED ? setOpenJournalId : undefined}
          onAllocate={
            LEDGER_F3_ALLOCATION_UI_ENABLED && canManageFinance
              ? (start) => setAllocationStart({ ...start, nonce: Date.now() })
              : undefined
          }
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
        onOpenJournal={LEDGER_REVERSALS_UI_ENABLED ? setOpenJournalId : undefined}
      />
    </Stack>
  );
};

export default BooksTab;

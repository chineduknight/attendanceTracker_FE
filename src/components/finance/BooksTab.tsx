import { ReactNode, RefObject, useEffect, useId, useRef, useState } from "react";
import { Badge, Box, Button, Flex, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import { FiArrowDownLeft, FiArrowUpRight, FiRepeat } from "react-icons/fi";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import LedgerSetupPanel from "components/finance/LedgerSetupPanel";
import OpeningBalancesPanel from "components/finance/OpeningBalancesPanel";
import LedgerLifecyclePanel from "components/finance/lifecycle/LedgerLifecyclePanel";
import MemberMoneyPanel from "components/finance/postings/MemberMoneyPanel";
import PostingReceipt from "components/finance/postings/PostingReceipt";
import ReversalsPanel from "components/finance/reversals/ReversalsPanel";
import ReversalReceipt from "components/finance/reversals/ReversalReceipt";
import UnconfirmedAttemptsPanel from "components/finance/attempts/UnconfirmedAttemptsPanel";
import LedgerReportsPanel from "components/finance/reports/LedgerReportsPanel";
import AllocationPanel from "components/finance/allocations/AllocationPanel";
import ReconciliationPanel, {
  ReconciliationFocus,
} from "components/finance/reconciliation/ReconciliationPanel";
import BackRow from "components/finance/books/BackRow";
import BalanceTiles from "components/finance/books/BalanceTiles";
import BooksStateCard from "components/finance/books/BooksStateCard";
import BooksTransactions from "components/finance/books/BooksTransactions";
import NavRow, { NavGroup } from "components/finance/books/NavRow";
import NeedsAttention from "components/finance/books/NeedsAttention";
import PostingSheet from "components/finance/books/PostingSheet";
import RecentTransactions from "components/finance/books/RecentTransactions";
import ThisMonth from "components/finance/books/ThisMonth";
import ReadOnlyEntry from "components/finance/books/ReadOnlyEntry";
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
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore from "zStore";
import { formatBusinessDate } from "helpers/financeCompliance";
import { BOOKS_HOME, BooksScreen } from "helpers/booksNavigation";
import { AttentionTarget, attentionItems, cashbookSheetFor } from "helpers/booksOverview";
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
import { retrySectionFor, shownPostingSections } from "helpers/ledgerPostings";
import { ledgerRecheckUsable } from "helpers/ledgerSetup";
import { useBooksNav } from "hooks/useBooksNav";
import { useCashbookPostings } from "hooks/useCashbookPostings";
import { ConfirmedPosting } from "hooks/usePostingWorkflow";
import { useLedgerAccounts, useLedgerStatus } from "hooks/useLedger";
import {
  LedgerAccount,
  LedgerKnownState,
  LedgerStatus,
} from "components/finance/ledgerTypes";

/**
 * Books: a small stack of screens (Overview, Transactions, Reports, Held for
 * members, an entry, Manage Books) kept in the URL so Back and Forward move
 * through them. It reports only what the backend sent: no derived balance,
 * total or seeded row. Only a recognised `active` state is presented as
 * ready; posting readiness always comes from the server's status.
 *
 * Every screen stays mounted and is hidden when not shown, so each panel's
 * own state (open forms, pending writes, recovery notices, cross-links)
 * survives navigation exactly as it did on the single page.
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

const TITLES: Record<BooksScreen, string> = {
  overview: "Books",
  transactions: "Transactions",
  reports: "Reports",
  held: "Held for members",
  entry: "Entry",
  manage: "Manage Books",
  "manage-status": "Books status & history",
  "manage-setup": "Setup & accounts",
  "manage-opening": "Opening balances",
  "manage-reconciliation": "Reconciliation",
  "manage-attempts": "Unconfirmed saves",
};

const backLabel = (screen: BooksScreen) =>
  screen.startsWith("manage-") ? "Manage Books" : screen === "entry" ? "Transactions" : "Books";

/** One Books screen: always mounted, hidden unless it is the current one. */
const Screen = ({
  screen,
  current,
  onBack,
  children,
}: {
  screen: BooksScreen;
  current: BooksScreen;
  onBack: () => void;
  children: ReactNode;
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shown = screen === current;
  return (
    <Stack gap={4} hidden={!shown}>
      {screen !== "overview" && (
        <BackRow
          label={backLabel(screen)}
          title={TITLES[screen]}
          onBack={onBack}
          shown={shown}
          headingRef={headingRef as RefObject<HTMLHeadingElement>}
        />
      )}
      {children}
    </Stack>
  );
};

const BooksScreens = ({
  organisationId,
  status,
  accountsQuery,
  statusQuery,
}: {
  organisationId: string;
  status: LedgerStatus;
  accountsQuery: ReturnType<typeof useLedgerAccounts>;
  statusQuery: ReturnType<typeof useLedgerStatus>;
}) => {
  const queryClient = useQueryClient();
  const nav = useBooksNav(organisationId);
  const { screen, sheet, journalId } = nav.location;
  const canManage = usePermissions().has("finance.manage");
  const isOwner = useGlobalStore((store) => store.organisation.isOwner === true);
  const stateKey = ledgerStateKey(status);
  const live = stateKey === "active" || stateKey === "suspended";
  const memberReceiptsOn = status.memberReceiptsEnabled === true;
  const accounts = accountsQuery.accounts;
  const accountsHeadingId = useId();
  // F3: a request to show the reconciliation's allocation history, and a
  // request (e.g. a chosen suggestion) to start an allocation.
  const [reconciliationFocus, setReconciliationFocus] = useState<ReconciliationFocus | null>(null);
  const [allocationStart, setAllocationStart] = useState<AllocationStart | null>(null);
  // "For a member" on Money in: asks Held for members to open its form.
  const [startReceipt, setStartReceipt] = useState(0);
  // A reversal confirmed after the officer left its entry (Back mid-save, or
  // another Finance tab): its receipt follows them to the screen they are on.
  const shownScreen = useRef<BooksScreen | null>(screen);
  shownScreen.current = nav.onBooks ? screen : null;
  const [awayReversal, setAwayReversal] = useState<ConfirmedPosting | null>(null);
  useEffect(() => {
    if (screen === "entry") setAwayReversal(null);
  }, [screen]);

  const isRechecking = statusQuery.isFetching || accountsQuery.isFetching;
  const recheckPostings = () => {
    statusQuery.refetch();
    accountsQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.journals(organisationId) });
  };

  const cashbook = useCashbookPostings({
    organisationId,
    status,
    accounts,
    onRecheckLedger: recheckPostings,
  });
  // Held for members (member money and allocations) exists only while member
  // receipts are on; the sections it hosts count as shown only then.
  const heldShown = LEDGER_MEMBER_MONEY_UI_ENABLED && memberReceiptsOn;
  const shownSections = shownPostingSections({
    cashbook: LEDGER_POSTINGS_UI_ENABLED,
    memberMoney: heldShown,
    reversals: LEDGER_REVERSALS_UI_ENABLED,
    allocations: LEDGER_F3_ALLOCATION_UI_ENABLED && heldShown,
  });

  const available = (target: BooksScreen): boolean => {
    switch (target) {
      case "reports":
        return LEDGER_REPORTS_UI_ENABLED;
      case "held":
        return heldShown;
      case "manage-status":
        return true;
      case "manage-opening":
        return LEDGER_OPENING_BALANCES_UI_ENABLED;
      case "manage-reconciliation":
        return LEDGER_F3_RECONCILIATION_UI_ENABLED;
      case "manage-attempts":
        return LEDGER_REVERSALS_UI_ENABLED && canManage;
      default:
        return true;
    }
  };
  const sheetAllowed = LEDGER_POSTINGS_UI_ENABLED && canManage;

  // A screen this officer or build can't show (a gate off, a viewer at a
  // manage-only URL): land on the Overview without adding a history entry.
  useEffect(() => {
    if (!nav.onBooks) return;
    if (!available(screen) || (sheet && !sheetAllowed)) nav.replace(BOOKS_HOME);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.onBooks, screen, sheet, sheetAllowed]);

  const intentRead = cashbook.intentRead;
  const attention = attentionItems({
    pending: intentRead.kind === "pending" ? intentRead.intents : [],
    sectionFor: (record) => retrySectionFor(record.operation, shownSections),
    reach: {
      canManage,
      sheets: sheetAllowed,
      held: available("held"),
      attempts: available("manage-attempts"),
    },
    unconfirmedAttempts: canManage && LEDGER_REVERSALS_UI_ENABLED ? status.unconfirmedAttempts : null,
    hasPendingProposal: LEDGER_OPENING_BALANCES_UI_ENABLED ? status.hasPendingProposal : null,
    blockers: canManage && live ? status.blockers ?? [] : [],
  });
  const openAttention = (target: AttentionTarget) => {
    if (target.kind === "sheet") nav.openSheet(target.sheet);
    else nav.go(target.screen, target.journalId);
  };

  const openEntry = (id: string) => nav.go("entry", id);
  const { success } = cashbook.workflow;
  const { receiptReadiness, expenseReadiness, transferReadiness, readiness } = cashbook;
  const readinessNotes = [
    !readiness.ready ? readiness.reason : null,
    readiness.ready && !receiptReadiness.ready ? `Money in: ${receiptReadiness.reason}` : null,
    readiness.ready && !expenseReadiness.ready ? `Money out: ${expenseReadiness.reason}` : null,
    readiness.ready && !transferReadiness.ready ? `Transfer: ${transferReadiness.reason}` : null,
  ].filter(Boolean) as string[];

  const screenProps = { current: screen, onBack: nav.close };

  // Coming back to the Overview from another screen: focus its heading, as
  // the other screens' back rows do, so the move is announced. Not on first
  // paint, which would steal focus from the Finance tabs.
  const overviewHeading = useRef<HTMLHeadingElement>(null);
  const previousScreen = useRef(screen);
  useEffect(() => {
    if (screen === "overview" && previousScreen.current !== "overview") overviewHeading.current?.focus();
    previousScreen.current = screen;
  }, [screen]);

  return (
    <Box>
      {awayReversal && screen !== "entry" && (
        <Box mb={4}>
          <ReversalReceipt
            result={awayReversal.result}
            summary={awayReversal.summary}
            onDone={() => setAwayReversal(null)}
            onOpenJournal={openEntry}
          />
        </Box>
      )}
      <Screen screen="overview" {...screenProps}>
        <Flex align="center" gap={2} wrap="wrap">
          <Text as="h2" ref={overviewHeading} tabIndex={-1} outline="none" fontSize="xl" fontWeight="semibold">
            Books
          </Text>
          {stateKey !== "active" && (
            <Badge colorPalette={STATE_SCHEMES[stateKey]} variant="subtle">
              {LEDGER_STATE_LABELS[stateKey]}
            </Badge>
          )}
        </Flex>

        {success && sheet === null && (
          <PostingReceipt
            result={success.result}
            summary={success.summary}
            onAnother={() => {
              // A fresh form for the same kind of money; a posting no sheet
              // records (one retried here for another section) just closes.
              const next = cashbookSheetFor(success.summary.operation);
              cashbook.workflow.dismissSuccess();
              if (next) nav.openSheet(next);
            }}
          />
        )}

        <BooksStateCard
          status={status}
          canManage={canManage}
          isOwner={isOwner}
          onGo={(target) => nav.go(target)}
        />

        {live && LEDGER_REPORTS_UI_ENABLED && (
          <BalanceTiles
            organisationId={organisationId}
            accounts={accounts}
            accountsError={accountsQuery.isError ? accountsQuery.error : null}
            onRetryAccounts={accountsQuery.refetch}
            enabled
            memberReceiptsOn={memberReceiptsOn && available("held")}
            onOpenHeld={() => nav.go("held")}
          />
        )}

        {live && sheetAllowed && (
          <Stack gap={2}>
            <SimpleGrid columns={2} gap={3}>
              <Button
                variant="outline"
                minH="56px"
                fontSize="md"
                disabled={!readiness.ready || !receiptReadiness.ready}
                onClick={() => nav.openSheet("money-in")}
              >
                <Box as={FiArrowDownLeft} aria-hidden color="green.fg" />
                Money in
              </Button>
              <Button
                variant="outline"
                minH="56px"
                fontSize="md"
                disabled={!readiness.ready || !expenseReadiness.ready}
                onClick={() => nav.openSheet("money-out")}
              >
                <Box as={FiArrowUpRight} aria-hidden color="red.fg" />
                Money out
              </Button>
            </SimpleGrid>
            <Button
              variant="ghost"
              minH="44px"
              disabled={!readiness.ready || !transferReadiness.ready}
              onClick={() => nav.openSheet("transfer")}
            >
              <FiRepeat aria-hidden />
              Transfer between accounts
            </Button>
            {readinessNotes.map((note) => (
              <Text key={note} fontSize="sm" color="fg.muted">
                {note}
              </Text>
            ))}
          </Stack>
        )}

        <NeedsAttention items={attention} onOpen={openAttention} />

        {live && LEDGER_REPORTS_UI_ENABLED && (
          <ThisMonth organisationId={organisationId} enabled onOpen={() => nav.go("reports")} />
        )}

        {live && (
          <RecentTransactions
            organisationId={organisationId}
            accounts={accounts ?? []}
            enabled
            onSeeAll={() => nav.go("transactions")}
            onOpen={openEntry}
          />
        )}

        <NavGroup>
          {!live && <NavRow label="Transactions" onClick={() => nav.go("transactions")} />}
          {available("reports") && (
            <NavRow label="Reports" caption="Summary, balances, cashbook" onClick={() => nav.go("reports")} />
          )}
          <NavRow
            label="Manage Books"
            caption="Status, setup, accounts, opening balances"
            onClick={() => nav.go("manage")}
          />
        </NavGroup>
      </Screen>

      <Screen screen="transactions" {...screenProps}>
        <BooksTransactions
          organisationId={organisationId}
          accounts={accounts ?? []}
          enabled={screen === "transactions"}
          memberReceipts={memberReceiptsOn && LEDGER_MEMBER_MONEY_UI_ENABLED}
          allocations={status.allocationsEnabled === true && LEDGER_F3_ALLOCATION_UI_ENABLED}
          onOpen={openEntry}
        />
      </Screen>

      {available("reports") && (
        <Screen screen="reports" {...screenProps}>
          <LedgerReportsPanel organisationId={organisationId} accounts={accounts} />
        </Screen>
      )}

      {heldShown && (
        <Screen screen="held" {...screenProps}>
          <MemberMoneyPanel
            organisationId={organisationId}
            status={status}
            accounts={accounts}
            isRechecking={isRechecking}
            onRecheckLedger={recheckPostings}
            startReceipt={startReceipt}
          />
          {LEDGER_F3_ALLOCATION_UI_ENABLED && (
            <AllocationPanel
              organisationId={organisationId}
              status={status}
              accounts={accounts}
              start={allocationStart}
              isRechecking={isRechecking}
              onRecheckLedger={recheckPostings}
              onViewHistory={
                LEDGER_F3_RECONCILIATION_UI_ENABLED
                  ? (historyJournalId, sourceId, sourceNumber) => {
                      setReconciliationFocus({
                        tab: "allocations",
                        history: {
                          sourceId: sourceId ?? "",
                          sourceNumber: sourceNumber ?? "",
                          highlightJournalId: historyJournalId,
                        },
                        nonce: Date.now(),
                      });
                      nav.go("manage-reconciliation");
                    }
                  : undefined
              }
            />
          )}
        </Screen>
      )}

      <Screen screen="entry" {...screenProps}>
        {LEDGER_REVERSALS_UI_ENABLED ? (
          <ReversalsPanel
            organisationId={organisationId}
            status={status}
            accounts={accounts}
            openJournalId={screen === "entry" ? journalId : null}
            onOpenJournal={(id) => nav.go("entry", id)}
            onCloseJournal={nav.close}
            isRechecking={isRechecking}
            onRecheckLedger={recheckPostings}
            onConfirmed={(confirmed) => {
              if (shownScreen.current !== "entry") setAwayReversal(confirmed);
            }}
          />
        ) : (
          <ReadOnlyEntry
            organisationId={organisationId}
            journalId={screen === "entry" ? journalId : null}
            accounts={accounts}
            onOpenJournal={openEntry}
          />
        )}
      </Screen>

      <Screen screen="manage" {...screenProps}>
        <NavGroup label="Manage Books">
          <NavRow
            label="Books status & history"
            caption={LEDGER_STATE_LABELS[stateKey]}
            onClick={() => nav.go("manage-status")}
          />
          <NavRow
            label="Setup & accounts"
            caption={
              stateKey === "not_active" || stateKey === "setup"
                ? "Setup in progress"
                : accounts
                  ? `${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`
                  : undefined
            }
            onClick={() => nav.go("manage-setup")}
          />
          {available("manage-opening") && (
            <NavRow
              label="Opening balances"
              caption={status.hasPendingProposal === true ? "Awaiting verification" : undefined}
              onClick={() => nav.go("manage-opening")}
            />
          )}
          {available("manage-reconciliation") && (
            <NavRow label="Reconciliation" onClick={() => nav.go("manage-reconciliation")} />
          )}
          {available("manage-attempts") && (
            <NavRow
              label="Unconfirmed saves"
              caption={status.unconfirmedAttempts ? `${status.unconfirmedAttempts} to check` : "None"}
              onClick={() => nav.go("manage-attempts")}
            />
          )}
        </NavGroup>
      </Screen>

      <Screen screen="manage-status" {...screenProps}>
        <StatusHeader status={status} />
        {LEDGER_LIFECYCLE_UI_ENABLED && (
          <LedgerLifecyclePanel
            organisationId={organisationId}
            status={status}
            onRecheckLedger={recheckPostings}
          />
        )}
      </Screen>

      <Screen screen="manage-setup" {...screenProps}>
        {/* Setup, member-money settings and the chart of accounts stay one
            panel: they share recheck and unresolved-write recovery. */}
        {LEDGER_SETUP_UI_ENABLED ? (
          <LedgerSetupPanel
            organisationId={organisationId}
            status={status}
            accounts={accountsQuery.accounts}
            accountsError={accountsQuery.isError ? accountsQuery.error : null}
            accountsUnreadable={accountsQuery.hasData && !accountsQuery.isError}
            onRetryAccounts={accountsQuery.refetch}
            isRetryingAccounts={accountsQuery.isFetching}
            isRefreshingLedger={statusQuery.isFetching || accountsQuery.isFetching}
            onRecheckLedger={async ({ requireAllocations, allowInitialSetup }) => {
              // Reconciliation after an unresolved write needs both the status
              // and the account list. Only a clean, usable reload of both counts.
              const [statusResult, accountsResult] = await Promise.all([
                statusQuery.refetch(),
                accountsQuery.refetch(),
              ]);
              return (
                !statusResult.isError &&
                !accountsResult.isError &&
                ledgerRecheckUsable(statusResult.data?.data, accountsResult.data?.data, {
                  requireAllocations,
                  allowInitialSetup,
                })
              );
            }}
          />
        ) : (
          <AccountsSection
            headingId={accountsHeadingId}
            accounts={accountsQuery.accounts}
            isError={accountsQuery.isError}
            error={accountsQuery.error}
            refetch={accountsQuery.refetch}
            isFetching={accountsQuery.isFetching}
          />
        )}
      </Screen>

      {available("manage-opening") && (
        <Screen screen="manage-opening" {...screenProps}>
          <OpeningBalancesPanel
            organisationId={organisationId}
            status={status}
            accounts={accounts}
            onRecheckLedger={() => {
              statusQuery.refetch();
              accountsQuery.refetch();
            }}
          />
        </Screen>
      )}

      {available("manage-reconciliation") && (
        <Screen screen="manage-reconciliation" {...screenProps}>
          <ReconciliationPanel
            organisationId={organisationId}
            booksLive={live}
            focus={reconciliationFocus}
            onOpenJournal={openEntry}
            onAllocate={
              LEDGER_F3_ALLOCATION_UI_ENABLED && canManage
                ? (start) => {
                    setAllocationStart({ ...start, nonce: Date.now() });
                    nav.go("held");
                  }
                : undefined
            }
          />
        </Screen>
      )}

      {LEDGER_REVERSALS_UI_ENABLED && (
        <Screen screen="manage-attempts" {...screenProps}>
          <UnconfirmedAttemptsPanel
            organisationId={organisationId}
            onOpenJournal={(id) => nav.go("entry", id)}
          />
        </Screen>
      )}

      {sheetAllowed && (
        <PostingSheet
          sheet={sheet}
          postings={cashbook}
          shownSections={shownSections}
          isRechecking={isRechecking}
          onClose={nav.close}
          onForMember={
            available("held")
              ? () => {
                  nav.go("held");
                  setStartReceipt((nonce) => nonce + 1);
                }
              : undefined
          }
        />
      )}
    </Box>
  );
};

const BooksTab = ({ organisationId }: { organisationId: string }) => {
  const statusQuery = useLedgerStatus(organisationId);
  const status = statusQuery.status;
  const stateKey = status ? ledgerStateKey(status) : null;
  // Lists start only after a valid, recognised status, so an old backend gets
  // one neutral 404 rather than several. An unrecognised state may have
  // different list semantics, so this build neither reads nor renders them.
  const listsEnabled = status !== null && ledgerReadiness(status) !== "unknown";
  const accountsQuery = useLedgerAccounts(organisationId, listsEnabled);

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

  // Wait for the account list to settle (success or failure) before painting
  // the screens, so a transient null can never look like "no accounts".
  if (listsEnabled && !accountsQuery.hasData && !accountsQuery.isError) {
    return <PageLoader h="30vh" label="Loading books..." />;
  }

  return (
    <BooksScreens
      organisationId={organisationId}
      status={status}
      accountsQuery={accountsQuery}
      statusQuery={statusQuery}
    />
  );
};

export default BooksTab;

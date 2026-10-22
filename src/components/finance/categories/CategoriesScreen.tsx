import { useState } from "react";import {
  Badge,
  Box,
  Button,
  Collapsible,
  Flex,
  Stack,
  Tabs,
  Text,
  chakra,
} from "@chakra-ui/react";
import { FiChevronDown } from "react-icons/fi";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { AlertBox, LedgerWriteNotices } from "components/finance/LedgerWriteNotices";
import {
  AddCategorySheet,
  AddMoneyAccountSheet,
  AccountActionsSheet,
} from "components/finance/categories/CategorySheets";
import {
  CategoryKind,
  buildCategoryPayload,
  groupAccounts,
} from "helpers/booksCategories";
import {
  LEDGER_UNAVAILABLE_NOTE,
  LEDGER_UNAVAILABLE_TITLE,
  ledgerStateKey,
} from "helpers/ledger";
import {
  OPENING_PENDING_CREATE_NOTE,
  SUSPENDED_CREATE_NOTE,
  accountActions,
  activeSingletonSubtypes,
  canCreateAccounts,
  isMemberHoldingRole,
  isMemberIncomeRole,
  isOpeningEquityRole,
  moneyAccountsFrozen,
  toAccountRole,
} from "helpers/ledgerSetup";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { useAccountWrites } from "hooks/useAccountWrites";
import { usePermissions } from "rbac/usePermissions";

/**
 * Books → Categories & Accounts (approved 22 Oct 2026).
 *
 * Three plain tabs over one account list: Expenses, Income, Cash & bank.
 * Treasurers manage categories and money accounts here without accounting
 * vocabulary. The technical accounts every ledger needs are listed in one
 * collapsed, read-only section so nothing in the books is hidden.
 *
 * Every write goes through `useAccountWrites` (the durable ledger lifecycle),
 * carries `expectedRevision`, and is scoped to this organisation. The backend
 * remains authoritative on every refusal.
 */

type TabKey = "expenses" | "income" | "cash-bank";

type Sheet =
  | { kind: "add-category"; categoryKind: CategoryKind }
  | { kind: "money"; mode: "cash" | "bank" }
  | { kind: "account"; account: LedgerAccount };

const TAB_LABELS: Record<TabKey, string> = {
  expenses: "Expenses",
  income: "Income",
  "cash-bank": "Cash & bank",
};

const bankCaption = (account: LedgerAccount) =>
  [account.bankName, account.accountNumberLast4 ? `••••${account.accountNumberLast4}` : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

const purposeOf = (account: LedgerAccount): string => {
  const role = toAccountRole(account);
  if (!role) return "This account type isn't recognised by this app version.";
  if (isOpeningEquityRole(role)) return "Balances the opening count.";
  if (isMemberHoldingRole(role)) return "Money held for members until it is allocated.";
  if (isMemberIncomeRole(role)) return "Income recorded when member money is allocated.";
  return "Managed by the books.";
};

const RowBody = ({ label, caption }: { label: string; caption?: string | null }) => (
  <Stack gap={0.5} minW={0}>
    <Text fontWeight="medium">{label}</Text>
    {caption && (
      <Text fontSize="sm" color="fg.muted">
        {caption}
      </Text>
    )}
  </Stack>
);

const AccountRow = ({
  account,
  caption,
  canOpen,
  onOpen,
}: {
  account: LedgerAccount;
  caption?: string | null;
  canOpen: boolean;
  onOpen: (account: LedgerAccount) => void;
}) => (
  <GroupedListItem p={0}>
    {canOpen ? (
      <chakra.button
        type="button"
        w="100%"
        minH="52px"
        px={3}
        py={2}
        textAlign="left"
        onClick={() => onOpen(account)}
        _hover={{ bg: "bg.muted" }}
        _focusVisible={{
          outline: "2px solid",
          outlineColor: "colorPalette.focusRing",
          outlineOffset: "-2px",
        }}
      >
        <RowBody label={account.name} caption={caption} />
      </chakra.button>
    ) : (
      <Box px={3} py={2}>
        <RowBody label={account.name} caption={caption} />
      </Box>
    )}
  </GroupedListItem>
);

const RetiredList = ({
  accounts,
  canManage,
  context,
  onRestore,
}: {
  accounts: readonly LedgerAccount[];
  canManage: boolean;
  context: Parameters<typeof accountActions>[1];
  onRestore: (account: LedgerAccount) => void;
}) => {
  const [open, setOpen] = useState(false);
  if (accounts.length === 0) return null;
  return (
    <Box>
      <Button
        variant="ghost"
        size="sm"
        minH="44px"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {`Retired (${accounts.length})`}
      </Button>
      <Collapsible.Root open={open} lazyMount unmountOnExit>
        <Collapsible.Content>
          <Stack gap={2} pt={2}>
            {accounts.map((account) => {
              const allowance = accountActions(account, context);
              return (
                <Flex key={account.id} justify="space-between" align="flex-start" gap={3} wrap="wrap">
                  <Stack gap={0.5} minW={0}>
                    <Text fontSize="sm" fontWeight="medium">
                      {account.name}
                    </Text>
                    {canManage && allowance.note && (
                      <Text fontSize="xs" color="fg.muted">
                        {allowance.note}
                      </Text>
                    )}
                  </Stack>
                  {canManage && allowance.canReactivate && (
                    <Button size="sm" variant="outline" onClick={() => onRestore(account)}>
                      Restore
                    </Button>
                  )}
                </Flex>
              );
            })}
          </Stack>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
};

const BookkeepingSection = ({ accounts }: { accounts: readonly LedgerAccount[] }) => {
  const [open, setOpen] = useState(false);
  if (accounts.length === 0) return null;
  return (
    <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" p={3}>
      <Button
        variant="ghost"
        width="100%"
        minH="44px"
        py={2}
        gap={2}
        justifyContent="space-between"
        whiteSpace="normal"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Box flex="1" minW={0} textAlign="left">
          <Text fontWeight="semibold" fontSize="sm">
            Bookkeeping accounts (managed for you)
          </Text>
        </Box>
        <Box as={FiChevronDown} aria-hidden color="fg.muted" flexShrink={0} />
      </Button>
      <Collapsible.Root open={open} lazyMount unmountOnExit>
        <Collapsible.Content>
          <Stack gap={2} pt={2}>
            {accounts.map((account) => (
              <Stack key={account.id} gap={0.5}>
                <Flex align="center" gap={2} wrap="wrap">
                  <Text fontSize="sm" fontWeight="medium">
                    {account.name}
                  </Text>
                  {account.active !== true && (
                    <Badge colorPalette="gray" variant="subtle">
                      Retired
                    </Badge>
                  )}
                </Flex>
                <Text fontSize="xs" color="fg.muted">
                  {purposeOf(account)}
                </Text>
              </Stack>
            ))}
          </Stack>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
};

interface CategoriesScreenProps {
  organisationId: string;
  status: LedgerStatus;
  accounts: LedgerAccount[] | null;
  accountsError: unknown;
  /**
   * A response arrived but its body wasn't a readable account list. With
   * `accounts` null this is "not available yet", not still loading.
   */
  accountsUnreadable?: boolean;
  onRetryAccounts: () => void;
  isRetryingAccounts: boolean;
  onRecheckLedger?: (options: {
    requireAllocations: boolean;
    allowInitialSetup: boolean;
  }) => Promise<boolean> | void;
}

const CategoriesScreen = ({
  organisationId,
  status,
  accounts,
  accountsError,
  accountsUnreadable = false,
  onRetryAccounts,
  isRetryingAccounts,
  onRecheckLedger,
}: CategoriesScreenProps) => {
  const { has } = usePermissions();
  const canManage = has("finance.manage");
  const writes = useAccountWrites(organisationId);
  const [tab, setTab] = useState<TabKey>("expenses");
  const [sheet, setSheet] = useState<Sheet | null>(null);

  const openSheet = (next: Sheet) => {
    writes.clearError();
    setSheet(next);
  };

  const closeSheet = () => setSheet(null);

  if (accounts === null) {
    if (accountsError) {
      return (
        <ErrorState
          title="Couldn't load accounts"
          description={errorMessage(accountsError)}
          onRetry={onRetryAccounts}
          retrying={isRetryingAccounts}
        />
      );
    }
    if (accountsUnreadable) {
      return <EmptyState title={LEDGER_UNAVAILABLE_TITLE} description={LEDGER_UNAVAILABLE_NOTE} />;
    }
    return <PageLoader h="20vh" label="Loading accounts..." />;
  }

  const groups = groupAccounts(accounts);
  const frozen = moneyAccountsFrozen(status);
  const createAllowed =
    canManage && canCreateAccounts(status, canManage);
  const createNote =
    ledgerStateKey(status) === "suspended"
      ? SUSPENDED_CREATE_NOTE
      : frozen
        ? OPENING_PENDING_CREATE_NOTE
        : null;
  const context = {
    ledgerState: ledgerStateKey(status),
    memberReceiptsEnabled: status.memberReceiptsEnabled,
    allocationsEnabled: status.allocationsEnabled,
    activeSingletonSubtypes: activeSingletonSubtypes(accounts),
    writeBlocked: writes.blocked,
  };
  const counts: Record<TabKey, number> = {
    expenses: groups.expense.length,
    income: groups.income.length,
    "cash-bank": groups.cash.length + groups.bank.length,
  };

  const lookups = (
    list: readonly LedgerAccount[],
    label: string,
    empty: string,
  ) =>
    list.length === 0 ? (
      <Text fontSize="sm" color="fg.muted">
        {empty}
      </Text>
    ) : (
      <GroupedList aria-label={label}>
        {list.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            canOpen={canManage}
            onOpen={(next) => openSheet({ kind: "account", account: next })}
          />
        ))}
      </GroupedList>
    );

  const addCategoryButton = (kind: CategoryKind) =>
    createAllowed ? (
      <Button
        alignSelf="flex-start"
        variant="outline"
        minH="44px"
        disabled={writes.blocked}
        onClick={() => openSheet({ kind: "add-category", categoryKind: kind })}
      >
        {kind === "expense" ? "Add expense category" : "Add income category"}
      </Button>
    ) : null;

  const sheetAccount =
    sheet?.kind === "account"
      ? accounts.find((account) => account.id === sheet.account.id) ?? sheet.account
      : null;

  return (
    <Box as="section">
      <Stack gap={4}>
        <LedgerWriteNotices
          organisationId={organisationId}
          canManage={canManage}
          onRecheckLedger={onRecheckLedger}
          onRetryAccounts={onRetryAccounts}
          isRechecking={isRetryingAccounts}
        />

        {!sheet && writes.error && (
          <AlertBox title="That change wasn't saved">{writes.error}</AlertBox>
        )}

        {!canManage && (
          <Text fontSize="sm" color="fg.muted">
            You can view the categories and accounts with your current permissions. Adding,
            renaming, retiring or restoring one needs the finance manage permission.
          </Text>
        )}

        {canManage && createNote && !createAllowed && (
          <Text fontSize="sm" color="fg.muted">
            {createNote}
          </Text>
        )}

        <Tabs.Root value={tab} onValueChange={(details) => setTab(details.value as TabKey)}>
          {/* Three labels plus counts do not fit a 320px phone; the strip
              scrolls instead of widening the page. */}
          <Tabs.List maxW="100%" overflowX="auto" css={{ scrollbarWidth: "none" }}>
            {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
              <Tabs.Trigger key={key} value={key} minH="44px" flexShrink={0}>
                {TAB_LABELS[key]}
                <Badge ml={1} colorPalette="gray" variant="subtle">
                  {counts[key]}
                </Badge>
              </Tabs.Trigger>
            ))}
          </Tabs.List>

          <Tabs.Content value="expenses">
            <Stack gap={4} pt={4}>
              {addCategoryButton("expense")}
              {lookups(groups.expense, "Expense categories", "No expense categories yet")}
              <RetiredList
                accounts={groups.retiredExpense}
                canManage={canManage}
                context={context}
                onRestore={(account) => writes.setActive(account, true)}
              />
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="income">
            <Stack gap={4} pt={4}>
              {addCategoryButton("income")}
              {lookups(groups.income, "Income categories", "No income categories yet")}
              <RetiredList
                accounts={groups.retiredIncome}
                canManage={canManage}
                context={context}
                onRestore={(account) => writes.setActive(account, true)}
              />
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="cash-bank">
            <Stack gap={4} pt={4}>
              {createAllowed && (
                <Flex gap={2} wrap="wrap">
                  {groups.cash.length === 0 && (
                    <Button
                      variant="outline"
                      minH="44px"
                      disabled={frozen || writes.blocked}
                      onClick={() => openSheet({ kind: "money", mode: "cash" })}
                    >
                      Add Cash in hand
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    minH="44px"
                    disabled={frozen || writes.blocked}
                    onClick={() => openSheet({ kind: "money", mode: "bank" })}
                  >
                    Add bank account
                  </Button>
                </Flex>
              )}
              {createAllowed && frozen && (
                <Text fontSize="sm" color="fg.muted">
                  {OPENING_PENDING_CREATE_NOTE}
                </Text>
              )}

              <Stack gap={2}>
                <Text fontWeight="semibold" fontSize="sm">
                  Cash
                </Text>
                {lookups(groups.cash, "Cash accounts", "No cash account yet")}
              </Stack>

              <Stack gap={2}>
                <Text fontWeight="semibold" fontSize="sm">
                  Bank accounts
                </Text>
                {groups.bank.length === 0 ? (
                  <Text fontSize="sm" color="fg.muted">
                    No bank accounts yet
                  </Text>
                ) : (
                  <GroupedList aria-label="Bank accounts">
                    {groups.bank.map((account) => (
                      <AccountRow
                        key={account.id}
                        account={account}
                        caption={bankCaption(account) || null}
                        canOpen={canManage}
                        onOpen={(next) => openSheet({ kind: "account", account: next })}
                      />
                    ))}
                  </GroupedList>
                )}
              </Stack>

              <RetiredList
                accounts={groups.retiredMoney}
                canManage={canManage}
                context={context}
                onRestore={(account) => writes.setActive(account, true)}
              />
            </Stack>
          </Tabs.Content>
        </Tabs.Root>

        <BookkeepingSection accounts={groups.bookkeeping} />
      </Stack>

      {sheet?.kind === "add-category" && (
        <AddCategorySheet
          kind={sheet.categoryKind}
          accounts={accounts}
          isSaving={writes.isSaving}
          error={writes.error}
          onCreate={(name) =>
            writes.create([buildCategoryPayload(name, sheet.categoryKind)], () => closeSheet())
          }
          onRestore={(account) => writes.setActive(account, true, () => closeSheet())}
          onClose={closeSheet}
        />
      )}

      {sheet?.kind === "money" && (
        <AddMoneyAccountSheet
          mode={sheet.mode}
          accounts={accounts}
          isSaving={writes.isSaving}
          error={writes.error}
          onCreate={(payload) => writes.create([payload], () => closeSheet())}
          onClose={closeSheet}
        />
      )}

      {sheetAccount && (
        <AccountActionsSheet
          account={sheetAccount}
          context={context}
          subtitle={
            sheetAccount.subtype === "bank"
              ? bankCaption(sheetAccount) || "Bank"
              : sheetAccount.class === "asset"
                ? "Cash"
                : null
          }
          isSaving={writes.isSaving}
          error={writes.error}
          onRename={(name) => writes.rename(sheetAccount, name, () => closeSheet())}
          onSetActive={(active) => writes.setActive(sheetAccount, active, () => closeSheet())}
          onClose={closeSheet}
        />
      )}
    </Box>
  );
};

export default CategoriesScreen;

import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  MAX_ACCOUNT_NAME_LENGTH,
  CreateAccountPayload,
  accountNameKey,
  toAccountRole,
} from "helpers/ledgerSetup";

/**
 * Books → Categories & Accounts: pure grouping and naming rules.
 *
 * The backend owns every value here. These helpers only decide how a loaded
 * account list is presented and what may be offered next; they never derive a
 * balance and never replace a server refusal.
 *
 * Identity rules that matter:
 * - the stable id is `_id`/`id`, the storage key is `class` + `subtype`, and
 *   `name` is display-only (AGENTS.md §17);
 * - a category is an ordinary income/expense account (`subtype: null`). Dues
 *   and levy income (`member_dues_income`, `member_levy_income`) are
 *   bookkeeping accounts credited only by allocations (F3), never categories;
 * - `active !== true` is retired here: an inactive account stays listed so
 *   nothing in the books is hidden, and it is never offered for new entries.
 */

export type CategoryKind = "income" | "expense";

export interface AccountGroups {
  /** Active ordinary income categories, A–Z. */
  income: LedgerAccount[];
  /** Active ordinary expense categories, A–Z. */
  expense: LedgerAccount[];
  retiredIncome: LedgerAccount[];
  retiredExpense: LedgerAccount[];
  /** Active money accounts. */
  cash: LedgerAccount[];
  bank: LedgerAccount[];
  retiredMoney: LedgerAccount[];
  /** Equity, the member-money holding account, dues/levy income and anything unrecognised. */
  bookkeeping: LedgerAccount[];
}

const isActive = (account: LedgerAccount) => account.active === true;

const byName = (left: LedgerAccount, right: LedgerAccount) =>
  left.name.localeCompare(right.name);

const isMoneySubtype = (subtype: string | null) =>
  subtype === "cash" || subtype === "bank";

const emptyGroups = (): AccountGroups => ({
  income: [],
  expense: [],
  retiredIncome: [],
  retiredExpense: [],
  cash: [],
  bank: [],
  retiredMoney: [],
  bookkeeping: [],
});

/**
 * Splits a loaded account list into the three tabs plus bookkeeping.
 * Unrecognised roles go to `bookkeeping` rather than nowhere: an account the
 * books hold must never disappear from the only screen that lists them.
 */
export const groupAccounts = (accounts: readonly LedgerAccount[]): AccountGroups => {
  const groups = emptyGroups();
  for (const account of accounts) {
    const role = toAccountRole(account);
    if (!role) {
      groups.bookkeeping.push(account);
      continue;
    }
    if (role.class === "income" || role.class === "expense") {
      // Only an ordinary category (no specialised subtype) belongs in a tab.
      if (role.subtype !== null) {
        groups.bookkeeping.push(account);
        continue;
      }
      if (role.class === "income") {
        (isActive(account) ? groups.income : groups.retiredIncome).push(account);
      } else {
        (isActive(account) ? groups.expense : groups.retiredExpense).push(account);
      }
      continue;
    }
    if (role.class === "asset" && isMoneySubtype(role.subtype)) {
      if (!isActive(account)) {
        groups.retiredMoney.push(account);
      } else if (role.subtype === "cash") {
        groups.cash.push(account);
      } else {
        groups.bank.push(account);
      }
      continue;
    }
    groups.bookkeeping.push(account);
  }
  for (const list of Object.values(groups)) list.sort(byName);
  return groups;
};

/** Active categories of one kind, A–Z. */
export const categoriesFor = (
  accounts: readonly LedgerAccount[],
  kind: CategoryKind,
): LedgerAccount[] => {
  const groups = groupAccounts(accounts);
  return kind === "income" ? groups.income : groups.expense;
};

/* ------------------------------------------------------------------ */
/* Suggested categories (first-time setup)                            */
/* ------------------------------------------------------------------ */

export interface SuggestedCategory {
  /** Stable local key for selection; never sent to the API. */
  key: string;
  name: string;
  kind: CategoryKind;
}

export const SUGGESTED_CATEGORIES: readonly SuggestedCategory[] = [
  { key: "donations", name: "Donations", kind: "income" },
  { key: "offerings", name: "Offerings", kind: "income" },
  { key: "other-income", name: "Other income", kind: "income" },
  { key: "transport", name: "Transport", kind: "expense" },
  { key: "utilities", name: "Utilities", kind: "expense" },
  { key: "other-expenses", name: "Other expenses", kind: "expense" },
];

export type SuggestionState =
  | { kind: "create"; suggestion: SuggestedCategory }
  | { kind: "restore"; suggestion: SuggestedCategory; account: LedgerAccount };

const isCategoryOfKind = (account: LedgerAccount, kind: CategoryKind) => {
  const role = toAccountRole(account);
  return role?.class === kind && role.subtype === null;
};

/**
 * What each suggestion needs: create it, restore a retired category that
 * already has the name, or nothing because an active account uses the name.
 *
 * A retired match of the other kind stays a `create`: the name is free again
 * for a new account, and restoring an expense as an income category is not
 * something this screen may do.
 */
export const suggestedCategoryStates = (
  accounts: readonly LedgerAccount[],
): SuggestionState[] => {
  const activeNames = new Set(
    accounts.filter(isActive).map((account) => accountNameKey(account.name)),
  );
  const retired = accounts.filter((account) => !isActive(account));
  const states: SuggestionState[] = [];
  for (const suggestion of SUGGESTED_CATEGORIES) {
    const key = accountNameKey(suggestion.name);
    // An active account of any kind owns the name: no duplicate may be made.
    if (activeNames.has(key)) continue;
    const match = retired.find(
      (account) => accountNameKey(account.name) === key && isCategoryOfKind(account, suggestion.kind),
    );
    states.push(
      match
        ? { kind: "restore", suggestion, account: match }
        : { kind: "create", suggestion },
    );
  }
  return states;
};

/* ------------------------------------------------------------------ */
/* Names                                                              */
/* ------------------------------------------------------------------ */

/** Suggested payload for a category of one kind; the server still decides. */
export const buildCategoryPayload = (
  name: string,
  kind: CategoryKind,
): CreateAccountPayload => ({ name: name.trim(), class: kind, subtype: null });

/**
 * `base`, or the first free variant (`base (Books)`, `base (Books 2)`, …)
 * among active account names. Retired names may be reused, like the backend.
 */
export const freeName = (base: string, accounts: readonly LedgerAccount[]): string => {
  const taken = new Set(
    accounts.filter(isActive).map((account) => accountNameKey(account.name)),
  );
  const name = base.trim();
  if (!taken.has(accountNameKey(name))) return name;
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = suffix === 1 ? `${name} (Books)` : `${name} (Books ${suffix})`;
    if (!taken.has(accountNameKey(candidate))) return candidate;
  }
  return `${name} (Books)`;
};

/* ------------------------------------------------------------------ */
/* The accounts setup must not leave missing                          */
/* ------------------------------------------------------------------ */

/**
 * The bookkeeping accounts a started ledger is missing, as create payloads in
 * the order they are made: (cash,) opening balance equity, then the
 * member-money holding account when member receipts are on.
 *
 * Only opening balance equity and the enabled holding account are required.
 * Cash in hand is optional: the backend lets a zero-balance cash account be
 * retired and an organisation may run on bank accounts alone. It is added only
 * when `provideCash` is set, which the first-time setup does so a new ledger
 * has somewhere to hold money. Recovery and turning on member receipts never
 * recreate a retired cash account.
 *
 * Call this with a *freshly reloaded* list. A backend that creates these inside
 * `POST /ledger/setup` or `PATCH /ledger/settings` returns them in that reload,
 * so nothing is posted twice. A missing list (null) must never be treated as
 * empty: the caller waits for a usable read instead.
 */
export const missingBookkeepingAccounts = (
  status: LedgerStatus,
  accounts: readonly LedgerAccount[],
  { provideCash = false }: { provideCash?: boolean } = {},
): CreateAccountPayload[] => {
  const taken = new Set(
    accounts.filter(isActive).map((account) => accountNameKey(account.name)),
  );
  const pickName = (base: string) => {
    let name = base;
    for (let suffix = 1; taken.has(accountNameKey(name)) && suffix < 100; suffix += 1) {
      name = suffix === 1 ? `${base} (Books)` : `${base} (Books ${suffix})`;
    }
    taken.add(accountNameKey(name));
    return name;
  };
  const hasActive = (accountClass: string, subtype: string) =>
    accounts.some(
      (account) =>
        isActive(account) &&
        account.class === accountClass &&
        account.subtype === subtype,
    );

  const missing: CreateAccountPayload[] = [];
  if (provideCash && !hasActive("asset", "cash"))
    missing.push({ name: pickName("Cash in hand"), class: "asset", subtype: "cash" });
  if (!hasActive("equity", "opening_balance_equity"))
    missing.push({
      name: pickName("Opening balance equity"),
      class: "equity",
      subtype: "opening_balance_equity",
    });
  if (
    status.memberReceiptsEnabled === true &&
    !hasActive("liability", "member_receipts_unallocated")
  )
    missing.push({
      name: pickName("Member money – unallocated"),
      class: "liability",
      subtype: "member_receipts_unallocated",
    });
  return missing;
};

/* ------------------------------------------------------------------ */
/* Naming a new category                                              */
/* ------------------------------------------------------------------ */

export type CategoryNameCheck =
  | { kind: "ok"; name: string }
  | { kind: "issue"; message: string }
  | { kind: "retired"; account: LedgerAccount };

/**
 * The first thing to say about a typed category name, before sending.
 *
 * Convenience only: the backend stays authoritative. Active names are refused
 * client-side (names are unique among active accounts, matching is case- and
 * space-insensitive). A retired category of the same kind is never duplicated;
 * the caller offers **Restore** instead.
 */
export const checkCategoryName = (
  raw: string,
  kind: CategoryKind,
  accounts: readonly LedgerAccount[],
): CategoryNameCheck => {
  const name = raw.trim();
  if (!name) return { kind: "issue", message: "Enter a name." };
  if (name.length > MAX_ACCOUNT_NAME_LENGTH)
    return {
      kind: "issue",
      message: `Use ${MAX_ACCOUNT_NAME_LENGTH} characters or fewer.`,
    };
  const key = accountNameKey(name);
  const active = accounts.some(
    (account) => isActive(account) && accountNameKey(account.name) === key,
  );
  if (active) return { kind: "issue", message: `"${name}" is already in use.` };
  const retired = accounts.find(
    (account) =>
      !isActive(account) &&
      accountNameKey(account.name) === key &&
      isCategoryOfKind(account, kind),
  );
  return retired ? { kind: "retired", account: retired } : { kind: "ok", name };
};

/**
 * F2B-4 report reads (RFC v0.3 §5.5, §8.4): tolerant parsing that fails
 * closed, report parameters and display helpers.
 *
 * Pure helpers. The server computes every balance, closing and total; these
 * functions only check that what arrived is usable and say so when it is not.
 * A malformed report becomes `null` ("couldn't be read"), never zeros, an
 * empty list or a shortened list that looks complete.
 */

import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { toLedgerAccounts } from "helpers/ledger";
import { toJournalDetail } from "helpers/ledgerReversals";
import { ACCOUNT_CLASS_LABELS, ACCOUNT_SUBTYPE_LABELS } from "helpers/ledgerSetup";
import { isBusinessDate, LAGOS_TIME_ZONE } from "helpers/openingBalances";
import { LedgerAccount } from "components/finance/ledgerTypes";
import {
  AccountBalance,
  BalancesReport,
  CashbookDayClosing,
  CashbookItem,
  CashbookPage,
  MemberMoneySummary,
  ReportState,
  SummaryCategory,
  SummaryReport,
  SummarySection,
} from "components/finance/ledgerReportTypes";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isKobo = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const asBusinessDate = (value: unknown): string | null =>
  typeof value === "string" && isBusinessDate(value) ? value : null;

/**
 * Only the exact string "known" is known. A missing or unrecognised state is
 * unknown: this build cannot vouch for figures it does not understand.
 */
const toReportState = (value: unknown): ReportState =>
  value === "known" ? "known" : "unknown";

/**
 * A figure under a report state. Known: it must be integer kobo, or the
 * report is malformed (`undefined`). Unknown: always `null`, even if the
 * server sent a number, so an unconfirmed figure is never shown as a balance.
 */
const stateFigure = (state: ReportState, value: unknown): number | null | undefined => {
  if (state === "unknown") return null;
  return isKobo(value) ? value : undefined;
};

/* ------------------------------------------------------------------ */
/* Money accounts                                                     */
/* ------------------------------------------------------------------ */

/**
 * Cash and bank accounts have a cashbook (any other account is 422). Inactive
 * and not-yet-verified ones are still offered: their history is readable and
 * the server reports an unverified balance as unknown.
 */
export const isCashbookAccount = (account: LedgerAccount): boolean =>
  account.class === "asset" && (account.subtype === "cash" || account.subtype === "bank");

export const cashbookAccounts = (accounts: readonly LedgerAccount[] | null): LedgerAccount[] =>
  (accounts ?? [])
    .filter(isCashbookAccount)
    .slice()
    .sort((left, right) => {
      // Active accounts first, then by name.
      const rank = (account: LedgerAccount) => (account.active === false ? 1 : 0);
      return rank(left) - rank(right) || left.name.localeCompare(right.name);
    });

export const cashbookAccountLabel = (account: LedgerAccount): string => {
  const kind = account.subtype === "cash" ? "Cash" : "Bank";
  const extra = [
    account.bankName,
    account.accountNumberLast4 ? `••••${account.accountNumberLast4}` : null,
    account.active === false ? "inactive" : null,
    account.openingVerified === false ? "opening not verified" : null,
  ].filter((part): part is string => Boolean(part));
  return [`${account.name} — ${kind}`, ...extra].join(" · ");
};

/* ------------------------------------------------------------------ */
/* Parsing                                                            */
/* ------------------------------------------------------------------ */

const toCashbookItem = (value: unknown, state: ReportState): CashbookItem | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const journal = toJournalDetail(raw.journal);
  const direction = raw.direction === "in" || raw.direction === "out" ? raw.direction : null;
  const amountKobo = isKobo(raw.amountKobo) && raw.amountKobo > 0 ? raw.amountKobo : null;
  const runningBalanceKobo = stateFigure(state, raw.runningBalanceKobo);
  if (!journal || !direction || amountKobo === null || runningBalanceKobo === undefined) {
    return null;
  }
  return { journal, direction, amountKobo, runningBalanceKobo };
};

const toDayClosing = (value: unknown, state: ReportState): CashbookDayClosing | null => {
  const raw = asRecord(value);
  const date = asBusinessDate(raw?.date);
  const closingKobo = stateFigure(state, raw?.closingKobo);
  if (!raw || !date || closingKobo === undefined) return null;
  return { date, closingKobo };
};

/**
 * One cashbook page, or null when anything structural is unusable: the
 * account is not the one requested, a row or closing cannot be read, a known
 * page lacks a figure, or a day on the page has no closing. One bad row fails
 * the page rather than being dropped, so a running balance never jumps over a
 * hidden entry.
 */
export const toCashbookPage = (value: unknown, accountId: string): CashbookPage | null => {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.items) || !Array.isArray(raw.dayClosings)) return null;
  const account = toLedgerAccounts([raw.account])?.[0];
  if (!account || account.id !== accountId) return null;

  const balanceState = toReportState(raw.balanceState);
  const balanceBeforeKobo = stateFigure(balanceState, raw.balanceBeforeKobo);
  if (balanceBeforeKobo === undefined) return null;

  const items: CashbookItem[] = [];
  for (const entry of raw.items) {
    const item = toCashbookItem(entry, balanceState);
    if (!item) return null;
    items.push(item);
  }
  const dayClosings: CashbookDayClosing[] = [];
  for (const entry of raw.dayClosings) {
    const closing = toDayClosing(entry, balanceState);
    if (!closing) return null;
    dayClosings.push(closing);
  }
  const closingDates = new Set(dayClosings.map((closing) => closing.date));
  if (items.some((item) => !item.journal.businessDate || !closingDates.has(item.journal.businessDate))) {
    return null;
  }

  const nextCursor = raw.nextCursor === null ? null : asText(raw.nextCursor);
  if (nextCursor === null && raw.nextCursor !== null) return null;
  return { account, balanceState, balanceBeforeKobo, items, dayClosings, nextCursor };
};

const toAccountBalance = (value: unknown): AccountBalance | null => {
  const raw = asRecord(value);
  const accountId = asText(raw?.accountId);
  if (!raw || !accountId) return null;
  const balanceState = toReportState(raw.balanceState);
  const balanceKobo = stateFigure(balanceState, raw.balanceKobo);
  if (balanceKobo === undefined) return null;
  return { accountId, balanceState, balanceKobo };
};

/**
 * Balances as of a day, or null when unusable. `moneyTotalKobo` is read
 * exactly: `null` stays unknown, a number must be integer kobo, and a
 * missing or malformed total fails the report rather than becoming 0.
 */
export const toBalancesReport = (value: unknown): BalancesReport | null => {
  const raw = asRecord(value);
  const asOf = asBusinessDate(raw?.asOf);
  if (!raw || !asOf || !Array.isArray(raw.accounts)) return null;
  const accounts: AccountBalance[] = [];
  for (const entry of raw.accounts) {
    const balance = toAccountBalance(entry);
    if (!balance) return null;
    accounts.push(balance);
  }
  if (raw.moneyTotalKobo !== null && !isKobo(raw.moneyTotalKobo)) return null;
  return { asOf, accounts, moneyTotalKobo: raw.moneyTotalKobo };
};

const toSummaryCategory = (value: unknown): SummaryCategory | null => {
  const raw = asRecord(value);
  const accountId = asText(raw?.accountId);
  if (!raw || !accountId || !isKobo(raw.amountKobo)) return null;
  return {
    accountId,
    name: asText(raw.name) ?? "Unnamed category",
    active: typeof raw.active === "boolean" ? raw.active : null,
    amountKobo: raw.amountKobo,
  };
};

const toSummarySection = (value: unknown): SummarySection | null => {
  const raw = asRecord(value);
  if (!raw || !isKobo(raw.totalKobo) || !Array.isArray(raw.categories)) return null;
  const categories: SummaryCategory[] = [];
  for (const entry of raw.categories) {
    const category = toSummaryCategory(entry);
    if (!category) return null;
    categories.push(category);
  }
  return { totalKobo: raw.totalKobo, categories };
};

const MEMBER_MONEY_FIELDS = [
  "heldAtStartKobo",
  "openingKobo",
  "receivedKobo",
  "refundedKobo",
  "allocatedKobo",
  "reversalsKobo",
  "otherKobo",
  "heldAtEndKobo",
] as const;

/** undefined: malformed. null: the organisation has no member-money account. */
const toMemberMoneySummary = (value: unknown): MemberMoneySummary | null | undefined => {
  if (value === null) return null;
  const raw = asRecord(value);
  if (!raw) return undefined;
  const summary = {} as MemberMoneySummary;
  for (const field of MEMBER_MONEY_FIELDS) {
    const figure = raw[field];
    if (!isKobo(figure)) return undefined;
    summary[field] = figure;
  }
  return summary;
};

/**
 * The financial summary, or null when unusable. An unknown summary carries
 * no figures at all, whatever the body contained; a known one must carry
 * every figure.
 */
export const toSummaryReport = (value: unknown): SummaryReport | null => {
  const raw = asRecord(value);
  const from = asBusinessDate(raw?.from);
  const to = asBusinessDate(raw?.to);
  if (!raw || !from || !to) return null;
  if (toReportState(raw.summaryState) === "unknown") return { summaryState: "unknown", from, to };
  const income = toSummarySection(raw.income);
  const expense = toSummarySection(raw.expense);
  const memberMoney = toMemberMoneySummary(raw.memberMoney);
  if (!income || !expense || !isKobo(raw.netKobo) || memberMoney === undefined) return null;
  return { summaryState: "known", from, to, income, expense, netKobo: raw.netKobo, memberMoney };
};

/* ------------------------------------------------------------------ */
/* Parameters and filters                                             */
/* ------------------------------------------------------------------ */

export const CASHBOOK_PAGE_SIZE = 50;

/** A query string from the parameters that are set; "" adds nothing. */
export const reportQuery = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

/**
 * A From/To pair: both optional, neither after today in Lagos, and From not
 * after To. The server re-checks every rule (422).
 */
export const reportRangeIssue = (from: string, to: string, today: string): string | null => {
  if (from && !isBusinessDate(from)) return "Choose a valid From date.";
  if (to && !isBusinessDate(to)) return "Choose a valid To date.";
  if (from && from > today) return "The From date can't be after today in Lagos.";
  if (to && to > today) return "The To date can't be after today in Lagos.";
  if (from && to && from > to) return "The From date can't be after the To date.";
  return null;
};

export const asOfIssue = (asOf: string, today: string): string | null => {
  if (asOf && !isBusinessDate(asOf)) return "Choose a valid date.";
  if (asOf && asOf > today) return "The date can't be after today in Lagos.";
  return null;
};

/* ------------------------------------------------------------------ */
/* Balances grouping                                                  */
/* ------------------------------------------------------------------ */

/** Display only. F3's member income subtypes are rendered as returned. */
const REPORT_SUBTYPE_LABELS: Record<string, string> = {
  ...ACCOUNT_SUBTYPE_LABELS,
  member_dues_income: "Member dues income",
  member_levy_income: "Member levy income",
};

/** "Bank", "Income", "Member dues income"; an unrecognised subtype verbatim. */
export const accountTypeLabel = (account: LedgerAccount): string => {
  if (account.subtype) return REPORT_SUBTYPE_LABELS[account.subtype] ?? account.subtype;
  if (account.class && account.class in ACCOUNT_CLASS_LABELS) {
    return ACCOUNT_CLASS_LABELS[account.class as keyof typeof ACCOUNT_CLASS_LABELS];
  }
  return account.class ?? "Account type unavailable";
};

export type BalanceGroupKey = "money" | "income" | "expense" | "liability" | "equity" | "other";

export const BALANCE_GROUP_TITLES: Record<BalanceGroupKey, string> = {
  money: "Cash and bank",
  income: "Income",
  expense: "Expenses",
  liability: "Liabilities (member money)",
  equity: "Equity",
  other: "Other accounts",
};

const BALANCE_GROUP_ORDER: readonly BalanceGroupKey[] = [
  "money",
  "income",
  "expense",
  "liability",
  "equity",
  "other",
];

export interface BalanceRow {
  balance: AccountBalance;
  /** null when the account list has no such account (shown as unknown). */
  account: LedgerAccount | null;
}

const balanceGroupOf = (account: LedgerAccount | null): BalanceGroupKey => {
  if (!account) return "other";
  if (isCashbookAccount(account)) return "money";
  switch (account.class) {
    case "income":
    case "expense":
    case "liability":
    case "equity":
      return account.class;
    default:
      return "other";
  }
};

/**
 * The server's balances grouped for display, in the server's order within
 * each group. Grouping only: no figure is added, netted or sign-flipped.
 */
export const balanceGroups = (
  report: BalancesReport,
  accounts: readonly LedgerAccount[],
): { key: BalanceGroupKey; title: string; rows: BalanceRow[] }[] => {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const grouped = new Map<BalanceGroupKey, BalanceRow[]>();
  for (const balance of report.accounts) {
    const account = byId.get(balance.accountId) ?? null;
    const key = balanceGroupOf(account);
    grouped.set(key, [...(grouped.get(key) ?? []), { balance, account }]);
  }
  return BALANCE_GROUP_ORDER.filter((key) => grouped.has(key)).map((key) => ({
    key,
    title: BALANCE_GROUP_TITLES[key],
    rows: grouped.get(key) ?? [],
  }));
};

/* ------------------------------------------------------------------ */
/* Cashbook days                                                      */
/* ------------------------------------------------------------------ */

export interface CashbookDay {
  date: string;
  items: CashbookItem[];
  /** The server's whole-day closing for this date. */
  closingKobo: number | null;
}

/**
 * Consecutive rows of one date, in the server's order (never re-sorted),
 * each with the server's closing for that date.
 */
export const cashbookDays = (page: CashbookPage): CashbookDay[] => {
  const closings = new Map(page.dayClosings.map((closing) => [closing.date, closing.closingKobo]));
  const days: CashbookDay[] = [];
  for (const item of page.items) {
    const date = item.journal.businessDate ?? "";
    const last = days[days.length - 1];
    if (last && last.date === date) last.items.push(item);
    else days.push({ date, items: [item], closingKobo: closings.get(date) ?? null });
  }
  return days;
};

/** A row's reference: the entry number, else the journal reference. */
export const cashbookReference = (item: CashbookItem): string =>
  item.journal.number ?? item.journal.reference ?? "No reference";

/* ------------------------------------------------------------------ */
/* Display                                                            */
/* ------------------------------------------------------------------ */

export const UNKNOWN_FIGURE = "Unknown";

/** Server kobo as Naira; an unknown figure says so and is never ₦0. */
export const formatReportKobo = (value: number | null): string =>
  value === null ? UNKNOWN_FIGURE : formatKobo(value);

/** A signed movement, e.g. "+₦5,000" / "−₦3,000". */
export const formatSignedKobo = (direction: "in" | "out", amountKobo: number): string =>
  `${direction === "in" ? "+" : "−"}${formatKobo(amountKobo)}`;

export const formatReportPeriod = (from: string, to: string): string =>
  from === to ? formatBusinessDate(from) : `${formatBusinessDate(from)} – ${formatBusinessDate(to)}`;

/** When a report was loaded, as a Lagos wall-clock time. */
export const formatLoadedAt = (updatedAt: number): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(updatedAt));

export const CASHBOOK_ORDER_NOTE =
  "Within a day: money in, then money out. This is a reporting order, not the time each entry was made.";

export const CASHBOOK_UNKNOWN_NOTE =
  "This account's balance isn't known for this period, so no balances are shown. The books may not be active yet, the account's opening balance may not be verified, or the period may end before the account's opening date.";

export const BALANCES_DIRECTION_NOTE =
  "Each balance is in the account's normal direction: cash, bank and expenses as debits; income, equity and member money as credits. Income and expenses accumulate from the books' opening date.";

export const MONEY_TOTAL_UNKNOWN_NOTE =
  "The total isn't known because at least one active cash or bank account has no known balance on this date.";

export const SUMMARY_UNKNOWN_NOTE =
  "No confirmed figures exist for this period yet. The books may not be active, or the period ends before the books' opening date.";

export const SUMMARY_CATEGORIES_NOTE =
  "Amounts are net of reversals. A reversal of an entry from an earlier period can make a category negative.";

export const MEMBER_MONEY_SUMMARY_NOTE =
  "Member money is held for members (a liability). It is never income; money moves into income only when it is allocated to dues or levies.";

export const CASHBOOK_NOT_DUES_NOTE =
  "A cashbook balance is money in the account. It is not a member's dues position.";

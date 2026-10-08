import { format, isValid, parseISO } from "date-fns";
import {
  ComplianceRow,
  ComplianceSummary,
  FinanceMember,
  Obligation,
  OverallStatus,
} from "components/finance/financeTypes";
import { MONTHS } from "helpers/financeConstants";

/**
 * Pure read-side helpers for the Finance screens. Every figure here comes
 * from the compliance report; nothing re-derives liability or allocation,
 * which stay backend-owned.
 */

export type CollectFilter = "all" | "behind" | "owing" | "paid" | "not-set";
export type CollectSort = "name" | "behind" | "owing" | "progress";

export const COLLECT_SORT_LABELS: Record<CollectSort, string> = {
  name: "Name (A–Z)",
  behind: "Most behind",
  owing: "Most left to pay",
  progress: "Least paid first",
};

/** Today's calendar date in the officer's timezone, as `YYYY-MM-DD`. */
export const todayBusinessDate = (now: Date = new Date()) => format(now, "yyyy-MM-dd");

/**
 * Whether the report carries the arrears lens (newer backends). Older
 * responses have only `balance`, which also counts months not yet due.
 */
export const hasArrearsLens = (rows: readonly ComplianceRow[]) =>
  rows.some((row) => row.accountable && row.arrears !== undefined);

export const arrearsOf = (row: ComplianceRow) => Math.max(0, row.arrears ?? 0);
export const isBehind = (row: ComplianceRow) => isLiable(row) && arrearsOf(row) > 0;

export const isDuesObligation = (obligation?: Pick<Obligation, "type">) =>
  obligation?.type === "dues";

/**
 * A levy dated before the member's start date is not theirs to pay. Such a
 * row is accountable but owes nothing, so it never counts as owing.
 */
export const isLiable = (row: ComplianceRow) =>
  row.accountable && row.liable !== false;

export const paidOf = (row: ComplianceRow) => row.totalPaid ?? row.paid ?? 0;
export const balanceOf = (row: ComplianceRow) => Math.max(0, row.balance ?? 0);
export const expectedOf = (row: ComplianceRow) =>
  row.totalExpected ?? row.expected ?? paidOf(row) + balanceOf(row);

/** Amount-based progress (0–100), so a small part payment never reads 0%. */
export const progressOf = (row: ComplianceRow) => {
  const expected = expectedOf(row);
  if (!expected) return 100;
  return Math.min(100, (paidOf(row) / expected) * 100);
};

export const formatPct = (n: number) =>
  n > 0 && n < 1 ? "<1%" : `${Math.round(n)}%`;

/**
 * The backend's overall status where present. Older dues responses only
 * carry the month grid, so fall back to reading it.
 */
export const overallStatus = (row: ComplianceRow): OverallStatus => {
  if (row.status === "paid" || row.status === "partial" || row.status === "unpaid")
    return row.status;
  if (row.status === "not-due") return "paid";
  const due = Object.values(row.months ?? {}).filter((s) => s !== "not-due");
  if (due.length === 0 || due.every((s) => s === "paid")) return "paid";
  if (due.every((s) => s === "unpaid")) return "unpaid";
  return "partial";
};

export const matchesFilter = (row: ComplianceRow, filter: CollectFilter) => {
  switch (filter) {
    case "all":
      return true;
    case "not-set":
      return !row.accountable;
    case "behind":
      return isBehind(row);
    case "paid":
      return isLiable(row) && overallStatus(row) === "paid";
    case "owing":
      return isLiable(row) && overallStatus(row) !== "paid";
  }
};

export const filterCounts = (rows: readonly ComplianceRow[]) => {
  const counts: Record<CollectFilter, number> = {
    all: 0,
    behind: 0,
    owing: 0,
    paid: 0,
    "not-set": 0,
  };
  (Object.keys(counts) as CollectFilter[]).forEach((filter) => {
    counts[filter] = rows.filter((row) => matchesFilter(row, filter)).length;
  });
  return counts;
};

export const matchesSearch = (name: string, search: string) => {
  const term = search.trim().toLowerCase();
  return !term || name.toLowerCase().includes(term);
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name);

/** Members without a start date have no figures, so they always sort last. */
export const sortRows = (rows: readonly ComplianceRow[], sort: CollectSort) =>
  [...rows].sort((a, b) => {
    if (a.accountable !== b.accountable) return a.accountable ? -1 : 1;
    if (sort === "behind") return arrearsOf(b) - arrearsOf(a) || byName(a, b);
    if (sort === "owing") return balanceOf(b) - balanceOf(a) || byName(a, b);
    if (sort === "progress") return progressOf(a) - progressOf(b) || byName(a, b);
    return byName(a, b);
  });

export const visibleRows = (
  rows: readonly ComplianceRow[],
  { search, filter, sort }: { search: string; filter: CollectFilter; sort: CollectSort },
) =>
  sortRows(
    rows.filter((row) => matchesSearch(row.name, search) && matchesFilter(row, filter)),
    sort,
  );

/** Share of what is due that has been collected, for the summary bar. */
export const collectionPct = (
  summary: Pick<ComplianceSummary, "totalCollected" | "totalOutstanding" | "totalExpected">,
) => {
  const expected =
    summary.totalExpected ?? summary.totalCollected + summary.totalOutstanding;
  if (!expected) return 0;
  return Math.min(100, (summary.totalCollected / expected) * 100);
};

export const monthLabel = (month: number) =>
  MONTHS.find((m) => m.value === month)?.label ?? String(month);

/** The first month the member is accountable for (leading not-due months). */
export const firstLiableMonth = (row: ComplianceRow) => {
  for (let m = 1; m <= 12; m++) {
    if (row.months?.[String(m)] !== "not-due") return m;
  }
  return null;
};

/** The first month not yet fully paid — where a new dues payment lands. */
export const nextUnpaidMonth = (row: ComplianceRow) => {
  for (let m = 1; m <= 12; m++) {
    const status = row.months?.[String(m)];
    if (status === "unpaid" || status === "partial") return m;
  }
  return null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * One-line standing for a list row, e.g. "2 months behind" or
 * "Up to date · paid to Sep". With the arrears lens, being behind means
 * owing for months already due — not the rest of the year.
 */
export const standingLabel = (row: ComplianceRow, obligation: Obligation) => {
  if (!row.accountable) return "No start date";
  if (!isLiable(row)) return "Not liable for this levy";
  const status = overallStatus(row);
  if (status === "paid") return "Paid in full";
  const isDues = isDuesObligation(obligation);
  const through = row.paidUpToMonth ?? 0;
  const paidToMonth = isDues && through > 0 ? monthLabel(through) : null;

  if (row.arrears !== undefined) {
    if (arrearsOf(row) > 0) {
      if (isDues && row.monthsBehind) return `${plural(row.monthsBehind, "month")} behind`;
      return isDues ? "Behind" : "Overdue";
    }
    if (!isDues && !row.dueToDate) return "Not due yet";
    return paidToMonth ? `Up to date · paid to ${paidToMonth}` : "Up to date";
  }

  if (!isDues) return status === "partial" ? "Part paid" : "Not paid";
  if (paidToMonth) return `Paid to ${paidToMonth}`;
  return status === "partial" ? "Part paid" : "Nothing paid yet";
};

export interface QuickAmount {
  label: string;
  amount: number;
}

/**
 * Tap-to-fill amounts for recording a payment. Each is capped at what the
 * member still owes (the backend rejects overpayment). When two options are
 * the same amount, the more meaningful label wins (arrears, then balance,
 * then month multiples); the survivors are shown smallest first.
 */
export const quickAmounts = (obligation: Obligation, row: ComplianceRow): QuickAmount[] => {
  const balance = balanceOf(row);
  if (balance <= 0) return [];
  const perMonth = obligation.amountPerMonth ?? 0;
  const byPriority: QuickAmount[] = [
    { label: "Clear arrears", amount: arrearsOf(row) },
    { label: "Full balance", amount: balance },
    ...(isDuesObligation(obligation) && perMonth > 0
      ? [
          { label: "1 month", amount: perMonth },
          { label: "3 months", amount: perMonth * 3 },
        ]
      : []),
  ];
  const seen = new Set<number>();
  return byPriority
    .filter(({ amount }) => {
      if (amount <= 0 || amount > balance || seen.has(amount)) return false;
      seen.add(amount);
      return true;
    })
    .sort((a, b) => a.amount - b.amount);
};

/**
 * Plain-language preview of where a dues payment goes. The backend fills the
 * earliest unpaid months in order, so only the starting month and the
 * monthly equivalent are stated — not a per-month allocation.
 */
export const duesPaymentHint = (
  obligation: Obligation,
  row: ComplianceRow,
  amount: number,
) => {
  const perMonth = obligation.amountPerMonth ?? 0;
  const from = nextUnpaidMonth(row);
  if (!perMonth || !from || !(amount > 0)) return null;
  const months = amount / perMonth;
  const worth =
    months === 1
      ? "1 month's"
      : Number.isInteger(months)
        ? `${months} months'`
        : `about ${months.toFixed(1)} months'`;
  return `Fills from ${monthLabel(from)} onwards — ${worth} worth.`;
};

/** Default obligation: this year's dues, else the latest levy, else the first. */
export const defaultObligationId = (
  obligations: readonly Obligation[],
  today: Date = new Date(),
) => {
  if (!obligations.length) return "";
  const year = today.getFullYear();
  const dues = obligations.find((o) => isDuesObligation(o) && o.year === year);
  if (dues) return dues.id;
  const levies = obligations
    .filter((o) => o.type === "levy" && o.date)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return (levies[0] ?? obligations[0]).id;
};

/** "2026-03-01" → "1 Mar 2026"; anything unparseable is shown as stored. */
export const formatBusinessDate = (value: string) => {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "d MMM yyyy") : value;
};

/** Normalises a raw members-list record (id or _id) for finance screens. */
export const toFinanceMember = (raw: Record<string, unknown>): FinanceMember => ({
  id: String(raw.id ?? raw._id ?? ""),
  name: String(raw.name ?? ""),
  financialStartDate:
    typeof raw.financialStartDate === "string" && raw.financialStartDate
      ? raw.financialStartDate
      : null,
});

export type StartDateFilter = "all" | "missing" | "set";

export const START_DATE_FILTER_LABELS: Record<StartDateFilter, string> = {
  all: "All",
  missing: "No start date",
  set: "Has start date",
};

export const matchesStartDateFilter = (member: FinanceMember, filter: StartDateFilter) =>
  filter === "all" ||
  (filter === "missing" ? !member.financialStartDate : !!member.financialStartDate);

/**
 * Consequences of start-date changes, worded from the backend's behaviour:
 * a new date re-applies the member's dues payments to the new liable window
 * (dropping anything that no longer fits the year); clearing the date
 * archives every payment the member has, on every obligation.
 */
export const REALLOCATION_WARNING =
  "Their recorded dues payments will be re-applied from the new date, and any amount that no longer fits the year will be dropped.";
export const CLEAR_WARNING =
  "All of their recorded payments, on every obligation, will be cleared. This can't be undone.";

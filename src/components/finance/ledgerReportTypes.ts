import { LedgerAccount } from "components/finance/ledgerTypes";
import { JournalDetail } from "helpers/ledgerReversals";

/**
 * F2B-4 read-only report shapes (RFC v0.3 §5.5, §8.4).
 *
 * Every figure is the server's. A balance the server could not know is
 * `null` with state `unknown`; it is never 0 and nothing here may turn it
 * into one. The frontend never recomputes a balance, total or closing.
 */

/** `known` only when the server said exactly "known"; anything else is unknown. */
export type ReportState = "known" | "unknown";

export type CashbookDirection = "in" | "out";

export interface CashbookItem {
  journal: JournalDetail;
  direction: CashbookDirection;
  /** Always positive integer kobo; the direction carries the sign. */
  amountKobo: number;
  /** null whenever the page's balance state is unknown. */
  runningBalanceKobo: number | null;
}

export interface CashbookDayClosing {
  date: string;
  /** The whole day's closing, even when the day continues on another page. */
  closingKobo: number | null;
}

export interface CashbookPage {
  account: LedgerAccount;
  balanceState: ReportState;
  /** The balance before the page's first row (or before the window when empty). */
  balanceBeforeKobo: number | null;
  items: CashbookItem[];
  dayClosings: CashbookDayClosing[];
  nextCursor: string | null;
}

export interface AccountBalance {
  accountId: string;
  balanceState: ReportState;
  /** In the account's normal direction; may legitimately be negative. */
  balanceKobo: number | null;
}

export interface BalancesReport {
  asOf: string;
  accounts: AccountBalance[];
  /** Cash plus bank; null while any active cash or bank account is unknown. */
  moneyTotalKobo: number | null;
}

export interface SummaryCategory {
  accountId: string;
  name: string;
  active: boolean | null;
  /** Net of reversals; negative when a reversal outweighs the window's postings. */
  amountKobo: number;
}

export interface SummarySection {
  totalKobo: number;
  categories: SummaryCategory[];
}

/**
 * Member money held for members (a liability). Never income. The server's
 * identity: heldAtStart + opening + received − refunded − allocated +
 * reversals + other = heldAtEnd. The UI shows these figures; it never
 * derives one from the others.
 */
export interface MemberMoneySummary {
  heldAtStartKobo: number;
  openingKobo: number;
  receivedKobo: number;
  refundedKobo: number;
  allocatedKobo: number;
  reversalsKobo: number;
  otherKobo: number;
  heldAtEndKobo: number;
}

export type SummaryReport =
  | { summaryState: "unknown"; from: string; to: string }
  | {
      summaryState: "known";
      from: string;
      to: string;
      income: SummarySection;
      expense: SummarySection;
      netKobo: number;
      /** null when the organisation has no member-money account. */
      memberMoney: MemberMoneySummary | null;
    };

/* ------------------------------------------------------------------ */
/* Financial Report v1 preview figures                                */
/* ------------------------------------------------------------------ */

/**
 * The Financial Report preview's category totals (BE-1). `rowLimit` only
 * bounds its sample rows; these totals cover the whole period and are what
 * the PDF and workbook print. `name` is null for member money, which has no
 * income or expense account.
 */
export interface FinancialReportCategoryTotal {
  accountId: string | null;
  name: string | null;
  count: number;
  /** Net of reversals; may be negative or zero. */
  amountKobo: number;
}

/** One statement group ("receipts", "member_money", "expenses", ...). */
export interface FinancialReportMoneyGroup {
  key: string;
  label: string;
  /** Exact number of entries, even when the preview's rows are capped. */
  count: number;
  totalKobo: number;
  categories: FinancialReportCategoryTotal[];
}

export type FinancialReportAccountState = "in_books" | "brought_in" | "unknown";

/** One reported cash or bank account at period end. */
export interface FinancialReportAccountRow {
  accountId: string;
  name: string;
  kind: "cash" | "bank";
  active: boolean;
  state: FinancialReportAccountState;
  /** null when the account's balance is unknown; never treated as zero. */
  carriedForwardKobo: number | null;
  broughtInOn: string | null;
  bankName: string | null;
  accountNumberLast4: string | null;
}

/**
 * The statement as the backend computed it. B/F, gross and C/F are null when
 * the report is incomplete; they are never recomputed here.
 */
export interface FinancialReportStatement {
  broughtForwardKobo: number | null;
  broughtForwardAsOf: string | null;
  broughtForwardBasis: "verified_opening" | "balance" | null;
  broughtInCount: number;
  broughtInTotalKobo: number;
  receivedGroups: FinancialReportMoneyGroup[];
  receivedTotalKobo: number;
  paidGroups: FinancialReportMoneyGroup[];
  paidTotalKobo: number;
  grossBalanceKobo: number | null;
  carriedForwardKobo: number | null;
  carriedForwardAsOf: string;
  transfersCount: number;
  transfersTotalKobo: number;
}

/** An account the server left out of the report (and said why). */
export interface FinancialReportExcludedAccount {
  name: string;
  reason: "never_opened" | "not_yet_in_books" | null;
}

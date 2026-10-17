export type ObligationType = "dues" | "levy";
export type MonthStatus = "paid" | "partial" | "unpaid" | "not-due";
/** A member's standing across a whole obligation. */
export type OverallStatus = "paid" | "partial" | "unpaid";

/**
 * Collection totals for one obligation. Mirrors the compliance report's
 * summary; the obligation list only carries it once the backend sends it, so
 * every reader must treat it as optional.
 */
export interface ObligationSummary {
  totalMembers: number;
  accountableMembers: number;
  paidMembers: number;
  totalExpected: number;
  /** Value applied to this obligation under current start dates. */
  totalCollected: number;
  totalOutstanding: number;
  /** All value recorded on payment rows; absent on older backends. */
  totalRecorded?: number;
  /** Recorded value that does not apply under current start dates. */
  totalUnappliedCredit?: number;
}

export interface Obligation {
  id: string;
  type: ObligationType;
  name: string;
  year?: number;
  amountPerMonth?: number;
  amount?: number;
  date?: string;
  summary?: ObligationSummary;
}

export interface ComplianceRow {
  memberId: string;
  name: string;
  accountable: boolean;
  /** Overall standing; older backends only send it for levies. */
  status?: MonthStatus;
  // dues
  months?: Record<string, MonthStatus>;
  totalExpected?: number;
  totalPaid?: number;
  balance?: number;
  paidUpToMonth?: number;
  compliance?: number;
  /** @deprecated No longer sent; use `unappliedCredit`. */
  creditMonths?: number[];
  // levy
  liable?: boolean;
  expected?: number;
  paid?: number;
  // Arrears lens as of the requested date; absent on older backends and on
  // non-accountable rows. `balance` still covers the whole year.
  dueToDate?: number;
  arrears?: number;
  /** Dues only: due months not fully paid. */
  monthsBehind?: number;
  // Recorded vs applied, also on non-accountable rows; absent on older
  // backends. Paid / balance figures above are the applied value.
  /** Everything recorded on the payment row; null when it is invalid. */
  recordedTotal?: number | null;
  appliedTotal?: number;
  /** Recorded value beyond what is owed under the current start date. */
  unappliedCredit?: number;
  /** The stored amount is invalid and needs an admin review. */
  invalidStoredAmount?: boolean;
}

export interface ComplianceSummary {
  totalMembers: number;
  accountableMembers: number;
  totalCollected: number;
  totalOutstanding: number;
  paidMembers?: number;
  totalExpected?: number;
  totalDueToDate?: number;
  totalArrears?: number;
  behindMembers?: number;
  totalRecorded?: number;
  totalUnappliedCredit?: number;
  creditMembers?: number;
  invalidPaymentRows?: number;
}

/** Bulk start-date result: partial success is normal, not an error. */
export interface BulkStartDateResponse {
  updated: string[];
  failed: { memberId: string; error: string }[];
}

export interface ComplianceResponse {
  obligation: Obligation;
  summary: ComplianceSummary;
  rows: ComplianceRow[];
}

/** A member as the finance screens read it from the shared members list. */
export interface FinanceMember {
  id: string;
  name: string;
  financialStartDate: string | null;
}

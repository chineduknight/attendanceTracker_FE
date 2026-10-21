export type ObligationType = "dues" | "levy";
/** `unknown`: the month depends on a payment record with an invalid amount. */
export type MonthStatus = "paid" | "partial" | "unpaid" | "not-due" | "unknown";
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
  /**
   * Value APPLIED to this obligation under current start dates (named
   * "collected" for compatibility). Not cash income; see totalRecorded.
   */
  totalCollected: number;
  /** Explicit name for totalCollected; absent on older backends. */
  totalApplied?: number;
  totalOutstanding: number;
  /** All value recorded on payment rows; absent on older backends. */
  totalRecorded?: number;
  /** Recorded value that does not apply under current start dates. */
  totalUnappliedCredit?: number;
  /** Rows with an invalid stored amount; the totals above exclude them. */
  invalidPaymentRows?: number;
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
  /**
   * Overall standing; older backends only send it for levies.
   * `needs-review`: the stored amount is invalid, so what was paid is unknown.
   */
  status?: MonthStatus | "needs-review";
  // dues
  months?: Record<string, MonthStatus>;
  totalExpected?: number;
  // null = unknown (invalidStoredAmount): never read it as 0.
  totalPaid?: number | null;
  balance?: number | null;
  paidUpToMonth?: number | null;
  /** Absent when the member owes nothing this year (`liable: false`); null when unknown. */
  compliance?: number | null;
  /** False when nothing is owed: a levy dated before the start date, or a
   * dues year that ends before it. */
  liable?: boolean;
  // levy
  expected?: number;
  paid?: number | null;
  // Arrears lens as of the requested date; absent on older backends and on
  // non-accountable rows. `balance` still covers the whole year.
  dueToDate?: number;
  arrears?: number | null;
  /** Dues only: due months not fully paid. */
  monthsBehind?: number | null;
  // Recorded vs applied, also on non-accountable rows; absent on older
  // backends. Paid / balance figures above are the applied value.
  /** Everything recorded on the payment row; null when it is invalid. */
  recordedTotal?: number | null;
  appliedTotal?: number | null;
  /** Recorded value beyond what is owed under the current start date. */
  unappliedCredit?: number | null;
  /** The stored amount is invalid and needs an admin review. */
  invalidStoredAmount?: boolean;
  /**
   * Version of the payment row and member finance state this row was built
   * from. A correction sends back the guard of the row the officer saw so the
   * backend can refuse it (409) if either changed since. Absent on older
   * backends, and then corrections are blocked.
   */
  correctionGuard?: CorrectionGuard;
}

export interface CorrectionGuard {
  paymentRowExists: boolean;
  /** null: no payment row, or a legacy row saved before revisions. */
  paymentRevision: number | null;
  /** 0 is a real revision (legacy members), not "missing". */
  memberFinanceRevision: number;
}

export interface ComplianceSummary {
  totalMembers: number;
  accountableMembers: number;
  /** Applied value, as on ObligationSummary. */
  totalCollected: number;
  totalApplied?: number;
  totalOutstanding: number;
  paidMembers?: number;
  totalExpected?: number;
  totalDueToDate?: number;
  totalArrears?: number;
  behindMembers?: number;
  totalRecorded?: number;
  totalUnappliedCredit?: number;
  creditMembers?: number;
  /** Rows with an invalid stored amount; money totals exclude them. */
  invalidPaymentRows?: number;
  /** What the members with invalid records are known to owe. */
  invalidRowsExpected?: number;
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

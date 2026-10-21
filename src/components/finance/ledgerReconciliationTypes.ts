/**
 * F3-4 allocation and reconciliation read shapes (F3 RFC v0.3 §10, §12;
 * backend FRONTEND_API "Allocations and reconciliation").
 *
 * Two kinds of figure are never mixed: ledger figures (sources, allocations,
 * member income, the holding balance) and F0 figures (a position's recorded,
 * applied and credit values), which are F0's CURRENT values as read at
 * `readAt`. Every figure is the server's; the client never derives one.
 */

import { JournalDetail } from "helpers/ledgerReversals";
import { MemberMoneyPurpose } from "components/finance/ledgerPostingTypes";
import { MemberMoneySummary } from "components/finance/ledgerReportTypes";

export type ObligationKind = "dues" | "levy";

export type MemberMoneySourceKind = "receipt" | "opening_item";

/** How readable F0's value for a position is. */
export type RecordedState = "known" | "unknown" | "ambiguous";

/** Review flags (never errors) a position can carry. */
export const POSITION_FLAGS = [
  "OVER_LINKED",
  "ALLOCATED_INTO_CREDIT",
  "ALLOCATED_BEYOND_AFTER_SNAPSHOT",
  "MEMBER_ARCHIVED",
  "OBLIGATION_ARCHIVED",
  "NEEDS_REVIEW",
  "AMBIGUOUS",
] as const;

export type PositionFlag = (typeof POSITION_FLAGS)[number];

/** The F0 snapshot taken when member receipts went live (activation or later). */
export interface ReconciliationSnapshotLabel {
  takenAt: string;
  trigger: string;
}

/* ------------------------------------------------------------------ */
/* GET /allocations                                                   */
/* ------------------------------------------------------------------ */

export interface AllocationSourceRef {
  kind: MemberMoneySourceKind;
  id: string;
  number: string;
}

export interface AllocationHistoryItem {
  journal: JournalDetail;
  /** `A-…`. */
  number: string;
  source: AllocationSourceRef;
  memberId: string;
  obligationId: string;
  obligationType: ObligationKind;
  /** The hints the officer confirmed as mismatched (`member`, `obligation`, `purpose`). */
  confirmedMismatches: string[];
  state: "live" | "reversed";
  reversal: { journalId: string; businessDate: string | null; postedAt: string | null } | null;
}

export interface AllocationHistoryPage {
  readAt: string;
  items: AllocationHistoryItem[];
  nextCursor: string | null;
}

/* ------------------------------------------------------------------ */
/* GET /reconciliation/sources                                        */
/* ------------------------------------------------------------------ */

export interface ReconciliationSourceRow {
  kind: MemberMoneySourceKind;
  id: string;
  number: string;
  payerName: string | null;
  businessDate: string;
  ageDays: number;
  effectiveKobo: number;
  refundedKobo: number;
  allocatedKobo: number;
  remainingKobo: number;
  hints: {
    memberId: string | null;
    obligationId: string | null;
    /** null when absent or a purpose this build doesn't know. */
    purpose: MemberMoneyPurpose | null;
  };
}

export type SuggestionHint = "member" | "obligation" | "purpose";

export interface AllocationSuggestion {
  memberId: string;
  obligationId: string;
  obligationType: ObligationKind | null;
  /** Current F0 value; a matching hint, never an instruction. */
  unlinkedKobo: number;
  matchedHints: SuggestionHint[];
}

export interface SourcesReport {
  readAt: string;
  asOf: string;
  items: ReconciliationSourceRow[];
  /** Current-F0 suggestions, keyed by source number; null for a historical asOf. */
  suggestions: { readAt: string; bySource: Record<string, AllocationSuggestion[]> } | null;
  suggestionsOmitted: "historical_as_of" | null;
  nextCursor: string | null;
}

/* ------------------------------------------------------------------ */
/* GET /reconciliation/positions                                      */
/* ------------------------------------------------------------------ */

export interface ExplainingSource {
  kind: MemberMoneySourceKind;
  id: string;
  number: string;
  businessDate: string;
  allocatedKobo: number;
}

export interface PositionSnapshot {
  takenAt: string;
  snapshotState: "present" | "absent";
  recordedState: RecordedState;
  recordedKobo: number | null;
  /** Can be negative (a later correction); null when either value is unknown. */
  recordedAfterSnapshotKobo: number | null;
  explainingSources: ExplainingSource[];
}

export interface ReconciliationPosition {
  memberId: string;
  obligationId: string;
  obligationType: ObligationKind | null;
  recordedState: RecordedState;
  /** F0, current. null unless `recordedState` is `known`. */
  recordedKobo: number | null;
  /** Ledger: always known. */
  allocatedKobo: number;
  linkedKobo: number | null;
  unlinkedKobo: number | null;
  overLinkedKobo: number | null;
  /** F0, current; null when F0 can't compute it. */
  appliedKobo: number | null;
  creditKobo: number | null;
  snapshot: PositionSnapshot | null;
  /** Known flags, plus any this build doesn't recognise (still shown for review). */
  flags: string[];
}

export interface PositionsReport {
  readAt: string;
  snapshot: ReconciliationSnapshotLabel | null;
  items: ReconciliationPosition[];
  nextCursor: string | null;
}

/* ------------------------------------------------------------------ */
/* GET /reconciliation/summary                                        */
/* ------------------------------------------------------------------ */

export interface ReconciliationIdentityCheck {
  name: string;
  kind: string;
  consistent: boolean;
  leftKobo: number;
  rightKobo: number;
}

export interface PositionTotals {
  positionCount: number;
  recordedTotalState: "complete" | "incomplete";
  /** null while any position is unknown or ambiguous. */
  recordedTotalKobo: number | null;
  linkedTotalKobo: number | null;
  unlinkedTotalKobo: number | null;
  overLinkedTotalKobo: number | null;
  unknownPositions: number;
  ambiguousPositions: number;
  knownRecordedTotalKobo: number;
  allocatedTotalKobo: number;
  allocatedOnUnknownKobo: number;
  knownPositions: {
    count: number;
    recordedKobo: number;
    allocatedKobo: number;
    linkedKobo: number;
    unlinkedKobo: number;
    overLinkedKobo: number;
  };
}

export interface ReconciliationFlows {
  flowState: "known" | "unknown";
  allocationsKobo: number | null;
  allocationReversalsKobo: number | null;
  netAllocatedKobo: number | null;
  memberIncomeKobo: number | null;
  memberMoney: MemberMoneySummary | null;
}

export interface ReconciliationSummary {
  readAt: string;
  from: string;
  to: string;
  snapshot: ReconciliationSnapshotLabel | null;
  balances: {
    holdingBalanceKobo: number;
    sources: {
      count: number;
      effectiveKobo: number;
      refundedKobo: number;
      allocatedKobo: number;
      remainingKobo: number;
    };
    memberIncome: { duesKobo: number; levyKobo: number; totalKobo: number };
  };
  positions: PositionTotals;
  flows: ReconciliationFlows;
  identities: {
    consistent: boolean;
    message: string | null;
    checks: ReconciliationIdentityCheck[];
  };
  lists: {
    openSources: { minAgeDays: number; count: number; items: ReconciliationSourceRow[] };
    overLinkedPositions: { count: number; items: ReconciliationPosition[] };
    positionsNeedingReview: { count: number; items: ReconciliationPosition[] };
  };
}

/** A request, from a report, to start an allocation (the wizard still checks everything). */
export interface AllocationStart {
  sourceId: string;
  sourceNumber: string;
  memberId: string;
  obligationId: string;
  /** Distinguishes two identical requests. */
  nonce: number;
}

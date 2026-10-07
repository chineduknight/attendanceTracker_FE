/**
 * Phase 7C Welfare follow-up payloads — mirrors the backend response exactly.
 *
 * A follow-up is human context only. Nothing in this module derives from
 * attendance, analytics or the member model, and no field is computed in the
 * browser: the backend owns the records, the summary counts, the ordering and
 * the revision used for concurrency.
 */

export type WelfareFollowUpSourceType =
  | "manual"
  | "attention"
  | "communicated"
  | "encouragement";

export type WelfareFollowUpWorkflowStatus = "open" | "closed";

/** A resolved member/assignee/audit user; null when it can no longer resolve. */
export interface WelfareFollowUpPersonRef {
  id: string;
  name: string | null;
}

/** One follow-up exactly as the API serializes it. */
export interface WelfareFollowUp {
  id: string;
  organisationId: string;
  memberId: string;
  member: WelfareFollowUpPersonRef | null;
  recordDate: string;
  sourceType: WelfareFollowUpSourceType;
  sourceSignals: string[];
  sourceAsOf: string | null;
  reason: string;
  note: string | null;
  workflowStatus: WelfareFollowUpWorkflowStatus;
  nextFollowUpDate: string | null;
  assignedTo: WelfareFollowUpPersonRef | null;
  createdBy: WelfareFollowUpPersonRef | null;
  updatedBy: WelfareFollowUpPersonRef | null;
  closedAt: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Backend summary of the organisation's active (non-archived) follow-ups —
 * never recomputed in the browser. List filters do not narrow it.
 */
export interface WelfareFollowUpSummary {
  open: number;
  dueToday: number;
  overdue: number;
}

export interface WelfareFollowUpListData {
  summary: WelfareFollowUpSummary;
  followUps: WelfareFollowUp[];
}

/** Exactly the create body the backend accepts — nothing more. */
export interface WelfareFollowUpCreatePayload {
  memberId: string;
  recordDate: string;
  sourceType: WelfareFollowUpSourceType;
  sourceSignals: string[];
  sourceAsOf: string | null;
  reason: string;
  note: string | null;
  workflowStatus: WelfareFollowUpWorkflowStatus;
  nextFollowUpDate: string | null;
  assignedToUserId: string | null;
}

/**
 * Editable fields plus the revision guard. `memberId` and source provenance
 * are immutable after creation and must never appear here.
 */
export interface WelfareFollowUpUpdatePayload {
  expectedRevision: number;
  recordDate?: string;
  reason?: string;
  note?: string | null;
  workflowStatus?: WelfareFollowUpWorkflowStatus;
  nextFollowUpDate?: string | null;
  assignedToUserId?: string | null;
}

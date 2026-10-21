import { LedgerStatus } from "components/finance/ledgerTypes";

/**
 * Wire shapes for F2A-3B ledger lifecycle (F2 Cashbook RFC v0.3 §4.2, §4.6,
 * §4.7, D9, D12, D28) exactly as the merged backend sends them.
 *
 * Only these fields are read; nothing here is derived client-side. Amounts,
 * balances and posting capability never appear in this module.
 */

/** Every audit action the backend enum accepts (`LEDGER_AUDIT_ACTIONS`). */
export const LEDGER_AUDIT_ACTIONS = [
  "setup_started",
  "account_created",
  "account_renamed",
  "account_deactivated",
  "account_reactivated",
  "member_receipts_enabled",
  "member_money_item_added",
  "member_money_item_adjusted",
  "gap_window_attested",
  "opening_proposed",
  "opening_rejected",
  "opening_withdrawn",
  "opening_verified",
  "ledger_suspended",
  "ledger_resumed",
  "period_locked",
  "period_unlocked",
  "attempt_voided",
  "member_allocations_enabled",
  "member_allocations_disabled",
] as const;

export type LedgerAuditActionKey = (typeof LEDGER_AUDIT_ACTIONS)[number];

/**
 * An action string this build does not recognise is kept verbatim. It is
 * displayed by its raw key and never treated as one of the known actions.
 */
export type LedgerAuditAction =
  | { kind: "known"; action: LedgerAuditActionKey }
  | { kind: "unknown"; raw: string };

export interface LedgerAuditSubject {
  type: string;
  id: string;
}

/**
 * One append-only audit row (`GET /ledger/audit`). `before`/`after` are shown
 * only when the server sent a record; they are never reconstructed.
 */
export interface LedgerAuditEntry {
  id: string;
  action: LedgerAuditAction;
  /** null when the row did not carry a usable actor id. */
  actorId: string | null;
  /** ISO timestamp, or null when absent/unparseable. */
  at: string | null;
  /** Ledger revision after the action; null when absent. */
  ledgerRevision: number | null;
  subject: LedgerAuditSubject | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  voidId: string | null;
}

export interface LedgerAuditPage {
  items: LedgerAuditEntry[];
  /** Opaque cursor for older rows; null means this page reached the oldest. */
  nextCursor: string | null;
}

/** Exact body for `POST …/ledger/suspend` and `POST …/ledger/resume`. */
export interface SuspendResumeInput {
  expectedLedgerRevision: number;
  reason: string;
}

/** Exact body for `PUT …/ledger/period-lock`. */
export interface PeriodLockInput {
  expectedLedgerRevision: number;
  /** `YYYY-MM-DD`, or null to remove the lock (needs a reason). */
  lockedThrough: string | null;
  reason?: string;
}

/** Exact body for `POST …/ledger/gap-window/attest`. */
export interface GapWindowAttestInput {
  expectedLedgerRevision: number;
  attestation: true;
}

/**
 * A lifecycle write's result. `status` is the server's resulting ledger
 * status, or null when the 2xx body was not a usable status — in which case
 * no state claim may be made and the screen must ask for a reload.
 */
export interface LifecycleWriteResult {
  status: LedgerStatus | null;
}

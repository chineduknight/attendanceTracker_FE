import { isValid, parseISO } from "date-fns";
import { LedgerStatus } from "components/finance/ledgerTypes";
import {
  LEDGER_AUDIT_ACTIONS,
  LedgerAuditAction,
  LedgerAuditActionKey,
  LedgerAuditEntry,
  LedgerAuditPage,
  LifecycleWriteResult,
} from "components/finance/lifecycleTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { LEDGER_STATE_LABELS, ledgerStateKey } from "helpers/ledger";
import { formatLagosTimestamp } from "helpers/openingBalances";

/**
 * Pure rules for the F2A-3B lifecycle screens: suspend/resume, the period
 * lock and the once-only gap-window attestation (RFC v0.3 §4.2, §4.6, §4.7,
 * D9, D12, D28).
 *
 * Everything here mirrors the merged backend for UX only. The backend stays
 * authoritative: no rule below replaces a server refusal, and no missing
 * field is turned into an attestation, an activation or a lock date.
 */

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const asRevision = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

export const isBusinessDate = (value: string): boolean =>
  BUSINESS_DATE.test(value) && isValid(parseISO(value));

/* ------------------------------------------------------------------ */
/* Audit read                                                         */
/* ------------------------------------------------------------------ */

const isAuditAction = (value: string): value is LedgerAuditActionKey =>
  (LEDGER_AUDIT_ACTIONS as readonly string[]).includes(value);

const toAuditAction = (raw: string): LedgerAuditAction =>
  isAuditAction(raw) ? { kind: "known", action: raw } : { kind: "unknown", raw };

/**
 * One audit row. Structurally it needs an `id` and a non-blank `action`;
 * display-only fields (actor, time, before/after) stay null when unusable
 * rather than dropping the row or fabricating a value.
 */
export const toLedgerAuditEntry = (value: unknown): LedgerAuditEntry | null => {
  const raw = asRecord(value);
  const id = asText(raw?.id);
  const actionText = asText(raw?.action);
  if (!raw || !id || !actionText) return null;
  const subject = asRecord(raw.subject);
  return {
    id,
    action: toAuditAction(actionText),
    actorId: asText(raw.actorId),
    at: asTimestamp(raw.at),
    ledgerRevision: asRevision(raw.ledgerRevision),
    subject:
      subject && asText(subject.type) && asText(subject.id)
        ? { type: asText(subject.type) as string, id: asText(subject.id) as string }
        : null,
    before: asRecord(raw.before),
    after: asRecord(raw.after),
    reason: asText(raw.reason),
    voidId: asText(raw.voidId),
  };
};

/**
 * One audit page. A malformed item makes the page unusable instead of
 * yielding a shorter list that could look like the complete history.
 */
export const toLedgerAuditPage = (value: unknown): LedgerAuditPage | null => {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.items)) return null;
  const items: LedgerAuditEntry[] = [];
  for (const item of raw.items) {
    const parsed = toLedgerAuditEntry(item);
    if (!parsed) return null;
    items.push(parsed);
  }
  return {
    items,
    nextCursor: asText(raw.nextCursor),
  };
};

export const ledgerAuditActionLabels: Record<
  LedgerAuditActionKey | "unknown",
  string
> = {
  setup_started: "Bookkeeping setup started",
  account_created: "Account created",
  account_renamed: "Account renamed",
  account_deactivated: "Account deactivated",
  account_reactivated: "Account reactivated",
  member_receipts_enabled: "Member receipts enabled",
  member_money_item_added: "Member money item added",
  member_money_item_adjusted: "Member money item adjusted",
  gap_window_attested: "Gap window attested",
  opening_proposed: "Opening proposed",
  opening_rejected: "Opening rejected",
  opening_withdrawn: "Opening withdrawn",
  opening_verified: "Opening verified",
  ledger_suspended: "Ledger suspended",
  ledger_resumed: "Ledger resumed",
  period_locked: "Period lock set",
  period_unlocked: "Period lock moved back or removed",
  attempt_voided: "Posting attempt voided",
  unknown: "Unrecognised action",
};

export const auditActionLabel = (action: LedgerAuditAction): string =>
  action.kind === "known"
    ? ledgerAuditActionLabels[action.action]
    : `${ledgerAuditActionLabels.unknown} (${action.raw})`;

/** The newest entry for one action, or null when this page has none. */
export const latestAuditEntry = (
  entries: readonly LedgerAuditEntry[],
  action: LedgerAuditActionKey,
): LedgerAuditEntry | null =>
  entries.find(
    (entry) => entry.action.kind === "known" && entry.action.action === action,
  ) ?? null;

/**
 * A short "before → after" line for a lifecycle row, or null when the row did
 * not carry the fields it would describe. Never reconstructed from other rows.
 */
export const auditDetail = (entry: LedgerAuditEntry): string | null => {
  if (entry.action.kind !== "known") return null;
  const before = entry.before;
  const after = entry.after;
  if (entry.action.action === "ledger_suspended" || entry.action.action === "ledger_resumed") {
    const from = asText(before?.state);
    const to = asText(after?.state);
    return from && to ? `State: ${from} → ${to}` : null;
  }
  if (entry.action.action === "period_locked" || entry.action.action === "period_unlocked") {
    if (!before || !after) return null;
    if (!("lockedThrough" in before) || !("lockedThrough" in after)) return null;
    return `Period lock: ${asText(before.lockedThrough) ?? "none"} → ${asText(after.lockedThrough) ?? "none"}`;
  }
  if (entry.action.action === "gap_window_attested") {
    const openingDate = asText(after?.openingDate);
    return openingDate ? `Opening date: ${openingDate}` : null;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Permissions and state transitions                                  */
/* ------------------------------------------------------------------ */

export type LifecycleAction = "suspend" | "resume" | "period-lock" | "attest-gap-window";

export interface LifecyclePermission {
  allowed: boolean;
  reason: string | null;
}

const deny = (reason: string): LifecyclePermission => ({ allowed: false, reason });

/**
 * Whether the signed-in officer may start one lifecycle action, and why not.
 *
 * Order matters: an unrecognised state is reported before permissions so no
 * action is ever offered against a state this build cannot interpret; every
 * owner-only action follows the backend's `finance.manage + ownerOnly` rule.
 */
export const lifecyclePermission = ({
  action,
  status,
  canManage,
  isOwner,
}: {
  action: LifecycleAction;
  status: LedgerStatus;
  canManage: boolean;
  isOwner: boolean;
}): LifecyclePermission => {
  const state = ledgerStateKey(status);
  if (state === "unknown")
    return deny(
      "This app version doesn't recognise the ledger state the server sent, so no lifecycle change is offered.",
    );
  if (!canManage) return deny("You need the finance manage permission.");
  if (action !== "attest-gap-window" && !isOwner)
    return deny("Only the organisation owner can suspend, resume or move the period lock.");
  if (status.revision === null)
    return deny(
      "This server doesn't send the ledger revision yet, so this change can't be submitted safely.",
    );

  if (action === "suspend" && state !== "active")
    return deny("Only an active ledger can be suspended.");
  if (action === "resume" && state !== "suspended")
    return deny("Only a suspended ledger can be resumed.");
  if (
    action === "period-lock" &&
    state !== "active" &&
    state !== "suspended"
  )
    return deny("The period lock can only move while the ledger is active or suspended.");
  if (action === "attest-gap-window") {
    if (state !== "active" && state !== "suspended")
      return deny("The gap window can only be attested after the ledger is activated.");
    if (status.gapWindowAttestation === "attested")
      return deny("The gap window has already been attested and can't be attested again.");
    if (status.gapWindowAttestation === "unknown")
      return deny(
        "The server didn't say whether the gap window is attested, so this app won't offer it again.",
      );
    const windowProblem = gapWindowProblem(status);
    if (windowProblem) return deny(windowProblem);
  }

  return { allowed: true, reason: null };
};

/* ------------------------------------------------------------------ */
/* Gap window                                                         */
/* ------------------------------------------------------------------ */

export interface GapWindow {
  openingDate: string;
  /** ISO activation instant; display only. */
  activatedAt: string;
}

/**
 * The displayed gap window `[openingDate, activatedAt)`. Both values must be
 * readable; a missing activation time is never replaced with today.
 */
export const gapWindow = (status: LedgerStatus): GapWindow | null => {
  if (!status.openingDate || !status.activatedAt) return null;
  return { openingDate: status.openingDate, activatedAt: status.activatedAt };
};

/** The Lagos calendar date of an instant, as YYYY-MM-DD. */
const lagosBusinessDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));

/** Why the gap window can't be shown, or null. */
export const gapWindowProblem = (status: LedgerStatus): string | null => {
  if (!status.openingDate)
    return "The server didn't send the ledger's opening date, so the gap window can't be shown.";
  if (!status.activatedAt)
    return "The server didn't send the activation time, so the gap window can't be shown.";
  if (lagosBusinessDate(status.activatedAt) < status.openingDate)
    return "The server's activation time is earlier than the opening date, so this app can't show a gap window.";
  return null;
};

/* ------------------------------------------------------------------ */
/* Period lock                                                        */
/* ------------------------------------------------------------------ */

export type PeriodLockChange = "set" | "forward" | "back" | "unlock" | "unchanged";

/** Which kind of lock move `current → next` is. */
export const periodLockChange = (
  current: string | null,
  next: string | null,
): PeriodLockChange => {
  if (next === null) return current === null ? "unchanged" : "unlock";
  if (current === null) return "set";
  if (next > current) return "forward";
  if (next < current) return "back";
  return "unchanged";
};

/** Moving the lock earlier or removing it is the audited unlock (D12). */
export const periodLockNeedsReason = (change: PeriodLockChange): boolean =>
  change === "back" || change === "unlock";

/**
 * Why a requested lock date would be refused by this app, or null. The
 * backend still validates; a missing opening date means the client cannot
 * check the rule and must not guess.
 */
export const periodLockIssue = ({
  next,
  current,
  openingDate,
  today,
}: {
  next: string | null;
  current: string | null;
  openingDate: string | null;
  today: string;
}): string | null => {
  if (next === null) {
    if (current === null) return "The period is already unlocked.";
    return null;
  }
  if (!isBusinessDate(next)) return "Choose a valid lock date.";
  if (!openingDate)
    return "The server didn't send the ledger's opening date, so a lock date can't be checked.";
  if (next < openingDate)
    return "The period lock can't be earlier than the ledger's opening date.";
  if (next > today) return "The period lock can't be later than today in Lagos.";
  if (current !== null && next === current) return "The period lock is already at this date.";
  return null;
};

/* ------------------------------------------------------------------ */
/* Reasons                                                            */
/* ------------------------------------------------------------------ */

export const MAX_LIFECYCLE_REASON = 500;

const reasonTooLong = (reason: string) =>
  reason.trim().length > MAX_LIFECYCLE_REASON
    ? `Keep the reason to ${MAX_LIFECYCLE_REASON} characters or fewer.`
    : null;

/** Suspend/resume reasons are required by the backend and audited. */
export const lifecycleReasonIssue = (reason: string): string | null => {
  if (!reason.trim()) return "Enter a reason for this change.";
  return reasonTooLong(reason);
};

/** A forward lock move needs no reason; backwards or removing the lock does. */
export const periodLockReasonIssue = (
  reason: string,
  change: PeriodLockChange,
): string | null => {
  if (!periodLockNeedsReason(change)) {
    return reason.trim() ? reasonTooLong(reason) : null;
  }
  if (!reason.trim())
    return change === "unlock"
      ? "Enter a reason for removing the period lock."
      : "Enter a reason for moving the period lock back.";
  return reasonTooLong(reason);
};

/* ------------------------------------------------------------------ */
/* Outcome wording                                                    */
/* ------------------------------------------------------------------ */

const UNREADABLE_RESULT =
  "The server accepted the request, but this app couldn't read the resulting ledger state. Reload and check the audit trail before making another change.";

const stateLabel = (status: LedgerStatus) =>
  LEDGER_STATE_LABELS[ledgerStateKey(status)];

/**
 * What the officer is told after a lifecycle write. A 2xx only reports what
 * the returned status actually says; a missing or contradictory state is
 * never presented as success.
 */
export const lifecycleOutcomeMessage = ({
  action,
  result,
  lockedThrough,
}: {
  action: LifecycleAction;
  result: LifecycleWriteResult;
  /** The lock date the officer asked for, for `period-lock` only. */
  lockedThrough?: string | null;
}): string => {
  const status = result.status;
  if (!status) return UNREADABLE_RESULT;
  const state = ledgerStateKey(status);

  if (action === "suspend") {
    return state === "suspended"
      ? "The ledger is suspended. No postings or opening proposals can be made until an owner resumes it."
      : `The server accepted the suspension but still reports the ledger as ${stateLabel(status)}. Reload before trying again.`;
  }
  if (action === "resume") {
    return state === "active"
      ? "The ledger is active again."
      : `The server accepted the resume but still reports the ledger as ${stateLabel(status)}. Reload before trying again.`;
  }
  if (action === "period-lock") {
    const target = lockedThrough ?? null;
    const reported = status.lockedThrough;
    if (target === null) {
      return reported === null
        ? "The period lock is removed."
        : `The server accepted the request but still reports a period lock through ${formatBusinessDate(reported)}. Reload before trying again.`;
    }
    return reported === target
      ? `The period is now locked through ${formatBusinessDate(target)}.`
      : `The server accepted the request but reports a different period lock (${reported ? formatBusinessDate(reported) : "none"}). Reload before trying again.`;
  }
  if (status.gapWindowAttestation === "attested") {
    const at = status.gapWindowAttestedAt
      ? formatLagosTimestamp(status.gapWindowAttestedAt)
      : null;
    return at
      ? `The gap window is recorded as attested (${at}).`
      : "The gap window is recorded as attested.";
  }
  return "The server accepted the attestation but doesn't report the gap window as attested. Reload and check the audit trail before trying again.";
};

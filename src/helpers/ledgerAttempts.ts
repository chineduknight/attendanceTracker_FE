/**
 * F2B-3 unconfirmed posting attempts (RFC v0.3 §7.3–§7.6, §8.2).
 *
 * Pure helpers: reading the server's attempts list and resolve responses, and
 * applying §7.5 to a resolve failure. The server classifies every key and
 * decides who may see or resolve it. An unresolved key is never a failed
 * transaction: it may or may not have been posted until resolve proves it.
 */

import { PostingJournal } from "components/finance/ledgerPostingTypes";
import { isObjectId } from "helpers/ledgerPostingIntent";
import { ledgerApiFailure } from "helpers/ledgerSetup";
import { toPostingJournal } from "helpers/ledgerPostings";
import { isBusinessDate } from "helpers/openingBalances";
import { journalTypeLabel } from "helpers/ledgerReversals";

/** The server's settle window (D24): resolve is refused within it. */
export const ATTEMPT_SETTLE_WINDOW_MS = 2 * 60 * 1000;

export const ATTEMPT_KEY_STATUSES = ["unresolved", "refused", "committed", "voided"] as const;

export type AttemptKeyStatus = (typeof ATTEMPT_KEY_STATUSES)[number];

export interface LedgerAttemptOutcome {
  /** `committed`, `refused` or `unknown` today; kept verbatim. */
  outcome: string;
  code: string | null;
  at: string | null;
}

export interface LedgerAttempt {
  id: string;
  sourceType: string | null;
  actorId: string | null;
  startedAt: string | null;
  businessDate: string | null;
  /** Integer kobo, or null when the server recorded none (e.g. unknown journal). */
  amountKobo: number | null;
  counterpartyName: string | null;
  /** null: no outcome was recorded, which the server treats as unknown. */
  outcome: LedgerAttemptOutcome | null;
}

export interface LedgerAttemptVoid {
  voidId: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
}

export interface LedgerAttemptKey {
  idempotencyKey: string;
  /** `unknown` for a status this build does not recognise. */
  status: AttemptKeyStatus | "unknown";
  latestAttemptAt: string | null;
  settlesAt: string | null;
  journalId: string | null;
  void: LedgerAttemptVoid | null;
  /** Oldest first, as the server sends them. */
  attempts: LedgerAttempt[];
}

export interface LedgerAttemptPage {
  items: LedgerAttemptKey[];
  nextCursor: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asInstant = (value: unknown): string | null => {
  const text = asText(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : null;
};

const asKobo = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

const toOutcome = (value: unknown): LedgerAttemptOutcome | null => {
  const raw = asRecord(value);
  const outcome = asText(raw?.outcome);
  if (!raw || !outcome) return null;
  return { outcome, code: asText(raw.code), at: asInstant(raw.at) };
};

const toVoid = (value: unknown): LedgerAttemptVoid | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  return {
    voidId: asText(raw.voidId),
    voidedBy: asText(raw.voidedBy),
    voidedAt: asInstant(raw.voidedAt),
  };
};

const toAttempt = (value: unknown): LedgerAttempt | null => {
  const raw = asRecord(value);
  const id = asText(raw?.id);
  if (!raw || !id) return null;
  const summary = asRecord(raw.summary);
  const businessDate = asText(summary?.businessDate);
  return {
    id,
    sourceType: asText(raw.sourceType),
    actorId: asText(raw.actorId),
    startedAt: asInstant(raw.startedAt),
    businessDate: businessDate && isBusinessDate(businessDate) ? businessDate : null,
    amountKobo: asKobo(summary?.amountKobo),
    counterpartyName: asText(summary?.counterpartyName),
    outcome: toOutcome(raw.outcome),
  };
};

const toAttemptKey = (value: unknown): LedgerAttemptKey | null => {
  const raw = asRecord(value);
  const idempotencyKey = asText(raw?.idempotencyKey);
  if (!raw || !idempotencyKey || !Array.isArray(raw.attempts)) return null;
  const attempts: LedgerAttempt[] = [];
  for (const entry of raw.attempts) {
    const attempt = toAttempt(entry);
    if (!attempt) return null;
    attempts.push(attempt);
  }
  const status = (ATTEMPT_KEY_STATUSES as readonly string[]).includes(raw.status as string)
    ? (raw.status as AttemptKeyStatus)
    : "unknown";
  return {
    idempotencyKey,
    status,
    latestAttemptAt: asInstant(raw.latestAttemptAt),
    settlesAt: asInstant(raw.settlesAt),
    journalId: asText(raw.journalId),
    void: toVoid(raw.void),
    attempts,
  };
};

/**
 * One page of `GET /ledger/attempts`, or null when it is not structurally
 * usable. A malformed key is never dropped: the list would then look
 * complete while hiding an unconfirmed posting.
 */
export const toLedgerAttemptPage = (value: unknown): LedgerAttemptPage | null => {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.items)) return null;
  if (raw.nextCursor !== null && typeof raw.nextCursor !== "string") return null;
  const items: LedgerAttemptKey[] = [];
  for (const entry of raw.items) {
    const item = toAttemptKey(entry);
    if (!item) return null;
    items.push(item);
  }
  return { items, nextCursor: raw.nextCursor || null };
};

/** The latest attempt, which the list is ordered by. */
export const latestAttempt = (item: LedgerAttemptKey): LedgerAttempt | null =>
  item.attempts.length ? item.attempts[item.attempts.length - 1] : null;

/**
 * When the server will accept a resolve: its `settlesAt`, else two minutes
 * after the latest attempt it reported. null when neither is known, in which
 * case resolution is not offered.
 */
export const attemptSettlesAt = (item: LedgerAttemptKey): Date | null => {
  if (item.settlesAt) return new Date(item.settlesAt);
  if (item.latestAttemptAt) {
    return new Date(Date.parse(item.latestAttemptAt) + ATTEMPT_SETTLE_WINDOW_MS);
  }
  return null;
};

export const attemptOutcomeLabel = (outcome: LedgerAttemptOutcome | null): string => {
  if (!outcome) return "No outcome recorded, so it is treated as unknown";
  switch (outcome.outcome) {
    case "unknown":
      return "Outcome unknown";
    case "refused":
      return "Refused; this attempt wrote nothing";
    case "committed":
      return "Committed";
    default:
      return `Outcome: ${outcome.outcome}`;
  }
};

export const attemptTypeLabel = (sourceType: string | null): string =>
  sourceType ? journalTypeLabel(sourceType) : "Unknown type";

/* ------------------------------------------------------------------ */
/* Resolve                                                            */
/* ------------------------------------------------------------------ */

export type ResolveOutcome =
  | { kind: "committed"; journal: PostingJournal }
  | {
      kind: "voided";
      voidId: string;
      voidedBy: string;
      voidedAt: string;
      /** false: the key had already been voided earlier (nothing new was written). */
      voidedByThisRequest: boolean;
    };

/** An ISO-8601 instant as the server writes it (`Date#toJSON`). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const asIsoInstant = (value: unknown): string | null =>
  typeof value === "string" && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value))
    ? value
    : null;

/**
 * A resolve answer is proof only as a complete 200 (RFC §7.4):
 *
 * - committed: a journal with a real id, business date and total;
 * - voided: the void's id, who voided it and when (the server writes all
 *   three in the one transaction that creates the void), and whether this
 *   request made it. A void this request made must name this officer.
 *
 * Anything partial, malformed or contradictory proves nothing and clears
 * nothing; resolving again with the same key returns the stored outcome.
 */
export const toResolveOutcome = (
  httpStatus: number | undefined,
  body: unknown,
  officerId: string,
): ResolveOutcome | null => {
  if (httpStatus !== 200) return null;
  const data = asRecord(asRecord(body)?.data);
  if (!data) return null;
  if (data.outcome === "committed") {
    const journal = toPostingJournal(data.journal);
    if (!journal || !isObjectId(journal.id) || !journal.businessDate || journal.totalKobo === null)
      return null;
    return { kind: "committed", journal };
  }
  if (data.outcome !== "voided") return null;
  const voidId = isObjectId(data.voidId) ? data.voidId : null;
  const voidedBy = asText(data.voidedBy);
  const voidedAt = asIsoInstant(data.voidedAt);
  if (!voidId || !voidedBy || !voidedAt || typeof data.voidedByThisRequest !== "boolean") return null;
  // The server records the caller as the voiding actor of a void it just made.
  if (data.voidedByThisRequest && voidedBy !== officerId) return null;
  return {
    kind: "voided",
    voidId,
    voidedBy,
    voidedAt,
    voidedByThisRequest: data.voidedByThisRequest,
  };
};

export const RESOLVE_ERROR_CODES = {
  tooRecent: "LEDGER_ATTEMPT_TOO_RECENT",
  contended: "LEDGER_RESOLVE_CONTENDED",
  outcomeUnknown: "LEDGER_RESOLVE_OUTCOME_UNKNOWN",
  transactionsUnavailable: "LEDGER_TRANSACTIONS_UNAVAILABLE",
  indexesNotInstalled: "LEDGER_INDEXES_NOT_INSTALLED",
} as const;

export const RESOLVE_UNPROVEN_RESPONSE_MESSAGE =
  "The server answered, but its reply didn't prove an outcome. Nothing was cleared. Resolve again with the same request key; a resolved key always returns the same result.";

export type ResolveFailureKind =
  | "too-recent"
  | "contended"
  | "outcome-unknown"
  | "unavailable"
  | "forbidden"
  | "session"
  | "refused";

/**
 * RFC §7.5 for resolve: no failure is proof of anything about the key.
 * Contention, an unknown outcome and every 5xx or network failure mean
 * "resolve again with the same key"; the rest explain why nothing changed.
 */
export const classifyResolveFailure = (
  error: unknown,
): { kind: ResolveFailureKind; message: string } => {
  const { status, code, message, transportFailure } = ledgerApiFailure(error);
  if (code === RESOLVE_ERROR_CODES.tooRecent) {
    return {
      kind: "too-recent",
      message:
        "This request may still be running. The server allows resolving it two minutes after its latest attempt. Nothing changed; try again after that.",
    };
  }
  if (code === RESOLVE_ERROR_CODES.contended) {
    return {
      kind: "contended",
      message:
        "A posting with this request key was being processed at the same moment. Nothing changed. Resolve again with the same key.",
    };
  }
  if (
    code === RESOLVE_ERROR_CODES.transactionsUnavailable ||
    code === RESOLVE_ERROR_CODES.indexesNotInstalled
  ) {
    return {
      kind: "unavailable",
      message: `${message ?? "Resolving is unavailable on the server right now."} Nothing changed; the request is still unconfirmed.`,
    };
  }
  if (
    code === RESOLVE_ERROR_CODES.outcomeUnknown ||
    transportFailure ||
    status === 408 ||
    (typeof status === "number" && status >= 500)
  ) {
    return {
      kind: "outcome-unknown",
      message:
        "The server couldn't confirm whether this request key was resolved. Resolve again with the same key: if it was resolved, the server returns the same result.",
    };
  }
  if (status === 401) {
    return {
      kind: "session",
      message: "Your session ended before the server resolved this request. Sign in again and resolve it again.",
    };
  }
  if (status === 403) {
    return {
      kind: "forbidden",
      message:
        message ??
        "Only the owner can resolve another officer's request, or a request key with no recorded attempt.",
    };
  }
  return {
    kind: "refused",
    message: `${message ?? "The server refused to resolve this request."} Nothing changed.`,
  };
};

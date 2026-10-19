/**
 * The durable posting intent required by RFC v0.3 §7.6.
 *
 * A financial posting is not retried from memory. Before the first send the
 * client stores the exact body, the idempotency key, the organisation and the
 * officer. The record survives reloads and organisation switches (one storage
 * key per organisation) and blocks every new posting until it is proved:
 *
 * - `dispatching`: the request is about to be / may have been sent.
 * - `unresolved`: the outcome was not proof of success or a first clean
 *   refusal. Retrying must send this exact body with this exact key.
 *
 * A later 4xx never clears a record that has had an ambiguous attempt, and a
 * corrupt record fails closed. Nothing here silently discards an intent.
 *
 * Every write to the record (claim, unresolved update, clear) is a
 * read-modify-write under one per-organisation cross-tab lock, so a stale
 * response in one tab can never delete or overwrite a newer key claimed by
 * another.
 */

import {
  MEMBER_MONEY_PURPOSES,
  MemberMoneyPurpose,
  POSTING_METHODS,
  PostingBody,
  PostingMethod,
  PostingOperation,
  PostingSummary,
} from "components/finance/ledgerPostingTypes";
import { isBusinessDate } from "helpers/openingBalances";

const OPERATIONS: readonly PostingOperation[] = [
  "receipt",
  "expense",
  "transfer",
  "member_receipt",
  "refund",
];

export const LEDGER_POSTING_INTENT_PREFIX = "presence-pro:ledger-posting-intent:";

export const ledgerPostingIntentKey = (organisationId: string) =>
  `${LEDGER_POSTING_INTENT_PREFIX}${organisationId}`;

const POSTING_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

/**
 * A key the backend accepts: 8–128 of `A–Z a–z 0–9 _ . : -`, starting
 * alphanumeric. `opening:` belongs to the server and is refused here too.
 */
export const isPostingKey = (value: unknown): value is string =>
  typeof value === "string" &&
  !value.startsWith("opening:") &&
  POSTING_KEY_PATTERN.test(value);

/** One key per user intent. UUID v4 when the browser offers it. */
export const newPostingKey = (): string => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  const randomPart = () => Math.random().toString(36).slice(2, 10);
  return `p${Date.now().toString(36)}-${randomPart()}${randomPart()}`.slice(0, 120);
};

export interface LedgerPostingIntentRecord {
  organisationId: string;
  officerId: string;
  key: string;
  operation: PostingOperation;
  /** The exact object sent for this intent. Reused verbatim on every retry. */
  body: PostingBody;
  /**
   * Refunds only: the member-money source in the route
   * (`/member-money/:sourceId/refunds`). Part of the exact request, so a
   * retry goes to the same source. `null` for every other operation.
   */
  sourceId: string | null;
  summary: PostingSummary;
  startedAt: string;
  state: "dispatching" | "unresolved";
  /**
   * True once any attempt had an unknown outcome (5xx, 408, timeout or
   * network failure). From then on a 400/422 is not a clean refusal.
   * A `dispatching` record read after a reload is treated as ambiguous: the
   * tab may have crashed after sending.
   */
  hadAmbiguousAttempt: boolean;
  /**
   * Whether the officer may safely resend this exact request. A reused key,
   * a revoked permission or lost organisation access can never be fixed by
   * resending; those need the unconfirmed-attempts resolution flow (F2B-3).
   */
  retryMode: "retry" | "owner";
  lastAttemptAt: string | null;
  lastFailure: string | null;
}

export type LedgerPostingIntentRead =
  | { kind: "none" }
  | { kind: "pending"; intents: LedgerPostingIntentRecord[] }
  | { kind: "unknown" }
  | { kind: "storage-unavailable" };

interface StoredContainer {
  organisationId: string;
  intents: LedgerPostingIntentRecord[];
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const isOperation = (value: unknown): value is PostingOperation =>
  typeof value === "string" && (OPERATIONS as readonly string[]).includes(value);

const isMethod = (value: unknown): value is PostingMethod =>
  typeof value === "string" && (POSTING_METHODS as readonly string[]).includes(value);

const isPurpose = (value: unknown): value is MemberMoneyPurpose =>
  typeof value === "string" && (MEMBER_MONEY_PURPOSES as readonly string[]).includes(value);

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;

/** The ids the server accepts in a route or hint (24 hex characters). */
const isObjectId = (value: unknown): value is string =>
  typeof value === "string" && OBJECT_ID_PATTERN.test(value);

const readRawResult = (
  key: string,
): { ok: true; value: string | null } | { ok: false } => {
  try {
    return { ok: true, value: window.localStorage.getItem(key) };
  } catch {
    return { ok: false };
  }
};

const writeRaw = (key: string, value: string): boolean => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeRaw = (key: string): boolean => {
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const parseSummary = (value: unknown): PostingSummary | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  if (!isOperation(raw.operation)) return null;
  if (!isMethod(raw.method)) return null;
  if (
    typeof raw.amountKobo !== "number" ||
    !Number.isSafeInteger(raw.amountKobo) ||
    raw.amountKobo < 1
  )
    return null;
  if (typeof raw.businessDate !== "string" || !isBusinessDate(raw.businessDate))
    return null;
  const optionalText = (entry: unknown) =>
    entry === null || entry === undefined
      ? null
      : typeof entry === "string"
        ? entry
        : undefined;
  const fromAccountName = optionalText(raw.fromAccountName);
  const toAccountName = optionalText(raw.toAccountName);
  const categoryName = optionalText(raw.categoryName);
  // F2B-2 additions: absent on records written by the F2B-1 build.
  const counterpartyName = optionalText(raw.counterpartyName);
  const sourceNumber = optionalText(raw.sourceNumber);
  const purpose =
    raw.purpose === null || raw.purpose === undefined
      ? null
      : isPurpose(raw.purpose)
        ? raw.purpose
        : undefined;
  if (
    fromAccountName === undefined ||
    toAccountName === undefined ||
    categoryName === undefined ||
    counterpartyName === undefined ||
    sourceNumber === undefined ||
    purpose === undefined
  )
    return null;
  return {
    operation: raw.operation,
    amountKobo: raw.amountKobo,
    businessDate: raw.businessDate,
    method: raw.method,
    fromAccountName,
    toAccountName,
    categoryName,
    counterpartyName,
    purpose,
    sourceNumber,
  };
};

/**
 * A stored body must still look like the typed intent it claims to be. A
 * syntactically impossible body is not retried: it makes the record unreadable
 * and therefore blocks, rather than sending unknown fields.
 */
const isUsableBody = (value: unknown, operation: PostingOperation, key: string) => {
  const body = asRecord(value);
  if (!body) return false;
  if (body.idempotencyKey !== key) return false;
  if (typeof body.businessDate !== "string" || !isBusinessDate(body.businessDate))
    return false;
  if (
    typeof body.amountKobo !== "number" ||
    !Number.isSafeInteger(body.amountKobo) ||
    body.amountKobo < 1
  )
    return false;
  if (!isMethod(body.method)) return false;

  const requiredId = (entry: unknown) => typeof entry === "string" && entry.trim().length > 0;
  const optionalText = (entry: unknown) =>
    entry === undefined || (typeof entry === "string" && entry.length <= 500);
  const requiredText = (entry: unknown, max: number) =>
    typeof entry === "string" && entry.trim().length > 0 && entry.length <= max;
  const optionalHint = (entry: unknown) => entry === undefined || isObjectId(entry);

  switch (operation) {
    case "receipt":
      return (
        requiredId(body.toAccountId) &&
        requiredId(body.incomeAccountId) &&
        optionalText(body.counterpartyName) &&
        optionalText(body.externalReference) &&
        optionalText(body.evidenceReference) &&
        optionalText(body.reference) &&
        optionalText(body.note)
      );
    case "expense":
      return (
        requiredId(body.fromAccountId) &&
        requiredId(body.expenseAccountId) &&
        requiredId(body.counterpartyName) &&
        optionalText(body.externalReference) &&
        optionalText(body.evidenceReference) &&
        optionalText(body.reference) &&
        optionalText(body.note)
      );
    case "transfer":
      return (
        requiredId(body.fromAccountId) &&
        requiredId(body.toAccountId) &&
        optionalText(body.externalReference) &&
        optionalText(body.reference) &&
        optionalText(body.note)
      );
    case "member_receipt":
      return (
        requiredId(body.toAccountId) &&
        requiredText(body.counterpartyName, 120) &&
        isPurpose(body.purpose) &&
        body.receivedAfterOpeningCount === true &&
        optionalHint(body.memberId) &&
        optionalHint(body.obligationId) &&
        optionalText(body.externalReference) &&
        optionalText(body.evidenceReference) &&
        optionalText(body.reference) &&
        optionalText(body.note)
      );
    case "refund":
      return (
        requiredId(body.fromAccountId) &&
        requiredText(body.counterpartyName, 120) &&
        requiredText(body.reason, 500) &&
        optionalText(body.externalReference) &&
        optionalText(body.evidenceReference) &&
        optionalText(body.reference) &&
        optionalText(body.note)
      );
  }
};

/** A refund must carry its route source; nothing else may. */
const isUsableSourceId = (value: unknown, operation: PostingOperation) =>
  operation === "refund"
    ? isObjectId(value)
    : value === undefined || value === null;

const parseRecord = (
  organisationId: string,
  value: unknown,
): LedgerPostingIntentRecord | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  if (raw.organisationId !== organisationId) return null;
  const officerId = asText(raw.officerId);
  if (!officerId) return null;
  if (!isPostingKey(raw.key)) return null;
  if (!isOperation(raw.operation)) return null;
  if (!isUsableBody(raw.body, raw.operation, raw.key)) return null;
  if (!isUsableSourceId(raw.sourceId, raw.operation)) return null;
  const summary = parseSummary(raw.summary);
  if (!summary) return null;
  if (summary.operation !== raw.operation) return null;
  if (typeof raw.startedAt !== "string") return null;
  if (raw.state !== "dispatching" && raw.state !== "unresolved") return null;
  const lastAttemptAt =
    raw.lastAttemptAt === null || typeof raw.lastAttemptAt === "string"
      ? raw.lastAttemptAt
      : null;
  const lastFailure =
    raw.lastFailure === null || typeof raw.lastFailure === "string"
      ? raw.lastFailure
      : null;
  const retryMode =
    raw.retryMode === undefined || raw.retryMode === "retry"
      ? "retry"
      : raw.retryMode === "owner"
        ? "owner"
        : null;
  if (!retryMode) return null;

  return {
    organisationId,
    officerId,
    key: raw.key,
    operation: raw.operation,
    body: raw.body as PostingBody,
    sourceId: raw.operation === "refund" ? (raw.sourceId as string) : null,
    summary,
    startedAt: raw.startedAt,
    state: raw.state,
    // A reload can happen after the request left the browser but before the
    // response arrived. Treat that as an ambiguous attempt, never as clean.
    hadAmbiguousAttempt: raw.hadAmbiguousAttempt === true || raw.state === "dispatching",
    retryMode,
    lastAttemptAt,
    lastFailure,
  };
};

const parseContainer = (
  organisationId: string,
  raw: string,
): StoredContainer | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const container = asRecord(parsed);
  if (!container || container.organisationId !== organisationId) return null;
  if (!Array.isArray(container.intents)) return null;
  const intents: LedgerPostingIntentRecord[] = [];
  for (const entry of container.intents) {
    const record = parseRecord(organisationId, entry);
    if (!record) return null;
    intents.push(record);
  }
  return { organisationId, intents };
};

/**
 * The organisation's stored posting intents. `unknown` (corrupt or foreign)
 * and `storage-unavailable` both block every new posting.
 */
export const readLedgerPostingIntents = (
  organisationId: string,
): LedgerPostingIntentRead => {
  if (!organisationId) return { kind: "none" };
  const stored = readRawResult(ledgerPostingIntentKey(organisationId));
  if (!stored.ok) return { kind: "storage-unavailable" };
  if (stored.value === null) return { kind: "none" };
  const container = parseContainer(organisationId, stored.value);
  if (!container) return { kind: "unknown" };
  return container.intents.length
    ? { kind: "pending", intents: container.intents }
    : { kind: "none" };
};

/** True when no new posting may be dispatched for this organisation. */
export const hasPendingLedgerPosting = (read: LedgerPostingIntentRead) =>
  read.kind !== "none";

/** This organisation's stored record for one key, or null. */
export const readLedgerPostingIntentByKey = (
  organisationId: string,
  key: string,
): LedgerPostingIntentRecord | null => {
  const read = readLedgerPostingIntents(organisationId);
  return read.kind === "pending"
    ? read.intents.find((entry) => entry.key === key) ?? null
    : null;
};

/** Exact-body comparison for the pre-dispatch recheck. */
export const sameLedgerPostingBody = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export type LedgerPostingClaimBlockedReason =
  | "existing"
  | "unknown"
  | "storage-unavailable"
  | "coordination-unavailable"
  | "write-failed"
  | "invalid";

export type LedgerPostingClaimResult =
  | { kind: "claimed"; record: LedgerPostingIntentRecord }
  | { kind: "blocked"; reason: LedgerPostingClaimBlockedReason };

export const LEDGER_POSTING_INTENT_LOCK_PREFIX =
  "presence-pro:ledger-posting-intent-lock:";

/**
 * One cross-tab lock per organisation, held by every mutation of that
 * organisation's intent record: only one claim can be admitted, and a clear
 * or unresolved update can never interleave with another tab's claim.
 */
export const ledgerPostingIntentLockName = (organisationId: string) =>
  `${LEDGER_POSTING_INTENT_LOCK_PREFIX}${organisationId}`;

const POSTING_LOCK_TIMEOUT_MS = 5000;

interface LockManagerLike {
  request: (
    name: string,
    optionsOrCallback: unknown,
    maybeCallback?: unknown,
  ) => Promise<unknown>;
}

const getLockManager = (): LockManagerLike | null => {
  if (typeof navigator === "undefined") return null;
  const locks = (navigator as unknown as { locks?: LockManagerLike }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
};

type LockOutcome<T> = { ok: true; value: T } | { ok: false };

/**
 * Run one intent mutation under the Web Locks API's per-organisation
 * exclusive lock. The lock is held only for the storage read/write/read-back,
 * never for the network request. If the API is unavailable (or the lock
 * cannot be taken within the safety window), the mutation does not happen:
 * a claim sends nothing, and a clear or update leaves the record blocking.
 */
const withIntentLock = async <T>(
  organisationId: string,
  run: () => T,
): Promise<LockOutcome<T>> => {
  const locks = getLockManager();
  if (!locks) return { ok: false };
  const name = ledgerPostingIntentLockName(organisationId);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    if (typeof AbortController !== "undefined") {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), POSTING_LOCK_TIMEOUT_MS);
      const value = await locks.request(
        name,
        { signal: controller.signal },
        run,
      );
      return { ok: true, value: value as T };
    }
    const value = await locks.request(name, run);
    return { ok: true, value: value as T };
  } catch {
    return { ok: false };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
};

export interface NewLedgerPostingIntent {
  organisationId: string;
  officerId: string;
  key: string;
  operation: PostingOperation;
  body: PostingBody;
  /** Refunds only: the route's `:sourceId`. */
  sourceId?: string | null;
  summary: PostingSummary;
}

/**
 * Persist the exact intent before dispatch.
 *
 * The empty-slot check, write and read-back all happen inside one
 * per-organisation cross-tab lock, so two tabs cannot both pass the check and
 * dispatch different keys. The read-back proves the durable record is the
 * body this caller intends to send. Any unsupported/unsafe condition blocks
 * the claim rather than falling back to an uncoordinated read/write.
 */
export const beginLedgerPostingIntent = async (
  input: NewLedgerPostingIntent,
  now: Date = new Date(),
): Promise<LedgerPostingClaimResult> => {
  const { organisationId, officerId, key, operation, body, summary } = input;
  const sourceId = input.sourceId ?? null;
  if (!organisationId || !officerId) return { kind: "blocked", reason: "invalid" };
  if (!isPostingKey(key)) return { kind: "blocked", reason: "invalid" };
  if (!isUsableBody(body, operation, key)) return { kind: "blocked", reason: "invalid" };
  if (!isUsableSourceId(sourceId, operation)) return { kind: "blocked", reason: "invalid" };
  if (summary.operation !== operation) return { kind: "blocked", reason: "invalid" };

  const outcome = await withIntentLock(
    organisationId,
    (): LedgerPostingClaimResult => {
      const current = readLedgerPostingIntents(organisationId);
      if (current.kind === "storage-unavailable") {
        return { kind: "blocked", reason: "storage-unavailable" };
      }
      if (current.kind === "unknown") {
        return { kind: "blocked", reason: "unknown" };
      }
      if (current.kind === "pending") {
        return { kind: "blocked", reason: "existing" };
      }

      const record: LedgerPostingIntentRecord = {
        organisationId,
        officerId,
        key,
        operation,
        body,
        sourceId,
        summary,
        startedAt: now.toISOString(),
        state: "dispatching",
        hadAmbiguousAttempt: false,
        retryMode: "retry",
        lastAttemptAt: null,
        lastFailure: null,
      };
      const container: StoredContainer = { organisationId, intents: [record] };
      if (
        !writeRaw(
          ledgerPostingIntentKey(organisationId),
          JSON.stringify(container),
        )
      ) {
        return { kind: "blocked", reason: "storage-unavailable" };
      }

      // Re-read under the same lock: the record that will be retried must be
      // exactly the body this caller is about to send.
      const verified = readLedgerPostingIntents(organisationId);
      if (
        verified.kind !== "pending" ||
        verified.intents.length !== 1 ||
        verified.intents[0].key !== key ||
        verified.intents[0].sourceId !== sourceId ||
        !sameLedgerPostingBody(verified.intents[0].body, body)
      ) {
        return { kind: "blocked", reason: "write-failed" };
      }
      return { kind: "claimed", record };
    },
  );

  if (!outcome.ok) {
    return { kind: "blocked", reason: "coordination-unavailable" };
  }
  return outcome.value;
};

/**
 * Mark this exact key's outcome as unresolved. Never touches another record.
 * `ambiguous` is sticky: once an attempt may have committed, later business
 * refusals must never clear the record.
 *
 * The record is re-read under the lock: if another tab has already cleared
 * this key (and perhaps claimed a new one), nothing is written, so a stale
 * response can neither resurrect the old intent nor overwrite the new one.
 * Returns false when nothing was saved; the stored record then still blocks.
 */
export const markLedgerPostingIntentUnresolved = async (
  record: LedgerPostingIntentRecord,
  {
    ambiguous,
    message,
    retryMode = "retry",
    now = new Date(),
  }: {
    ambiguous: boolean;
    message: string | null;
    /** `owner` when resending cannot help (key reuse, permission/access loss). */
    retryMode?: "retry" | "owner";
    now?: Date;
  },
): Promise<boolean> => {
  const outcome = await withIntentLock(record.organisationId, () => {
    const key = ledgerPostingIntentKey(record.organisationId);
    const stored = readRawResult(key);
    if (!stored.ok || stored.value === null) return false;
    const container = parseContainer(record.organisationId, stored.value);
    if (!container) return false;
    const index = container.intents.findIndex((entry) => entry.key === record.key);
    if (index === -1) return false;
    const current = container.intents[index];
    // `parseRecord` treats a reloaded `dispatching` record as ambiguous. The
    // current request, however, knows its own disposition: a clean 401/503
    // must not become ambiguous just because the record was written before
    // sending. Once a record is already `unresolved`, its stored flag is
    // authoritative and is preserved (another tab may have proved an
    // ambiguous attempt).
    const previouslyAmbiguous =
      (current.state === "unresolved" && current.hadAmbiguousAttempt) ||
      record.hadAmbiguousAttempt;
    container.intents[index] = {
      ...current,
      state: "unresolved",
      hadAmbiguousAttempt: previouslyAmbiguous || ambiguous,
      retryMode: retryMode === "owner" ? "owner" : current.retryMode,
      lastAttemptAt: now.toISOString(),
      lastFailure: message,
    };
    return writeRaw(key, JSON.stringify(container));
  });
  return outcome.ok && outcome.value;
};

/**
 * Clear only this exact key. A missing record is already clear.
 *
 * Re-read under the lock, so a stale clear that queued behind another tab's
 * clear-and-claim removes nothing but its own key. Returns false when the
 * record could not be proved cleared (no coordination, unreadable storage or
 * a corrupt record); it then still blocks new postings.
 */
export const clearLedgerPostingIntent = async (
  organisationId: string,
  key: string,
): Promise<boolean> => {
  if (!organisationId) return true;
  const outcome = await withIntentLock(organisationId, () => {
    const storageKey = ledgerPostingIntentKey(organisationId);
    const stored = readRawResult(storageKey);
    if (!stored.ok) return false;
    if (stored.value === null) return true;
    const container = parseContainer(organisationId, stored.value);
    // A corrupt marker is never silently removed: only an explicit
    // resolution (F2B-3) may clear it.
    if (!container) return false;
    const remaining = container.intents.filter((entry) => entry.key !== key);
    if (remaining.length === container.intents.length) return true;
    if (remaining.length === 0) return removeRaw(storageKey);
    return writeRaw(
      storageKey,
      JSON.stringify({ organisationId, intents: remaining }),
    );
  });
  return outcome.ok && outcome.value;
};

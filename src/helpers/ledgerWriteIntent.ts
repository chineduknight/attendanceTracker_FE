/**
 * Persisted intent for high-impact opening-balance writes.
 *
 * The intent is written *before* dispatch, so a reload (or a crashed tab)
 * cannot silently permit a blind retry:
 *
 *   dispatching  → the request may have been sent; outcome unknown
 *   unresolved   → the request failed ambiguously; outcome unknown
 *
 * Either state blocks further opening-balance writes until an officer checks
 * the ledger and explicitly acknowledges. A later 409 or timeout never clears
 * it and never counts as proof of success or failure.
 *
 * Storage is a hard dependency: if the intent cannot be persisted (or the
 * store cannot be read), no write is dispatched. One slot per organisation;
 * opening-balance actions are serialised by the backend's single-open-proposal
 * rule anyway.
 */

export type OpeningWriteAction =
  | "submit-opening"
  | "verify-opening"
  | "reject-opening"
  | "withdraw-opening";

/** High-impact ledger lifecycle writes that share the same intent-before-dispatch rule. */
export type LifecycleWriteAction =
  | "suspend-ledger"
  | "resume-ledger"
  | "set-period-lock"
  | "attest-gap-window";

export type LedgerWriteAction = OpeningWriteAction | LifecycleWriteAction;

const ACTIONS: readonly LedgerWriteAction[] = [
  "submit-opening",
  "verify-opening",
  "reject-opening",
  "withdraw-opening",
  "suspend-ledger",
  "resume-ledger",
  "set-period-lock",
  "attest-gap-window",
];

export interface LedgerWriteIntentRefs {
  proposalId?: string | null;
  fingerprint?: string | null;
  /** Proposal kind for a submit intent ("initial" | "supplementary" | "correction"). */
  kind?: string | null;
}

export interface LedgerWriteIntent {
  organisationId: string;
  intentId: string;
  action: LedgerWriteAction;
  proposalId: string | null;
  fingerprint: string | null;
  kind: string | null;
  startedAt: string;
  state: "dispatching" | "unresolved";
}

export type LedgerIntentRead =
  | { kind: "none" }
  | { kind: "pending"; intent: LedgerWriteIntent }
  | { kind: "unknown" }
  | { kind: "storage-unavailable" };

export const LEDGER_WRITE_INTENT_PREFIX = "presence-pro:ledger-write-intent:";

export const ledgerWriteIntentKey = (organisationId: string) =>
  `${LEDGER_WRITE_INTENT_PREFIX}${organisationId}`;

const isAction = (value: unknown): value is LedgerWriteAction =>
  typeof value === "string" && (ACTIONS as readonly string[]).includes(value);

const newIntentId = () => {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const readRaw = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

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

const parseIntent = (
  organisationId: string,
  raw: string,
): LedgerWriteIntent | null => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.organisationId !== organisationId) return null;
    if (typeof parsed.intentId !== "string" || !parsed.intentId) return null;
    if (!isAction(parsed.action)) return null;
    if (parsed.state !== "dispatching" && parsed.state !== "unresolved") return null;
    if (typeof parsed.startedAt !== "string") return null;
    const optional = (value: unknown) =>
      typeof value === "string" && value ? value : null;
    return {
      organisationId,
      intentId: parsed.intentId,
      action: parsed.action,
      proposalId: optional(parsed.proposalId),
      fingerprint: optional(parsed.fingerprint),
      kind: optional(parsed.kind),
      startedAt: parsed.startedAt,
      state: parsed.state,
    };
  } catch {
    return null;
  }
};

/**
 * The stored intent. "storage-unavailable" is deliberately distinct from
 * "none": a reader that cannot see the store must not conclude that no write
 * is outstanding.
 */
export const readLedgerWriteIntent = (
  organisationId: string,
): LedgerIntentRead => {
  if (!organisationId) return { kind: "none" };
  const stored = readRawResult(ledgerWriteIntentKey(organisationId));
  if (!stored.ok) return { kind: "storage-unavailable" };
  if (stored.value === null) return { kind: "none" };
  const intent = parseIntent(organisationId, stored.value);
  return intent ? { kind: "pending", intent } : { kind: "unknown" };
};

/**
 * Persist an intent before dispatching. Returns null when anything is already
 * outstanding or the store is unavailable — the caller must then not send.
 */
export const beginLedgerWriteIntent = (
  organisationId: string,
  action: LedgerWriteAction,
  refs: LedgerWriteIntentRefs = {},
  now: Date = new Date(),
): LedgerWriteIntent | null => {
  if (!organisationId) return null;
  if (readLedgerWriteIntent(organisationId).kind !== "none") return null;
  const intent: LedgerWriteIntent = {
    organisationId,
    intentId: newIntentId(),
    action,
    proposalId: refs.proposalId ?? null,
    fingerprint: refs.fingerprint ?? null,
    kind: refs.kind ?? null,
    startedAt: now.toISOString(),
    state: "dispatching",
  };
  return writeRaw(ledgerWriteIntentKey(organisationId), JSON.stringify(intent))
    ? intent
    : null;
};

/** Mark this exact intent as an unknown outcome. Never touches another intent. */
export const markLedgerWriteIntentUnresolved = (
  intent: LedgerWriteIntent,
): boolean => {
  const key = ledgerWriteIntentKey(intent.organisationId);
  const raw = readRaw(key);
  if (!raw) return false;
  const stored = parseIntent(intent.organisationId, raw);
  if (!stored || stored.intentId !== intent.intentId) return false;
  return writeRaw(key, JSON.stringify({ ...stored, state: "unresolved" }));
};

/** Clear only this exact intent. */
export const clearLedgerWriteIntent = (
  organisationId: string,
  intentId: string,
): boolean => {
  const key = ledgerWriteIntentKey(organisationId);
  const raw = readRaw(key);
  if (raw === null) return true;
  const stored = parseIntent(organisationId, raw);
  if (!stored) return removeRaw(key);
  if (stored.intentId !== intentId) return false;
  return removeRaw(key);
};

/**
 * Remove whatever marker is stored for this organisation, including a corrupt
 * or unrecognised one. Used only by the explicit reconciliation action; it
 * remains scoped to this organisation's key.
 */
export const clearLedgerWriteIntentMarker = (organisationId: string): boolean => {
  if (!organisationId) return true;
  return removeRaw(ledgerWriteIntentKey(organisationId));
};

/** What an officer should compare before allowing another ledger write. */
export const ledgerWriteIntentGuidance = (
  action: LedgerWriteAction,
  kind: string | null,
): string => {
  switch (action) {
    case "submit-opening":
      return kind === "correction"
        ? "Check whether a correction proposal now exists, or the opening figures already changed, before submitting again."
        : kind === "supplementary"
          ? "Check whether a supplementary proposal now exists before submitting again."
          : "Check whether an opening proposal now exists before submitting again.";
    case "verify-opening":
      return "Check whether the proposal is now verified and whether the ledger was activated before trying again.";
    case "reject-opening":
      return "Check whether the proposal is now rejected before trying again.";
    case "withdraw-opening":
      return "Check whether the proposal is now withdrawn before trying again.";
    case "suspend-ledger":
      return "Check the current ledger state and recent audit records to see whether the suspension was recorded before trying again.";
    case "resume-ledger":
      return "Check the current ledger state and recent audit records to see whether the ledger was resumed before trying again.";
    case "set-period-lock":
      return "Check the current period lock and recent audit records before moving it again.";
    case "attest-gap-window":
      return "Check whether the gap window is now recorded as attested before attesting again.";
  }
};

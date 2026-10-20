/**
 * Persisted latch for a ledger write whose outcome could not be established.
 *
 * A lost response is not over when the page reloads: an officer who retries
 * blind can create a second account or setup, or cannot tell whether the
 * first attempt landed. The marker is therefore stored per organisation and
 * survives ordinary reloads. It is only cleared by an explicit reconciliation
 * ("I've checked the ledger"), never by a later response — a repeated 409 may
 * be the first attempt, another officer, or a different conflict.
 *
 * The marker holds no money, no balance and no account data: only which
 * action is unresolved and when it was attempted.
 *
 * F3A writes go further (review of FE #140): `beginLedgerWrite` stores a
 * `pending` marker BEFORE the request is sent and `settleLedgerWrite` decides
 * it from the request promise itself, never from a component callback, so an
 * organisation switch, leaving Books or a reload cannot lose it. A pending
 * marker is cleared only by its own definitive outcome (success, or a refusal
 * that wrote nothing); an ambiguous outcome turns it into an ordinary
 * unresolved marker. A pending marker whose request is not running in this
 * page (the page reloaded, or another tab sent it) can never be confirmed
 * here, so it reads as unresolved and needs the usual reconciliation.
 */

export type LedgerWriteAction =
  | "setup"
  | "member-receipts"
  | "create-accounts"
  | "update-account"
  | "member-allocations"
  | "unknown";

export interface UnresolvedLedgerWrite {
  organisationId: string;
  action: LedgerWriteAction;
  /** ISO timestamp of the attempt, or "" when the marker was unreadable. */
  at: string;
  /**
   * True only while the request that wrote this pending marker is still
   * running in this page: the outcome is not known yet, and nothing can be
   * reconciled. Every other marker is unresolved.
   */
  pending: boolean;
}

/** How a write that went through `beginLedgerWrite` ended. */
export type LedgerWriteOutcome = "confirmed" | "refused" | "unknown";

export const LEDGER_WRITE_UNCERTAINTY_PREFIX = "presence-pro:ledger-write-uncertain:";

export const LEDGER_WRITE_UNCERTAIN_NOTE =
  "A previous ledger change may or may not have been saved. Nothing is retried automatically.";

const ACTIONS: readonly LedgerWriteAction[] = [
  "setup",
  "member-receipts",
  "create-accounts",
  "update-account",
  "member-allocations",
  "unknown",
];

const isAction = (value: unknown): value is LedgerWriteAction =>
  typeof value === "string" && (ACTIONS as readonly string[]).includes(value);

/**
 * Write ids whose request is running in this page. Module memory on purpose:
 * a reload empties it, which is exactly what turns a surviving pending
 * marker into an unresolved one.
 */
const inFlight = new Map<string, { action: LedgerWriteAction; at: string }>();

type Listener = (organisationId: string) => void;
const listeners = new Set<Listener>();

/** Called with the organisation whose marker changed in this page. */
export const subscribeLedgerWriteUncertainty = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const notify = (organisationId: string) =>
  listeners.forEach((listener) => listener(organisationId));

interface StoredMarker {
  organisationId?: unknown;
  action?: unknown;
  at?: unknown;
  phase?: unknown;
  writeId?: unknown;
}

export const ledgerWriteUncertaintyKey = (organisationId: string) =>
  `${LEDGER_WRITE_UNCERTAINTY_PREFIX}${organisationId}`;

const newWriteId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const readRaw = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode or a blocked storage: fall back to "nothing known".
    return null;
  }
};

const writeRaw = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A failed marker write must not crash the screen. The in-memory warning
    // still shows for this session; the next reload may not remember it.
  }
};

const removeRaw = (key: string) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore: the caller also clears its in-memory warning.
  }
};

const readStored = (organisationId: string): StoredMarker | "corrupt" | null => {
  const raw = readRaw(ledgerWriteUncertaintyKey(organisationId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredMarker | null;
    return parsed && typeof parsed === "object" ? parsed : "corrupt";
  } catch {
    return "corrupt";
  }
};

/**
 * The unresolved write for this organisation, or null. A corrupt or foreign
 * marker is still treated as unresolved (`unknown`): a parse failure must
 * never let a retry through.
 */
export const readLedgerWriteUncertainty = (
  organisationId: string,
): UnresolvedLedgerWrite | null => {
  if (!organisationId) return null;
  const stored = readStored(organisationId);
  if (!stored) return null;
  if (stored === "corrupt" || stored.organisationId !== organisationId) {
    return { organisationId, action: "unknown", at: "", pending: false };
  }
  return {
    organisationId,
    action: isAction(stored.action) ? stored.action : "unknown",
    at: typeof stored.at === "string" ? stored.at : "",
    pending:
      stored.phase === "pending" &&
      typeof stored.writeId === "string" &&
      inFlight.has(stored.writeId),
  };
};

export const markLedgerWriteUncertain = (
  organisationId: string,
  action: LedgerWriteAction,
  now: Date = new Date(),
) => {
  if (!organisationId) return;
  writeRaw(
    ledgerWriteUncertaintyKey(organisationId),
    JSON.stringify({ organisationId, action, at: now.toISOString() }),
  );
  notify(organisationId);
};

export const clearLedgerWriteUncertainty = (organisationId: string) => {
  if (!organisationId) return;
  removeRaw(ledgerWriteUncertaintyKey(organisationId));
  notify(organisationId);
};

/**
 * Stores this organisation's pending marker and returns its write id, or
 * null when the request must not be sent: a marker (pending or unresolved)
 * already exists, re-read from storage rather than trusted from the screen,
 * or the marker could not be stored and read back. Without a durable marker
 * a lost response could not be remembered, so the write fails closed.
 */
export const beginLedgerWrite = (
  organisationId: string,
  action: LedgerWriteAction,
  now: Date = new Date(),
): string | null => {
  if (!organisationId || readStored(organisationId) !== null) return null;
  const writeId = newWriteId();
  writeRaw(
    ledgerWriteUncertaintyKey(organisationId),
    JSON.stringify({ organisationId, action, at: now.toISOString(), phase: "pending", writeId }),
  );
  const stored = readStored(organisationId);
  if (!stored || stored === "corrupt" || stored.writeId !== writeId) return null;
  inFlight.set(writeId, { action, at: now.toISOString() });
  notify(organisationId);
  return writeId;
};

/**
 * Decides the marker `beginLedgerWrite` stored, using the organisation and
 * write id captured when the request was sent (never the organisation on
 * screen now). Only this write's own pending marker is ever cleared or
 * changed: a marker another write or an acknowledgement replaced is left
 * alone, except that an unknown outcome is still latched when the marker is
 * gone, because the officer may have acknowledged before it arrived.
 */
export const settleLedgerWrite = (
  organisationId: string,
  writeId: string,
  outcome: LedgerWriteOutcome,
) => {
  const sent = inFlight.get(writeId);
  inFlight.delete(writeId);
  const stored = readStored(organisationId);
  const ours =
    stored !== null && stored !== "corrupt" && stored.writeId === writeId && stored.phase === "pending";
  if (outcome === "unknown") {
    if (stored === null || ours) {
      writeRaw(
        ledgerWriteUncertaintyKey(organisationId),
        JSON.stringify({
          organisationId,
          action: sent?.action ?? "unknown",
          at: sent?.at ?? new Date().toISOString(),
          phase: "uncertain",
          writeId,
        }),
      );
    }
  } else if (ours) {
    removeRaw(ledgerWriteUncertaintyKey(organisationId));
  }
  notify(organisationId);
};

/** What an officer should compare before allowing another write. */
export const ledgerWriteUncertaintyGuidance = (action: LedgerWriteAction) => {
  switch (action) {
    case "setup":
      return "Check whether bookkeeping setup now exists before trying again.";
    case "member-receipts":
      return "Check whether member receipts are now on before trying again.";
    case "create-accounts":
      return "Check whether the account now exists before adding it again.";
    case "update-account":
      return "Check whether the account's name or status changed before trying again.";
    case "member-allocations":
      return "Check whether member money allocations are now on or off before trying again.";
    default:
      return "Check the current ledger state before trying again.";
  }
};

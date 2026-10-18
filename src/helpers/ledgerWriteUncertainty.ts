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
 */

export type LedgerWriteAction =
  | "setup"
  | "member-receipts"
  | "create-accounts"
  | "update-account"
  | "unknown";

export interface UnresolvedLedgerWrite {
  organisationId: string;
  action: LedgerWriteAction;
  /** ISO timestamp of the attempt, or "" when the marker was unreadable. */
  at: string;
}

export const LEDGER_WRITE_UNCERTAINTY_PREFIX = "presence-pro:ledger-write-uncertain:";

export const LEDGER_WRITE_UNCERTAIN_NOTE =
  "A previous ledger change may or may not have been saved. Nothing is retried automatically.";

const ACTIONS: readonly LedgerWriteAction[] = [
  "setup",
  "member-receipts",
  "create-accounts",
  "update-account",
  "unknown",
];

const isAction = (value: unknown): value is LedgerWriteAction =>
  typeof value === "string" && (ACTIONS as readonly string[]).includes(value);

export const ledgerWriteUncertaintyKey = (organisationId: string) =>
  `${LEDGER_WRITE_UNCERTAINTY_PREFIX}${organisationId}`;

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

/**
 * The unresolved write for this organisation, or null. A corrupt or foreign
 * marker is still treated as unresolved (`unknown`): a parse failure must
 * never let a retry through.
 */
export const readLedgerWriteUncertainty = (
  organisationId: string,
): UnresolvedLedgerWrite | null => {
  if (!organisationId) return null;
  const raw = readRaw(ledgerWriteUncertaintyKey(organisationId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      organisationId?: unknown;
      action?: unknown;
      at?: unknown;
    };
    if (parsed?.organisationId !== organisationId) {
      return { organisationId, action: "unknown", at: "" };
    }
    return {
      organisationId,
      action: isAction(parsed.action) ? parsed.action : "unknown",
      at: typeof parsed.at === "string" ? parsed.at : "",
    };
  } catch {
    return { organisationId, action: "unknown", at: "" };
  }
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
};

export const clearLedgerWriteUncertainty = (organisationId: string) => {
  if (!organisationId) return;
  removeRaw(ledgerWriteUncertaintyKey(organisationId));
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
    default:
      return "Check the current ledger state before trying again.";
  }
};

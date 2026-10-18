import {
  LedgerAccount,
  LedgerJournal,
  LedgerJournalLine,
  LedgerStatus,
} from "components/finance/ledgerTypes";

/**
 * Read-only parsing for the F1 ledger endpoints. Every parser fails closed:
 * an unexpected body becomes `null` ("not available yet") rather than being
 * coerced into empty accounts, a zero balance or a guessed status.
 */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A non-blank string, trimmed; otherwise null. */
const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const toLedgerStatus = (value: unknown): LedgerStatus | null => {
  const raw = asRecord(value);
  if (!raw || (raw.state !== "not_active" && raw.state !== "active")) return null;
  return {
    state: raw.state,
    currency: asText(raw.currency),
    // Missing flags fail closed: never claim verification or posting support.
    openingBalancesVerified: raw.openingBalancesVerified === true,
    postingEnabled: raw.postingEnabled === true,
  };
};

/**
 * Accounts, or null when the body is not an array or any entry is not a
 * usable account. A malformed entry must never be filtered into a shorter
 * list: a partial list could look like a complete set, and dropping the only
 * entry would look like "no accounts configured". An empty array is a
 * genuine empty list and stays `[]`.
 *
 * Missing optional fields stay null and are surfaced as unavailable; only
 * the stable id is structurally required.
 */
export const toLedgerAccounts = (value: unknown): LedgerAccount[] | null => {
  if (!Array.isArray(value)) return null;
  const accounts: LedgerAccount[] = [];
  for (const entry of value) {
    const raw = asRecord(entry);
    const id = asText(raw?.id);
    if (!raw || !id) return null;
    accounts.push({
      id,
      name: asText(raw.name) ?? "Unnamed account",
      class: asText(raw.class),
      subtype: asText(raw.subtype),
      currency: asText(raw.currency),
      active: typeof raw.active === "boolean" ? raw.active : null,
    });
  }
  return accounts;
};

const toJournalLine = (value: unknown): LedgerJournalLine | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  return {
    accountId: asText(raw.accountId) ?? "",
    side: raw.side === "debit" || raw.side === "credit" ? raw.side : null,
    // Only a genuine integer kobo value is displayable. Strings, decimals
    // and unsafe integers are not rounded into a made-up amount.
    amountKobo:
      typeof raw.amountKobo === "number" && Number.isSafeInteger(raw.amountKobo)
        ? raw.amountKobo
        : null,
  };
};

/**
 * Journals, or null when the body is not an array or any entry/line is not
 * structurally usable. A malformed line must never be filtered out: that
 * would leave a journal that looks complete while missing a debit or credit.
 * An entry without a valid id or without a `lines` array is likewise
 * structurally invalid, not an empty journal.
 *
 * Invalid individual values inside a line (side, kobo) are not structural:
 * the line stays on screen with `side: null` / `amountKobo: null` so the UI
 * can say "Side unavailable" / "Amount unavailable" without rounding.
 */
export const toLedgerJournals = (value: unknown): LedgerJournal[] | null => {
  if (!Array.isArray(value)) return null;
  const journals: LedgerJournal[] = [];
  for (const entry of value) {
    const raw = asRecord(entry);
    const id = asText(raw?.id);
    if (!raw || !id || !Array.isArray(raw.lines)) return null;

    const lines: LedgerJournalLine[] = [];
    for (const line of raw.lines) {
      const parsed = toJournalLine(line);
      if (!parsed) return null;
      lines.push(parsed);
    }

    journals.push({
      id,
      businessDate: asText(raw.businessDate) ?? "",
      reference: asText(raw.reference) ?? "",
      note: asText(raw.note),
      sourceType: asText(raw.sourceType),
      lines,
    });
  }
  return journals;
};

/** HTTP status from a failed Axios request, if it reached the backend. */
export const ledgerHttpStatus = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } } | null)?.response?.status;

/**
 * A gated, missing or not-implemented ledger endpoint is a neutral
 * "not available yet" state — not a report failure to retry. A 401 has
 * already been handled by the global Axios interceptor.
 */
export const isLedgerUnavailable = (error: unknown): boolean => {
  const status = ledgerHttpStatus(error);
  return status === 401 || status === 403 || status === 404 || status === 501;
};

export const LEDGER_NOT_ACTIVE_NOTE =
  "Bookkeeping has not been activated for this organisation. Existing dues/levy compliance figures are recorded amounts, not verified cash receipts or opening balances.";

export const LEDGER_UNAVAILABLE_TITLE = "Books aren't available yet";
export const LEDGER_UNAVAILABLE_NOTE =
  "This organisation's books can't be shown yet. No balances or transactions have been estimated.";

export const LEDGER_FORBIDDEN_TITLE = "Books aren't available to your account yet";
export const LEDGER_FORBIDDEN_NOTE =
  "You don't have access to this organisation's books yet. No balances or transactions have been estimated.";

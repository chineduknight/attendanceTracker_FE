import { isValid, parseISO } from "date-fns";
import {
  GapWindowAttestation,
  LedgerAccount,
  LedgerJournal,
  LedgerJournalLine,
  LedgerKnownState,
  LedgerStatus,
  PeriodLockState,
} from "components/finance/ledgerTypes";

/**
 * Read-only parsing for the ledger endpoints. Every parser fails closed:
 * an unexpected body becomes `null` ("not available yet") rather than being
 * coerced into empty accounts, a zero balance or a guessed status.
 *
 * The same parsers cover F1 payloads and the additive F2 read shape. F2 never
 * renames or changes an F1 field, and a missing additive field stays `null`
 * instead of becoming a default or evidence of readiness.
 */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** A non-blank string, trimmed; otherwise null. */
const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** A supplied boolean; anything else (including "true") is null, not false. */
const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

/** A non-negative safe-integer counter; anything else is null, not zero. */
const asCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A business date exactly as supplied (`YYYY-MM-DD`). A malformed or
 * impossible calendar date is null; it is never shifted or reformatted into
 * a plausible date.
 */
const asBusinessDate = (value: unknown): string | null => {
  if (typeof value !== "string" || !BUSINESS_DATE.test(value)) return null;
  return isValid(parseISO(value)) ? value : null;
};

/**
 * A bank account's last four digits, exactly four digits, or null. Anything
 * else is not displayed: a full account number must never be echoed back.
 */
const asLastFour = (value: unknown): string | null =>
  typeof value === "string" && /^[0-9]{4}$/.test(value) ? value : null;

/**
 * A list of non-blank strings, or null when any entry is not one. A malformed
 * entry is not filtered out: a shortened list could look like the full set.
 */
const asTextList = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const list: string[] = [];
  for (const entry of value) {
    const text = asText(entry);
    if (!text) return null;
    list.push(text);
  }
  return list;
};

/**
 * A stored timestamp (activation, attestation) as an ISO string. Anything that
 * does not parse as a real instant is null: never "now" and never a business
 * date, which would silently widen the gap window.
 */
const asTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/**
 * Attestation is three-state: only an explicit `null` means "not attested".
 * A missing field is unknown, so a backend that does not send it can never be
 * read as either proof of an attestation or proof that none exists.
 */
const toGapWindowAttestation = (raw: Record<string, unknown>): GapWindowAttestation => {
  if (!("gapWindowAttestedAt" in raw)) return "unknown";
  if (raw.gapWindowAttestedAt === null) return "not_attested";
  return asTimestamp(raw.gapWindowAttestedAt) ? "attested" : "unknown";
};

/**
 * Period lock is three-state too: an explicit `null` means "no lock", and a
 * valid date means "locked through". A missing or malformed value is unknown,
 * so an unlock can never be confirmed by an absent field.
 */
const toPeriodLockState = (raw: Record<string, unknown>): PeriodLockState => {
  if (!("lockedThrough" in raw)) return "unknown";
  if (raw.lockedThrough === null) return "none";
  return asBusinessDate(raw.lockedThrough) ? "set" : "unknown";
};

const KNOWN_STATES: readonly LedgerKnownState[] = [
  "not_active",
  "setup",
  "pending_verification",
  "active",
  "suspended",
];

export const isKnownLedgerState = (
  value: string,
): value is LedgerKnownState =>
  (KNOWN_STATES as readonly string[]).includes(value);

export const toLedgerStatus = (value: unknown): LedgerStatus | null => {
  const raw = asRecord(value);
  const stateText = asText(raw?.state);
  // A body without any readable state is malformed, not "not active".
  if (!raw || !stateText) return null;
  return {
    state: isKnownLedgerState(stateText)
      ? { kind: "known", state: stateText }
      : { kind: "unknown", raw: stateText },
    currency: asText(raw.currency),
    // Missing flags fail closed: never claim verification or posting support.
    openingBalancesVerified: raw.openingBalancesVerified === true,
    postingEnabled: raw.postingEnabled === true,
    contractVersion: asText(raw.contractVersion),
    blockers: asTextList(raw.blockers),
    openingDate: asBusinessDate(raw.openingDate),
    lockedThrough: asBusinessDate(raw.lockedThrough),
    lockedThroughState: toPeriodLockState(raw),
    revision: asCount(raw.revision),
    memberReceiptsEnabled: asBoolean(raw.memberReceiptsEnabled),
    allocationsEnabled: asBoolean(raw.allocationsEnabled),
    unconfirmedAttempts: asCount(raw.unconfirmedAttempts),
    // `undefined` (field absent) is unknown; an explicit `null` is "none";
    // only an object is an open proposal. Any other type stays unknown.
    hasPendingProposal:
      raw.pendingProposal === undefined
        ? null
        : raw.pendingProposal === null
          ? false
          : asRecord(raw.pendingProposal)
            ? true
            : null,
    activatedAt: asTimestamp(raw.activatedAt),
    gapWindowAttestedAt: asTimestamp(raw.gapWindowAttestedAt),
    gapWindowAttestation: toGapWindowAttestation(raw),
  };
};

/** The state key used for labels and copy; `unknown` is never a known state. */
export const ledgerStateKey = (
  status: LedgerStatus,
): LedgerKnownState | "unknown" =>
  status.state.kind === "known" ? status.state.state : "unknown";

export type LedgerReadiness = "active" | "not_ready" | "unknown";

/**
 * Only a recognised `active` state is ready. Everything else — a known
 * non-active lifecycle state or an unrecognised future string — is not ready,
 * whatever `postingEnabled` or `openingBalancesVerified` claim.
 */
export const ledgerReadiness = (status: LedgerStatus): LedgerReadiness => {
  if (status.state.kind === "unknown") return "unknown";
  return status.state.state === "active" ? "active" : "not_ready";
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
      // Additive F2 read fields. An F1 list has none of them; they stay null
      // so nothing is guessed and no action is offered without a revision.
      revision: asCount(raw.revision),
      bankName: asText(raw.bankName),
      accountNumberLast4: asLastFour(raw.accountNumberLast4),
      openingVerified: asBoolean(raw.openingVerified),
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
  "Bookkeeping has not been activated for this organisation. Existing dues/levy compliance figures are recorded amounts, not verified cash receipts, ledger cash, opening balances or income.";

export const LEDGER_SETUP_NOTE =
  "Bookkeeping setup has started for this organisation, but the books are not active yet. No postings can be made; only recorded journal entries are shown, and balances are not calculated here.";

export const LEDGER_PENDING_VERIFICATION_NOTE =
  "Opening balances have been proposed and are awaiting independent verification. The books are not active yet, so no postings can be made and balances are not calculated here.";

export const LEDGER_SUSPENDED_NOTE =
  "Bookkeeping is suspended for this organisation. No postings can be made until an owner resumes it, and balances are not calculated here.";

/**
 * An unrecognised state string is deliberately reported as unknown rather
 * than guessed at. It must never be described as active or ready.
 */
export const LEDGER_UNKNOWN_STATE_NOTE =
  "This app version doesn't recognise the bookkeeping state the server reported, so these books are shown as not ready. No balances or transactions have been estimated.";

/** Officer-facing label per state. Colour is added by the component. */
export const LEDGER_STATE_LABELS: Record<LedgerKnownState | "unknown", string> = {
  not_active: "Not active",
  setup: "Setup",
  pending_verification: "Awaiting verification",
  active: "Active",
  suspended: "Suspended",
  unknown: "Unknown state",
};

const LEDGER_ACTIVE_VERIFIED_NOTE =
  "Bookkeeping is active. Only recorded journal entries are shown; balances are not calculated here.";
const LEDGER_ACTIVE_UNVERIFIED_NOTE =
  "Bookkeeping is active, but opening balances have not been verified. Only recorded journal entries are shown; balances are not calculated here.";

/**
 * The explanation shown under the state badge. `active` alone selects the
 * active wording; `postingEnabled` never upgrades a non-active or unknown
 * state into one.
 */
export const ledgerStatusNote = (status: LedgerStatus): string => {
  if (status.state.kind === "unknown") return LEDGER_UNKNOWN_STATE_NOTE;
  switch (status.state.state) {
    case "active":
      return status.openingBalancesVerified
        ? LEDGER_ACTIVE_VERIFIED_NOTE
        : LEDGER_ACTIVE_UNVERIFIED_NOTE;
    case "setup":
      return LEDGER_SETUP_NOTE;
    case "pending_verification":
      return LEDGER_PENDING_VERIFICATION_NOTE;
    case "suspended":
      return LEDGER_SUSPENDED_NOTE;
    case "not_active":
      return LEDGER_NOT_ACTIVE_NOTE;
  }
};

export const LEDGER_UNAVAILABLE_TITLE = "Books aren't available yet";
export const LEDGER_UNAVAILABLE_NOTE =
  "This organisation's books can't be shown yet. No balances or transactions have been estimated.";

export const LEDGER_FORBIDDEN_TITLE = "Books aren't available to your account yet";
export const LEDGER_FORBIDDEN_NOTE =
  "You don't have access to this organisation's books yet. No balances or transactions have been estimated.";

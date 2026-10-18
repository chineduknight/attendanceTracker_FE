/**
 * Read-only shapes for the finance ledger foundation (F1).
 *
 * The backend owns every value here. The frontend must never derive balances,
 * opening balances, totals or cash positions from these records.
 */

/**
 * `not_active` is the gated state. Unknown future states fail closed as
 * unavailable in the parser rather than being guessed at.
 */
export type LedgerState = "not_active" | "active";

export interface LedgerStatus {
  state: LedgerState;
  /** ISO currency from the backend; null when it did not send one. */
  currency: string | null;
  openingBalancesVerified: boolean;
  postingEnabled: boolean;
}

export interface LedgerAccount {
  id: string;
  name: string;
  class: string | null;
  subtype: string | null;
  currency: string | null;
  active: boolean | null;
}

export type LedgerSide = "debit" | "credit";

export interface LedgerJournalLine {
  accountId: string;
  /** null: not a side this build understands. */
  side: LedgerSide | null;
  /** Integer kobo exactly as supplied; null when it was not a safe integer. */
  amountKobo: number | null;
}

export interface LedgerJournal {
  id: string;
  businessDate: string;
  reference: string;
  note: string | null;
  sourceType: string | null;
  lines: LedgerJournalLine[];
}

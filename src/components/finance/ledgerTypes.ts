/**
 * Read-only shapes for the finance ledger.
 *
 * The backend owns every value here. The frontend must never derive balances,
 * opening balances, totals or cash positions from these records.
 *
 * F1 shipped `not_active | active`. F2 (approved RFC v0.3, not yet delivered)
 * adds lifecycle states and additive fields, announced by `contractVersion`.
 * F2 never changes an F1 field's name, type or meaning, so an F1 payload stays
 * a valid read.
 */

/**
 * The states this build knows how to label. Only `active` means ready.
 * `not_active` is the F1 gated state and still means "unknown": no verified
 * opening balances and no posting.
 */
export type LedgerKnownState =
  | "not_active"
  | "setup"
  | "pending_verification"
  | "active"
  | "suspended";

/**
 * A state string this build does not recognise is kept verbatim as `unknown`
 * rather than being rejected or coerced. Rejecting it would hide a real book
 * as "not available"; coercing it could read as active. It renders as not
 * ready, never as active, posting-enabled or a zero balance.
 */
export type LedgerState =
  | { kind: "known"; state: LedgerKnownState }
  | { kind: "unknown"; raw: string };

export interface LedgerStatus {
  state: LedgerState;
  /** ISO currency from the backend; null when it did not send one. */
  currency: string | null;
  /**
   * F1 flag. Missing/invalid fails closed to `false`: never claim verified
   * opening balances from an absent value.
   */
  openingBalancesVerified: boolean;
  /**
   * F1 flag, read-only information. It is never used as proof of readiness:
   * `state` alone decides that in this read-only shell.
   */
  postingEnabled: boolean;

  /* Additive F2 reads. `null` means the backend did not send a usable value;
   * it is never turned into a default, an empty list or proof of readiness. */

  /**
   * Non-null means the backend announced the F2 contract. Absent/non-string
   * stays `null`: an F1 backend is a legitimate read, never a reason to fail.
   */
  contractVersion: string | null;
  /** Server-reported blocker codes; `[]` means "reported none", `null` unknown. */
  blockers: string[] | null;
  /** `YYYY-MM-DD` exactly as supplied, or null when absent/malformed. */
  openingDate: string | null;
  /** `YYYY-MM-DD` exactly as supplied, or null when absent/malformed. */
  lockedThrough: string | null;
  /** Client-visible CAS revision; null when absent/not a counter. */
  revision: number | null;
  memberReceiptsEnabled: boolean | null;
  /** Count of unresolved posting attempts; null when absent/not a counter. */
  unconfirmedAttempts: number | null;
  /**
   * Whether an opening proposal is open. Only a present, non-null value is
   * `true`; an explicit `null` is `false`; a missing or unusable value is
   * `null` (unknown), never "no proposal". The RFC v0.3 status shape does not
   * define the inner proposal fields, so none are read.
   */
  hasPendingProposal: boolean | null;
}

export interface LedgerAccount {
  id: string;
  name: string;
  class: string | null;
  subtype: string | null;
  currency: string | null;
  active: boolean | null;
  /**
   * Additive F2 read field (§8.0). `null` when an F1 backend did not send it
   * or the value was unusable. Rename/(de)activate PATCHes require it as
   * `expectedRevision`, so those actions stay unavailable without it.
   */
  revision: number | null;
  /** Additive F2 money-account display metadata (D5); never a full number. */
  bankName: string | null;
  accountNumberLast4: string | null;
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

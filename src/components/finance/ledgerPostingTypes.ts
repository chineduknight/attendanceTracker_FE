/**
 * F2B-1 cashbook, F2B-2 member-money and F2B-3 reversal posting shapes (RFC
 * v0.3 §5.1–§5.6, §7, §8.2).
 *
 * These are the client's typed intents. The server builds the journal lines,
 * the entry number and the posting actor, and chooses the member-money
 * holding account; the client never sends `lines`, `sourceType`, `postedBy`,
 * an `entry` number, a holding account or a body `organisationId`.
 */

export type PostingOperation =
  | "receipt"
  | "expense"
  | "transfer"
  | "member_receipt"
  | "refund"
  | "reversal";

/** Ordinary cashbook entries (F2B-1), shown under "Record money". */
export const CASHBOOK_OPERATIONS: readonly PostingOperation[] = [
  "receipt",
  "expense",
  "transfer",
];

/** Member-money entries (F2B-2), shown under "Member money". */
export const MEMBER_MONEY_OPERATIONS: readonly PostingOperation[] = [
  "member_receipt",
  "refund",
];

/** Reversals (F2B-3), shown under "Reversals". */
export const REVERSAL_OPERATIONS: readonly PostingOperation[] = ["reversal"];

/**
 * The Books sections that own postings. One pending posting blocks every
 * section, but only one section offers its retry, so the same request is never
 * offered twice on a page.
 */
export type PostingSection = "cashbook" | "memberMoney" | "reversals";

/** Page order: a posting whose own section is hidden falls back to the first shown. */
export const POSTING_SECTIONS: readonly PostingSection[] = [
  "cashbook",
  "memberMoney",
  "reversals",
];

export const POSTING_SECTION_OPERATIONS: Record<PostingSection, readonly PostingOperation[]> = {
  cashbook: CASHBOOK_OPERATIONS,
  memberMoney: MEMBER_MONEY_OPERATIONS,
  reversals: REVERSAL_OPERATIONS,
};

export const POSTING_SECTION_LABELS: Record<PostingSection, string> = {
  cashbook: "Record money",
  memberMoney: "Member money",
  reversals: "Reversals",
};

/**
 * The journal types F2B-3 may reverse (RFC v0.3 §5.3). The server's allow-list
 * also has F3 allocations, which this phase does not offer.
 */
export const REVERSIBLE_SOURCE_TYPES = [
  "cash_receipt",
  "cash_expense",
  "cash_transfer",
  "member_receipt",
  "member_receipt_refund",
] as const;

export type ReversibleSourceType = (typeof REVERSIBLE_SOURCE_TYPES)[number];

export const REVERSIBLE_SOURCE_TYPE_LABELS: Record<ReversibleSourceType, string> = {
  cash_receipt: "Money in",
  cash_expense: "Money out",
  cash_transfer: "Transfer",
  member_receipt: "Member money in",
  member_receipt_refund: "Member money refund",
};

/** Why a member paid (RFC D1a). A tag for later reconciliation, never an allocation. */
export const MEMBER_MONEY_PURPOSES = ["dues", "levy", "unspecified"] as const;

export type MemberMoneyPurpose = (typeof MEMBER_MONEY_PURPOSES)[number];

export const MEMBER_MONEY_PURPOSE_LABELS: Record<MemberMoneyPurpose, string> = {
  dues: "Dues",
  levy: "Levy",
  unspecified: "Not specified",
};

export const POSTING_METHODS = [
  "cash",
  "bank_transfer",
  "pos",
  "cheque",
  "mobile_money",
  "other",
] as const;

export type PostingMethod = (typeof POSTING_METHODS)[number];

export const POSTING_METHOD_LABELS: Record<PostingMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  pos: "POS",
  cheque: "Cheque",
  mobile_money: "Mobile money",
  other: "Other",
};

export const POSTING_OPERATION_LABELS: Record<PostingOperation, string> = {
  receipt: "Money in",
  expense: "Money out",
  transfer: "Transfer",
  member_receipt: "Member money in",
  refund: "Member money refund",
  reversal: "Reversal",
};

export interface ReceiptDraft {
  businessDate: string;
  amountKobo: number;
  toAccountId: string;
  incomeAccountId: string;
  method: PostingMethod;
  counterpartyName: string;
  externalReference: string;
  evidenceReference: string;
  reference: string;
  note: string;
}

export interface ExpenseDraft {
  businessDate: string;
  amountKobo: number;
  fromAccountId: string;
  expenseAccountId: string;
  method: PostingMethod;
  counterpartyName: string;
  externalReference: string;
  evidenceReference: string;
  reference: string;
  note: string;
}

export interface TransferDraft {
  businessDate: string;
  amountKobo: number;
  fromAccountId: string;
  toAccountId: string;
  method: PostingMethod;
  externalReference: string;
  reference: string;
  note: string;
}

export interface MemberReceiptDraft {
  businessDate: string;
  amountKobo: number;
  toAccountId: string;
  method: PostingMethod;
  /** The payer (required). */
  counterpartyName: string;
  /** No default: the officer must choose one deliberately. */
  purpose: MemberMoneyPurpose | "";
  /** Optional reconciliation hints; "" when not given. */
  memberId: string;
  obligationId: string;
  /** Must be true: money already in the opening count is never a member receipt. */
  receivedAfterOpeningCount: boolean;
  externalReference: string;
  evidenceReference: string;
  reference: string;
  note: string;
}

/** The member-money source a refund returns money from (`GET /member-money`). */
export interface MemberMoneySourceRef {
  kind: "receipt" | "opening_item";
  /** The id the refund route takes as `:sourceId`. */
  id: string;
  /** `M-…` or `OM-…`, for display only. */
  number: string;
  businessDate: string;
  remainingKobo: number;
}

export interface RefundDraft {
  source: MemberMoneySourceRef;
  businessDate: string;
  amountKobo: number;
  fromAccountId: string;
  method: PostingMethod;
  /** The recipient (required). */
  counterpartyName: string;
  /** Why the money is returned (required). */
  reason: string;
  externalReference: string;
  evidenceReference: string;
  reference: string;
  note: string;
}

/**
 * The journal a reversal undoes, as the server last reported it. Part of the
 * exact request: `journalId` is the route's `:journalId`, and the reversal is
 * only proved when it names this journal and mirrors its total.
 */
export interface ReversalTarget {
  journalId: string;
  sourceType: ReversibleSourceType;
  /** The original's server number (`R-…`, `M-…`), for display. */
  number: string | null;
  businessDate: string;
  totalKobo: number;
}

export interface ReversalDraft {
  original: ReversalTarget;
  businessDate: string;
  /** Why the entry is undone (required, ≤ 500). Stored as the reversal's note. */
  reason: string;
}

export type PostingDraft =
  | { operation: "receipt"; receipt: ReceiptDraft }
  | { operation: "expense"; expense: ExpenseDraft }
  | { operation: "transfer"; transfer: TransferDraft }
  | { operation: "member_receipt"; memberReceipt: MemberReceiptDraft }
  | { operation: "refund"; refund: RefundDraft }
  | { operation: "reversal"; reversal: ReversalDraft };

/** Display facts kept beside the exact body so a pending posting is recognisable. */
export interface PostingSummary {
  operation: PostingOperation;
  /** For a reversal, the original's total, which the reversal mirrors. */
  amountKobo: number;
  businessDate: string;
  /** `null` only for a reversal, which has no payment method. */
  method: PostingMethod | null;
  fromAccountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
  /** Member money: the payer or recipient. Absent on F2B-1 records. */
  counterpartyName?: string | null;
  /** Member receipts: the chosen purpose. */
  purpose?: MemberMoneyPurpose | null;
  /** Refunds: the source's `M-…` / `OM-…` number. */
  sourceNumber?: string | null;
  /** Reversals: what the reversed journal was, and its number. */
  originalSourceType?: ReversibleSourceType | null;
  originalNumber?: string | null;
}

export interface ReceiptBody {
  idempotencyKey: string;
  businessDate: string;
  amountKobo: number;
  toAccountId: string;
  incomeAccountId: string;
  method: PostingMethod;
  counterpartyName?: string;
  externalReference?: string;
  evidenceReference?: string;
  reference?: string;
  note?: string;
}

export interface ExpenseBody {
  idempotencyKey: string;
  businessDate: string;
  amountKobo: number;
  fromAccountId: string;
  expenseAccountId: string;
  method: PostingMethod;
  counterpartyName: string;
  externalReference?: string;
  evidenceReference?: string;
  reference?: string;
  note?: string;
}

export interface TransferBody {
  idempotencyKey: string;
  businessDate: string;
  amountKobo: number;
  fromAccountId: string;
  toAccountId: string;
  method: PostingMethod;
  externalReference?: string;
  reference?: string;
  note?: string;
}

export interface MemberReceiptBody {
  idempotencyKey: string;
  businessDate: string;
  amountKobo: number;
  toAccountId: string;
  method: PostingMethod;
  counterpartyName: string;
  purpose: MemberMoneyPurpose;
  memberId?: string;
  obligationId?: string;
  receivedAfterOpeningCount: true;
  externalReference?: string;
  evidenceReference?: string;
  reference?: string;
  note?: string;
}

/** The refund body; the source travels in the route (`:sourceId`), never the body. */
export interface RefundBody {
  idempotencyKey: string;
  businessDate: string;
  amountKobo: number;
  fromAccountId: string;
  method: PostingMethod;
  counterpartyName: string;
  reason: string;
  externalReference?: string;
  evidenceReference?: string;
  reference?: string;
  note?: string;
}

/**
 * The reversal body (RFC v0.3 §5.3), exactly these three fields. The journal
 * travels in the route (`:journalId`); the server builds the mirrored lines,
 * so no amount, account, method or number is ever sent.
 */
export interface ReversalBody {
  idempotencyKey: string;
  businessDate: string;
  reason: string;
}

export type PostingBody =
  | ReceiptBody
  | ExpenseBody
  | TransferBody
  | MemberReceiptBody
  | RefundBody
  | ReversalBody;

/**
 * The additive posting fields on a confirmed journal. Every value is read
 * tolerantly: a field the server did not send (or sent unusably) stays null
 * and is shown as unavailable, never guessed.
 */
export interface PostingJournal {
  id: string;
  businessDate: string | null;
  reference: string | null;
  note: string | null;
  sourceType: string | null;
  totalKobo: number | null;
  postedAt: string | null;
  postedByName: string | null;
  sourceId: string | null;
  number: string | null;
  method: string | null;
  counterpartyName: string | null;
  externalReference: string | null;
  evidenceReference: string | null;
  /** Member receipts (F2B-2). */
  purpose: string | null;
  memberId: string | null;
  obligationId: string | null;
  receivedAfterOpeningCount: boolean | null;
  /** Refunds (F2B-2) and allocations (F3-3): the source the money came from. */
  memberMoneySourceId: string | null;
  memberMoneySourceNumber: string | null;
  memberMoneySourceKind: string | null;
  reason: string | null;
  /** Allocations (F3-3): the obligation's type and the confirmed hint mismatches. */
  obligationType: string | null;
  confirmedMismatches: string[] | null;
  /** Reversals (F2B-3): the journal this one undoes. */
  reversesJournalId: string | null;
}

/**
 * F2B-1 cashbook and F2B-2 member-money posting shapes (RFC v0.3 §5.1–§5.6,
 * §7, §8.2).
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
  | "refund";

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

export type PostingDraft =
  | { operation: "receipt"; receipt: ReceiptDraft }
  | { operation: "expense"; expense: ExpenseDraft }
  | { operation: "transfer"; transfer: TransferDraft }
  | { operation: "member_receipt"; memberReceipt: MemberReceiptDraft }
  | { operation: "refund"; refund: RefundDraft };

/** Display facts kept beside the exact body so a pending posting is recognisable. */
export interface PostingSummary {
  operation: PostingOperation;
  amountKobo: number;
  businessDate: string;
  method: PostingMethod;
  fromAccountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
  /** Member money: the payer or recipient. Absent on F2B-1 records. */
  counterpartyName?: string | null;
  /** Member receipts: the chosen purpose. */
  purpose?: MemberMoneyPurpose | null;
  /** Refunds: the source's `M-…` / `OM-…` number. */
  sourceNumber?: string | null;
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

export type PostingBody =
  | ReceiptBody
  | ExpenseBody
  | TransferBody
  | MemberReceiptBody
  | RefundBody;

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
  /** Refunds (F2B-2): the source this refund returned money from. */
  memberMoneySourceId: string | null;
  memberMoneySourceNumber: string | null;
  reason: string | null;
}

/**
 * F2B-1 cashbook posting shapes (RFC v0.3 §5.1–§5.5, §7, §8.2).
 *
 * These are the client's typed intents. The server builds the journal lines,
 * the entry number and the posting actor; the client never sends `lines`,
 * `sourceType`, `postedBy`, an `entry` number or a body `organisationId`.
 */

export type PostingOperation = "receipt" | "expense" | "transfer";

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

export type PostingDraft =
  | { operation: "receipt"; receipt: ReceiptDraft }
  | { operation: "expense"; expense: ExpenseDraft }
  | { operation: "transfer"; transfer: TransferDraft };

/** Display facts kept beside the exact body so a pending posting is recognisable. */
export interface PostingSummary {
  operation: PostingOperation;
  amountKobo: number;
  businessDate: string;
  method: PostingMethod;
  fromAccountName: string | null;
  toAccountName: string | null;
  categoryName: string | null;
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

export type PostingBody = ReceiptBody | ExpenseBody | TransferBody;

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
}

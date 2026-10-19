/**
 * F2B-1 cashbook and F2B-2 member-money posting rules (F2 Cashbook RFC v0.3
 * §5, §7, §8.2).
 *
 * Pure helpers only: eligible-account filtering, strict field validation,
 * exact integer-kobo conversion, body building, tolerant response parsing and
 * the proof rules for an ambiguous posting. The backend remains the authority
 * for every accounting decision; nothing here derives a balance or a journal.
 */

import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { LedgerAccount, LedgerStatus, PeriodLockState } from "components/finance/ledgerTypes";
import {
  ExpenseBody,
  ExpenseDraft,
  MEMBER_MONEY_PURPOSES,
  MEMBER_MONEY_PURPOSE_LABELS,
  MemberMoneyPurpose,
  MemberReceiptBody,
  MemberReceiptDraft,
  POSTING_METHODS,
  POSTING_METHOD_LABELS,
  POSTING_OPERATION_LABELS,
  PostingBody,
  PostingDraft,
  PostingJournal,
  PostingMethod,
  PostingOperation,
  PostingSummary,
  ReceiptBody,
  ReceiptDraft,
  RefundBody,
  RefundDraft,
  TransferBody,
  TransferDraft,
} from "components/finance/ledgerPostingTypes";
import { ledgerApiFailure } from "helpers/ledgerSetup";
import { ledgerStateKey } from "helpers/ledger";
import { activeMemberMoneyAccount, isBusinessDate } from "helpers/openingBalances";
import { financeRequest } from "services/api/request";

/* ------------------------------------------------------------------ */
/* Accounts and categories                                            */
/* ------------------------------------------------------------------ */

const MONEY_SUBTYPES = new Set(["cash", "bank"]);

/** Active cash or bank account with a verified opening (RFC §5.1, §8.2). */
export const isPostingMoneyAccount = (account: LedgerAccount): boolean =>
  account.active === true &&
  account.class === "asset" &&
  account.subtype !== null &&
  MONEY_SUBTYPES.has(account.subtype) &&
  account.openingVerified === true;

/** Only eligible accounts are offered; inactive, unverified and non-money accounts are never options. */
export const postingMoneyAccounts = (
  accounts: readonly LedgerAccount[] | null,
): LedgerAccount[] =>
  (accounts ?? [])
    .filter(isPostingMoneyAccount)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));

const activeCategory = (account: LedgerAccount, accountClass: "income" | "expense") =>
  account.active === true && account.class === accountClass;

/**
 * Ordinary receipt categories: active income with no subtype. F3's member
 * dues/levy income accounts (`member_dues_income`, `member_levy_income`) are
 * also class `income`, but only allocations may credit them; a receipt naming
 * one is `422 LEDGER_ACCOUNT_ROLE_MISMATCH`. Never filter on class alone.
 */
export const postingIncomeCategories = (
  accounts: readonly LedgerAccount[] | null,
): LedgerAccount[] =>
  (accounts ?? [])
    .filter((account) => activeCategory(account, "income") && account.subtype === null)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));

export const postingExpenseCategories = (
  accounts: readonly LedgerAccount[] | null,
): LedgerAccount[] =>
  (accounts ?? [])
    .filter((account) => activeCategory(account, "expense"))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));

/** A human label that never invents a full account number. */
export const postingAccountLabel = (account: LedgerAccount): string => {
  const kind = account.subtype === "cash" ? "Cash" : "Bank";
  const extra = [account.bankName, account.accountNumberLast4 ? `••••${account.accountNumberLast4}` : null]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  return extra ? `${account.name} — ${kind} · ${extra}` : `${account.name} — ${kind}`;
};

/* ------------------------------------------------------------------ */
/* Amounts and dates                                                  */
/* ------------------------------------------------------------------ */

/**
 * Naira text to integer kobo with no floating-point arithmetic. Accepts at
 * most two decimal places and rejects anything that is not a whole positive
 * kobo amount (including values beyond JavaScript's safe integer range).
 */
export const nairaToKobo = (raw: string): number | null => {
  const text = raw.trim();
  if (!text) return null;
  const match = /^(0|[1-9]\d*)(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  const whole = match[1];
  // 2^53 - 1 is 16 digits. A longer whole-naira part cannot stay a safe
  // integer once multiplied by 100, before any rounding can occur.
  if (whole.length > 15) return null;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const kobo = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(kobo) && kobo >= 1 ? kobo : null;
};

export const postingAmountIssue = (raw: string): string | null => {
  if (!raw.trim()) return "Enter an amount.";
  if (nairaToKobo(raw) !== null) return null;
  if (/^0(?:\.0{0,2})?$/.test(raw.trim())) return "Enter an amount greater than zero.";
  return "Enter a valid amount in naira, using at most two decimal places.";
};

export interface PostingDateContext {
  /** Today in Africa/Lagos, `YYYY-MM-DD`. */
  today: string;
  openingDate: string | null;
  lockedThrough: string | null;
  lockedThroughState: PeriodLockState;
}

/** Strict business-date checks (§4.6, §8.2); the backend still enforces them. */
export const postingDateIssue = (
  date: string,
  context: PostingDateContext,
): string | null => {
  if (!isBusinessDate(date)) return "Choose the business date.";
  if (date > context.today) return "The business date can't be after today in Lagos.";
  if (context.openingDate && date < context.openingDate) {
    return `The date can't be before the ledger's opening date (${formatBusinessDate(
      context.openingDate,
    )}).`;
  }
  if (
    context.lockedThroughState === "set" &&
    context.lockedThrough &&
    date <= context.lockedThrough
  ) {
    return `The period is locked through ${formatBusinessDate(
      context.lockedThrough,
    )}. Choose a date after it.`;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Text and method validation                                         */
/* ------------------------------------------------------------------ */

export const POSTING_TEXT_LIMITS = {
  counterpartyName: 120,
  externalReference: 64,
  evidenceReference: 500,
  reference: 64,
  note: 500,
  /** Refund reason (RFC §8.2). */
  reason: 500,
} as const;

export const isPostingMethod = (value: string): value is PostingMethod =>
  (POSTING_METHODS as readonly string[]).includes(value);

export const postingMethodIssue = (method: string): string | null =>
  isPostingMethod(method) ? null : "Choose a payment method.";

export const postingTextIssue = ({
  value,
  label,
  max,
  required = false,
}: {
  value: string;
  label: string;
  max: number;
  required?: boolean;
}): string | null => {
  const text = value.trim();
  if (required && !text) return `${label} is required.`;
  if (text.length > max) return `${label} must be ${max} characters or fewer.`;
  return null;
};

/* ------------------------------------------------------------------ */
/* Draft validation                                                   */
/* ------------------------------------------------------------------ */

export interface PostingValidationContext extends PostingDateContext {
  accounts: readonly LedgerAccount[] | null;
}

const moneyAccountIds = (accounts: readonly LedgerAccount[] | null) =>
  new Set(postingMoneyAccounts(accounts).map((account) => account.id));

const categoryIds = (
  accounts: readonly LedgerAccount[] | null,
  accountClass: "income" | "expense",
) =>
  new Set(
    (accountClass === "income"
      ? postingIncomeCategories(accounts)
      : postingExpenseCategories(accounts)
    ).map((account) => account.id),
  );

const commonDraftIssue = (
  draft: { businessDate: string; amountKobo: number; method: string },
  context: PostingValidationContext,
): string | null =>
  postingDateIssue(draft.businessDate, context) ??
  (Number.isSafeInteger(draft.amountKobo) && draft.amountKobo >= 1
    ? null
    : "Enter a valid amount in naira.") ??
  postingMethodIssue(draft.method);

export const receiptDraftIssue = (
  draft: ReceiptDraft,
  context: PostingValidationContext,
): string | null => {
  const moneyIds = moneyAccountIds(context.accounts);
  const incomeIds = categoryIds(context.accounts, "income");
  return (
    commonDraftIssue(draft, context) ??
    (moneyIds.has(draft.toAccountId)
      ? null
      : "Choose the cash or bank account the money was received into.") ??
    (incomeIds.has(draft.incomeAccountId)
      ? null
      : "Choose an active income category.") ??
    postingTextIssue({
      value: draft.counterpartyName,
      label: "Received from",
      max: POSTING_TEXT_LIMITS.counterpartyName,
    }) ??
    postingTextIssue({
      value: draft.externalReference,
      label: "External reference",
      max: POSTING_TEXT_LIMITS.externalReference,
    }) ??
    postingTextIssue({
      value: draft.evidenceReference,
      label: "Evidence reference",
      max: POSTING_TEXT_LIMITS.evidenceReference,
    }) ??
    postingTextIssue({
      value: draft.reference,
      label: "Reference",
      max: POSTING_TEXT_LIMITS.reference,
    }) ??
    postingTextIssue({
      value: draft.note,
      label: "Note",
      max: POSTING_TEXT_LIMITS.note,
    })
  );
};

export const expenseDraftIssue = (
  draft: ExpenseDraft,
  context: PostingValidationContext,
): string | null => {
  const moneyIds = moneyAccountIds(context.accounts);
  const expenseIds = categoryIds(context.accounts, "expense");
  return (
    commonDraftIssue(draft, context) ??
    (moneyIds.has(draft.fromAccountId)
      ? null
      : "Choose the cash or bank account the money was paid from.") ??
    (expenseIds.has(draft.expenseAccountId)
      ? null
      : "Choose an active expense category.") ??
    postingTextIssue({
      value: draft.counterpartyName,
      label: "Paid to",
      max: POSTING_TEXT_LIMITS.counterpartyName,
      required: true,
    }) ??
    postingTextIssue({
      value: draft.externalReference,
      label: "External reference",
      max: POSTING_TEXT_LIMITS.externalReference,
    }) ??
    postingTextIssue({
      value: draft.evidenceReference,
      label: "Evidence reference",
      max: POSTING_TEXT_LIMITS.evidenceReference,
    }) ??
    postingTextIssue({
      value: draft.reference,
      label: "Reference",
      max: POSTING_TEXT_LIMITS.reference,
    }) ??
    postingTextIssue({
      value: draft.note,
      label: "Note",
      max: POSTING_TEXT_LIMITS.note,
    })
  );
};

export const transferDraftIssue = (
  draft: TransferDraft,
  context: PostingValidationContext,
): string | null => {
  const moneyIds = moneyAccountIds(context.accounts);
  return (
    commonDraftIssue(draft, context) ??
    (moneyIds.has(draft.fromAccountId)
      ? null
      : "Choose the cash or bank account the money was paid from.") ??
    (moneyIds.has(draft.toAccountId)
      ? null
      : "Choose the cash or bank account the money was received into.") ??
    (draft.fromAccountId && draft.fromAccountId === draft.toAccountId
      ? "Choose a different account to transfer into."
      : null) ??
    postingTextIssue({
      value: draft.externalReference,
      label: "External reference",
      max: POSTING_TEXT_LIMITS.externalReference,
    }) ??
    postingTextIssue({
      value: draft.reference,
      label: "Reference",
      max: POSTING_TEXT_LIMITS.reference,
    }) ??
    postingTextIssue({
      value: draft.note,
      label: "Note",
      max: POSTING_TEXT_LIMITS.note,
    })
  );
};

/** The optional reference fields every member-money entry accepts. */
const entryReferencesIssue = (draft: {
  externalReference: string;
  evidenceReference: string;
  reference: string;
  note: string;
}): string | null =>
  postingTextIssue({
    value: draft.externalReference,
    label: "External reference",
    max: POSTING_TEXT_LIMITS.externalReference,
  }) ??
  postingTextIssue({
    value: draft.evidenceReference,
    label: "Evidence reference",
    max: POSTING_TEXT_LIMITS.evidenceReference,
  }) ??
  postingTextIssue({
    value: draft.reference,
    label: "Reference",
    max: POSTING_TEXT_LIMITS.reference,
  }) ??
  postingTextIssue({
    value: draft.note,
    label: "Note",
    max: POSTING_TEXT_LIMITS.note,
  });

export const isMemberMoneyPurpose = (value: string): value is MemberMoneyPurpose =>
  (MEMBER_MONEY_PURPOSES as readonly string[]).includes(value);

export const RECEIVED_AFTER_OPENING_COUNT_ISSUE =
  "Confirm the money was received after the opening count. Money already in the opening count can't be recorded as a member receipt.";

export const memberReceiptDraftIssue = (
  draft: MemberReceiptDraft,
  context: PostingValidationContext,
): string | null =>
  commonDraftIssue(draft, context) ??
  (moneyAccountIds(context.accounts).has(draft.toAccountId)
    ? null
    : "Choose the cash or bank account the money was received into.") ??
  postingTextIssue({
    value: draft.counterpartyName,
    label: "Paid by",
    max: POSTING_TEXT_LIMITS.counterpartyName,
    required: true,
  }) ??
  (isMemberMoneyPurpose(draft.purpose) ? null : "Choose what the money is for.") ??
  (draft.receivedAfterOpeningCount === true ? null : RECEIVED_AFTER_OPENING_COUNT_ISSUE) ??
  entryReferencesIssue(draft);

export const refundDraftIssue = (
  draft: RefundDraft,
  context: PostingValidationContext,
): string | null =>
  commonDraftIssue(draft, context) ??
  (draft.businessDate < draft.source.businessDate
    ? `A refund can't be dated before the money it returns was received (${formatBusinessDate(
        draft.source.businessDate,
      )}).`
    : null) ??
  (draft.amountKobo > draft.source.remainingKobo
    ? `A refund can't be more than the ${formatKobo(
        draft.source.remainingKobo,
      )} still held from ${draft.source.number}.`
    : null) ??
  (moneyAccountIds(context.accounts).has(draft.fromAccountId)
    ? null
    : "Choose the cash or bank account the money is paid back from.") ??
  postingTextIssue({
    value: draft.counterpartyName,
    label: "Paid to",
    max: POSTING_TEXT_LIMITS.counterpartyName,
    required: true,
  }) ??
  postingTextIssue({
    value: draft.reason,
    label: "Reason",
    max: POSTING_TEXT_LIMITS.reason,
    required: true,
  }) ??
  entryReferencesIssue(draft);

export const postingDraftIssue = (
  draft: PostingDraft,
  context: PostingValidationContext,
): string | null => {
  switch (draft.operation) {
    case "receipt":
      return receiptDraftIssue(draft.receipt, context);
    case "expense":
      return expenseDraftIssue(draft.expense, context);
    case "transfer":
      return transferDraftIssue(draft.transfer, context);
    case "member_receipt":
      return memberReceiptDraftIssue(draft.memberReceipt, context);
    case "refund":
      return refundDraftIssue(draft.refund, context);
  }
};

/* ------------------------------------------------------------------ */
/* Exact request bodies                                               */
/* ------------------------------------------------------------------ */

const optionalText = (value: string): string | undefined => {
  const text = value.trim();
  return text ? text : undefined;
};

/** The exact receipt body, including the key. Optional blank text is omitted. */
export const buildReceiptBody = (
  draft: ReceiptDraft,
  idempotencyKey: string,
): ReceiptBody => {
  const body: ReceiptBody = {
    idempotencyKey,
    businessDate: draft.businessDate,
    amountKobo: draft.amountKobo,
    toAccountId: draft.toAccountId,
    incomeAccountId: draft.incomeAccountId,
    method: draft.method,
  };
  const counterpartyName = optionalText(draft.counterpartyName);
  const externalReference = optionalText(draft.externalReference);
  const evidenceReference = optionalText(draft.evidenceReference);
  const reference = optionalText(draft.reference);
  const note = optionalText(draft.note);
  if (counterpartyName) body.counterpartyName = counterpartyName;
  if (externalReference) body.externalReference = externalReference;
  if (evidenceReference) body.evidenceReference = evidenceReference;
  if (reference) body.reference = reference;
  if (note) body.note = note;
  return body;
};

/** The exact expense body, including the key. The payee is always present. */
export const buildExpenseBody = (
  draft: ExpenseDraft,
  idempotencyKey: string,
): ExpenseBody => {
  const body: ExpenseBody = {
    idempotencyKey,
    businessDate: draft.businessDate,
    amountKobo: draft.amountKobo,
    fromAccountId: draft.fromAccountId,
    expenseAccountId: draft.expenseAccountId,
    method: draft.method,
    counterpartyName: draft.counterpartyName.trim(),
  };
  const externalReference = optionalText(draft.externalReference);
  const evidenceReference = optionalText(draft.evidenceReference);
  const reference = optionalText(draft.reference);
  const note = optionalText(draft.note);
  if (externalReference) body.externalReference = externalReference;
  if (evidenceReference) body.evidenceReference = evidenceReference;
  if (reference) body.reference = reference;
  if (note) body.note = note;
  return body;
};

/** The exact transfer body. Transfers accept no counterparty or evidence field. */
export const buildTransferBody = (
  draft: TransferDraft,
  idempotencyKey: string,
): TransferBody => {
  const body: TransferBody = {
    idempotencyKey,
    businessDate: draft.businessDate,
    amountKobo: draft.amountKobo,
    fromAccountId: draft.fromAccountId,
    toAccountId: draft.toAccountId,
    method: draft.method,
  };
  const externalReference = optionalText(draft.externalReference);
  const reference = optionalText(draft.reference);
  const note = optionalText(draft.note);
  if (externalReference) body.externalReference = externalReference;
  if (reference) body.reference = reference;
  if (note) body.note = note;
  return body;
};

/** Optional reference fields, omitted when blank. */
const withReferences = <T extends object>(
  body: T,
  draft: { externalReference: string; evidenceReference: string; reference: string; note: string },
): T => {
  const references = {
    externalReference: optionalText(draft.externalReference),
    evidenceReference: optionalText(draft.evidenceReference),
    reference: optionalText(draft.reference),
    note: optionalText(draft.note),
  };
  const present = Object.fromEntries(
    Object.entries(references).filter(([, value]) => value !== undefined),
  );
  return { ...body, ...present };
};

/**
 * The exact member-receipt body. The server picks the holding account, so
 * none is ever sent. Blank hints are omitted rather than sent empty.
 */
export const buildMemberReceiptBody = (
  draft: MemberReceiptDraft,
  idempotencyKey: string,
): MemberReceiptBody => {
  if (!isMemberMoneyPurpose(draft.purpose)) {
    throw new Error("A member receipt needs an explicit purpose.");
  }
  const body: MemberReceiptBody = {
    idempotencyKey,
    businessDate: draft.businessDate,
    amountKobo: draft.amountKobo,
    toAccountId: draft.toAccountId,
    method: draft.method,
    counterpartyName: draft.counterpartyName.trim(),
    purpose: draft.purpose,
    receivedAfterOpeningCount: true,
  };
  if (draft.memberId) body.memberId = draft.memberId;
  if (draft.obligationId) body.obligationId = draft.obligationId;
  return withReferences(body, draft);
};

/** The exact refund body. The source is the route's `:sourceId`, never a body field. */
export const buildRefundBody = (draft: RefundDraft, idempotencyKey: string): RefundBody =>
  withReferences(
    {
      idempotencyKey,
      businessDate: draft.businessDate,
      amountKobo: draft.amountKobo,
      fromAccountId: draft.fromAccountId,
      method: draft.method,
      counterpartyName: draft.counterpartyName.trim(),
      reason: draft.reason.trim(),
    },
    draft,
  );

export const buildPostingBody = (
  draft: PostingDraft,
  idempotencyKey: string,
): PostingBody => {
  switch (draft.operation) {
    case "receipt":
      return buildReceiptBody(draft.receipt, idempotencyKey);
    case "expense":
      return buildExpenseBody(draft.expense, idempotencyKey);
    case "transfer":
      return buildTransferBody(draft.transfer, idempotencyKey);
    case "member_receipt":
      return buildMemberReceiptBody(draft.memberReceipt, idempotencyKey);
    case "refund":
      return buildRefundBody(draft.refund, idempotencyKey);
  }
};

/** The refund's source id, which is part of the exact request (its route). */
export const postingSourceId = (draft: PostingDraft): string | null =>
  draft.operation === "refund" ? draft.refund.source.id : null;

export const postingEndpoint = (operation: PostingOperation): string => {
  switch (operation) {
    case "receipt":
      return financeRequest.LEDGER_RECEIPTS;
    case "expense":
      return financeRequest.LEDGER_EXPENSES;
    case "transfer":
      return financeRequest.LEDGER_TRANSFERS;
    case "member_receipt":
      return financeRequest.LEDGER_MEMBER_RECEIPTS;
    case "refund":
      return financeRequest.LEDGER_MEMBER_MONEY_REFUNDS;
  }
};

/* ------------------------------------------------------------------ */
/* Readiness                                                          */
/* ------------------------------------------------------------------ */

export const POSTING_BLOCKER_MESSAGES: Record<string, string> = {
  LEDGER_WRITES_DISABLED:
    "Posting is switched off on the server for this environment. Money can't be recorded yet.",
  LEDGER_TRANSACTIONS_UNAVAILABLE:
    "The server's database can't safely post ledger entries right now.",
  LEDGER_INDEXES_NOT_INSTALLED:
    "The server's ledger safety indexes aren't installed yet, so posting is unavailable.",
};

export interface PostingReadiness {
  ready: boolean;
  reason: string | null;
}

/**
 * The server's actual readiness gates every form. `postingEnabled` alone is
 * not enough: the ledger must also be active with verified opening balances,
 * a known opening date and a known period lock so the client can validate the
 * business date without guessing.
 */
export const postingReadiness = ({
  status,
  canManage,
  accounts,
}: {
  status: LedgerStatus;
  canManage: boolean;
  accounts: readonly LedgerAccount[] | null;
}): PostingReadiness => {
  if (!canManage) {
    return {
      ready: false,
      reason:
        "Only officers with permission to manage finance can record money. You can still view the books.",
    };
  }

  const state = ledgerStateKey(status);
  if (state === "unknown") {
    return {
      ready: false,
      reason:
        "This app version doesn't recognise the bookkeeping state the server reported, so posting is blocked.",
    };
  }
  if (state === "suspended") {
    return {
      ready: false,
      reason:
        "Bookkeeping is suspended for this organisation. An owner must resume it before any money can be recorded.",
    };
  }
  if (state !== "active") {
    return {
      ready: false,
      reason:
        state === "not_active"
          ? "Bookkeeping hasn't been activated yet. Set up the ledger and verify the opening balances first."
          : state === "setup"
            ? "Bookkeeping setup is still in progress. Posting becomes available after the ledger is activated."
            : "Opening balances are awaiting independent verification. Posting becomes available after the ledger is activated.",
    };
  }
  if (status.openingBalancesVerified !== true) {
    return {
      ready: false,
      reason: "Opening balances aren't verified, so cash and bank accounts can't be posted to yet.",
    };
  }
  // Readiness must be affirmative and internally consistent. A true
  // `postingEnabled` never overrides blockers (or an unreported blocker
  // list): either would mean the server has not actually cleared posting.
  if (status.blockers === null) {
    return {
      ready: false,
      reason:
        "The server didn't report whether posting is available, so no financial entry can be offered.",
    };
  }
  if (status.blockers.length > 0) {
    const known = status.blockers
      .map((code) => POSTING_BLOCKER_MESSAGES[code])
      .filter((message): message is string => Boolean(message));
    return {
      ready: false,
      reason: known.length
        ? known.join(" ")
        : `The server reports that posting is unavailable (${status.blockers.join(", ")}).`,
    };
  }
  if (status.postingEnabled !== true) {
    return {
      ready: false,
      reason: "The server doesn't report posting as available for this ledger.",
    };
  }
  if (!status.openingDate) {
    return {
      ready: false,
      reason:
        "The server didn't report the ledger's opening date, so a safe business date can't be checked.",
    };
  }
  if (status.lockedThroughState === "unknown") {
    return {
      ready: false,
      reason:
        "The server didn't report the current period lock, so a safe business date can't be checked.",
    };
  }
  if (accounts === null) {
    return {
      ready: false,
      reason:
        "The accounts couldn't be loaded, so eligible cash, bank and category accounts can't be checked.",
    };
  }
  if (postingMoneyAccounts(accounts).length === 0) {
    return {
      ready: false,
      reason:
        "No active cash or bank account with a verified opening is available. Add or verify one before recording money.",
    };
  }
  return { ready: true, reason: null };
};

export const receiptOperationReadiness = (
  accounts: readonly LedgerAccount[] | null,
): PostingReadiness =>
  postingIncomeCategories(accounts).length > 0
    ? { ready: true, reason: null }
    : {
        ready: false,
        reason: "No active income category is configured. Add one before recording money in.",
      };

export const expenseOperationReadiness = (
  accounts: readonly LedgerAccount[] | null,
): PostingReadiness =>
  postingExpenseCategories(accounts).length > 0
    ? { ready: true, reason: null }
    : {
        ready: false,
        reason: "No active expense category is configured. Add one before recording money out.",
      };

export const transferOperationReadiness = (
  accounts: readonly LedgerAccount[] | null,
): PostingReadiness =>
  postingMoneyAccounts(accounts).length >= 2
    ? { ready: true, reason: null }
    : {
        ready: false,
        reason:
          "At least two active cash or bank accounts with verified openings are needed for a transfer.",
      };

/**
 * Member money needs, on top of ordinary posting readiness, member receipts
 * turned on for this ledger and an active holding account. The server picks
 * that account; the client only checks it exists so it can explain a gap.
 */
export const memberMoneyReadiness = ({
  status,
  accounts,
}: {
  status: LedgerStatus;
  accounts: readonly LedgerAccount[] | null;
}): PostingReadiness => {
  if (status.memberReceiptsEnabled !== true) {
    return {
      ready: false,
      reason:
        status.memberReceiptsEnabled === false
          ? "Member receipts are turned off for this ledger. An officer can turn them on in Bookkeeping setup before activation."
          : "The server didn't report whether member receipts are on, so member money can't be recorded.",
    };
  }
  if (accounts === null || !activeMemberMoneyAccount(accounts)) {
    return {
      ready: false,
      reason:
        "No active member money holding account is set up. Add one in the chart of accounts before recording member money.",
    };
  }
  return { ready: true, reason: null };
};

/* ------------------------------------------------------------------ */
/* Confirmed response                                                 */
/* ------------------------------------------------------------------ */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asSafeKobo = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

const asBusinessDate = (value: unknown): string | null =>
  typeof value === "string" && isBusinessDate(value) ? value : null;

/** The confirmed journal, or null when the body did not contain a usable id. */
export const toPostingJournal = (value: unknown): PostingJournal | null => {
  const raw = asRecord(value);
  const id = asText(raw?.id);
  if (!raw || !id) return null;
  const entry = asRecord(raw.entry);
  const source = asRecord(entry?.memberMoneySource);
  const postedBy = asRecord(raw.postedBy);
  return {
    id,
    businessDate: asBusinessDate(raw.businessDate),
    reference: asText(raw.reference),
    note: asText(raw.note),
    sourceType: asText(raw.sourceType),
    totalKobo: asSafeKobo(raw.totalKobo),
    postedAt: asText(raw.postedAt),
    postedByName: asText(postedBy?.name),
    sourceId: asText(raw.sourceId),
    number: asText(entry?.number),
    method: asText(entry?.method),
    counterpartyName: asText(entry?.counterpartyName),
    externalReference: asText(entry?.externalReference),
    evidenceReference: asText(entry?.evidenceReference),
    purpose: asText(entry?.purpose),
    memberId: asText(entry?.memberId),
    obligationId: asText(entry?.obligationId),
    receivedAfterOpeningCount:
      typeof entry?.receivedAfterOpeningCount === "boolean"
        ? entry.receivedAfterOpeningCount
        : null,
    memberMoneySourceId: asText(source?.id),
    memberMoneySourceNumber: asText(source?.number),
    reason: asText(entry?.reason),
  };
};

export interface PostingResponse {
  /** null when the 2xx body did not contain a readable journal. */
  journal: PostingJournal | null;
  /** true only when the server explicitly said this was a replay. */
  replayed: boolean | null;
}

export const toPostingResponse = (value: unknown): PostingResponse => {
  const envelope = asRecord(value);
  const data = asRecord(envelope?.data);
  if (!data) return { journal: null, replayed: null };
  return {
    journal: toPostingJournal(data.journal),
    replayed: typeof data.replayed === "boolean" ? data.replayed : null,
  };
};

/** The one journal `sourceType` each posting endpoint can create. */
export const POSTING_SOURCE_TYPES: Record<PostingOperation, string> = {
  receipt: "cash_receipt",
  expense: "cash_expense",
  transfer: "cash_transfer",
  member_receipt: "member_receipt",
  refund: "member_receipt_refund",
};

export type PostingConfirmationAssessment =
  | { confirmed: true; journal: PostingJournal; replayed: boolean }
  | { confirmed: false; message: string };

const unconfirmedPostingResponse = (detail: string): PostingConfirmationAssessment => ({
  confirmed: false,
  message: `The server returned a success status, but ${detail}. The request has been kept pending; retry the exact same request. If it was posted, the server will return the original journal instead of posting again.`,
});

/**
 * A 2xx is only proof when its body is contract-consistent.
 *
 * The client keeps the intent until it can identify the journal that was
 * posted, knows whether this was a replay, and can see that the journal is
 * the same type, date and amount it asked for. Anything else is unconfirmed,
 * never "Posted": the stored body and key stay pending and a fresh posting is
 * blocked.
 */
export const assessPostingConfirmation = ({
  httpStatus,
  body,
  operation,
  businessDate,
  amountKobo,
  sourceId = null,
}: {
  httpStatus: number | undefined;
  body: unknown;
  operation: PostingOperation;
  businessDate: string;
  amountKobo: number;
  /** Refunds: the `:sourceId` the request was sent to. */
  sourceId?: string | null;
}): PostingConfirmationAssessment => {
  if (httpStatus !== 200 && httpStatus !== 201) {
    return unconfirmedPostingResponse(
      `the status (${httpStatus ?? "none"}) was not 201 or 200`,
    );
  }

  const parsed = toPostingResponse(body);
  if (!parsed.journal) {
    return unconfirmedPostingResponse(
      "the response did not contain a usable journal identity",
    );
  }
  if (parsed.replayed === null) {
    return unconfirmedPostingResponse(
      "the response did not say whether this was a replay",
    );
  }
  if (httpStatus === 201 && parsed.replayed !== false) {
    return unconfirmedPostingResponse(
      "a 201 response claimed to be a replay",
    );
  }
  if (httpStatus === 200 && parsed.replayed !== true) {
    return unconfirmedPostingResponse(
      "a 200 response did not confirm a replay",
    );
  }
  if (parsed.journal.sourceType !== POSTING_SOURCE_TYPES[operation]) {
    return unconfirmedPostingResponse(
      "the journal type did not match the posting",
    );
  }
  if (parsed.journal.businessDate !== businessDate) {
    return unconfirmedPostingResponse(
      "the journal business date did not match the posting",
    );
  }
  if (parsed.journal.totalKobo !== amountKobo) {
    return unconfirmedPostingResponse(
      "the journal total did not match the posting amount",
    );
  }
  if (!parsed.journal.number) {
    return unconfirmedPostingResponse(
      "the response did not contain the server-issued journal number",
    );
  }
  // A refund is only the one asked for when it returned money from the
  // source the request named.
  if (operation === "refund" && parsed.journal.memberMoneySourceId !== sourceId) {
    return unconfirmedPostingResponse(
      "the refund did not name the member money it was sent against",
    );
  }

  return {
    confirmed: true,
    journal: parsed.journal,
    replayed: parsed.replayed,
  };
};

/* ------------------------------------------------------------------ */
/* Failure proof                                                      */
/* ------------------------------------------------------------------ */

export const POSTING_ERROR_CODES = {
  keyReused: "LEDGER_IDEMPOTENCY_KEY_REUSED",
  keyVoided: "LEDGER_IDEMPOTENCY_KEY_VOIDED",
  contended: "LEDGER_POSTING_CONTENDED",
  outcomeUnknown: "LEDGER_POSTING_OUTCOME_UNKNOWN",
  writesDisabled: "LEDGER_WRITES_DISABLED",
  transactionsUnavailable: "LEDGER_TRANSACTIONS_UNAVAILABLE",
  indexesNotInstalled: "LEDGER_INDEXES_NOT_INSTALLED",
  insufficientFunds: "LEDGER_INSUFFICIENT_FUNDS",
  periodLocked: "LEDGER_PERIOD_LOCKED",
  beforeOpeningDate: "LEDGER_BEFORE_OPENING_DATE",
  accountRoleMismatch: "LEDGER_ACCOUNT_ROLE_MISMATCH",
  accountInactive: "LEDGER_ACCOUNT_INACTIVE",
  openingUnverified: "LEDGER_OPENING_UNVERIFIED",
  sameAccountTransfer: "LEDGER_SAME_ACCOUNT_TRANSFER",
  memberReceiptsDisabled: "LEDGER_MEMBER_RECEIPTS_DISABLED",
  requiredAccountMissing: "LEDGER_REQUIRED_ACCOUNT_MISSING",
  refundExceedsRemaining: "LEDGER_REFUND_EXCEEDS_REMAINING",
} as const;

const NOTHING_WRITTEN_CODES: ReadonlySet<string> = new Set([
  POSTING_ERROR_CODES.writesDisabled,
  POSTING_ERROR_CODES.transactionsUnavailable,
  POSTING_ERROR_CODES.indexesNotInstalled,
]);

export type PostingFailureDisposition =
  | { kind: "voided"; message: string }
  | { kind: "key-reused"; message: string }
  | { kind: "clean-refusal"; message: string }
  | {
      kind: "keep-pending";
      ambiguous: boolean;
      /** Resending cannot fix this; the unconfirmed-attempts flow must. */
      ownerResolution: boolean;
      message: string;
    };

/**
 * Apply RFC §7.5/§7.6 to a failed posting.
 *
 * Only 201/200 replay are proof of success (handled by the caller). A 400/422
 * is a clean refusal only when this key has never had an ambiguous attempt;
 * after one, it says nothing about the earlier attempt. A 401/403/404 never
 * reached the key check. 503 infrastructure codes did not write, but the
 * contract still requires keeping the key pending so a retry can prove it.
 */
export const classifyPostingFailure = (
  error: unknown,
  hadAmbiguousAttempt: boolean,
): PostingFailureDisposition => {
  const failure = ledgerApiFailure(error);
  const status = failure.status;
  const code = failure.code;
  const backendMessage = failure.message;

  if (status === 409 && code === POSTING_ERROR_CODES.keyVoided) {
    return {
      kind: "voided",
      message:
        "The earlier attempt was voided, so nothing was posted. Enter the posting again to use a new request key.",
    };
  }
  if (status === 409 && code === POSTING_ERROR_CODES.keyReused) {
    return {
      kind: "key-reused",
      message:
        "This request key was already used for a different posting. Don't send it again; an owner must resolve it from the unconfirmed attempts list.",
    };
  }
  if (status === 400 || status === 422) {
    if (!hadAmbiguousAttempt) {
      return {
        kind: "clean-refusal",
        message: backendMessage ?? "The posting was refused and nothing was saved.",
      };
    }
    return {
      kind: "keep-pending",
      ambiguous: false,
      ownerResolution: true,
      message: `Not saved now: ${
        backendMessage ?? "the posting was refused"
      } An earlier attempt with this same request is still unconfirmed, so it can't be treated as a fresh start. Resolution is needed before this transaction can be relied on.`,
    };
  }
  if (status === 401) {
    return {
      kind: "keep-pending",
      ambiguous: false,
      ownerResolution: false,
      message:
        "Your session ended before the server checked this posting. Sign in again and retry the same request.",
    };
  }
  if (status === 403) {
    return {
      kind: "keep-pending",
      ambiguous: false,
      ownerResolution: true,
      message:
        "Your permission changed before the server checked this posting. Don't enter it again; an owner must resolve it.",
    };
  }
  if (status === 404) {
    return {
      kind: "keep-pending",
      ambiguous: false,
      ownerResolution: true,
      message:
        "This posting no longer matches your organisation or its accounts. Don't enter it again; an owner must resolve it.",
    };
  }
  if (status === 409 && code === POSTING_ERROR_CODES.contended) {
    return {
      kind: "keep-pending",
      ambiguous: false,
      ownerResolution: false,
      message:
        "Another posting changed the books at the same time. Retry this same request; no new key is needed.",
    };
  }
  if (code && NOTHING_WRITTEN_CODES.has(code)) {
    return {
      kind: "keep-pending",
      ambiguous: false,
      ownerResolution: false,
      message: `${backendMessage ?? "Posting is unavailable on the server."} This attempt didn't post anything; retry later with the same request.`,
    };
  }

  const ambiguous =
    failure.transportFailure ||
    status === 408 ||
    (typeof status === "number" && status >= 500);
  return {
    kind: "keep-pending",
    ambiguous,
    ownerResolution: false,
    message: ambiguous
      ? `${
          backendMessage ?? "The server didn't confirm this posting."
        } The outcome is unknown. Retry the same request; if it was already saved, the server returns the original journal instead of posting again.`
      : backendMessage ?? "The posting wasn't confirmed. Retry the same request.",
  };
};

/* ------------------------------------------------------------------ */
/* Display helpers                                                    */
/* ------------------------------------------------------------------ */

export const postingSummaryText = (summary: PostingSummary): string => {
  const amount = formatKobo(summary.amountKobo);
  const operation = POSTING_OPERATION_LABELS[summary.operation];
  switch (summary.operation) {
    case "receipt":
      return `${operation}: ${amount} into ${
        summary.toAccountName ?? "the selected account"
      } from ${summary.categoryName ?? "the selected income category"}`;
    case "expense":
      return `${operation}: ${amount} from ${
        summary.fromAccountName ?? "the selected account"
      } to ${summary.categoryName ?? "the selected expense category"}`;
    case "transfer":
      return `${operation}: ${amount} from ${
        summary.fromAccountName ?? "the selected account"
      } to ${summary.toAccountName ?? "the selected account"}`;
    case "member_receipt":
      return `${operation}: ${amount} into ${
        summary.toAccountName ?? "the selected account"
      } from ${summary.counterpartyName ?? "the payer"}${
        summary.purpose ? ` (${MEMBER_MONEY_PURPOSE_LABELS[summary.purpose].toLowerCase()})` : ""
      }`;
    case "refund":
      return `${operation}: ${amount} from ${
        summary.fromAccountName ?? "the selected account"
      } to ${summary.counterpartyName ?? "the recipient"}, against ${
        summary.sourceNumber ?? "the selected member money"
      }`;
  }
};

export const postingMethodLabel = (method: string | null): string | null =>
  method && isPostingMethod(method) ? POSTING_METHOD_LABELS[method] : method;

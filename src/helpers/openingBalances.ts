import { format, isValid, parseISO, subDays } from "date-fns";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import {
  AccountOpeningView,
  EffectiveOpeningsView,
  MemberMoneyPositionView,
  OpeningAccountLineInput,
  OpeningAdjustmentView,
  OpeningItemChangeInput,
  OpeningItemChangeView,
  OpeningMemberMoneyItemInput,
  OpeningMemberMoneyItemView,
  OpeningProposal,
  OpeningProposalKind,
  OpeningProposalKnownStatus,
  OpeningProposalLine,
  OpeningProposalPage,
  OpeningProposalStatus,
  OpeningProposalSummary,
  SubmitOpeningInput,
} from "components/finance/openingBalanceTypes";
import { ledgerStateKey } from "helpers/ledger";
import {
  AccountRole,
  isMemberHoldingRole,
  isMoneyRole,
  isOpeningEquityRole,
  toAccountRole,
} from "helpers/ledgerSetup";

/**
 * Pure rules and fail-closed readers for F2A-3 opening balances.
 *
 * The backend owns every authoritative figure: fingerprints, summaries,
 * effective openings, deltas and activation. Nothing here derives an opening
 * from F0 dues/levy records, and a missing field never becomes zero, a
 * verified amount, "no proposal" or "complete".
 */

/* ------------------------------------------------------------------ */
/* Fail-closed primitive readers                                      */
/* ------------------------------------------------------------------ */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asSafeInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) ? value : null;

const asNonNegativeInt = (value: unknown): number | null => {
  const parsed = asSafeInt(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

const asCount = (value: unknown): number | null => asNonNegativeInt(value);

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isBusinessDate = (value: string) =>
  BUSINESS_DATE.test(value) && isValid(parseISO(value));

const asBusinessDate = (value: unknown): string | null =>
  typeof value === "string" && isBusinessDate(value) ? value : null;

const asTimestamp = (value: unknown): string | null => asText(value);

const FINGERPRINT = /^[a-f0-9]{64}$/;

const asFingerprint = (value: unknown): string | null =>
  typeof value === "string" && FINGERPRINT.test(value) ? value : null;

/* ------------------------------------------------------------------ */
/* Proposal parsing                                                   */
/* ------------------------------------------------------------------ */

export const OPENING_PROPOSAL_KINDS: readonly OpeningProposalKind[] = [
  "initial",
  "supplementary",
  "correction",
];

export const OPENING_PROPOSAL_STATUSES: readonly OpeningProposalKnownStatus[] = [
  "submitted",
  "verified",
  "rejected",
  "withdrawn",
];

const isProposalKind = (value: string): value is OpeningProposalKind =>
  (OPENING_PROPOSAL_KINDS as readonly string[]).includes(value);

const isKnownStatus = (value: string): value is OpeningProposalKnownStatus =>
  (OPENING_PROPOSAL_STATUSES as readonly string[]).includes(value);

export const toOpeningStatus = (value: unknown): OpeningProposalStatus | null => {
  const text = asText(value);
  if (!text) return null;
  return isKnownStatus(text)
    ? { kind: "known", status: text }
    : { kind: "unknown", raw: text };
};

export const openingStatusKey = (
  status: OpeningProposalStatus,
): OpeningProposalKnownStatus | "unknown" =>
  status.kind === "known" ? status.status : "unknown";

const toProposalLine = (
  value: unknown,
  kind: OpeningProposalKind,
): OpeningProposalLine | null => {
  const raw = asRecord(value);
  const accountId = asText(raw?.accountId);
  if (!raw || !accountId) return null;
  if (kind === "correction") {
    const correctedAmountKobo = asNonNegativeInt(raw.correctedAmountKobo);
    const effectiveBeforeKobo = asNonNegativeInt(raw.effectiveBeforeKobo);
    const deltaKobo = asSafeInt(raw.deltaKobo);
    if (
      correctedAmountKobo === null ||
      effectiveBeforeKobo === null ||
      deltaKobo === null
    )
      return null;
    return {
      accountId,
      amountKobo: null,
      correctedAmountKobo,
      effectiveBeforeKobo,
      deltaKobo,
    };
  }
  const amountKobo = asNonNegativeInt(raw.amountKobo);
  if (amountKobo === null) return null;
  return {
    accountId,
    amountKobo,
    correctedAmountKobo: null,
    effectiveBeforeKobo: null,
    deltaKobo: null,
  };
};

const toMemberMoneyItemView = (value: unknown): OpeningMemberMoneyItemView | null => {
  const raw = asRecord(value);
  const id = asText(raw?.id);
  const payerName = asText(raw?.payerName);
  const purpose = asText(raw?.purpose);
  const evidence = asText(raw?.evidence);
  const amountKobo = asSafeInt(raw?.amountKobo);
  if (!raw || !id || !payerName || !purpose || !evidence) return null;
  if (amountKobo === null || amountKobo <= 0) return null;
  return {
    id,
    payerName,
    memberId: asText(raw.memberId),
    purpose,
    obligationId: asText(raw.obligationId),
    amountKobo,
    evidence,
  };
};

const toItemChangeView = (value: unknown): OpeningItemChangeView | null => {
  const raw = asRecord(value);
  const itemId = asText(raw?.itemId);
  const correctedAmountKobo = asNonNegativeInt(raw?.correctedAmountKobo);
  const effectiveBeforeKobo = asNonNegativeInt(raw?.effectiveBeforeKobo);
  const deltaKobo = asSafeInt(raw?.deltaKobo);
  if (
    !raw ||
    !itemId ||
    correctedAmountKobo === null ||
    effectiveBeforeKobo === null ||
    deltaKobo === null
  )
    return null;
  return { itemId, correctedAmountKobo, effectiveBeforeKobo, deltaKobo };
};

const toProposalSummary = (value: unknown): OpeningProposalSummary | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const moneyKobo = asSafeInt(raw.moneyKobo);
  const memberMoneyKobo = asSafeInt(raw.memberMoneyKobo);
  const equityKobo = asSafeInt(raw.equityKobo);
  if (moneyKobo === null || memberMoneyKobo === null || equityKobo === null)
    return null;
  return { moneyKobo, memberMoneyKobo, equityKobo };
};

/**
 * One proposal, or null when any essential field is missing or unusable.
 * Individual lines/items are never dropped: a shortened proposal would look
 * complete while omitting money that must be approved.
 */
export const toOpeningProposal = (value: unknown): OpeningProposal | null => {
  const raw = asRecord(value);
  const id = asText(raw?.id);
  const kindText = asText(raw?.kind);
  const status = toOpeningStatus(raw?.status);
  const asOfDate = asBusinessDate(raw?.asOfDate);
  const evidence = asText(raw?.evidence);
  if (!raw || !id || !kindText || !isProposalKind(kindText) || !status || !asOfDate || !evidence)
    return null;

  const kind = kindText;
  const rawLines = raw.lines;
  const rawItems = raw.memberMoneyItems;
  const rawChanges = raw.itemChanges;
  if (!Array.isArray(rawLines) || !Array.isArray(rawItems) || !Array.isArray(rawChanges))
    return null;

  const lines: OpeningProposalLine[] = [];
  for (const entry of rawLines) {
    const line = toProposalLine(entry, kind);
    if (!line) return null;
    lines.push(line);
  }
  const memberMoneyItems: OpeningMemberMoneyItemView[] = [];
  for (const entry of rawItems) {
    const item = toMemberMoneyItemView(entry);
    if (!item) return null;
    memberMoneyItems.push(item);
  }
  const itemChanges: OpeningItemChangeView[] = [];
  for (const entry of rawChanges) {
    const change = toItemChangeView(entry);
    if (!change) return null;
    itemChanges.push(change);
  }

  return {
    id,
    kind,
    status,
    asOfDate,
    lines,
    memberMoneyItems,
    itemChanges,
    summary: toProposalSummary(raw.summary),
    evidence,
    reason: asText(raw.reason),
    fingerprint: asFingerprint(raw.fingerprint),
    proposedBy: asText(raw.proposedBy),
    proposedAt: asTimestamp(raw.proposedAt),
    decidedBy: asText(raw.decidedBy),
    decidedAt: asTimestamp(raw.decidedAt),
    decisionNote: asText(raw.decisionNote),
    journalId: asText(raw.journalId),
    revision: asCount(raw.revision),
  };
};

/**
 * `{ items, nextCursor }` or null when the envelope or any item is unusable.
 * An empty page is a genuine empty list.
 */
export const toOpeningProposalPage = (value: unknown): OpeningProposalPage | null => {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.items)) return null;
  const nextCursor =
    raw.nextCursor === null || raw.nextCursor === undefined
      ? null
      : asText(raw.nextCursor);
  const items: OpeningProposal[] = [];
  for (const entry of raw.items) {
    const proposal = toOpeningProposal(entry);
    if (!proposal) return null;
    items.push(proposal);
  }
  return { items, nextCursor };
};

/* ------------------------------------------------------------------ */
/* Effective openings parsing                                         */
/* ------------------------------------------------------------------ */

const toAdjustment = (value: unknown): OpeningAdjustmentView | null => {
  const raw = asRecord(value);
  const proposalId = asText(raw?.proposalId);
  const deltaKobo = asSafeInt(raw?.deltaKobo);
  if (!raw || !proposalId || deltaKobo === null) return null;
  return {
    proposalId,
    deltaKobo,
    verifiedAt: asTimestamp(raw.verifiedAt),
  };
};

const toAccountOpening = (value: unknown): AccountOpeningView | null => {
  const raw = asRecord(value);
  const accountId = asText(raw?.accountId);
  const openingDate = asBusinessDate(raw?.openingDate);
  const proposalId = asText(raw?.proposalId);
  const originalKobo = asNonNegativeInt(raw?.originalKobo);
  const effectiveKobo = asSafeInt(raw?.effectiveKobo);
  if (
    !raw ||
    !accountId ||
    !openingDate ||
    !proposalId ||
    originalKobo === null ||
    effectiveKobo === null ||
    !Array.isArray(raw.corrections)
  )
    return null;
  const corrections: OpeningAdjustmentView[] = [];
  for (const entry of raw.corrections) {
    const adjustment = toAdjustment(entry);
    if (!adjustment) return null;
    corrections.push(adjustment);
  }
  return {
    accountId,
    openingDate,
    proposalId,
    originalKobo,
    corrections,
    effectiveKobo,
  };
};

const toMemberMoneyPosition = (value: unknown): MemberMoneyPositionView | null => {
  const raw = asRecord(value);
  const id = asText(raw?.id);
  const number = asText(raw?.number);
  const payerName = asText(raw?.payerName);
  const purpose = asText(raw?.purpose);
  const evidence = asText(raw?.evidence);
  const proposalId = asText(raw?.proposalId);
  const originalKobo = asNonNegativeInt(raw?.originalKobo);
  const effectiveKobo = asSafeInt(raw?.effectiveKobo);
  if (
    !raw ||
    !id ||
    !number ||
    !payerName ||
    !purpose ||
    !evidence ||
    !proposalId ||
    originalKobo === null ||
    effectiveKobo === null ||
    !Array.isArray(raw.adjustments)
  )
    return null;
  const adjustments: OpeningAdjustmentView[] = [];
  for (const entry of raw.adjustments) {
    const adjustment = toAdjustment(entry);
    if (!adjustment) return null;
    adjustments.push(adjustment);
  }
  return {
    id,
    number,
    payerName,
    memberId: asText(raw.memberId),
    purpose,
    obligationId: asText(raw.obligationId),
    evidence,
    proposalId,
    originalKobo,
    adjustments,
    effectiveKobo,
  };
};

/**
 * Verified openings, or null when any entry is unusable. A malformed list is
 * never shown as "nothing verified yet".
 */
export const toEffectiveOpenings = (value: unknown): EffectiveOpeningsView | null => {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.accounts) || !Array.isArray(raw.memberMoneyItems))
    return null;
  const openingDate =
    raw.openingDate === null || raw.openingDate === undefined
      ? null
      : asBusinessDate(raw.openingDate);
  if (raw.openingDate != null && openingDate === null) return null;

  const accounts: AccountOpeningView[] = [];
  for (const entry of raw.accounts) {
    const account = toAccountOpening(entry);
    if (!account) return null;
    accounts.push(account);
  }
  const memberMoneyItems: MemberMoneyPositionView[] = [];
  for (const entry of raw.memberMoneyItems) {
    const item = toMemberMoneyPosition(entry);
    if (!item) return null;
    memberMoneyItems.push(item);
  }
  return { openingDate, accounts, memberMoneyItems };
};

/* ------------------------------------------------------------------ */
/* Proposal selection                                                 */
/* ------------------------------------------------------------------ */

/** The one open proposal, or null. More than one submitted is a conflict. */
export const openProposalOf = (
  proposals: readonly OpeningProposal[],
): OpeningProposal | null => {
  const open = proposals.filter(
    (proposal) =>
      proposal.status.kind === "known" && proposal.status.status === "submitted",
  );
  return open.length === 1 ? open[0] : null;
};

/** True when the server sent more than one open proposal (never expected). */
export const hasMultipleOpenProposals = (proposals: readonly OpeningProposal[]) =>
  proposals.filter(
    (proposal) =>
      proposal.status.kind === "known" && proposal.status.status === "submitted",
  ).length > 1;

/* ------------------------------------------------------------------ */
/* Money and previews (integer kobo only)                             */
/* ------------------------------------------------------------------ */

const sumSafe = (values: readonly number[]): number | null => {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
};

/**
 * Officer-typed naira to integer kobo, without floating point. Accepts
 * thousands separators and at most two decimal places; anything else is null.
 */
export const parseNairaToKobo = (typed: string): number | null => {
  const cleaned = typed.replace(/[,\s₦]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  const kobo = Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
  return Number.isSafeInteger(kobo) ? kobo : null;
};

export interface OpeningPreview {
  moneyKobo: number;
  memberMoneyKobo: number;
  equityKobo: number;
  /** True when identified member money exceeds the cash counted. */
  memberExceedsMoney: boolean;
}

/**
 * A clearly-labelled preview only. The backend stores and verifies the
 * authoritative summary; a negative equity figure is shown, never clamped.
 */
export const openingPreview = (
  lines: readonly { amountKobo: number | null }[],
  items: readonly { amountKobo: number | null }[],
): OpeningPreview | null => {
  const moneyKobo = sumSafe(
    lines.map((line) => (line.amountKobo === null ? NaN : line.amountKobo)),
  );
  const memberMoneyKobo = sumSafe(
    items.map((item) => (item.amountKobo === null ? NaN : item.amountKobo)),
  );
  if (moneyKobo === null || memberMoneyKobo === null) return null;
  return {
    moneyKobo,
    memberMoneyKobo,
    equityKobo: moneyKobo - memberMoneyKobo,
    memberExceedsMoney: memberMoneyKobo > moneyKobo,
  };
};

/** A correction's delta preview: corrected − effective-before, per line. */
export const correctionDelta = (
  correctedAmountKobo: number,
  effectiveBeforeKobo: number,
): number | null => {
  if (!Number.isSafeInteger(correctedAmountKobo) || !Number.isSafeInteger(effectiveBeforeKobo))
    return null;
  const delta = correctedAmountKobo - effectiveBeforeKobo;
  return Number.isSafeInteger(delta) ? delta : null;
};

/* ------------------------------------------------------------------ */
/* Dates in Africa/Lagos                                              */
/* ------------------------------------------------------------------ */

export const LAGOS_TIME_ZONE = "Africa/Lagos";

/** Today's calendar date in Lagos, as `YYYY-MM-DD`. */
export const todayInLagos = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/** The earliest opening date the backend accepts today (31 days earlier). */
export const earliestOpeningDate = (today: string): string => {
  const parsed = parseISO(today);
  return isValid(parsed) ? format(subDays(parsed, 31), "yyyy-MM-dd") : "";
};

/** Why an opening date would be refused, or null. The backend still decides. */
export const openingDateIssue = (date: string, today: string): string | null => {
  if (!isBusinessDate(date)) return "Choose a valid opening date.";
  if (date > today) return "The opening date can't be after today in Lagos.";
  const earliest = earliestOpeningDate(today);
  if (earliest && date < earliest)
    return `The opening date can be at most 31 days earlier than today (earliest ${format(
      parseISO(earliest),
      "d MMM yyyy",
    )}).`;
  return null;
};

/** A stored timestamp shown in Lagos time; never used for business dates. */
export const formatLagosTimestamp = (value: string | null): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
  return `${text} WAT`;
};

/* ------------------------------------------------------------------ */
/* Chart-of-accounts helpers                                          */
/* ------------------------------------------------------------------ */

const activeRole = (account: LedgerAccount): AccountRole | null =>
  account.active === true ? toAccountRole(account) : null;

export const activeMoneyAccounts = (
  accounts: readonly LedgerAccount[],
): LedgerAccount[] => accounts.filter((account) => {
  const role = activeRole(account);
  return role !== null && isMoneyRole(role);
});

export const activeOpeningEquityAccount = (
  accounts: readonly LedgerAccount[],
): LedgerAccount | null =>
  accounts.find((account) => {
    const role = activeRole(account);
    return role !== null && isOpeningEquityRole(role);
  }) ?? null;

export const activeMemberMoneyAccount = (
  accounts: readonly LedgerAccount[],
): LedgerAccount | null =>
  accounts.find((account) => {
    const role = activeRole(account);
    return role !== null && isMemberHoldingRole(role);
  }) ?? null;

export interface InitialOpeningReadiness {
  moneyAccounts: LedgerAccount[];
  equityAccount: LedgerAccount | null;
  holdingAccount: LedgerAccount | null;
  /** Hard blockers: the backend refuses an initial proposal without these. */
  blockers: string[];
  /** When true, member-money items can be added (optional). */
  memberMoneyReady: boolean;
}

export const initialOpeningReadiness = (
  accounts: readonly LedgerAccount[],
  memberReceiptsEnabled: boolean,
): InitialOpeningReadiness => {
  const moneyAccounts = activeMoneyAccounts(accounts);
  const equityAccount = activeOpeningEquityAccount(accounts);
  const holdingAccount = activeMemberMoneyAccount(accounts);
  const blockers: string[] = [];
  if (moneyAccounts.length === 0)
    blockers.push("Add at least one active cash or bank account in the chart of accounts.");
  if (!equityAccount)
    blockers.push("Add an active opening balance equity account in the chart of accounts.");
  const memberMoneyReady = memberReceiptsEnabled && holdingAccount !== null;
  return { moneyAccounts, equityAccount, holdingAccount, blockers, memberMoneyReady };
};

/**
 * Money accounts whose opening is still outstanding.
 *
 * In `setup`/`pending_verification` every active money account is part of the
 * initial opening. Once `active`, only accounts the server explicitly marks
 * `openingVerified: false` are supplementary candidates. A missing F2A-4 flag
 * is unknown, not "unverified", and is never listed here.
 */
export const moneyAccountsAwaitingOpening = (
  status: LedgerStatus,
  accounts: readonly LedgerAccount[],
): LedgerAccount[] => {
  const state: LedgerKnownState | "unknown" = ledgerStateKey(status);
  if (state === "setup" || state === "pending_verification") return activeMoneyAccounts(accounts);
  if (state === "active")
    return activeMoneyAccounts(accounts).filter(
      (account) => account.openingVerified === false,
    );
  return [];
};

/** Verified openings that are genuinely zero (must not read as unknown). */
export const verifiedZeroAccounts = (
  effective: EffectiveOpeningsView | null,
): AccountOpeningView[] =>
  (effective?.accounts ?? []).filter((account) => account.effectiveKobo === 0);

/* ------------------------------------------------------------------ */
/* Permissions (presentation only; the backend enforces)              */
/* ------------------------------------------------------------------ */

export interface OpeningDecisionPermissions {
  canVerify: boolean;
  canReject: boolean;
  canWithdraw: boolean;
  verifyBlockedReason: string | null;
}

export const openingDecisionPermissions = ({
  proposal,
  isOwner,
  userId,
  ledgerRevision,
}: {
  proposal: OpeningProposal;
  isOwner: boolean;
  userId: string | null;
  ledgerRevision: number | null;
}): OpeningDecisionPermissions => {
  const decision = (verifyBlockedReason: string | null): OpeningDecisionPermissions => ({
    canVerify: false,
    canReject: false,
    canWithdraw: false,
    verifyBlockedReason,
  });

  if (proposal.status.kind === "unknown")
    return decision("This proposal's status isn't recognised by this app version.");
  if (proposal.status.status !== "submitted")
    return decision("This proposal has already been decided.");

  const isProposer = Boolean(proposal.proposedBy && proposal.proposedBy === userId);
  const canVerify =
    isOwner &&
    !isProposer &&
    proposal.fingerprint !== null &&
    ledgerRevision !== null;
  const verifyBlockedReason = canVerify
    ? null
    : !isOwner
      ? "Only the organisation owner can verify opening balances."
      : isProposer
        ? "You proposed these opening balances, so another officer must verify them."
        : "The proposal fingerprint or ledger revision isn't available, so verification can't be requested.";

  return {
    canVerify,
    canReject: isOwner,
    canWithdraw: isOwner || isProposer,
    verifyBlockedReason,
  };
};

export interface ProposePermission {
  allowed: boolean;
  reason: string | null;
}

/**
 * Who may submit an opening proposal. The owner independently verifies, so
 * an owner-submitted proposal could never be approved (backend PR #40).
 */
export const canSubmitOpeningProposal = ({
  canManage,
  isOwner,
  hasOpenProposal,
}: {
  canManage: boolean;
  isOwner: boolean;
  hasOpenProposal: boolean;
}): ProposePermission => {
  if (!canManage) return { allowed: false, reason: "You need the finance manage permission." };
  if (isOwner)
    return {
      allowed: false,
      reason:
        "The owner independently verifies opening balances, so another finance officer must submit them.",
    };
  if (hasOpenProposal)
    return {
      allowed: false,
      reason: "A proposal is already waiting for a decision. Verify, reject or withdraw it first.",
    };
  return { allowed: true, reason: null };
};

/* ------------------------------------------------------------------ */
/* Payload builders (exact backend validators)                        */
/* ------------------------------------------------------------------ */

const cleanItems = (
  items: readonly OpeningMemberMoneyItemInput[],
): OpeningMemberMoneyItemInput[] =>
  items.map((item) => ({
    payerName: item.payerName.trim(),
    purpose: item.purpose?.trim() || undefined,
    memberId: item.memberId?.trim() || null,
    obligationId: item.obligationId?.trim() || null,
    amountKobo: item.amountKobo,
    evidence: item.evidence.trim(),
  }));

export const buildInitialOpeningInput = ({
  asOfDate,
  expectedLedgerRevision,
  evidence,
  lines,
  memberMoneyItems = [],
}: {
  asOfDate: string;
  expectedLedgerRevision: number;
  evidence: string;
  lines: readonly OpeningAccountLineInput[];
  memberMoneyItems?: readonly OpeningMemberMoneyItemInput[];
}): SubmitOpeningInput => {
  const input: SubmitOpeningInput = {
    kind: "initial",
    asOfDate,
    expectedLedgerRevision,
    evidence: evidence.trim(),
    lines: lines.map((line) => ({ accountId: line.accountId, amountKobo: line.amountKobo })),
  };
  // The validator forbids these keys on an initial proposal only when sent as
  // the wrong shape; an empty list is omitted so nothing is asserted.
  if (memberMoneyItems.length > 0) input.memberMoneyItems = cleanItems(memberMoneyItems);
  return input;
};

export const buildSupplementaryOpeningInput = ({
  asOfDate,
  expectedLedgerRevision,
  evidence,
  lines,
}: {
  asOfDate: string;
  expectedLedgerRevision: number;
  evidence: string;
  lines: readonly OpeningAccountLineInput[];
}): SubmitOpeningInput => ({
  kind: "supplementary",
  asOfDate,
  expectedLedgerRevision,
  evidence: evidence.trim(),
  lines: lines.map((line) => ({ accountId: line.accountId, amountKobo: line.amountKobo })),
});

export const buildCorrectionOpeningInput = ({
  asOfDate,
  expectedLedgerRevision,
  evidence,
  reason,
  lines,
  itemChanges = [],
  memberMoneyItems = [],
}: {
  asOfDate: string;
  expectedLedgerRevision: number;
  evidence: string;
  reason: string;
  lines: readonly OpeningAccountLineInput[];
  itemChanges?: readonly OpeningItemChangeInput[];
  memberMoneyItems?: readonly OpeningMemberMoneyItemInput[];
}): SubmitOpeningInput => {
  const input: SubmitOpeningInput = {
    kind: "correction",
    asOfDate,
    expectedLedgerRevision,
    evidence: evidence.trim(),
    reason: reason.trim(),
    lines: lines.map((line) => ({
      accountId: line.accountId,
      correctedAmountKobo: line.correctedAmountKobo,
    })),
  };
  // The validator forbids `itemChanges`/`memberMoneyItems` on the other kinds;
  // for a correction they are optional and omitted when empty.
  if (itemChanges.length > 0)
    input.itemChanges = itemChanges.map((change) => ({
      itemId: change.itemId,
      correctedAmountKobo: change.correctedAmountKobo,
    }));
  if (memberMoneyItems.length > 0) input.memberMoneyItems = cleanItems(memberMoneyItems);
  return input;
};

/** Member-money items only when the organisation actually supports them. */
export const memberMoneyItemsAllowed = (
  memberReceiptsEnabled: boolean | null,
  holdingAccount: LedgerAccount | null,
) => memberReceiptsEnabled === true && holdingAccount !== null;

/* ------------------------------------------------------------------ */
/* Form drafts                                                        */
/* ------------------------------------------------------------------ */

export const MEMBER_MONEY_PURPOSES = ["dues", "levy", "unspecified"] as const;
export type MemberMoneyPurpose = (typeof MEMBER_MONEY_PURPOSES)[number];

export interface MemberMoneyDraft {
  key: string;
  payerName: string;
  purpose: MemberMoneyPurpose;
  /** Naira as typed; converted to integer kobo only when building a payload. */
  amount: string;
  evidence: string;
  memberId: string;
  obligationId: string;
}

let draftSequence = 0;

export const emptyMemberMoneyDraft = (): MemberMoneyDraft => {
  draftSequence += 1;
  return {
    key: `item-${draftSequence}`,
    payerName: "",
    purpose: "unspecified",
    amount: "",
    evidence: "",
    memberId: "",
    obligationId: "",
  };
};

/** The first problem in one item draft, or null. */
export const memberMoneyDraftProblem = (draft: MemberMoneyDraft): string | null => {
  const payerName = draft.payerName.trim();
  if (!payerName) return "Enter the payer's name.";
  if (payerName.length > 120) return "The payer's name can be at most 120 characters.";
  const evidence = draft.evidence.trim();
  if (!evidence) return "Record the supporting evidence for this item.";
  if (evidence.length > 500) return "Evidence can be at most 500 characters.";
  const amount = parseNairaToKobo(draft.amount);
  if (amount === null) return "Enter the amount held for this item.";
  if (amount <= 0) return "An opening member-money item must be more than zero.";
  return null;
};

export const memberMoneyDraftToInput = (
  draft: MemberMoneyDraft,
): OpeningMemberMoneyItemInput | null => {
  const amountKobo = parseNairaToKobo(draft.amount);
  if (amountKobo === null || amountKobo <= 0) return null;
  return {
    payerName: draft.payerName.trim(),
    purpose: draft.purpose,
    amountKobo,
    evidence: draft.evidence.trim(),
    memberId: draft.memberId.trim() || null,
    obligationId: draft.obligationId.trim() || null,
  };
};

export const memberMoneyDraftsToInputs = (
  drafts: readonly MemberMoneyDraft[],
): { inputs: OpeningMemberMoneyItemInput[] | null; problem: string | null } => {
  const inputs: OpeningMemberMoneyItemInput[] = [];
  for (const draft of drafts) {
    const problem = memberMoneyDraftProblem(draft);
    if (problem) return { inputs: null, problem };
    const input = memberMoneyDraftToInput(draft);
    if (!input) return { inputs: null, problem: "Check this member-money item." };
    inputs.push(input);
  }
  return { inputs, problem: null };
};

/**
 * Every supplied account must have an explicitly entered amount, including
 * zero. An empty field is incomplete, never 0.
 */
export const amountsToLines = (
  accounts: readonly { id: string; name: string }[],
  amounts: Readonly<Record<string, string>>,
  field: "amountKobo" | "correctedAmountKobo" = "amountKobo",
): { lines: OpeningAccountLineInput[] | null; problem: string | null } => {
  const lines: OpeningAccountLineInput[] = [];
  for (const account of accounts) {
    const amountKobo = parseNairaToKobo(amounts[account.id] ?? "");
    if (amountKobo === null)
      return {
        lines: null,
        problem: `Enter the counted amount for ${account.name}, including 0 when the count was zero.`,
      };
    lines.push(
      field === "amountKobo"
        ? { accountId: account.id, amountKobo }
        : { accountId: account.id, correctedAmountKobo: amountKobo },
    );
  }
  return { lines, problem: null };
};

/** Shared with the tests so every displayed string list is complete. */
export const openingProposalStatusLabels: Record<
  OpeningProposalKnownStatus | "unknown",
  string
> = {
  submitted: "Awaiting decision",
  verified: "Verified",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  unknown: "Unknown status",
};

export const openingKindLabels: Record<OpeningProposalKind, string> = {
  initial: "Initial opening",
  supplementary: "Supplementary opening",
  correction: "Correction",
};

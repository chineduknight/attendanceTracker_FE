/**
 * Shapes for F2A-3 opening-balance proposals and verified openings.
 *
 * Derived only from the provisional backend contract in PR #40
 * (`toProposalShape`, the list/effective routes and the lifecycle service).
 * Every field here exists in that contract; nothing is invented. Fields the
 * backend has not yet delivered (F2A-4 lifecycle status, pending proposal,
 * `openingVerified`) are not assumed anywhere.
 */

export type OpeningProposalKind = "initial" | "supplementary" | "correction";

export type OpeningProposalKnownStatus =
  | "submitted"
  | "verified"
  | "rejected"
  | "withdrawn";

/** A status string this build cannot label is kept verbatim, never guessed. */
export type OpeningProposalStatus =
  | { kind: "known"; status: OpeningProposalKnownStatus }
  | { kind: "unknown"; raw: string };

/**
 * One proposal line. Initial/supplementary lines carry `amountKobo`;
 * correction lines carry `correctedAmountKobo`, the effective opening they
 * were computed against, and the resulting delta.
 */
export interface OpeningProposalLine {
  accountId: string;
  amountKobo: number | null;
  correctedAmountKobo: number | null;
  effectiveBeforeKobo: number | null;
  deltaKobo: number | null;
}

export interface OpeningMemberMoneyItemView {
  id: string;
  payerName: string;
  memberId: string | null;
  purpose: string;
  obligationId: string | null;
  amountKobo: number;
  evidence: string;
}

export interface OpeningItemChangeView {
  itemId: string;
  correctedAmountKobo: number;
  effectiveBeforeKobo: number;
  deltaKobo: number;
}

/** Backend-computed totals. `null` when the server did not send usable ones. */
export interface OpeningProposalSummary {
  moneyKobo: number;
  memberMoneyKobo: number;
  equityKobo: number;
}

export interface OpeningProposal {
  id: string;
  kind: OpeningProposalKind;
  status: OpeningProposalStatus;
  /** Business date `YYYY-MM-DD`. */
  asOfDate: string;
  lines: OpeningProposalLine[];
  memberMoneyItems: OpeningMemberMoneyItemView[];
  itemChanges: OpeningItemChangeView[];
  summary: OpeningProposalSummary | null;
  evidence: string;
  reason: string | null;
  /** SHA-256 the verifier must echo back; null when unusable. */
  fingerprint: string | null;
  proposedBy: string | null;
  proposedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  journalId: string | null;
  revision: number | null;
}

export interface OpeningProposalPage {
  items: OpeningProposal[];
  nextCursor: string | null;
}

export interface OpeningAdjustmentView {
  proposalId: string;
  /** Signed kobo delta of one verified correction. */
  deltaKobo: number;
  verifiedAt: string | null;
}

/** Verified opening for one account: original + corrections = effective. */
export interface AccountOpeningView {
  accountId: string;
  /** Business date `YYYY-MM-DD`. */
  openingDate: string;
  proposalId: string;
  originalKobo: number;
  corrections: OpeningAdjustmentView[];
  effectiveKobo: number;
}

/** Verified opening member-money item (`OM-…`), original + adjustments. */
export interface MemberMoneyPositionView {
  id: string;
  number: string;
  payerName: string;
  memberId: string | null;
  purpose: string;
  obligationId: string | null;
  evidence: string;
  proposalId: string;
  originalKobo: number;
  adjustments: OpeningAdjustmentView[];
  effectiveKobo: number;
}

export interface EffectiveOpeningsView {
  openingDate: string | null;
  accounts: AccountOpeningView[];
  memberMoneyItems: MemberMoneyPositionView[];
}

/* ------------------------------------------------------------------ */
/* Request payloads (exactly the backend's strict validators)          */
/* ------------------------------------------------------------------ */

export interface OpeningAccountLineInput {
  accountId: string;
  /** initial / supplementary */
  amountKobo?: number;
  /** correction */
  correctedAmountKobo?: number;
}

export interface OpeningMemberMoneyItemInput {
  payerName: string;
  memberId?: string | null;
  purpose?: string;
  obligationId?: string | null;
  amountKobo: number;
  evidence: string;
}

export interface OpeningItemChangeInput {
  itemId: string;
  correctedAmountKobo: number;
}

export interface SubmitOpeningInput {
  kind: OpeningProposalKind;
  asOfDate: string;
  expectedLedgerRevision: number;
  evidence: string;
  reason?: string | null;
  lines: OpeningAccountLineInput[];
  memberMoneyItems?: OpeningMemberMoneyItemInput[];
  itemChanges?: OpeningItemChangeInput[];
}

/** Exact body for `POST …/opening-balances/:proposalId/verify`. */
export interface VerifyOpeningInput {
  expectedFingerprint: string;
  expectedLedgerRevision: number;
  attestation: true;
}

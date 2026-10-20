/**
 * F2B-3 reversals (RFC v0.3 §5.3, §8.3): reading one journal's detail and
 * deciding whether this build may offer to reverse it.
 *
 * Pure helpers. The server is the authority on every rule: these checks only
 * decide what to offer, never what is allowed. In particular, whether a
 * member receipt's money has been refunded or allocated, and whether undoing
 * an entry would take an account below zero, are known only to the server.
 */

import {
  F2_REVERSIBLE_SOURCE_TYPES,
  PostingJournal,
  REVERSIBLE_SOURCE_TYPE_LABELS,
  ReversalTarget,
} from "components/finance/ledgerPostingTypes";
import { LedgerJournalLine } from "components/finance/ledgerTypes";
import { toLedgerJournals } from "helpers/ledger";
import { isObjectId, isReversibleSourceType } from "helpers/ledgerPostingIntent";
import { toPostingJournal } from "helpers/ledgerPostings";

/**
 * Whether the server reports this journal as already reversed. `unknown`
 * when it did not send a usable `reversedByJournalId` (missing or malformed):
 * never read as "not reversed".
 */
export type JournalReversedBy =
  | { kind: "not_reversed" }
  | { kind: "reversed"; journalId: string }
  | { kind: "unknown" };

export interface JournalDetail extends PostingJournal {
  lines: LedgerJournalLine[];
  reversedBy: JournalReversedBy;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const reversedByOf = (value: unknown): JournalReversedBy => {
  if (value === null) return { kind: "not_reversed" };
  if (typeof value === "string" && value.trim()) {
    return { kind: "reversed", journalId: value.trim() };
  }
  return { kind: "unknown" };
};

/**
 * One journal's detail (`GET /ledger/journals/:journalId`, the paged item
 * shape), or null when it is not structurally usable. Lines are validated
 * exactly as the journal list validates them: a malformed line is never
 * dropped from a journal that would then look complete.
 */
export const toJournalDetail = (value: unknown): JournalDetail | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const structural = toLedgerJournals([raw])?.[0];
  const journal = toPostingJournal(raw);
  if (!structural || !journal) return null;
  return {
    ...journal,
    lines: structural.lines,
    reversedBy: reversedByOf(raw.reversedByJournalId),
  };
};

export type ReversalEligibility =
  | { eligible: true; target: ReversalTarget }
  | { eligible: false; reason: string; reversedByJournalId: string | null };

const notEligible = (reason: string, reversedByJournalId: string | null = null) =>
  ({ eligible: false, reason, reversedByJournalId }) as const;

const OPENING_SOURCE_TYPES = ["opening_balance", "opening_balance_correction"];

// The F2 list: allocations are named in the message only when offered.
const REVERSIBLE_LIST = F2_REVERSIBLE_SOURCE_TYPES.map((type) => REVERSIBLE_SOURCE_TYPE_LABELS[type])
  .map((label) => label.toLowerCase())
  .join(", ")
  .replace(/, ([^,]*)$/, " and $1");

/**
 * Whether this build offers to reverse the journal (RFC §5.3). Openings,
 * corrections, reversals, already-reversed journals and every type outside
 * the five F2 postings are never offered. F3 allocations are offered only
 * with the F3 allocation gate on (`allocations`); with it off the answer is
 * exactly F2B-3's. An allocation reversal never depends on member receipts
 * or the allocations setting: it stays available after either is turned
 * off. Anything the server did not report clearly is not offered either.
 */
export const reversalEligibility = (
  journal: JournalDetail,
  { allocations = false }: { allocations?: boolean } = {},
): ReversalEligibility => {
  if (journal.sourceType === "reversal" || journal.reversesJournalId) {
    return notEligible(
      "This entry is itself a reversal. A reversal can't be reversed; record a new entry instead.",
    );
  }
  if (journal.sourceType && OPENING_SOURCE_TYPES.includes(journal.sourceType)) {
    return notEligible(
      "Opening balance entries are never reversed. Correct the opening balance instead.",
    );
  }
  if (
    !isReversibleSourceType(journal.sourceType) ||
    (journal.sourceType === "member_money_allocation" && !allocations)
  ) {
    return notEligible(`Only ${REVERSIBLE_LIST} entries can be reversed here.`);
  }
  if (journal.reversedBy.kind === "reversed") {
    return notEligible(
      "This entry has already been reversed. An entry can only be reversed once.",
      journal.reversedBy.journalId,
    );
  }
  if (journal.reversedBy.kind === "unknown") {
    return notEligible(
      "The server didn't say whether this entry has already been reversed, so no reversal is offered.",
    );
  }
  if (!isObjectId(journal.id) || !journal.businessDate || journal.totalKobo === null || journal.totalKobo < 1) {
    return notEligible(
      "The server didn't report this entry's identity, date or total clearly, so no reversal is offered.",
    );
  }
  return {
    eligible: true,
    target: {
      journalId: journal.id,
      sourceType: journal.sourceType,
      number: journal.number,
      businessDate: journal.businessDate,
      totalKobo: journal.totalKobo,
    },
  };
};

/**
 * What the officer should know before undoing this kind of entry. The server
 * enforces each of these; the client cannot check them.
 */
export const reversalCaution = (target: ReversalTarget): string | null => {
  switch (target.sourceType) {
    case "cash_receipt":
    case "cash_transfer":
      return "Undoing this takes the money back out of the account it went into. The server refuses if that account would close any day below zero; reverse or correct the later entries first.";
    case "member_receipt":
      return "A member receipt can be reversed only while none of its money has been refunded or allocated. Reverse those first. Undoing it also takes the money back out of the account it went into, which must not close any day below zero.";
    case "member_receipt_refund":
      return "Undoing a refund puts the money back into what its member money source holds.";
    case "member_money_allocation":
      return "Undoing an allocation moves the amount out of member dues or levy income and back into what its member money source holds. The allocation itself stays recorded, and no payment recorded in Finance changes. This works even if allocations have since been turned off.";
    case "cash_expense":
      return null;
  }
};

export const journalTypeLabel = (sourceType: string | null): string =>
  isReversibleSourceType(sourceType)
    ? REVERSIBLE_SOURCE_TYPE_LABELS[sourceType]
    : sourceType === "reversal"
      ? "Reversal"
      : sourceType === "opening_balance"
        ? "Opening balance"
        : sourceType === "opening_balance_correction"
          ? "Opening balance correction"
          : sourceType ?? "Unknown type";

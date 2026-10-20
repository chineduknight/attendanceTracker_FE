/**
 * F3-4 allocation and reconciliation reads (F3 RFC v0.3 §10, §11, §12):
 * fail-closed parsing, approved wording and display helpers.
 *
 * Pure helpers. The server computes every figure; nothing here adds,
 * subtracts or nets money. The parsers only check that what arrived is usable
 * and that the server's own figures agree with each other. A malformed page
 * becomes `null` ("couldn't be read"), never zeros, never a shorter list that
 * looks complete, and an unknown F0 figure is never read as ₦0.
 */

import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import { isObjectId } from "helpers/ledgerPostingIntent";
import { toMemberMoneySummary } from "helpers/ledgerReports";
import { toJournalDetail } from "helpers/ledgerReversals";
import { formatLagosTimestamp, isBusinessDate } from "helpers/openingBalances";
import {
  MEMBER_MONEY_PURPOSES,
  MemberMoneyPurpose,
} from "components/finance/ledgerPostingTypes";
import {
  AllocationHistoryItem,
  AllocationHistoryPage,
  AllocationSuggestion,
  ExplainingSource,
  MemberMoneySourceKind,
  ObligationKind,
  POSITION_FLAGS,
  PositionFlag,
  PositionSnapshot,
  PositionTotals,
  PositionsReport,
  RecordedState,
  ReconciliationFlows,
  ReconciliationIdentityCheck,
  ReconciliationPosition,
  ReconciliationSnapshotLabel,
  ReconciliationSourceRow,
  ReconciliationSummary,
  SourcesReport,
  SuggestionHint,
} from "components/finance/ledgerReconciliationTypes";

/* ------------------------------------------------------------------ */
/* Primitive readers                                                  */
/* ------------------------------------------------------------------ */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Any exact kobo figure, sign kept (a later-dated correction can be negative). */
const isKobo = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const isAmount = (value: unknown): value is number => isKobo(value) && value >= 0;

const isCount = (value: unknown): value is number => isAmount(value);

const isTimestamp = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && !Number.isNaN(new Date(value).getTime());

const isDate = (value: unknown): value is string =>
  typeof value === "string" && isBusinessDate(value);

/** null stays null; a value must be an amount; anything else is malformed. */
const nullableAmount = (value: unknown): number | null | undefined =>
  value === null ? null : isAmount(value) ? value : undefined;

const nullableKobo = (value: unknown): number | null | undefined =>
  value === null ? null : isKobo(value) ? value : undefined;

const isKind = (value: unknown): value is MemberMoneySourceKind =>
  value === "receipt" || value === "opening_item";

const isObligationKind = (value: unknown): value is ObligationKind =>
  value === "dues" || value === "levy";

const SOURCE_NUMBER: Record<MemberMoneySourceKind, RegExp> = {
  receipt: /^M-\d{6,}$/,
  opening_item: /^OM-\d{6,}$/,
};

const ALLOCATION_NUMBER = /^A-\d{6,}$/;

/** The id compared as the server stores it (it lowercases ids). */
export const sameId = (left: string | null | undefined, right: string | null | undefined) =>
  typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();

const parseCursor = (value: unknown): string | null | undefined =>
  value === null || value === undefined ? null : typeof value === "string" && value ? value : undefined;

const snapshotLabelOf = (value: unknown): ReconciliationSnapshotLabel | null | undefined => {
  if (value === null) return null;
  const raw = asRecord(value);
  if (!raw || !isTimestamp(raw.takenAt)) return undefined;
  return { takenAt: raw.takenAt, trigger: asText(raw.trigger) ?? "unknown" };
};

/* ------------------------------------------------------------------ */
/* Allocation history                                                 */
/* ------------------------------------------------------------------ */

export const toAllocationHistoryItem = (value: unknown): AllocationHistoryItem | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const journal = toJournalDetail(raw.journal);
  if (!journal || journal.sourceType !== "member_money_allocation") return null;
  if (!journal.number || !ALLOCATION_NUMBER.test(journal.number)) return null;
  if (!isObjectId(journal.id) || !journal.businessDate || journal.totalKobo === null) return null;
  const kind = journal.memberMoneySourceKind;
  const sourceId = journal.memberMoneySourceId;
  const sourceNumber = journal.memberMoneySourceNumber;
  if (!isKind(kind) || !isObjectId(sourceId) || !sourceNumber || !SOURCE_NUMBER[kind].test(sourceNumber))
    return null;
  if (!isObjectId(journal.memberId) || !isObjectId(journal.obligationId)) return null;
  if (!isObligationKind(journal.obligationType)) return null;
  if (raw.state !== "live" && raw.state !== "reversed") return null;
  let reversal: AllocationHistoryItem["reversal"] = null;
  if (raw.state === "reversed") {
    const rawReversal = asRecord(raw.reversal);
    if (!rawReversal || !isObjectId(rawReversal.journalId)) return null;
    reversal = {
      journalId: rawReversal.journalId,
      businessDate: isDate(rawReversal.businessDate) ? rawReversal.businessDate : null,
      postedAt: isTimestamp(rawReversal.postedAt) ? rawReversal.postedAt : null,
    };
  } else if (raw.reversal !== null && raw.reversal !== undefined) {
    return null;
  }
  // The listing's state and the journal's own link are read moments apart
  // (it is not a snapshot read). Either one saying "reversed" wins: an
  // allocation is never shown as live once a reversal is known.
  const linked = journal.reversedBy.kind === "reversed" ? journal.reversedBy.journalId : null;
  const state = raw.state === "reversed" || linked ? "reversed" : "live";
  if (state === "reversed" && !reversal && linked) {
    reversal = { journalId: linked, businessDate: null, postedAt: null };
  }
  return {
    journal,
    number: journal.number,
    source: { kind, id: sourceId, number: sourceNumber },
    memberId: journal.memberId,
    obligationId: journal.obligationId,
    obligationType: journal.obligationType,
    confirmedMismatches: journal.confirmedMismatches ?? [],
    state,
    reversal,
  };
};

export const toAllocationHistoryPage = (value: unknown): AllocationHistoryPage | null => {
  const raw = asRecord(value);
  if (!raw || !isTimestamp(raw.readAt) || !Array.isArray(raw.items)) return null;
  const nextCursor = parseCursor(raw.nextCursor);
  if (nextCursor === undefined) return null;
  const items: AllocationHistoryItem[] = [];
  for (const entry of raw.items) {
    const item = toAllocationHistoryItem(entry);
    if (!item) return null;
    items.push(item);
  }
  return { readAt: raw.readAt, items, nextCursor };
};

/* ------------------------------------------------------------------ */
/* Sources                                                            */
/* ------------------------------------------------------------------ */

const isPurpose = (value: unknown): value is MemberMoneyPurpose =>
  typeof value === "string" && (MEMBER_MONEY_PURPOSES as readonly string[]).includes(value);

const optionalId = (value: unknown): string | null | undefined =>
  value === null || value === undefined ? null : isObjectId(value) ? value : undefined;

export const toReconciliationSourceRow = (value: unknown): ReconciliationSourceRow | null => {
  const raw = asRecord(value);
  if (!raw || !isKind(raw.kind) || !isObjectId(raw.id)) return null;
  const number = asText(raw.number);
  if (!number || !SOURCE_NUMBER[raw.kind].test(number)) return null;
  if (!isDate(raw.businessDate) || !isCount(raw.ageDays)) return null;
  const { effectiveKobo, refundedKobo, allocatedKobo, remainingKobo } = raw;
  if (!isAmount(effectiveKobo) || !isAmount(refundedKobo) || !isAmount(allocatedKobo) || !isAmount(remainingKobo))
    return null;
  // The server's own identity for a source; a row that breaks it is unusable.
  if (effectiveKobo !== refundedKobo + allocatedKobo + remainingKobo) return null;
  const hints = asRecord(raw.hints);
  if (!hints) return null;
  const memberId = optionalId(hints.memberId);
  const obligationId = optionalId(hints.obligationId);
  if (memberId === undefined || obligationId === undefined) return null;
  return {
    kind: raw.kind,
    id: raw.id,
    number,
    payerName: asText(raw.payerName),
    businessDate: raw.businessDate,
    ageDays: raw.ageDays,
    effectiveKobo,
    refundedKobo,
    allocatedKobo,
    remainingKobo,
    hints: { memberId, obligationId, purpose: isPurpose(hints.purpose) ? hints.purpose : null },
  };
};

const SUGGESTION_HINTS: readonly SuggestionHint[] = ["member", "obligation", "purpose"];

const toSuggestion = (value: unknown): AllocationSuggestion | null => {
  const raw = asRecord(value);
  if (!raw || !isObjectId(raw.memberId) || !isObjectId(raw.obligationId)) return null;
  if (raw.obligationType !== null && !isObligationKind(raw.obligationType)) return null;
  if (!isAmount(raw.unlinkedKobo) || raw.unlinkedKobo < 1) return null;
  if (!Array.isArray(raw.matchedHints)) return null;
  const matchedHints = raw.matchedHints.filter((hint): hint is SuggestionHint =>
    (SUGGESTION_HINTS as readonly unknown[]).includes(hint),
  );
  if (matchedHints.length !== raw.matchedHints.length) return null;
  return {
    memberId: raw.memberId,
    obligationId: raw.obligationId,
    obligationType: raw.obligationType,
    unlinkedKobo: raw.unlinkedKobo,
    matchedHints,
  };
};

export const toSourcesReport = (value: unknown): SourcesReport | null => {
  const raw = asRecord(value);
  if (!raw || !isTimestamp(raw.readAt) || !isDate(raw.asOf) || !Array.isArray(raw.items)) return null;
  const nextCursor = parseCursor(raw.nextCursor);
  if (nextCursor === undefined) return null;
  const items: ReconciliationSourceRow[] = [];
  for (const entry of raw.items) {
    const row = toReconciliationSourceRow(entry);
    if (!row) return null;
    items.push(row);
  }
  // Suggestions use current F0 values: they come only for a current request,
  // and a historical one says so. Anything in between is not trusted.
  let suggestions: SourcesReport["suggestions"] = null;
  let suggestionsOmitted: SourcesReport["suggestionsOmitted"] = null;
  if (raw.suggestions === null) {
    if (raw.suggestionsOmitted !== "historical_as_of") return null;
    suggestionsOmitted = "historical_as_of";
  } else {
    if (raw.suggestionsOmitted !== null && raw.suggestionsOmitted !== undefined) return null;
    const block = asRecord(raw.suggestions);
    if (!block || block.basis !== "current" || !isTimestamp(block.readAt)) return null;
    const bySourceRaw = asRecord(block.bySource);
    if (!bySourceRaw) return null;
    const bySource: Record<string, AllocationSuggestion[]> = {};
    for (const [number, list] of Object.entries(bySourceRaw)) {
      if (!Array.isArray(list)) return null;
      const parsed = list.map(toSuggestion);
      if (parsed.some((entry) => entry === null)) return null;
      bySource[number] = parsed as AllocationSuggestion[];
    }
    suggestions = { readAt: block.readAt, bySource };
  }
  return { readAt: raw.readAt, asOf: raw.asOf, items, suggestions, suggestionsOmitted, nextCursor };
};

/* ------------------------------------------------------------------ */
/* Positions                                                          */
/* ------------------------------------------------------------------ */

const isRecordedState = (value: unknown): value is RecordedState =>
  value === "known" || value === "unknown" || value === "ambiguous";

const toExplainingSource = (value: unknown): ExplainingSource | null => {
  const raw = asRecord(value);
  if (!raw || !isKind(raw.kind) || !isObjectId(raw.id)) return null;
  const number = asText(raw.number);
  if (!number || !isDate(raw.businessDate) || !isAmount(raw.allocatedKobo)) return null;
  return { kind: raw.kind, id: raw.id, number, businessDate: raw.businessDate, allocatedKobo: raw.allocatedKobo };
};

const toPositionSnapshot = (value: unknown): PositionSnapshot | null | undefined => {
  if (value === null) return null;
  const raw = asRecord(value);
  if (!raw || !isTimestamp(raw.takenAt)) return undefined;
  if (raw.snapshotState !== "present" && raw.snapshotState !== "absent") return undefined;
  if (!isRecordedState(raw.recordedState)) return undefined;
  const recordedKobo = nullableAmount(raw.recordedKobo);
  const afterSnapshot = nullableKobo(raw.recordedAfterSnapshotKobo);
  if (recordedKobo === undefined || afterSnapshot === undefined) return undefined;
  if (raw.recordedState !== "known" && recordedKobo !== null) return undefined;
  if (!Array.isArray(raw.explainingSources)) return undefined;
  const explainingSources: ExplainingSource[] = [];
  for (const entry of raw.explainingSources) {
    const source = toExplainingSource(entry);
    if (!source) return undefined;
    explainingSources.push(source);
  }
  return {
    takenAt: raw.takenAt,
    snapshotState: raw.snapshotState,
    recordedState: raw.recordedState,
    recordedKobo,
    recordedAfterSnapshotKobo: afterSnapshot,
    explainingSources,
  };
};

export const toReconciliationPosition = (value: unknown): ReconciliationPosition | null => {
  const raw = asRecord(value);
  if (!raw || !isObjectId(raw.memberId) || !isObjectId(raw.obligationId)) return null;
  if (raw.obligationType !== null && !isObligationKind(raw.obligationType)) return null;
  if (!isRecordedState(raw.recordedState) || !isAmount(raw.allocatedKobo)) return null;
  const recordedKobo = nullableAmount(raw.recordedKobo);
  const linkedKobo = nullableAmount(raw.linkedKobo);
  const unlinkedKobo = nullableAmount(raw.unlinkedKobo);
  const overLinkedKobo = nullableAmount(raw.overLinkedKobo);
  const appliedKobo = nullableAmount(raw.appliedKobo);
  const creditKobo = nullableAmount(raw.creditKobo);
  if (
    recordedKobo === undefined ||
    linkedKobo === undefined ||
    unlinkedKobo === undefined ||
    overLinkedKobo === undefined ||
    appliedKobo === undefined ||
    creditKobo === undefined
  )
    return null;
  if (raw.recordedState === "known") {
    // Known: every link figure is present and agrees with the server's own
    // identities (recorded = linked + unlinked, allocated = linked + over).
    if (recordedKobo === null || linkedKobo === null || unlinkedKobo === null || overLinkedKobo === null)
      return null;
    if (recordedKobo !== linkedKobo + unlinkedKobo) return null;
    if (raw.allocatedKobo !== linkedKobo + overLinkedKobo) return null;
  } else if (
    // Unknown or ambiguous: a number here would read as a real value.
    [recordedKobo, linkedKobo, unlinkedKobo, overLinkedKobo, appliedKobo, creditKobo].some(
      (figure) => figure !== null,
    )
  ) {
    return null;
  }
  const snapshot = toPositionSnapshot(raw.snapshot);
  if (snapshot === undefined) return null;
  if (!Array.isArray(raw.flags) || !raw.flags.every((flag) => typeof flag === "string" && flag)) return null;
  return {
    memberId: raw.memberId,
    obligationId: raw.obligationId,
    obligationType: raw.obligationType,
    recordedState: raw.recordedState,
    recordedKobo,
    allocatedKobo: raw.allocatedKobo,
    linkedKobo,
    unlinkedKobo,
    overLinkedKobo,
    appliedKobo,
    creditKobo,
    snapshot,
    flags: [...(raw.flags as string[])],
  };
};

export const toPositionsReport = (value: unknown): PositionsReport | null => {
  const raw = asRecord(value);
  if (!raw || !isTimestamp(raw.readAt) || raw.basis !== "current" || !Array.isArray(raw.items)) return null;
  const snapshot = snapshotLabelOf(raw.snapshot);
  const nextCursor = parseCursor(raw.nextCursor);
  if (snapshot === undefined || nextCursor === undefined) return null;
  const items: ReconciliationPosition[] = [];
  for (const entry of raw.items) {
    const position = toReconciliationPosition(entry);
    if (!position) return null;
    items.push(position);
  }
  return { readAt: raw.readAt, snapshot, items, nextCursor };
};

/* ------------------------------------------------------------------ */
/* Summary                                                            */
/* ------------------------------------------------------------------ */

const toPositionTotals = (value: unknown): PositionTotals | null => {
  const raw = asRecord(value);
  if (!raw || raw.basis !== "current") return null;
  const known = asRecord(raw.knownPositions);
  if (!known) return null;
  if (raw.recordedTotalState !== "complete" && raw.recordedTotalState !== "incomplete") return null;
  const counts = [raw.positionCount, raw.unknownPositions, raw.ambiguousPositions, known.count];
  const amounts = [
    raw.knownRecordedTotalKobo,
    raw.allocatedTotalKobo,
    raw.allocatedOnUnknownKobo,
    known.recordedKobo,
    known.allocatedKobo,
    known.linkedKobo,
    known.unlinkedKobo,
    known.overLinkedKobo,
  ];
  if (!counts.every(isCount) || !amounts.every(isAmount)) return null;
  const totals = [raw.recordedTotalKobo, raw.linkedTotalKobo, raw.unlinkedTotalKobo, raw.overLinkedTotalKobo];
  const incomplete = raw.recordedTotalState === "incomplete";
  // Incomplete: never a total that looks complete. Complete: every total present.
  if (incomplete ? !totals.every((total) => total === null) : !totals.every(isAmount)) return null;
  if (incomplete !== ((raw.unknownPositions as number) + (raw.ambiguousPositions as number) > 0)) return null;
  return {
    positionCount: raw.positionCount as number,
    recordedTotalState: raw.recordedTotalState,
    recordedTotalKobo: raw.recordedTotalKobo as number | null,
    linkedTotalKobo: raw.linkedTotalKobo as number | null,
    unlinkedTotalKobo: raw.unlinkedTotalKobo as number | null,
    overLinkedTotalKobo: raw.overLinkedTotalKobo as number | null,
    unknownPositions: raw.unknownPositions as number,
    ambiguousPositions: raw.ambiguousPositions as number,
    knownRecordedTotalKobo: raw.knownRecordedTotalKobo as number,
    allocatedTotalKobo: raw.allocatedTotalKobo as number,
    allocatedOnUnknownKobo: raw.allocatedOnUnknownKobo as number,
    knownPositions: {
      count: known.count as number,
      recordedKobo: known.recordedKobo as number,
      allocatedKobo: known.allocatedKobo as number,
      linkedKobo: known.linkedKobo as number,
      unlinkedKobo: known.unlinkedKobo as number,
      overLinkedKobo: known.overLinkedKobo as number,
    },
  };
};

const FLOW_FIGURES = ["allocationsKobo", "allocationReversalsKobo", "netAllocatedKobo", "memberIncomeKobo"] as const;

const toFlows = (value: unknown): ReconciliationFlows | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  if (raw.flowState === "unknown") {
    // Unknown is null everywhere, even if a number was sent.
    if (!FLOW_FIGURES.every((field) => raw[field] === null) || raw.memberMoney !== null) return null;
    return {
      flowState: "unknown",
      allocationsKobo: null,
      allocationReversalsKobo: null,
      netAllocatedKobo: null,
      memberIncomeKobo: null,
      memberMoney: null,
    };
  }
  if (raw.flowState !== "known") return null;
  // Net and income figures can be negative inside a window (a reversal of
  // an allocation dated in an earlier window).
  if (!isAmount(raw.allocationsKobo) || !isAmount(raw.allocationReversalsKobo)) return null;
  if (!isKobo(raw.netAllocatedKobo) || !isKobo(raw.memberIncomeKobo)) return null;
  const memberMoney = toMemberMoneySummary(raw.memberMoney);
  if (memberMoney === undefined) return null;
  return {
    flowState: "known",
    allocationsKobo: raw.allocationsKobo,
    allocationReversalsKobo: raw.allocationReversalsKobo,
    netAllocatedKobo: raw.netAllocatedKobo,
    memberIncomeKobo: raw.memberIncomeKobo,
    memberMoney,
  };
};

const toIdentityCheck = (value: unknown): ReconciliationIdentityCheck | null => {
  const raw = asRecord(value);
  const name = asText(raw?.name);
  if (!raw || !name || typeof raw.consistent !== "boolean") return null;
  if (!isKobo(raw.leftKobo) || !isKobo(raw.rightKobo)) return null;
  return { name, kind: asText(raw.kind) ?? "unknown", consistent: raw.consistent, leftKobo: raw.leftKobo, rightKobo: raw.rightKobo };
};

const listOf = <T>(value: unknown, parse: (entry: unknown) => T | null): { count: number; items: T[] } | null => {
  const raw = asRecord(value);
  if (!raw || !isCount(raw.count) || !Array.isArray(raw.items)) return null;
  const items: T[] = [];
  for (const entry of raw.items) {
    const item = parse(entry);
    if (item === null) return null;
    items.push(item);
  }
  // A list shows at most a capped number of rows; `count` is the full count.
  if (items.length > raw.count) return null;
  return { count: raw.count, items };
};

export const toReconciliationSummary = (value: unknown): ReconciliationSummary | null => {
  const raw = asRecord(value);
  if (!raw || !isTimestamp(raw.readAt) || !isDate(raw.from) || !isDate(raw.to)) return null;
  const snapshot = snapshotLabelOf(raw.snapshot);
  if (snapshot === undefined) return null;

  const balances = asRecord(raw.balances);
  const sources = asRecord(balances?.sources);
  const income = asRecord(balances?.memberIncome);
  if (!balances || balances.basis !== "current" || !sources || !income) return null;
  const balanceFigures = [
    balances.holdingBalanceKobo,
    sources.effectiveKobo,
    sources.refundedKobo,
    sources.allocatedKobo,
    sources.remainingKobo,
    income.duesKobo,
    income.levyKobo,
    income.totalKobo,
  ];
  if (!balanceFigures.every(isAmount) || !isCount(sources.count)) return null;

  const positions = toPositionTotals(raw.positions);
  const flows = toFlows(raw.flows);
  const identitiesRaw = asRecord(raw.identities);
  if (!positions || !flows || !identitiesRaw || typeof identitiesRaw.consistent !== "boolean") return null;
  if (!Array.isArray(identitiesRaw.checks)) return null;
  const checks: ReconciliationIdentityCheck[] = [];
  for (const entry of identitiesRaw.checks) {
    const check = toIdentityCheck(entry);
    if (!check) return null;
    checks.push(check);
  }
  // The verdict must agree with its own checks: never shown as consistent
  // while a check says otherwise.
  if (identitiesRaw.consistent !== checks.every((check) => check.consistent)) return null;

  const lists = asRecord(raw.lists);
  const openRaw = asRecord(lists?.openSources);
  if (!lists || !openRaw || !isCount(openRaw.minAgeDays)) return null;
  const openSources = listOf(openRaw, toReconciliationSourceRow);
  const overLinked = listOf(lists.overLinkedPositions, toReconciliationPosition);
  const needingReview = listOf(lists.positionsNeedingReview, toReconciliationPosition);
  if (!openSources || !overLinked || !needingReview) return null;

  return {
    readAt: raw.readAt,
    from: raw.from,
    to: raw.to,
    snapshot,
    balances: {
      holdingBalanceKobo: balances.holdingBalanceKobo as number,
      sources: {
        count: sources.count as number,
        effectiveKobo: sources.effectiveKobo as number,
        refundedKobo: sources.refundedKobo as number,
        allocatedKobo: sources.allocatedKobo as number,
        remainingKobo: sources.remainingKobo as number,
      },
      memberIncome: {
        duesKobo: income.duesKobo as number,
        levyKobo: income.levyKobo as number,
        totalKobo: income.totalKobo as number,
      },
    },
    positions,
    flows,
    identities: {
      consistent: identitiesRaw.consistent,
      message: asText(identitiesRaw.message),
      checks,
    },
    lists: {
      openSources: { minAgeDays: openRaw.minAgeDays, ...openSources },
      overLinkedPositions: overLinked,
      positionsNeedingReview: needingReview,
    },
  };
};

/* ------------------------------------------------------------------ */
/* Wording (RFC §11, §17; FRONTEND_API F3-4)                          */
/* ------------------------------------------------------------------ */

/** A ledger or F0 figure; null is unknown, never ₦0. */
export const koboOrUnknown = (value: number | null | undefined): string =>
  value === null || value === undefined ? "Unknown" : formatKobo(value);

export const readAtText = (readAt: string): string =>
  `As read at ${formatLagosTimestamp(readAt) ?? readAt} (Lagos time)`;

export const UNLINKED_LABEL = "Recorded, not linked to an allocation";

export const UNLINKED_EXPLAINER =
  "Recorded value that no allocation is linked to. It may include value recorded before the ledger, money received but not yet allocated, or value recorded with no money in the books.";

export const CURRENT_F0_NOTE =
  "Finance (F0) figures are current values only. Finance keeps no history or receipt dates, so these are never figures for a past date.";

export const LEDGER_FIGURES_NOTE =
  "Ledger figures come from posted journals: member money held, allocated and refunded, and member dues and levy income.";

export const snapshotText = (snapshot: ReconciliationSnapshotLabel | null): string =>
  snapshot
    ? `The Finance snapshot was taken at ${
        formatLagosTimestamp(snapshot.takenAt) ?? snapshot.takenAt
      } (Lagos time), when member receipts went live. "Recorded after snapshot" is the current recorded value minus the value at that moment. It isn't "since the opening date", and it can be negative after a correction.`
    : "No Finance snapshot exists for this organisation (member receipts were never turned on), so nothing is compared with one.";

export const GAP_WINDOW_NOTE =
  "These allocated sources may already sit inside the snapshot value: opening items, and member receipts dated on or before the snapshot's day (the gap window between the opening date and activation).";

export const SUGGESTIONS_NOTE =
  "Suggestions are read-only hints from current Finance values. They are never posted automatically, and choosing one still goes through every allocation check.";

export const SUGGESTIONS_OMITTED_NOTE =
  "Suggestions use current Finance values, so they aren't shown for a past date.";

export const INCOMPLETE_TOTALS_NOTE =
  "Some positions have an unknown or ambiguous Finance value, so the totals across all positions are unknown. The figures below are over known positions only.";

export const IDENTITIES_FALLBACK_MESSAGE =
  "These figures don't agree with each other. Nothing was changed. Run the ledger integrity check before acting on them.";

/** What each review flag means and what an officer can do. Review, never an error. */
export const POSITION_FLAG_TEXT: Record<PositionFlag, { label: string; explanation: string }> = {
  OVER_LINKED: {
    label: "Over-linked",
    explanation:
      "More is allocated than Finance now records, usually after a Finance correction lowered the recorded value. The allocations stand and new allocations to this position are refused. Reverse an allocation or correct the Finance record.",
  },
  ALLOCATED_INTO_CREDIT: {
    label: "Allocated into credit",
    explanation:
      "More is allocated than Finance applies under the member's current start date. The extra sits in the member's unapplied credit. Check the start date or the allocations.",
  },
  ALLOCATED_BEYOND_AFTER_SNAPSHOT: {
    label: "Allocated beyond after-snapshot value",
    explanation:
      "More is allocated than was recorded after the snapshot. This is expected when opening items or gap-window receipts were allocated; the sources that may explain it are listed.",
  },
  MEMBER_ARCHIVED: {
    label: "Member archived or missing",
    explanation: "The member is archived or can't be found. No new allocation can be made to this position; reversals still work.",
  },
  OBLIGATION_ARCHIVED: {
    label: "Obligation archived or missing",
    explanation:
      "The obligation is archived or can't be found. No new allocation can be made to this position; reversals still work.",
  },
  NEEDS_REVIEW: {
    label: "Needs review",
    explanation:
      "Finance can't give a usable value for this position (a malformed amount, or applied value it can't compute). Fix the record in Finance; it can't be allocated to until then.",
  },
  AMBIGUOUS: {
    label: "Ambiguous",
    explanation:
      "Finance has two or more active payment records for this member and obligation. Fix them in Finance; it can't be allocated to until then.",
  },
};

export const isKnownFlag = (flag: string): flag is PositionFlag =>
  (POSITION_FLAGS as readonly string[]).includes(flag);

export const flagLabel = (flag: string): string =>
  isKnownFlag(flag) ? POSITION_FLAG_TEXT[flag].label : `Review flag: ${flag}`;

export const flagExplanation = (flag: string): string =>
  isKnownFlag(flag)
    ? POSITION_FLAG_TEXT[flag].explanation
    : "The server flagged this position for review with a flag this app version doesn't recognise.";

export const RECORDED_STATE_TEXT: Record<RecordedState, string> = {
  known: "Known",
  unknown: "Unknown: Finance's value can't be read",
  ambiguous: "Ambiguous: more than one Finance record",
};

export const OBLIGATION_KIND_LABELS: Record<ObligationKind, string> = {
  dues: "Dues",
  levy: "Levy",
};

export const SOURCE_KIND_LABELS: Record<MemberMoneySourceKind, string> = {
  receipt: "Member receipt",
  opening_item: "Opening member money",
};

export const IDENTITY_LABELS: Record<string, string> = {
  holding_balance_equals_sources_remaining: "Holding balance equals what sources still hold",
  sources_effective_equals_refunded_allocated_remaining:
    "Money received equals refunded + allocated + still held",
  member_income_equals_sources_allocated: "Member income equals allocations from sources",
  sources_allocated_equals_positions_allocated: "Allocated by source equals allocated by position",
  period_member_income_equals_allocations_minus_reversals:
    "Income in the window equals allocations minus their reversals",
  known_positions_recorded_minus_allocated_equals_unlinked_minus_over_linked:
    "Over known positions: recorded − allocated equals unlinked − over-linked",
};

export const identityLabel = (name: string) => IDENTITY_LABELS[name] ?? name;

export const ageText = (days: number) => (days === 1 ? "1 day" : `${days} days`);

export const sourceDateText = (row: { kind: MemberMoneySourceKind; businessDate: string }) =>
  row.kind === "opening_item"
    ? `held at opening (${formatBusinessDate(row.businessDate)})`
    : `received ${formatBusinessDate(row.businessDate)}`;

/** A member or obligation the reader can't name: a short id, never a guess. */
export const shortId = (id: string) => `…${id.slice(-6)}`;

/** Allocation history state labels. */
export const ALLOCATION_STATE_LABELS = { live: "Live", reversed: "Reversed" } as const;

/** Page size the F3 reads ask for (server default 50, max 100). */
export const RECONCILIATION_PAGE_SIZE = 25;

/**
 * The reconciliation reads' "service unavailable" case: without database
 * transactions the server reads nothing (`LEDGER_TRANSACTIONS_UNAVAILABLE`).
 */
export const TRANSACTIONS_UNAVAILABLE_NOTE =
  "Reconciliation reports need a database that supports transactions. This server can't provide them, so nothing was read.";

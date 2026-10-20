/**
 * F3 server-shaped fixtures (backend `reconciliationReports.ts`,
 * `ReconciliationService.ts`, `ledgerReadShapes.ts`). Raw JSON, exactly as the
 * server sends it, so parser and component tests exercise the real contract.
 */

export const ORG1 = "org1";
export const ORG2 = "org2";

export const id = (seed: string) => seed.padStart(24, "0").slice(-24);

export const MEMBER_ADA = id("a1");
export const MEMBER_CHIDI = id("c1");
export const OBLIGATION_DUES = id("d1");
export const OBLIGATION_LEVY = id("e1");
export const SOURCE_M12 = id("f12");
export const SOURCE_OM1 = id("f01");
export const ALLOCATION_A1 = id("aa1");
export const ALLOCATION_A2 = id("aa2");
export const REVERSAL_R1 = id("bb1");

export const READ_AT = "2026-11-14T10:00:00.000Z";
export const SNAPSHOT_AT = "2026-11-12T13:05:00.000Z";

export const allocationJournal = (overrides: Record<string, unknown> = {}, entry: Record<string, unknown> = {}) => ({
  id: ALLOCATION_A1,
  businessDate: "2026-11-14",
  reference: null,
  note: null,
  sourceType: "member_money_allocation",
  lines: [
    { accountId: id("ac1"), side: "debit", amountKobo: 200000 },
    { accountId: id("ac2"), side: "credit", amountKobo: 200000 },
  ],
  totalKobo: 200000,
  postedAt: "2026-11-14T09:00:00.000Z",
  postedBy: { id: "u1", name: "Treasurer Tola" },
  sourceId: null,
  reversesJournalId: null,
  reversedByJournalId: null,
  entry: {
    number: "A-000001",
    method: null,
    counterpartyName: null,
    externalReference: null,
    evidenceReference: null,
    memberMoneySource: { kind: "receipt", id: SOURCE_M12, number: "M-000012" },
    memberId: MEMBER_ADA,
    reason: null,
    obligationId: OBLIGATION_DUES,
    obligationType: "dues",
    confirmedMismatches: [],
    ...entry,
  },
  ...overrides,
});

export const allocationItem = (overrides: Record<string, unknown> = {}) => ({
  journal: allocationJournal(),
  state: "live",
  reversal: null,
  ...overrides,
});

export const reversedAllocationItem = () => ({
  journal: allocationJournal(
    { id: ALLOCATION_A2, reversedByJournalId: REVERSAL_R1, totalKobo: 50000 },
    { number: "A-000002", obligationId: OBLIGATION_LEVY, obligationType: "levy", confirmedMismatches: ["purpose"] },
  ),
  state: "reversed",
  reversal: { journalId: REVERSAL_R1, businessDate: "2026-11-15", postedAt: "2026-11-15T08:00:00.000Z" },
});

export const allocationsPage = (items: unknown[] = [allocationItem()], nextCursor: string | null = null) => ({
  readAt: READ_AT,
  items,
  nextCursor,
});

export const sourceRow = (overrides: Record<string, unknown> = {}) => ({
  kind: "receipt",
  id: SOURCE_M12,
  number: "M-000012",
  payerName: "Ada Obi",
  businessDate: "2026-11-04",
  ageDays: 10,
  effectiveKobo: 600000,
  refundedKobo: 100000,
  allocatedKobo: 400000,
  remainingKobo: 100000,
  hints: { memberId: MEMBER_ADA, obligationId: null, purpose: "dues" },
  ...overrides,
});

export const sourcesReport = (overrides: Record<string, unknown> = {}) => ({
  readAt: READ_AT,
  asOf: "2026-11-14",
  items: [sourceRow()],
  suggestions: {
    basis: "current",
    readAt: READ_AT,
    bySource: {
      "M-000012": [
        {
          memberId: MEMBER_ADA,
          obligationId: OBLIGATION_DUES,
          obligationType: "dues",
          unlinkedKobo: 300000,
          matchedHints: ["member", "purpose"],
        },
      ],
    },
  },
  suggestionsOmitted: null,
  nextCursor: null,
  ...overrides,
});

export const historicalSourcesReport = () =>
  sourcesReport({ asOf: "2026-11-05", suggestions: null, suggestionsOmitted: "historical_as_of" });

export const knownPosition = (overrides: Record<string, unknown> = {}) => ({
  memberId: MEMBER_ADA,
  obligationId: OBLIGATION_DUES,
  obligationType: "dues",
  recordedState: "known",
  recordedKobo: 1200000,
  allocatedKobo: 300000,
  linkedKobo: 300000,
  unlinkedKobo: 900000,
  overLinkedKobo: 0,
  appliedKobo: 1200000,
  creditKobo: 0,
  snapshot: {
    takenAt: SNAPSHOT_AT,
    snapshotState: "present",
    recordedState: "known",
    recordedKobo: 1000000,
    recordedAfterSnapshotKobo: 200000,
    explainingSources: [
      { kind: "receipt", id: SOURCE_M12, number: "M-000001", businessDate: "2026-11-05", allocatedKobo: 100000 },
    ],
  },
  flags: ["ALLOCATED_BEYOND_AFTER_SNAPSHOT"],
  ...overrides,
});

export const overLinkedPosition = () =>
  knownPosition({
    memberId: MEMBER_CHIDI,
    recordedKobo: 200000,
    allocatedKobo: 500000,
    linkedKobo: 200000,
    unlinkedKobo: 0,
    overLinkedKobo: 300000,
    appliedKobo: 200000,
    creditKobo: 0,
    snapshot: null,
    flags: ["OVER_LINKED"],
  });

export const unknownPosition = (recordedState: "unknown" | "ambiguous" = "unknown") =>
  knownPosition({
    memberId: id("b9"),
    recordedState,
    recordedKobo: null,
    allocatedKobo: 100000,
    linkedKobo: null,
    unlinkedKobo: null,
    overLinkedKobo: null,
    appliedKobo: null,
    creditKobo: null,
    snapshot: null,
    flags: [recordedState === "ambiguous" ? "AMBIGUOUS" : "NEEDS_REVIEW"],
  });

export const positionsReport = (items: unknown[] = [knownPosition()], nextCursor: string | null = null) => ({
  readAt: READ_AT,
  basis: "current",
  snapshot: { takenAt: SNAPSHOT_AT, trigger: "activation" },
  items,
  nextCursor,
});

export const summaryReport = (overrides: Record<string, unknown> = {}) => ({
  readAt: READ_AT,
  from: "2026-11-01",
  to: "2026-11-30",
  snapshot: { takenAt: SNAPSHOT_AT, trigger: "activation" },
  balances: {
    basis: "current",
    holdingBalanceKobo: 50000,
    sources: { count: 4, effectiveKobo: 950000, refundedKobo: 0, allocatedKobo: 900000, remainingKobo: 50000 },
    memberIncome: { duesKobo: 400000, levyKobo: 500000, totalKobo: 900000 },
  },
  positions: {
    basis: "current",
    positionCount: 3,
    recordedTotalKobo: null,
    recordedTotalState: "incomplete",
    unknownPositions: 1,
    ambiguousPositions: 0,
    knownRecordedTotalKobo: 1400000,
    allocatedTotalKobo: 900000,
    allocatedOnUnknownKobo: 100000,
    linkedTotalKobo: null,
    unlinkedTotalKobo: null,
    overLinkedTotalKobo: null,
    knownPositions: {
      count: 2,
      recordedKobo: 1400000,
      allocatedKobo: 800000,
      linkedKobo: 500000,
      unlinkedKobo: 900000,
      overLinkedKobo: 300000,
    },
  },
  flows: {
    flowState: "known",
    allocationsKobo: 900000,
    allocationReversalsKobo: 0,
    netAllocatedKobo: 900000,
    memberIncomeKobo: 900000,
    memberMoney: {
      heldAtStartKobo: 0,
      openingKobo: 150000,
      receivedKobo: 800000,
      refundedKobo: 0,
      allocatedKobo: 900000,
      reversalsKobo: 0,
      otherKobo: 0,
      heldAtEndKobo: 50000,
    },
  },
  identities: {
    consistent: true,
    message: null,
    checks: [
      {
        name: "holding_balance_equals_sources_remaining",
        kind: "ledger",
        consistent: true,
        leftKobo: 50000,
        rightKobo: 50000,
      },
    ],
  },
  lists: {
    openSources: { minAgeDays: 30, count: 0, items: [] },
    overLinkedPositions: { count: 1, items: [overLinkedPosition()] },
    positionsNeedingReview: { count: 1, items: [unknownPosition()] },
  },
  ...overrides,
});

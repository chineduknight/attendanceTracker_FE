import {
  koboOrUnknown,
  snapshotText,
  toAllocationHistoryPage,
  toPositionsReport,
  toReconciliationPosition,
  toReconciliationSummary,
  toSourcesReport,
  UNLINKED_EXPLAINER,
  flagExplanation,
  flagLabel,
} from "helpers/ledgerReconciliation";
import { LEDGER_F3_RECONCILIATION_UI_ENABLED } from "config/ledgerF3Reconciliation";
import { LEDGER_F3_ALLOCATION_UI_ENABLED } from "config/ledgerF3Allocations";
import {
  REVERSAL_R1,
  allocationItem,
  allocationJournal,
  allocationsPage,
  historicalSourcesReport,
  knownPosition,
  overLinkedPosition,
  positionsReport,
  reversedAllocationItem,
  sourceRow,
  sourcesReport,
  summaryReport,
  unknownPosition,
} from "test-utils/ledgerF3Fixtures";

describe("F3 gates", () => {
  it("ship the read-only reconciliation on and allocation posting off", () => {
    expect(LEDGER_F3_RECONCILIATION_UI_ENABLED).toBe(true);
    expect(LEDGER_F3_ALLOCATION_UI_ENABLED).toBe(false);
  });
});

describe("allocation history parsing", () => {
  it("reads live and reversed allocations", () => {
    const page = toAllocationHistoryPage(allocationsPage([allocationItem(), reversedAllocationItem()], "c1"));
    expect(page?.nextCursor).toBe("c1");
    expect(page?.items.map((item) => [item.number, item.state])).toEqual([
      ["A-000001", "live"],
      ["A-000002", "reversed"],
    ]);
    expect(page?.items[1]).toMatchObject({
      obligationType: "levy",
      confirmedMismatches: ["purpose"],
      reversal: { journalId: REVERSAL_R1, businessDate: "2026-11-15" },
    });
    expect(page?.items[0].source).toEqual({ kind: "receipt", id: expect.any(String), number: "M-000012" });
  });

  it("never shows an allocation as live once its journal names a reversal", () => {
    const item = allocationItem({ journal: allocationJournal({ reversedByJournalId: REVERSAL_R1 }) });
    expect(toAllocationHistoryPage(allocationsPage([item]))?.items[0]).toMatchObject({
      state: "reversed",
      reversal: { journalId: REVERSAL_R1 },
    });
  });

  it.each([
    ["a non-allocation journal", allocationItem({ journal: allocationJournal({ sourceType: "cash_receipt" }) })],
    ["a bad number", allocationItem({ journal: allocationJournal({}, { number: "R-000001" }) })],
    ["no source", allocationItem({ journal: allocationJournal({}, { memberMoneySource: undefined }) })],
    ["an unknown obligation type", allocationItem({ journal: allocationJournal({}, { obligationType: "fine" }) })],
    ["a reversed state without its reversal", allocationItem({ state: "reversed", reversal: null })],
    ["a live state with a reversal", allocationItem({ reversal: { journalId: REVERSAL_R1 } })],
    ["an unknown state", allocationItem({ state: "void" })],
  ])("rejects the whole page for %s", (_label, item) => {
    expect(toAllocationHistoryPage(allocationsPage([allocationItem(), item]))).toBeNull();
  });

  it("rejects a page without readAt", () => {
    expect(toAllocationHistoryPage({ items: [], nextCursor: null })).toBeNull();
  });
});

describe("sources parsing", () => {
  it("keeps current suggestions in their own block", () => {
    const report = toSourcesReport(sourcesReport());
    expect(report?.suggestionsOmitted).toBeNull();
    expect(report?.suggestions?.bySource["M-000012"][0]).toMatchObject({ unlinkedKobo: 300000, matchedHints: ["member", "purpose"] });
    expect(report?.items[0]).not.toHaveProperty("suggestions");
  });

  it("reads a historical asOf without suggestions", () => {
    const report = toSourcesReport(historicalSourcesReport());
    expect(report).toMatchObject({ asOf: "2026-11-05", suggestions: null, suggestionsOmitted: "historical_as_of" });
  });

  it.each([
    ["suggestions null without the omission reason", sourcesReport({ suggestions: null })],
    ["suggestions present with an omission reason", sourcesReport({ suggestionsOmitted: "historical_as_of" })],
    ["a non-current basis", sourcesReport({ suggestions: { basis: "snapshot", readAt: "2026-11-14T10:00:00.000Z", bySource: {} } })],
    ["a source breaking its own identity", sourcesReport({ items: [sourceRow({ remainingKobo: 99999 })] })],
    ["a fractional amount", sourcesReport({ items: [sourceRow({ refundedKobo: 0.5, remainingKobo: 99999.5 })] })],
    ["a malformed hint", sourcesReport({ items: [sourceRow({ hints: { memberId: "ada", obligationId: null, purpose: null } })] })],
  ])("rejects %s", (_label, body) => {
    expect(toSourcesReport(body)).toBeNull();
  });
});

describe("position parsing", () => {
  it("keeps unknown and ambiguous F0 values unknown, never zero", () => {
    for (const state of ["unknown", "ambiguous"] as const) {
      const position = toReconciliationPosition(unknownPosition(state));
      expect(position).toMatchObject({ recordedState: state, recordedKobo: null, unlinkedKobo: null, allocatedKobo: 100000 });
      expect(koboOrUnknown(position?.recordedKobo)).toBe("Unknown");
    }
  });

  it("reads an over-linked position", () => {
    expect(toReconciliationPosition(overLinkedPosition())).toMatchObject({ overLinkedKobo: 300000, flags: ["OVER_LINKED"] });
  });

  it.each([
    ["an unknown position that carries a number", { ...unknownPosition(), recordedKobo: 0 }],
    ["a known position missing a link figure", knownPosition({ unlinkedKobo: null })],
    ["recorded ≠ linked + unlinked", knownPosition({ unlinkedKobo: 800000 })],
    ["allocated ≠ linked + over-linked", knownPosition({ overLinkedKobo: 5 })],
    ["a negative recorded value", knownPosition({ recordedKobo: -1 })],
    ["an unknown recorded state", knownPosition({ recordedState: "maybe" })],
  ])("rejects %s", (_label, body) => {
    expect(toReconciliationPosition(body)).toBeNull();
  });

  it("allows a negative recorded-after-snapshot value (a later correction)", () => {
    const position = knownPosition();
    (position.snapshot as Record<string, unknown>).recordedAfterSnapshotKobo = -50000;
    expect(toReconciliationPosition(position)?.snapshot?.recordedAfterSnapshotKobo).toBe(-50000);
  });

  it("rejects a positions page whose basis isn't current", () => {
    expect(toPositionsReport({ ...positionsReport(), basis: "historical" })).toBeNull();
    expect(toPositionsReport(positionsReport([knownPosition(), { bad: true }]))).toBeNull();
  });

  it("shows an unrecognised flag for review instead of dropping it", () => {
    expect(toReconciliationPosition(knownPosition({ flags: ["NEW_FLAG"] }))?.flags).toEqual(["NEW_FLAG"]);
    expect(flagLabel("NEW_FLAG")).toBe("Review flag: NEW_FLAG");
    expect(flagExplanation("OVER_LINKED")).toMatch(/Reverse an allocation or correct the Finance record/);
  });
});

describe("summary parsing", () => {
  it("reads incomplete totals as unknown, with known-positions figures apart", () => {
    const summary = toReconciliationSummary(summaryReport());
    expect(summary?.positions).toMatchObject({
      recordedTotalState: "incomplete",
      recordedTotalKobo: null,
      unlinkedTotalKobo: null,
      knownRecordedTotalKobo: 1400000,
      allocatedOnUnknownKobo: 100000,
    });
    expect(summary?.lists.overLinkedPositions.count).toBe(1);
  });

  it("reads an unknown flow window as unknown", () => {
    const summary = toReconciliationSummary(
      summaryReport({
        flows: {
          flowState: "unknown",
          allocationsKobo: null,
          allocationReversalsKobo: null,
          netAllocatedKobo: null,
          memberIncomeKobo: null,
          memberMoney: null,
        },
      }),
    );
    expect(summary?.flows.flowState).toBe("unknown");
  });

  const positions = summaryReport().positions;
  const identities = summaryReport().identities;
  it.each([
    ["an incomplete total that carries a number", summaryReport({ positions: { ...positions, recordedTotalKobo: 1400000 } })],
    ["a complete state with unknown positions", summaryReport({ positions: { ...positions, recordedTotalState: "complete", recordedTotalKobo: 1, linkedTotalKobo: 1, unlinkedTotalKobo: 1, overLinkedTotalKobo: 1 } })],
    ["an unknown flow with numbers", summaryReport({ flows: { flowState: "unknown", allocationsKobo: 1, allocationReversalsKobo: null, netAllocatedKobo: null, memberIncomeKobo: null, memberMoney: null } })],
    ["a consistent verdict contradicted by a check", summaryReport({ identities: { ...identities, checks: [{ ...identities.checks[0], consistent: false }] } })],
    ["a list showing more rows than its count", summaryReport({ lists: { ...summaryReport().lists, overLinkedPositions: { count: 0, items: [overLinkedPosition()] } } })],
    ["a non-current balances basis", summaryReport({ balances: { ...summaryReport().balances, basis: "window" } })],
  ])("rejects %s", (_label, body) => {
    expect(toReconciliationSummary(body)).toBeNull();
  });
});

describe("wording", () => {
  it("says unlinked value may include several kinds, never that it is pre-ledger", () => {
    expect(UNLINKED_EXPLAINER).toMatch(/may include value recorded before the ledger, money received but not yet allocated, or value recorded with no money in the books/);
    expect(UNLINKED_EXPLAINER).not.toMatch(/pre-ledger|historical/i);
  });

  it("explains the snapshot is not the opening date and can go negative", () => {
    expect(snapshotText({ takenAt: "2026-11-12T13:05:00.000Z", trigger: "activation" })).toMatch(
      /isn't "since the opening date", and it can be negative/,
    );
    expect(snapshotText(null)).toMatch(/No Finance snapshot/);
  });
});

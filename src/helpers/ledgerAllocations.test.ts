import { format, parseISO, subDays } from "date-fns";
import { AllocationDraft, PostingSummary } from "components/finance/ledgerPostingTypes";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { confirmationFlags, confirmationsMatch, hintMismatches } from "helpers/allocationHints";
import {
  NO_PAYMENT_RECORDED_REASON,
  allocationCapIssue,
  allocationReadiness,
  positionGate,
} from "helpers/ledgerAllocations";
import {
  allocationDraftIssue,
  assessPostingConfirmation,
  buildAllocationBody,
  classifyPostingFailure,
  postingEndpoint,
  postingExpectation,
  postingSummaryText,
  retrySectionFor,
} from "helpers/ledgerPostings";
import { attemptTypeLabel } from "helpers/ledgerAttempts";
import {
  beginLedgerPostingIntent,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
import { toPositionsReport } from "helpers/ledgerReconciliation";
import { reversalEligibility, toJournalDetail } from "helpers/ledgerReversals";
import { todayInLagos } from "helpers/openingBalances";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import {
  MEMBER_ADA,
  MEMBER_CHIDI,
  OBLIGATION_DUES,
  OBLIGATION_LEVY,
  SOURCE_M12,
  allocationJournal,
  knownPosition,
  overLinkedPosition,
  positionsReport,
  unknownPosition,
} from "test-utils/ledgerF3Fixtures";

const TODAY = todayInLagos();
const daysAgo = (days: number) => format(subDays(parseISO(TODAY), days), "yyyy-MM-dd");

const draft = (overrides: Partial<AllocationDraft> = {}): AllocationDraft => ({
  source: {
    kind: "receipt",
    id: SOURCE_M12,
    number: "M-000012",
    businessDate: daysAgo(5),
    remainingKobo: 100000,
    memberId: MEMBER_ADA,
    obligationId: null,
    purpose: "dues",
  },
  memberId: MEMBER_ADA,
  obligationId: OBLIGATION_DUES,
  obligationType: "dues",
  businessDate: TODAY,
  amountKobo: 50000,
  confirmedMismatches: [],
  reference: "",
  note: "",
  ...overrides,
});

const CONTEXT = { today: TODAY, openingDate: daysAgo(30), lockedThrough: null, lockedThroughState: "none" as const };

describe("hint mismatches (three independent rules)", () => {
  const hints = { memberId: MEMBER_ADA, obligationId: OBLIGATION_DUES, purpose: "dues" as const };

  it("finds none when every hint agrees (ids compared case-insensitively)", () => {
    expect(
      hintMismatches(hints, { memberId: MEMBER_ADA.toUpperCase(), obligationId: OBLIGATION_DUES, obligationType: "dues" }),
    ).toEqual([]);
  });

  it("finds each mismatch on its own", () => {
    expect(hintMismatches(hints, { memberId: MEMBER_CHIDI, obligationId: OBLIGATION_DUES, obligationType: "dues" })).toEqual(["member"]);
    expect(hintMismatches({ ...hints, purpose: null }, { memberId: MEMBER_ADA, obligationId: OBLIGATION_LEVY, obligationType: "dues" })).toEqual(["obligation"]);
    expect(hintMismatches({ ...hints, obligationId: null }, { memberId: MEMBER_ADA, obligationId: OBLIGATION_LEVY, obligationType: "levy" })).toEqual(["purpose"]);
    expect(hintMismatches(hints, { memberId: MEMBER_CHIDI, obligationId: OBLIGATION_LEVY, obligationType: "levy" })).toEqual([
      "member",
      "obligation",
      "purpose",
    ]);
  });

  it("never treats an absent hint or an unspecified purpose as a mismatch", () => {
    expect(
      hintMismatches(
        { memberId: null, obligationId: null, purpose: "unspecified" },
        { memberId: MEMBER_CHIDI, obligationId: OBLIGATION_LEVY, obligationType: "levy" },
      ),
    ).toEqual([]);
  });

  it("sends a flag only as true and only for a confirmed mismatch", () => {
    expect(confirmationFlags([])).toEqual({});
    expect(confirmationFlags(["purpose", "member"])).toEqual({ confirmMemberMismatch: true, confirmPurposeMismatch: true });
    expect(confirmationsMatch(["member", "purpose"], ["purpose", "member"])).toBe(true);
    expect(confirmationsMatch(["member", "purpose"], ["member"])).toBe(false);
    expect(confirmationsMatch(["member"], ["member", "obligation"])).toBe(false);
  });
});

describe("allocation body and draft", () => {
  it("builds the exact body: no account, line, method or number", () => {
    const body = buildAllocationBody(draft({ confirmedMismatches: [], reference: "  Envelope 3 ", note: "" }), "key-0001");
    expect(body).toEqual({
      idempotencyKey: "key-0001",
      businessDate: TODAY,
      amountKobo: 50000,
      sourceId: SOURCE_M12,
      memberId: MEMBER_ADA,
      obligationId: OBLIGATION_DUES,
      reference: "Envelope 3",
    });
    expect(postingEndpoint("allocation")).toBe("/finance/:organisationId/ledger/allocations");
  });

  it("includes the flags the officer confirmed", () => {
    const body = buildAllocationBody(
      draft({ memberId: MEMBER_CHIDI, obligationId: OBLIGATION_LEVY, obligationType: "levy", confirmedMismatches: ["member", "purpose"] }),
      "key-0002",
    );
    expect(body).toMatchObject({ confirmMemberMismatch: true, confirmPurposeMismatch: true });
    expect(body).not.toHaveProperty("confirmObligationMismatch");
  });

  it.each([
    ["more than the source holds", draft({ amountKobo: 100001 }), /can't be more than the ₦1,000 M-000012 still holds/],
    ["dated before the money was received", draft({ businessDate: daysAgo(6) }), /can't be dated before its money was received/],
    ["dated after today", draft({ businessDate: "2999-01-01" }), /after today/],
    ["an unconfirmed mismatch", draft({ memberId: MEMBER_CHIDI }), /Confirm each hint/],
    ["a confirmation without a mismatch", draft({ confirmedMismatches: ["obligation"] }), /Confirm each hint/],
  ])("refuses %s", (_label, value, message) => {
    expect(allocationDraftIssue(value, CONTEXT)).toMatch(message);
  });

  it("accepts a valid draft", () => {
    expect(allocationDraftIssue(draft(), CONTEXT)).toBeNull();
  });

  it("describes a pending allocation in plain words", () => {
    const summary: PostingSummary = {
      operation: "allocation",
      amountKobo: 50000,
      businessDate: TODAY,
      method: null,
      fromAccountName: null,
      toAccountName: null,
      categoryName: null,
      sourceNumber: "M-000012",
      memberName: "Ada Obi",
      obligationName: "Dues (2026)",
      obligationType: "dues",
    };
    expect(postingSummaryText(summary)).toBe("Allocation: ₦500 from M-000012 to Ada Obi, Dues (2026)");
  });
});

describe("allocation proof", () => {
  const record = (body = buildAllocationBody(draft({ amountKobo: 200000, source: { ...draft().source, remainingKobo: 300000 } }), "key-0003")) => ({
    operation: "allocation" as const,
    body,
    sourceId: null,
    reversalTarget: null,
  });
  const respond = (journal: unknown, replayed = false) => ({ data: { journal, replayed } });

  it("accepts a 201 that names the same source, member and obligation", () => {
    const expectation = postingExpectation(record());
    const result = assessPostingConfirmation({
      httpStatus: 201,
      body: respond(allocationJournal({ businessDate: TODAY })),
      ...expectation,
    });
    expect(result).toMatchObject({ confirmed: true, replayed: false, journal: { number: "A-000001" } });
  });

  it("accepts a replay (200, replayed: true)", () => {
    const result = assessPostingConfirmation({
      httpStatus: 200,
      body: respond(allocationJournal({ businessDate: TODAY }), true),
      ...postingExpectation(record()),
    });
    expect(result).toMatchObject({ confirmed: true, replayed: true });
  });

  it.each([
    ["another source", { memberMoneySource: { kind: "receipt", id: "0".repeat(23) + "9", number: "M-000099" } }],
    ["another member", { memberId: MEMBER_CHIDI }],
    ["another obligation", { obligationId: OBLIGATION_LEVY }],
  ])("keeps it pending when the journal names %s", (_label, entry) => {
    const result = assessPostingConfirmation({
      httpStatus: 201,
      body: respond(allocationJournal({ businessDate: TODAY }, entry)),
      ...postingExpectation(record()),
    });
    expect(result.confirmed).toBe(false);
  });

  it("classifies allocation refusals with the F2 proof rules", () => {
    const refusal = (status: number, code: string) => ({ response: { status, data: { error: "x", code } } });
    expect(classifyPostingFailure(refusal(422, "LEDGER_ALLOCATION_EXCEEDS_REMAINING"), false).kind).toBe("clean-refusal");
    expect(classifyPostingFailure(refusal(400, "LEDGER_POSITION_AMBIGUOUS"), false).kind).toBe("clean-refusal");
    // After an ambiguous attempt a refusal proves nothing about the earlier one.
    expect(classifyPostingFailure(refusal(422, "LEDGER_ALLOCATION_EXCEEDS_RECORDED"), true)).toMatchObject({
      kind: "keep-pending",
      ownerResolution: true,
    });
    expect(classifyPostingFailure({ message: "Network Error" }, false)).toMatchObject({ kind: "keep-pending", ambiguous: true });
  });
});

describe("allocation posting intent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    installPostingLockManager();
  });
  afterEach(removePostingLockManager);

  const summary: PostingSummary = {
    operation: "allocation",
    amountKobo: 50000,
    businessDate: TODAY,
    method: null,
    fromAccountName: null,
    toAccountName: null,
    categoryName: null,
    sourceNumber: "M-000012",
    memberName: "Ada Obi",
    obligationName: "Dues (2026)",
    obligationType: "dues",
  };

  it("stores the exact body and reads it back after a reload", async () => {
    const body = buildAllocationBody(draft(), "alloc-key-0001");
    const claim = await beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "alloc-key-0001",
      operation: "allocation",
      body,
      summary,
    });
    expect(claim.kind).toBe("claimed");
    // A reload treats a dispatching record as an ambiguous attempt.
    expect(readLedgerPostingIntents("org1")).toMatchObject({
      kind: "pending",
      intents: [
        {
          body,
          summary: expect.objectContaining({ memberName: "Ada Obi", obligationType: "dues" }),
          hadAmbiguousAttempt: true,
        },
      ],
    });
    expect(readLedgerPostingIntents("org2").kind).toBe("none");
  });

  it.each([
    ["an unknown field", { accountId: "x" }],
    ["a false flag", { confirmMemberMismatch: false }],
    ["a bad member id", { memberId: "ada" }],
  ])("refuses to store a body with %s", async (_label, extra) => {
    const body = { ...buildAllocationBody(draft(), "alloc-key-0002"), ...extra };
    const claim = await beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "alloc-key-0002",
      operation: "allocation",
      body: body as never,
      summary,
    });
    expect(claim).toEqual({ kind: "blocked", reason: "invalid" });
  });
});

describe("allocation reversal eligibility", () => {
  const detail = (overrides: Record<string, unknown> = {}) =>
    toJournalDetail(allocationJournal({ businessDate: daysAgo(2), ...overrides })) as NonNullable<ReturnType<typeof toJournalDetail>>;

  it("is exactly F2B-3's refusal while the F3 allocation gate is off", () => {
    expect(reversalEligibility(detail())).toMatchObject({
      eligible: false,
      reason: "Only money in, money out, transfer, member money in and member money refund entries can be reversed here.",
    });
  });

  it("is offered with the gate on, mirroring the allocation's total", () => {
    expect(reversalEligibility(detail(), { allocations: true })).toMatchObject({
      eligible: true,
      target: { sourceType: "member_money_allocation", number: "A-000001", totalKobo: 200000 },
    });
  });

  it("is never offered twice", () => {
    expect(reversalEligibility(detail({ reversedByJournalId: "b".repeat(24) }), { allocations: true })).toMatchObject({
      eligible: false,
      reason: expect.stringMatching(/already been reversed/),
    });
  });
});

describe("allocation readiness", () => {
  const status = (overrides: Partial<LedgerStatus> = {}): LedgerStatus => ({
    state: { kind: "known", state: "active" },
    currency: "NGN",
    openingBalancesVerified: true,
    postingEnabled: true,
    contractVersion: "f2-0.3",
    blockers: [],
    openingDate: daysAgo(30),
    lockedThrough: null,
    lockedThroughState: "none",
    revision: 7,
    memberReceiptsEnabled: true,
    allocationsEnabled: true,
    unconfirmedAttempts: 0,
    hasPendingProposal: false,
    activatedAt: null,
    gapWindowAttestedAt: null,
    gapWindowAttestation: "not_attested",
    ...overrides,
  });
  const account = (id: string, cls: string, subtype: string | null, active = true): LedgerAccount => ({
    id,
    name: id,
    class: cls,
    subtype,
    currency: "NGN",
    active,
    revision: 0,
    bankName: null,
    accountNumberLast4: null,
    openingVerified: null,
  });
  const ACCOUNTS = [
    account("hold", "liability", "member_receipts_unallocated"),
    account("dues", "income", "member_dues_income"),
    account("levy", "income", "member_levy_income"),
  ];

  it("is ready with every prerequisite", () => {
    expect(allocationReadiness({ status: status(), canManage: true, accounts: ACCOUNTS })).toEqual({ ready: true, reason: null });
  });

  it.each([
    ["no finance.manage", { canManage: false }, /Only officers with permission to manage finance can allocate/],
    ["writes off", { status: status({ blockers: ["LEDGER_WRITES_DISABLED"], postingEnabled: false }) }, /switched off on the server/],
    ["a suspended ledger", { status: status({ state: { kind: "known", state: "suspended" } }) }, /suspended/],
    ["member receipts off", { status: status({ memberReceiptsEnabled: false }) }, /Member receipts are turned off/],
    ["allocations off", { status: status({ allocationsEnabled: false }) }, /allocations are turned off.*can still be reversed/],
    ["allocations unknown", { status: status({ allocationsEnabled: null }) }, /didn't report whether member money allocations are on/],
    ["a missing levy income account", { accounts: ACCOUNTS.slice(0, 2) }, /member levy income account are both needed/],
  ])("explains %s", (_label, change, message) => {
    const input = { status: status(), canManage: true, accounts: ACCOUNTS, ...change };
    expect(allocationReadiness(input).reason).toMatch(message);
  });
});

describe("position gate", () => {
  const gateFor = (items: unknown[]) =>
    positionGate({
      report: toPositionsReport(positionsReport(items)),
      isLoading: false,
      isError: false,
      memberId: (items[0] as { memberId?: string } | undefined)?.memberId ?? MEMBER_ADA,
      obligationId: OBLIGATION_DUES,
    });

  it("opens with the server's unlinked value as the cap", () => {
    const gate = gateFor([knownPosition()]);
    expect(gate).toMatchObject({ kind: "open", capKobo: 900000 });
    expect(allocationCapIssue(900000, gate)).toBeNull();
    expect(allocationCapIssue(900001, gate)).toMatch(/at most ₦9,000 can be allocated/);
  });

  it("says recorded ₦0 when Finance has no payment row", () => {
    expect(gateFor([])).toEqual({ kind: "none", reason: NO_PAYMENT_RECORDED_REASON });
  });

  it.each([
    ["an over-linked position", overLinkedPosition(), /Reverse an allocation or correct the Finance record/],
    ["an unknown value", unknownPosition("unknown"), /Fix the record in Finance/],
    ["two Finance rows", unknownPosition("ambiguous"), /two or more active payment records/],
    ["an archived member", knownPosition({ flags: ["MEMBER_ARCHIVED"] }), /archived or missing/],
  ])("blocks %s", (_label, item, message) => {
    const gate = gateFor([item]);
    expect(gate.kind).toBe("blocked");
    expect(gate.kind === "blocked" && gate.reason).toMatch(message);
  });

  it("never offers anything it couldn't read", () => {
    expect(positionGate({ report: null, isLoading: false, isError: true, memberId: MEMBER_ADA, obligationId: OBLIGATION_DUES }).kind).toBe(
      "unavailable",
    );
    expect(gateFor([knownPosition({ memberId: MEMBER_CHIDI })]).kind).toBe("open");
    expect(
      positionGate({
        report: toPositionsReport(positionsReport([knownPosition()])),
        isLoading: false,
        isError: false,
        memberId: MEMBER_CHIDI,
        obligationId: OBLIGATION_DUES,
      }).kind,
    ).toBe("unavailable");
  });
});

describe("retry ownership and labels", () => {
  it("offers a pending allocation's retry in exactly one shown section", () => {
    expect(retrySectionFor("allocation", ["cashbook", "memberMoney", "reversals", "allocations"])).toBe("allocations");
    // Allocations hidden: it falls back to the first shown section, never stranded.
    expect(retrySectionFor("allocation", ["memberMoney", "reversals"])).toBe("memberMoney");
    // F2 postings keep their own sections.
    expect(retrySectionFor("receipt", ["cashbook", "allocations"])).toBe("cashbook");
    expect(retrySectionFor("reversal", ["cashbook", "reversals", "allocations"])).toBe("reversals");
  });

  it("names allocation attempts in the unconfirmed-attempts list", () => {
    expect(attemptTypeLabel("member_money_allocation")).toBe("Allocation");
  });
});

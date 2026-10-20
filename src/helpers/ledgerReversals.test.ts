import { format, parseISO, subDays } from "date-fns";
import {
  assessPostingConfirmation,
  buildPostingBody,
  classifyPostingFailure,
  ledgerWriteReadiness,
  postingExpectation,
  postingRouteParams,
  postingSummaryText,
  retrySectionFor,
  reversalDraftIssue,
} from "helpers/ledgerPostings";
import { reversalCaution, reversalEligibility, toJournalDetail } from "helpers/ledgerReversals";
import { todayInLagos } from "helpers/openingBalances";
import { ReversalTarget } from "components/finance/ledgerPostingTypes";
import { LedgerStatus } from "components/finance/ledgerTypes";
import { LEDGER_REVERSALS_UI_ENABLED } from "config/ledgerReversals";

const TODAY = todayInLagos();
const daysAgo = (days: number) => format(subDays(parseISO(TODAY), days), "yyyy-MM-dd");
const ORIGINAL_ID = "a".repeat(24);
const REVERSAL_ID = "b".repeat(24);

const rawJournal = (overrides: Record<string, unknown> = {}) => ({
  id: ORIGINAL_ID,
  businessDate: daysAgo(5),
  reference: null,
  note: null,
  sourceType: "cash_receipt",
  lines: [
    { accountId: "cash", side: "debit", amountKobo: 500000 },
    { accountId: "income", side: "credit", amountKobo: 500000 },
  ],
  totalKobo: 500000,
  postedAt: `${daysAgo(5)}T10:00:00.000Z`,
  postedBy: { id: "officer-1", name: "treasurer" },
  sourceId: null,
  reversesJournalId: null,
  reversedByJournalId: null,
  entry: { number: "R-000012", method: "cash", counterpartyName: "Ada" },
  ...overrides,
});

const detail = (overrides: Record<string, unknown> = {}) => {
  const parsed = toJournalDetail(rawJournal(overrides));
  if (!parsed) throw new Error("fixture did not parse");
  return parsed;
};

const TARGET: ReversalTarget = {
  journalId: ORIGINAL_ID,
  sourceType: "cash_receipt",
  number: "R-000012",
  businessDate: daysAgo(5),
  totalKobo: 500000,
};

const CONTEXT = {
  today: TODAY,
  openingDate: daysAgo(30),
  lockedThrough: null,
  lockedThroughState: "none" as const,
};

describe("gate", () => {
  it("is off by default", () => {
    expect(LEDGER_REVERSALS_UI_ENABLED).toBe(false);
  });
});

describe("toJournalDetail", () => {
  it("reads the reversal links three-state", () => {
    expect(detail().reversedBy).toEqual({ kind: "not_reversed" });
    expect(detail({ reversedByJournalId: REVERSAL_ID }).reversedBy).toEqual({
      kind: "reversed",
      journalId: REVERSAL_ID,
    });
    // Missing is unknown, never "not reversed".
    const { reversedByJournalId, ...withoutLink } = rawJournal();
    expect(reversedByJournalId).toBeNull();
    expect(toJournalDetail(withoutLink)?.reversedBy).toEqual({ kind: "unknown" });
    expect(detail({ reversedByJournalId: 7 }).reversedBy).toEqual({ kind: "unknown" });
  });

  it("refuses a journal whose lines are not structurally usable", () => {
    expect(toJournalDetail(rawJournal({ lines: "nope" }))).toBeNull();
    expect(toJournalDetail(rawJournal({ lines: [null] }))).toBeNull();
    expect(toJournalDetail(null)).toBeNull();
  });
});

describe("reversalEligibility", () => {
  it.each([
    ["cash_receipt", "R-000001"],
    ["cash_expense", "E-000001"],
    ["cash_transfer", "T-000001"],
    ["member_receipt", "M-000001"],
    ["member_receipt_refund", "F-000001"],
  ])("offers the F2 posting type %s", (sourceType, number) => {
    const result = reversalEligibility(detail({ sourceType, entry: { number } }));
    expect(result).toEqual({
      eligible: true,
      target: { ...TARGET, sourceType, number },
    });
  });

  it.each([
    ["opening_balance", /Opening balance entries are never reversed/],
    ["opening_balance_correction", /Opening balance entries are never reversed/],
    ["reversal", /itself a reversal/],
    ["manual_adjustment", /Only money in, money out, transfer, member money in and member money refund entries/],
    ["member_money_allocation", /Only money in/],
  ])("never offers %s", (sourceType, reason) => {
    expect(reversalEligibility(detail({ sourceType }))).toEqual({
      eligible: false,
      reason: expect.stringMatching(reason),
      reversedByJournalId: null,
    });
  });

  it("never offers a journal that links to an original, whatever its type says", () => {
    expect(reversalEligibility(detail({ reversesJournalId: REVERSAL_ID })).eligible).toBe(false);
  });

  it("never offers an already-reversed journal, and names its reversal", () => {
    expect(reversalEligibility(detail({ reversedByJournalId: REVERSAL_ID }))).toEqual({
      eligible: false,
      reason: expect.stringMatching(/already been reversed/),
      reversedByJournalId: REVERSAL_ID,
    });
  });

  it("fails closed when the reversal link, id, date or total is unknown", () => {
    const { reversedByJournalId: _link, ...withoutLink } = rawJournal();
    const unknownLink = toJournalDetail(withoutLink);
    expect(unknownLink && reversalEligibility(unknownLink).eligible).toBe(false);
    expect(reversalEligibility(detail({ id: "not-an-object-id" })).eligible).toBe(false);
    expect(reversalEligibility(detail({ businessDate: "05/10/2026" })).eligible).toBe(false);
    expect(reversalEligibility(detail({ totalKobo: "500000" })).eligible).toBe(false);
    expect(reversalEligibility(detail({ totalKobo: 0 })).eligible).toBe(false);
  });

  it("warns about server-only refusals for the entries that have them", () => {
    expect(reversalCaution({ ...TARGET, sourceType: "member_receipt" })).toMatch(
      /refunded or allocated/,
    );
    expect(reversalCaution(TARGET)).toMatch(/below zero/);
    expect(reversalCaution({ ...TARGET, sourceType: "cash_expense" })).toBeNull();
  });
});

describe("reversal dates and reason", () => {
  const draft = (businessDate: string, reason = "Posted twice") => ({
    original: TARGET,
    businessDate,
    reason,
  });

  it("accepts the original's date through today", () => {
    expect(reversalDraftIssue(draft(TARGET.businessDate), CONTEXT)).toBeNull();
    expect(reversalDraftIssue(draft(TODAY), CONTEXT)).toBeNull();
  });

  it("refuses a date before the original, before the opening, in the lock or after today", () => {
    expect(reversalDraftIssue(draft(daysAgo(6)), CONTEXT)).toMatch(/before the entry it undoes/);
    expect(
      reversalDraftIssue(draft(daysAgo(6)), { ...CONTEXT, openingDate: daysAgo(4) }),
    ).toMatch(/opening date/);
    expect(
      reversalDraftIssue(draft(daysAgo(3)), {
        ...CONTEXT,
        lockedThrough: daysAgo(2),
        lockedThroughState: "set",
      }),
    ).toMatch(/locked through/);
    const tomorrow = format(subDays(parseISO(TODAY), -1), "yyyy-MM-dd");
    expect(reversalDraftIssue(draft(tomorrow), CONTEXT)).toMatch(/after today/);
  });

  it("requires a reason of at most 500 characters", () => {
    expect(reversalDraftIssue(draft(TODAY, "   "), CONTEXT)).toBe("Reason is required.");
    expect(reversalDraftIssue(draft(TODAY, "x".repeat(501)), CONTEXT)).toMatch(/500 characters/);
    expect(reversalDraftIssue(draft(TODAY, "x".repeat(500)), CONTEXT)).toBeNull();
  });
});

describe("reversal request", () => {
  it("is exactly { idempotencyKey, businessDate, reason } with the reason trimmed", () => {
    const body = buildPostingBody(
      { operation: "reversal", reversal: { original: TARGET, businessDate: TODAY, reason: "  Posted twice  " } },
      "key-00000001",
    );
    expect(body).toEqual({ idempotencyKey: "key-00000001", businessDate: TODAY, reason: "Posted twice" });
    expect(Object.keys(body)).toEqual(["idempotencyKey", "businessDate", "reason"]);
  });

  it("routes to the original journal and expects its total", () => {
    const request = {
      operation: "reversal" as const,
      body: { idempotencyKey: "key-00000001", businessDate: TODAY, reason: "Posted twice" },
      sourceId: null,
      reversalTarget: TARGET,
    };
    expect(postingRouteParams(request)).toEqual({ journalId: ORIGINAL_ID });
    expect(postingExpectation(request)).toMatchObject({ amountKobo: 500000, businessDate: TODAY });
  });
});

describe("assessPostingConfirmation for a reversal", () => {
  const reversalJournal = (overrides: Record<string, unknown> = {}) => ({
    id: REVERSAL_ID,
    businessDate: TODAY,
    reference: null,
    note: "Posted twice",
    sourceType: "reversal",
    totalKobo: 500000,
    postedAt: `${TODAY}T10:00:00.000Z`,
    postedBy: { id: "officer-1", name: "treasurer" },
    sourceId: ORIGINAL_ID,
    reversesJournalId: ORIGINAL_ID,
    reversedByJournalId: null,
    entry: null,
    lines: [],
    ...overrides,
  });
  const assess = (
    journal: Record<string, unknown>,
    { httpStatus = 201, replayed = false, target = TARGET as ReversalTarget | null } = {},
  ) =>
    assessPostingConfirmation({
      httpStatus,
      body: { data: { replayed, journal } },
      operation: "reversal",
      businessDate: TODAY,
      amountKobo: 500000,
      reversalTarget: target,
    });

  it("confirms a linked, unnumbered reversal on 201 and a replay on 200", () => {
    expect(assess(reversalJournal())).toMatchObject({ confirmed: true, replayed: false });
    expect(assess(reversalJournal(), { httpStatus: 200, replayed: true })).toMatchObject({
      confirmed: true,
      replayed: true,
    });
    // The server stores the route id lowercased; ids compare without case.
    expect(
      assess(reversalJournal({ reversesJournalId: ORIGINAL_ID.toUpperCase() })).confirmed,
    ).toBe(true);
  });

  it.each([
    ["another journal type", { sourceType: "cash_receipt" }],
    ["a different original", { reversesJournalId: "c".repeat(24) }],
    ["no original link", { reversesJournalId: null }],
    ["the original itself", { id: ORIGINAL_ID }],
    ["a different date", { businessDate: daysAgo(1) }],
    ["a different total", { totalKobo: 400000 }],
  ])("never confirms %s", (_label, overrides) => {
    expect(assess(reversalJournal(overrides)).confirmed).toBe(false);
  });

  it("never confirms an inconsistent replay flag or an unknown target", () => {
    expect(assess(reversalJournal(), { httpStatus: 201, replayed: true }).confirmed).toBe(false);
    expect(assess(reversalJournal(), { httpStatus: 200, replayed: false }).confirmed).toBe(false);
    expect(assess(reversalJournal(), { target: null }).confirmed).toBe(false);
  });
});

describe("reversal refusals", () => {
  const failure = (status: number, code: string, error = "Refused.") => ({
    response: { status, data: { error, code } },
  });

  it("treats a first 409 already-reversed as a clean refusal", () => {
    expect(classifyPostingFailure(failure(409, "LEDGER_ALREADY_REVERSED"), false)).toEqual({
      kind: "clean-refusal",
      message: "Refused.",
    });
  });

  it("keeps it pending after an ambiguous attempt: the earlier send may have posted", () => {
    expect(classifyPostingFailure(failure(409, "LEDGER_ALREADY_REVERSED"), true)).toMatchObject({
      kind: "keep-pending",
      ownerResolution: true,
    });
    expect(classifyPostingFailure(failure(422, "LEDGER_INSUFFICIENT_FUNDS"), true)).toMatchObject({
      kind: "keep-pending",
    });
  });

  it.each(["LEDGER_INSUFFICIENT_FUNDS", "LEDGER_MEMBER_RECEIPT_IN_USE"])(
    "shows the server's %s refusal on a first send",
    (code) => {
      expect(classifyPostingFailure(failure(422, code, "Server says no."), false)).toEqual({
        kind: "clean-refusal",
        message: "Server says no.",
      });
    },
  );
});

describe("sections and readiness", () => {
  it("retries a reversal in Reversals, or the first shown section when it is hidden", () => {
    expect(retrySectionFor("reversal", ["cashbook", "memberMoney", "reversals"])).toBe("reversals");
    expect(retrySectionFor("reversal", ["cashbook", "memberMoney"])).toBe("cashbook");
    expect(retrySectionFor("receipt", ["memberMoney", "reversals"])).toBe("memberMoney");
    expect(retrySectionFor("refund", ["reversals"])).toBe("reversals");
  });

  it("describes a pending reversal by its original", () => {
    expect(
      postingSummaryText({
        operation: "reversal",
        amountKobo: 500000,
        businessDate: TODAY,
        method: null,
        fromAccountName: null,
        toAccountName: null,
        categoryName: null,
        originalSourceType: "cash_receipt",
        originalNumber: "R-000012",
      }),
    ).toBe("Reversal of money in R-000012: ₦5,000");
  });

  it("needs write readiness but no posting account to reverse", () => {
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
      revision: 1,
      memberReceiptsEnabled: true,
      unconfirmedAttempts: 0,
      hasPendingProposal: false,
      activatedAt: null,
      gapWindowAttestedAt: null,
      gapWindowAttestation: "not_attested",
      ...overrides,
    });
    expect(ledgerWriteReadiness({ status: status(), canManage: true }).ready).toBe(true);
    expect(
      ledgerWriteReadiness({ status: status({ state: { kind: "known", state: "suspended" } }), canManage: true })
        .reason,
    ).toMatch(/suspended/);
    expect(
      ledgerWriteReadiness({ status: status({ blockers: ["LEDGER_WRITES_DISABLED"] }), canManage: true }).ready,
    ).toBe(false);
    expect(
      ledgerWriteReadiness({ status: status(), canManage: false, forbiddenReason: "No." }),
    ).toEqual({ ready: false, reason: "No." });
  });
});

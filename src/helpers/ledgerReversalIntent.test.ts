import {
  PostingSummary,
  ReversalBody,
  ReversalTarget,
} from "components/finance/ledgerPostingTypes";
import {
  beginLedgerPostingIntent,
  clearLedgerPostingIntent,
  ledgerPostingIntentKey,
  markLedgerPostingIntentUnresolved,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";

const ORIGINAL_ID = "a".repeat(24);
const KEY = "rev-12345678";

const TARGET: ReversalTarget = {
  journalId: ORIGINAL_ID,
  sourceType: "member_receipt",
  number: "M-000004",
  businessDate: "2026-10-10",
  totalKobo: 600000,
};

const BODY: ReversalBody = { idempotencyKey: KEY, businessDate: "2026-10-18", reason: "Posted twice" };

const SUMMARY: PostingSummary = {
  operation: "reversal",
  amountKobo: 600000,
  businessDate: "2026-10-18",
  method: null,
  fromAccountName: null,
  toAccountName: null,
  categoryName: null,
  originalSourceType: "member_receipt",
  originalNumber: "M-000004",
};

const claim = (overrides: Partial<Parameters<typeof beginLedgerPostingIntent>[0]> = {}) =>
  beginLedgerPostingIntent({
    organisationId: "org1",
    officerId: "officer-1",
    key: KEY,
    operation: "reversal",
    body: BODY,
    reversalTarget: TARGET,
    summary: SUMMARY,
    ...overrides,
  });

const storedContainer = (organisationId = "org1") =>
  JSON.parse(window.localStorage.getItem(ledgerPostingIntentKey(organisationId)) ?? "null");

const writeContainer = (intents: unknown[], organisationId = "org1") =>
  window.localStorage.setItem(
    ledgerPostingIntentKey(organisationId),
    JSON.stringify({ organisationId, intents }),
  );

beforeEach(() => {
  window.localStorage.clear();
  installPostingLockManager();
});

afterEach(() => {
  removePostingLockManager();
});

describe("durable reversal intent", () => {
  it("stores the exact body and the original journal before sending", async () => {
    const result = await claim();
    expect(result.kind).toBe("claimed");
    const read = readLedgerPostingIntents("org1");
    expect(read.kind).toBe("pending");
    if (read.kind !== "pending") return;
    expect(read.intents[0]).toMatchObject({
      operation: "reversal",
      body: BODY,
      sourceId: null,
      reversalTarget: TARGET,
      summary: { method: null, originalNumber: "M-000004" },
    });
  });

  it("shares the one slot with every other posting", async () => {
    expect((await claim()).kind).toBe("claimed");
    const second = await beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "key-99999999",
      operation: "receipt",
      body: {
        idempotencyKey: "key-99999999",
        businessDate: "2026-10-18",
        amountKobo: 100,
        toAccountId: "cash",
        incomeAccountId: "income",
        method: "cash",
      },
      summary: {
        operation: "receipt",
        amountKobo: 100,
        businessDate: "2026-10-18",
        method: "cash",
        fromAccountName: null,
        toAccountName: null,
        categoryName: null,
      },
    });
    expect(second).toEqual({ kind: "blocked", reason: "existing" });
  });

  it.each([
    ["no original journal", { reversalTarget: null }],
    ["an original that is not an id", { reversalTarget: { ...TARGET, journalId: "M-000004" } }],
    ["an opening as original", { reversalTarget: { ...TARGET, sourceType: "opening_balance" } }],
    ["an amount the summary disagrees with", { summary: { ...SUMMARY, amountKobo: 1 } }],
    ["a date before the original", { body: { ...BODY, businessDate: "2026-10-09" } }],
    ["an extra body field", { body: { ...BODY, amountKobo: 600000 } }],
    ["a blank reason", { body: { ...BODY, reason: "   " } }],
    ["a payment method", { summary: { ...SUMMARY, method: "cash" } }],
  ])("refuses to claim a reversal with %s", async (_label, overrides) => {
    expect(await claim(overrides as never)).toEqual({ kind: "blocked", reason: "invalid" });
    expect(readLedgerPostingIntents("org1")).toEqual({ kind: "none" });
  });

  it("refuses a reversal target on any other posting", async () => {
    const result = await beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "key-99999999",
      operation: "expense",
      body: {
        idempotencyKey: "key-99999999",
        businessDate: "2026-10-18",
        amountKobo: 100,
        fromAccountId: "cash",
        expenseAccountId: "fuel",
        method: "cash",
        counterpartyName: "Shell",
      },
      reversalTarget: TARGET,
      summary: {
        operation: "expense",
        amountKobo: 100,
        businessDate: "2026-10-18",
        method: "cash",
        fromAccountName: null,
        toAccountName: null,
        categoryName: null,
      },
    });
    expect(result).toEqual({ kind: "blocked", reason: "invalid" });
  });

  it("reads a reloaded dispatching reversal as ambiguous and keeps its target through updates", async () => {
    const claimed = await claim();
    if (claimed.kind !== "claimed") throw new Error("not claimed");
    // A reload after sending: the record is still `dispatching`.
    const reloaded = readLedgerPostingIntents("org1");
    expect(reloaded.kind === "pending" && reloaded.intents[0].hadAmbiguousAttempt).toBe(true);

    expect(
      await markLedgerPostingIntentUnresolved(claimed.record, { ambiguous: true, message: "Lost." }),
    ).toBe(true);
    expect(storedContainer().intents[0]).toMatchObject({
      state: "unresolved",
      reversalTarget: TARGET,
      body: BODY,
    });
    expect(await clearLedgerPostingIntent("org1", KEY)).toBe(true);
    expect(readLedgerPostingIntents("org1")).toEqual({ kind: "none" });
  });

  it("fails closed on a stored reversal without its original", async () => {
    await claim();
    const container = storedContainer();
    delete container.intents[0].reversalTarget;
    writeContainer(container.intents);
    expect(readLedgerPostingIntents("org1")).toEqual({ kind: "unknown" });
  });

  it("still reads records written before F2B-3", () => {
    writeContainer([
      {
        organisationId: "org1",
        officerId: "officer-1",
        key: "key-12345678",
        operation: "refund",
        body: {
          idempotencyKey: "key-12345678",
          businessDate: "2026-10-18",
          amountKobo: 100,
          fromAccountId: "cash",
          method: "cash",
          counterpartyName: "Ada",
          reason: "Paid twice",
        },
        sourceId: "b".repeat(24),
        summary: {
          operation: "refund",
          amountKobo: 100,
          businessDate: "2026-10-18",
          method: "cash",
          fromAccountName: "Cash",
          toAccountName: null,
          categoryName: null,
          counterpartyName: "Ada",
          purpose: null,
          sourceNumber: "M-000001",
        },
        startedAt: "2026-10-18T10:00:00.000Z",
        state: "unresolved",
        hadAmbiguousAttempt: true,
        retryMode: "retry",
        lastAttemptAt: null,
        lastFailure: null,
      },
    ]);
    expect(readLedgerPostingIntents("org1")).toMatchObject({
      kind: "pending",
      intents: [{ reversalTarget: null, sourceId: "b".repeat(24) }],
    });
  });

  it("keeps each organisation's reversal separate", async () => {
    await claim();
    expect(readLedgerPostingIntents("org2")).toEqual({ kind: "none" });
    expect(await clearLedgerPostingIntent("org2", KEY)).toBe(true);
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
  });
});

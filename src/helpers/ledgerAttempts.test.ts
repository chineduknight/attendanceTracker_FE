import {
  attemptOutcomeLabel,
  attemptSettlesAt,
  classifyResolveFailure,
  toLedgerAttemptPage,
  toResolveOutcome,
} from "helpers/ledgerAttempts";

const item = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: "key-12345678",
  status: "unresolved",
  latestAttemptAt: "2026-10-18T10:00:00.000Z",
  settlesAt: "2026-10-18T10:02:00.000Z",
  journalId: null,
  void: null,
  attempts: [
    {
      id: "attempt-1",
      sourceType: "cash_receipt",
      actorId: "officer-1",
      startedAt: "2026-10-18T10:00:00.000Z",
      summary: { businessDate: "2026-10-18", amountKobo: 750000, accountIds: ["cash"], counterpartyName: "Ada" },
      outcome: { outcome: "unknown", code: "LEDGER_POSTING_OUTCOME_UNKNOWN", at: "2026-10-18T10:00:01.000Z" },
    },
  ],
  ...overrides,
});

describe("toLedgerAttemptPage", () => {
  it("reads keys, attempts, outcomes and the cursor", () => {
    const page = toLedgerAttemptPage({ items: [item()], nextCursor: "eyJ" });
    expect(page?.nextCursor).toBe("eyJ");
    expect(page?.items[0]).toMatchObject({
      idempotencyKey: "key-12345678",
      status: "unresolved",
      attempts: [
        {
          sourceType: "cash_receipt",
          amountKobo: 750000,
          businessDate: "2026-10-18",
          outcome: { outcome: "unknown", code: "LEDGER_POSTING_OUTCOME_UNKNOWN" },
        },
      ],
    });
  });

  it("keeps a missing outcome as null (unknown) and an unknown status as unknown", () => {
    const page = toLedgerAttemptPage({
      items: [item({ status: "later", attempts: [{ ...item().attempts[0], outcome: null }] })],
      nextCursor: null,
    });
    expect(page?.items[0].status).toBe("unknown");
    expect(page?.items[0].attempts[0].outcome).toBeNull();
    expect(attemptOutcomeLabel(null)).toMatch(/treated as unknown/);
  });

  it("refuses a page with any unusable key rather than hiding it", () => {
    expect(toLedgerAttemptPage({ items: [item(), { status: "unresolved" }], nextCursor: null })).toBeNull();
    expect(toLedgerAttemptPage({ items: [item({ attempts: [{}] })], nextCursor: null })).toBeNull();
    expect(toLedgerAttemptPage({ items: "nope", nextCursor: null })).toBeNull();
    expect(toLedgerAttemptPage({ items: [], nextCursor: 4 })).toBeNull();
  });

  it("uses the server's settlesAt, else two minutes after the latest attempt", () => {
    const page = toLedgerAttemptPage({
      items: [item(), item({ settlesAt: null }), item({ settlesAt: null, latestAttemptAt: null })],
      nextCursor: null,
    });
    expect(page && attemptSettlesAt(page.items[0])?.toISOString()).toBe("2026-10-18T10:02:00.000Z");
    expect(page && attemptSettlesAt(page.items[1])?.toISOString()).toBe("2026-10-18T10:02:00.000Z");
    expect(page && attemptSettlesAt(page.items[2])).toBeNull();
  });
});

describe("toResolveOutcome", () => {
  const journal = { id: "j1", businessDate: "2026-10-18", sourceType: "cash_receipt", totalKobo: 750000, lines: [] };

  it("proves a committed key only with a readable journal", () => {
    expect(toResolveOutcome(200, { data: { outcome: "committed", journal } })).toMatchObject({
      kind: "committed",
      journal: { id: "j1" },
    });
    expect(toResolveOutcome(200, { data: { outcome: "committed", journal: {} } })).toBeNull();
  });

  it("proves a void only when it says whether this request made it", () => {
    expect(
      toResolveOutcome(200, {
        data: { outcome: "voided", voidId: "v1", voidedBy: "officer-1", voidedAt: "2026-10-18T10:05:00.000Z", voidedByThisRequest: false },
      }),
    ).toEqual({
      kind: "voided",
      voidId: "v1",
      voidedBy: "officer-1",
      voidedAt: "2026-10-18T10:05:00.000Z",
      voidedByThisRequest: false,
    });
    expect(toResolveOutcome(200, { data: { outcome: "voided" } })).toBeNull();
  });

  it("proves nothing for any other status or shape", () => {
    expect(toResolveOutcome(201, { data: { outcome: "committed", journal } })).toBeNull();
    expect(toResolveOutcome(200, { data: { outcome: "failed" } })).toBeNull();
    expect(toResolveOutcome(200, null)).toBeNull();
  });
});

describe("classifyResolveFailure", () => {
  const failure = (status: number, code?: string, error?: string) => ({
    response: { status, data: { code, error } },
  });

  it.each([
    [failure(422, "LEDGER_ATTEMPT_TOO_RECENT"), "too-recent", /two minutes/],
    [failure(409, "LEDGER_RESOLVE_CONTENDED"), "contended", /Resolve again with the same key/],
    [failure(503, "LEDGER_RESOLVE_OUTCOME_UNKNOWN"), "outcome-unknown", /Resolve again with the same key/],
    [failure(500), "outcome-unknown", /Resolve again/],
    [new Error("Network Error"), "outcome-unknown", /Resolve again/],
    [failure(503, "LEDGER_INDEXES_NOT_INSTALLED", "Not installed."), "unavailable", /Not installed\. Nothing changed/],
    [failure(403, undefined, "Only the owner can resolve."), "forbidden", /Only the owner/],
    [failure(401), "session", /Sign in again/],
    [failure(422, undefined, "Bad key."), "refused", /Bad key\. Nothing changed/],
  ])("classifies %#", (error, kind, message) => {
    const result = classifyResolveFailure(error);
    expect(result.kind).toBe(kind);
    expect(result.message).toMatch(message);
  });
});

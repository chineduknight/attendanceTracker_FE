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
  const ME = "64f00000000000000000a001";
  const OTHER = "64f00000000000000000a002";
  // As the backend presents them (LedgerAttemptService.resolve).
  const committed = {
    outcome: "committed",
    journal: {
      id: "6512345678901234567890ab",
      businessDate: "2026-10-18",
      reference: null,
      note: null,
      sourceType: "cash_receipt",
      lines: [
        { accountId: "6512345678901234567890a1", side: "debit", amountKobo: 750000 },
        { accountId: "6512345678901234567890a2", side: "credit", amountKobo: 750000 },
      ],
      totalKobo: 750000,
      postedAt: "2026-10-18T10:00:00.120Z",
      postedBy: { id: ME, name: "treasurer1" },
      sourceId: null,
      reversesJournalId: null,
      reversedByJournalId: null,
      entry: { number: "R-000031", method: "cash", counterpartyName: null, externalReference: null, evidenceReference: null },
    },
  };
  const voided = {
    outcome: "voided",
    voidId: "6512345678901234567890cd",
    voidedBy: ME,
    voidedAt: "2026-10-18T10:05:00.000Z",
    voidedByThisRequest: true,
  };
  const answer = (data: unknown, status = 200) => toResolveOutcome(status, { data }, ME);

  it("proves a committed key with a complete journal", () => {
    expect(answer(committed)).toMatchObject({
      kind: "committed",
      journal: { id: committed.journal.id, number: "R-000031", totalKobo: 750000 },
    });
  });

  it.each([
    ["no journal", { outcome: "committed" }],
    ["an empty journal", { outcome: "committed", journal: {} }],
    ["a journal id that isn't an id", { ...committed, journal: { ...committed.journal, id: "j1" } }],
    ["no business date", { ...committed, journal: { ...committed.journal, businessDate: null } }],
    ["no total", { ...committed, journal: { ...committed.journal, totalKobo: "750000" } }],
  ])("treats a committed answer with %s as unproven", (_label, data) => {
    expect(answer(data)).toBeNull();
  });

  it("proves a void made now, and one made earlier by anyone", () => {
    expect(answer(voided)).toEqual({
      kind: "voided",
      voidId: voided.voidId,
      voidedBy: ME,
      voidedAt: voided.voidedAt,
      voidedByThisRequest: true,
    });
    expect(answer({ ...voided, voidedBy: OTHER, voidedByThisRequest: false })).toEqual({
      kind: "voided",
      voidId: voided.voidId,
      voidedBy: OTHER,
      voidedAt: voided.voidedAt,
      voidedByThisRequest: false,
    });
  });

  it.each([
    ["no void id", { ...voided, voidId: undefined }],
    ["a null void id", { ...voided, voidId: null }],
    ["a void id that isn't an id", { ...voided, voidId: "v1" }],
    ["no actor", { ...voided, voidedBy: undefined }],
    ["a blank actor", { ...voided, voidedBy: "  " }],
    ["no time", { ...voided, voidedAt: undefined }],
    ["a time that isn't an instant", { ...voided, voidedAt: "yesterday" }],
    ["a date without a time", { ...voided, voidedAt: "2026-10-18" }],
    ["no voidedByThisRequest", { ...voided, voidedByThisRequest: undefined }],
    ["a string voidedByThisRequest", { ...voided, voidedByThisRequest: "true" }],
    ["a void made now by someone else", { ...voided, voidedBy: OTHER }],
    ["only the outcome", { outcome: "voided" }],
  ])("treats a voided answer with %s as unproven", (_label, data) => {
    expect(answer(data)).toBeNull();
  });

  it("proves nothing for any other status or shape", () => {
    expect(answer(committed, 201)).toBeNull();
    expect(answer(voided, 202)).toBeNull();
    expect(answer({ outcome: "failed" })).toBeNull();
    expect(toResolveOutcome(200, null, ME)).toBeNull();
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

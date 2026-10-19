import {
  PostingSummary,
  ReceiptBody,
} from "components/finance/ledgerPostingTypes";
import {
  beginLedgerPostingIntent,
  clearLedgerPostingIntent,
  isPostingKey,
  ledgerPostingIntentKey,
  markLedgerPostingIntentUnresolved,
  newPostingKey,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
import {
  installPostingLockManager,
  removePostingLockManager,
} from "test-utils/postingLocks";

const BODY: ReceiptBody = {
  idempotencyKey: "key-12345678",
  businessDate: "2026-10-18",
  amountKobo: 2500000,
  toAccountId: "cash",
  incomeAccountId: "income",
  method: "cash",
  counterpartyName: "Ada Obi",
  reference: "R1",
};

const SUMMARY: PostingSummary = {
  operation: "receipt",
  amountKobo: 2500000,
  businessDate: "2026-10-18",
  method: "cash",
  fromAccountName: null,
  toAccountName: "Cash in hand",
  categoryName: "Donations",
};

const NOW = new Date("2026-10-18T10:00:00.000Z");

const begin = (organisationId = "org1", key = "key-12345678") =>
  beginLedgerPostingIntent(
    {
      organisationId,
      officerId: "officer-1",
      key,
      operation: "receipt",
      body: { ...BODY, idempotencyKey: key },
      summary: SUMMARY,
    },
    NOW,
  );

const claimRecord = async (organisationId = "org1", key = "key-12345678") => {
  const result = await begin(organisationId, key);
  if (result.kind !== "claimed") {
    throw new Error(`Expected a claim, got ${result.reason}`);
  }
  return result.record;
};

const pendingIntents = (organisationId = "org1") => {
  const read = readLedgerPostingIntents(organisationId);
  if (read.kind !== "pending") {
    throw new Error(`Expected a pending intent, got ${read.kind}`);
  }
  return read.intents;
};

beforeEach(() => {
  window.localStorage.clear();
  installPostingLockManager();
});

afterEach(() => {
  removePostingLockManager();
});

describe("posting keys", () => {
  it("generates a key the backend accepts", () => {
    const key = newPostingKey();
    expect(isPostingKey(key)).toBe(true);
    expect(key.startsWith("opening:")).toBe(false);
  });

  it("rejects keys that are too short, start wrongly or carry invalid characters", () => {
    expect(isPostingKey("short")).toBe(false);
    expect(isPostingKey("-starts-with-dash")).toBe(false);
    expect(isPostingKey("bad key with spaces")).toBe(false);
    expect(isPostingKey("opening:server-owned")).toBe(false);
    expect(isPostingKey("valid-key")).toBe(true);
    expect(isPostingKey("valid_123")).toBe(true);
    expect(isPostingKey("valid:123")).toBe(true);
  });
});

describe("beginLedgerPostingIntent", () => {
  it("persists the exact body, key, organisation and officer before dispatch", async () => {
    const record = await claimRecord();
    expect(record).toMatchObject({
      organisationId: "org1",
      officerId: "officer-1",
      key: "key-12345678",
      operation: "receipt",
      body: BODY,
      summary: SUMMARY,
      state: "dispatching",
      hadAmbiguousAttempt: false,
      startedAt: NOW.toISOString(),
    });

    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
    expect(pendingIntents()[0].body).toEqual(BODY);
    expect(pendingIntents()[0].key).toBe("key-12345678");
  });

  it("blocks a second intent while one is outstanding", async () => {
    expect(await begin()).toMatchObject({ kind: "claimed" });
    expect(await begin("org1", "key-abcdefgh")).toMatchObject({
      kind: "blocked",
      reason: "existing",
    });
  });

  it("admits only one of two competing tabs and preserves the winning record", async () => {
    const results = await Promise.all([
      begin("org1", "key-aaaaaaaa"),
      begin("org1", "key-bbbbbbbb"),
    ]);
    const claimed = results.find((result) => result.kind === "claimed");
    const blocked = results.find((result) => result.kind === "blocked");
    if (claimed?.kind !== "claimed") throw new Error("no claim was admitted");

    expect(blocked).toMatchObject({ kind: "blocked", reason: "existing" });
    expect(pendingIntents()).toHaveLength(1);
    expect(pendingIntents()[0].key).toBe(claimed.record.key);
    expect(pendingIntents()[0].body.idempotencyKey).toBe(claimed.record.key);
  });

  it("fails closed when the cross-tab lock manager is unavailable", async () => {
    removePostingLockManager();

    expect(await begin()).toMatchObject({
      kind: "blocked",
      reason: "coordination-unavailable",
    });
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
  });

  it("keeps organisations isolated", async () => {
    expect(await begin("org1")).toMatchObject({ kind: "claimed" });
    expect(readLedgerPostingIntents("org2").kind).toBe("none");
    expect(await begin("org2", "key-abcdefgh")).toMatchObject({ kind: "claimed" });
    expect(readLedgerPostingIntents("org1")).toMatchObject({ kind: "pending" });
    expect(readLedgerPostingIntents("org2")).toMatchObject({ kind: "pending" });
  });

  it("refuses an invalid key or missing officer instead of storing a bad record", async () => {
    expect(await begin("org1", "bad key with spaces")).toMatchObject({
      kind: "blocked",
      reason: "invalid",
    });
    expect(
      await beginLedgerPostingIntent({
        organisationId: "org1",
        officerId: "",
        key: "key-12345678",
        operation: "receipt",
        body: BODY,
        summary: SUMMARY,
      }),
    ).toMatchObject({ kind: "blocked", reason: "invalid" });
  });
});

describe("unresolved and ambiguous states", () => {
  it("treats a reloaded dispatching record as ambiguous", async () => {
    await begin();
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
    expect(pendingIntents()[0].hadAmbiguousAttempt).toBe(true);
  });

  it("marks an exact key unresolved and keeps the exact body", async () => {
    const record = await claimRecord();
    expect(
      markLedgerPostingIntentUnresolved(record, {
        ambiguous: true,
        message: "The outcome is unknown.",
        now: NOW,
      }),
    ).toBe(true);

    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
    expect(pendingIntents()[0]).toMatchObject({
      state: "unresolved",
      hadAmbiguousAttempt: true,
      lastFailure: "The outcome is unknown.",
      body: BODY,
    });
  });

  it("does not clear a record when no proof exists (corrupt storage)", () => {
    window.localStorage.setItem(ledgerPostingIntentKey("org1"), "{not json");
    expect(readLedgerPostingIntents("org1").kind).toBe("unknown");
    expect(clearLedgerPostingIntent("org1", "key-12345678")).toBe(false);
    expect(readLedgerPostingIntents("org1").kind).toBe("unknown");
  });

  it("fails closed when storage cannot be read", async () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(readLedgerPostingIntents("org1").kind).toBe("storage-unavailable");
      expect(await begin()).toMatchObject({
        kind: "blocked",
        reason: "storage-unavailable",
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe("clearLedgerPostingIntent", () => {
  it("clears only the matching key", async () => {
    const record = await claimRecord();
    expect(clearLedgerPostingIntent("org1", "another-key")).toBe(true);
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
    expect(pendingIntents()[0].key).toBe(record.key);
    expect(clearLedgerPostingIntent("org1", record.key)).toBe(true);
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
  });
});

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
  holdPostingIntentLock,
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
      await markLedgerPostingIntentUnresolved(record, {
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

  it("does not clear a record when no proof exists (corrupt storage)", async () => {
    window.localStorage.setItem(ledgerPostingIntentKey("org1"), "{not json");
    expect(readLedgerPostingIntents("org1").kind).toBe("unknown");
    expect(await clearLedgerPostingIntent("org1", "key-12345678")).toBe(false);
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
    expect(await clearLedgerPostingIntent("org1", "another-key")).toBe(true);
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
    expect(pendingIntents()[0].key).toBe(record.key);
    expect(await clearLedgerPostingIntent("org1", record.key)).toBe(true);
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
  });
});

describe("two tabs resolving the same key", () => {
  const OLD_KEY = "key-aaaaaaaa";
  const NEW_KEY = "key-bbbbbbbb";

  /** Let every queued microtask and timer callback run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  /**
   * The other tab, inside its own critical section, proves OLD_KEY, clears
   * it and claims NEW_KEY for a different posting.
   */
  const otherTabClearsAndClaims = (
    resolved: Awaited<ReturnType<typeof claimRecord>>,
  ) => {
    window.localStorage.removeItem(ledgerPostingIntentKey("org1"));
    window.localStorage.setItem(
      ledgerPostingIntentKey("org1"),
      JSON.stringify({
        organisationId: "org1",
        intents: [
          {
            ...resolved,
            key: NEW_KEY,
            body: { ...resolved.body, idempotencyKey: NEW_KEY, amountKobo: 990000 },
            summary: { ...resolved.summary, amountKobo: 990000 },
            state: "dispatching",
            hadAmbiguousAttempt: false,
          },
        ],
      }),
    );
  };

  const expectOnlyNewClaim = () => {
    const intents = pendingIntents();
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      key: NEW_KEY,
      state: "dispatching",
      lastFailure: null,
      lastAttemptAt: null,
      body: { idempotencyKey: NEW_KEY, amountKobo: 990000 },
    });
  };

  it("makes a stale clear wait for the lock, then removes nothing but its own key", async () => {
    const resolved = await claimRecord("org1", OLD_KEY);
    const otherTab = await holdPostingIntentLock("org1");

    const staleClear = clearLedgerPostingIntent("org1", OLD_KEY);
    await settle();
    // Nothing is read or removed while the other tab holds the lock.
    expect(pendingIntents()[0].key).toBe(OLD_KEY);

    otherTabClearsAndClaims(resolved);
    await otherTab.release();

    expect(await staleClear).toBe(true);
    expectOnlyNewClaim();
  });

  it("makes a stale unresolved update wait, then neither resurrects nor overwrites", async () => {
    const resolved = await claimRecord("org1", OLD_KEY);
    const otherTab = await holdPostingIntentLock("org1");

    const staleMark = markLedgerPostingIntentUnresolved(resolved, {
      ambiguous: true,
      message: "The outcome is unknown.",
      now: NOW,
    });
    await settle();
    expect(pendingIntents()[0]).toMatchObject({ key: OLD_KEY, state: "dispatching" });

    otherTabClearsAndClaims(resolved);
    await otherTab.release();

    expect(await staleMark).toBe(false);
    expectOnlyNewClaim();
  });

  it.each([
    ["the new claim is queued first", "claim-first"],
    ["the stale responses are queued first", "stale-first"],
  ] as const)(
    "keeps the new claim intact when %s",
    async (_label, order) => {
      const resolved = await claimRecord("org1", OLD_KEY);
      const otherTab = await holdPostingIntentLock("org1");

      const claimNew = () => begin("org1", NEW_KEY);
      const staleClear = () => clearLedgerPostingIntent("org1", OLD_KEY);
      const staleMark = () =>
        markLedgerPostingIntentUnresolved(resolved, {
          ambiguous: false,
          message: "Writes are disabled.",
          now: NOW,
        });

      const pending =
        order === "claim-first"
          ? [claimNew(), staleClear(), staleMark()]
          : [staleMark(), staleClear(), claimNew()];

      // The other tab proves the old key and clears it under its lock.
      window.localStorage.removeItem(ledgerPostingIntentKey("org1"));
      await otherTab.release();

      const [first, second, third] = await Promise.all(pending);
      const [claim, clear, mark] =
        order === "claim-first" ? [first, second, third] : [third, second, first];

      expect(claim).toMatchObject({ kind: "claimed" });
      expect(clear).toBe(true);
      expect(mark).toBe(false);
      const intents = pendingIntents();
      expect(intents).toHaveLength(1);
      expect(intents[0]).toMatchObject({
        key: NEW_KEY,
        lastFailure: null,
        body: { idempotencyKey: NEW_KEY },
      });
    },
  );

  it("does not hold up another organisation's record", async () => {
    await claimRecord("org1", OLD_KEY);
    await claimRecord("org2", OLD_KEY);
    const org1Tab = await holdPostingIntentLock("org1");

    expect(await clearLedgerPostingIntent("org2", OLD_KEY)).toBe(true);
    expect(readLedgerPostingIntents("org2").kind).toBe("none");
    expect(pendingIntents("org1")[0].key).toBe(OLD_KEY);

    await org1Tab.release();
  });

  it("fails closed when the lock manager is unavailable", async () => {
    const record = await claimRecord("org1", OLD_KEY);
    removePostingLockManager();

    expect(await clearLedgerPostingIntent("org1", OLD_KEY)).toBe(false);
    expect(
      await markLedgerPostingIntentUnresolved(record, {
        ambiguous: true,
        message: "The outcome is unknown.",
        now: NOW,
      }),
    ).toBe(false);
    expect(pendingIntents()[0]).toMatchObject({
      key: OLD_KEY,
      state: "dispatching",
      lastFailure: null,
    });
  });

  it("fails closed when storage rejects the write inside the lock", async () => {
    const record = await claimRecord("org1", OLD_KEY);
    const remove = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(await clearLedgerPostingIntent("org1", OLD_KEY)).toBe(false);
      expect(
        await markLedgerPostingIntentUnresolved(record, {
          ambiguous: true,
          message: "The outcome is unknown.",
          now: NOW,
        }),
      ).toBe(false);
    } finally {
      remove.mockRestore();
      set.mockRestore();
    }
    expect(pendingIntents()[0]).toMatchObject({ key: OLD_KEY, state: "dispatching" });
  });
});

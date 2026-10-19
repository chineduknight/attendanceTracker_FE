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

const pendingIntents = (organisationId = "org1") => {
  const read = readLedgerPostingIntents(organisationId);
  if (read.kind !== "pending") {
    throw new Error(`Expected a pending intent, got ${read.kind}`);
  }
  return read.intents;
};

beforeEach(() => {
  window.localStorage.clear();
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
  it("persists the exact body, key, organisation and officer before dispatch", () => {
    const record = begin();
    expect(record).not.toBeNull();
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

  it("blocks a second intent while one is outstanding", () => {
    expect(begin()).not.toBeNull();
    expect(begin("org1", "key-abcdefgh")).toBeNull();
  });

  it("keeps organisations isolated", () => {
    begin("org1");
    expect(readLedgerPostingIntents("org2").kind).toBe("none");
    expect(begin("org2", "key-abcdefgh")).not.toBeNull();
    expect(readLedgerPostingIntents("org1")).toMatchObject({ kind: "pending" });
    expect(readLedgerPostingIntents("org2")).toMatchObject({ kind: "pending" });
  });

  it("refuses an invalid key or missing officer instead of storing a bad record", () => {
    expect(begin("org1", "bad key with spaces")).toBeNull();
    expect(
      beginLedgerPostingIntent({
        organisationId: "org1",
        officerId: "",
        key: "key-12345678",
        operation: "receipt",
        body: BODY,
        summary: SUMMARY,
      }),
    ).toBeNull();
  });
});

describe("unresolved and ambiguous states", () => {
  it("treats a reloaded dispatching record as ambiguous", () => {
    begin();
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
    expect(pendingIntents()[0].hadAmbiguousAttempt).toBe(true);
  });

  it("marks an exact key unresolved and keeps the exact body", () => {
    const record = begin();
    if (!record) throw new Error("record missing");
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

  it("fails closed when storage cannot be read", () => {
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(readLedgerPostingIntents("org1").kind).toBe("storage-unavailable");
      expect(begin()).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("clearLedgerPostingIntent", () => {
  it("clears only the matching key", () => {
    const record = begin();
    if (!record) throw new Error("record missing");
    expect(clearLedgerPostingIntent("org1", "another-key")).toBe(true);
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
    expect(pendingIntents()[0].key).toBe(record.key);
    expect(clearLedgerPostingIntent("org1", record.key)).toBe(true);
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
  });
});

import {
  LEDGER_WRITE_INTENT_PREFIX,
  beginLedgerWriteIntent,
  clearLedgerWriteIntent,
  ledgerWriteIntentGuidance,
  ledgerWriteIntentKey,
  markLedgerWriteIntentUnresolved,
  readLedgerWriteIntent,
  settleLedgerWriteIntent,
  startLedgerWriteIntent,
  subscribeLedgerWriteIntent,
} from "helpers/ledgerWriteIntent";

const AT = new Date("2026-10-18T10:00:00.000Z");

beforeEach(() => {
  window.localStorage.clear();
  jest.restoreAllMocks();
});

describe("opening write intent", () => {
  it("persists an intent before dispatch and reads it as pending after a reload", () => {
    const intent = beginLedgerWriteIntent("org1", "verify-opening", {
      proposalId: "p1",
      fingerprint: "a".repeat(64),
    }, AT);

    expect(intent).not.toBeNull();
    // A reload sees the same intent (still `dispatching`, so outcome unknown).
    expect(readLedgerWriteIntent("org1")).toEqual({
      kind: "pending",
      intent: expect.objectContaining({
        organisationId: "org1",
        action: "verify-opening",
        proposalId: "p1",
        state: "dispatching",
      }),
      // No request of this page sent it, so it needs reconciliation.
      inFlight: false,
    });
    expect(ledgerWriteIntentKey("org1")).toContain(LEDGER_WRITE_INTENT_PREFIX);
  });

  it("refuses a second intent while one is outstanding", () => {
    expect(beginLedgerWriteIntent("org1", "submit-opening")).not.toBeNull();
    expect(beginLedgerWriteIntent("org1", "submit-opening")).toBeNull();
    expect(beginLedgerWriteIntent("org2", "submit-opening")).not.toBeNull();
  });

  it("marks only the exact intent unresolved", () => {
    const first = beginLedgerWriteIntent("org1", "submit-opening");
    expect(first).not.toBeNull();
    const other = { ...first!, intentId: "another" };
    expect(markLedgerWriteIntentUnresolved(other)).toBe(false);
    expect(markLedgerWriteIntentUnresolved(first!)).toBe(true);
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { state: "unresolved" },
    });
  });

  it("clears only the exact intent", () => {
    const intent = beginLedgerWriteIntent("org1", "reject-opening");
    expect(intent).not.toBeNull();
    expect(clearLedgerWriteIntent("org1", "someone-else")).toBe(false);
    expect(readLedgerWriteIntent("org1").kind).toBe("pending");
    expect(clearLedgerWriteIntent("org1", intent!.intentId)).toBe(true);
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
  });

  it("treats a corrupt or foreign marker as unresolved, never as nothing", () => {
    window.localStorage.setItem(ledgerWriteIntentKey("org1"), "not json");
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "unknown" });

    window.localStorage.setItem(
      ledgerWriteIntentKey("org1"),
      JSON.stringify({
        organisationId: "org2",
        intentId: "x",
        action: "verify-opening",
        state: "dispatching",
        startedAt: AT.toISOString(),
      }),
    );
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "unknown" });
  });

  it("does not dispatch when the intent cannot be stored", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(beginLedgerWriteIntent("org1", "submit-opening")).toBeNull();
  });

  it("reports storage as unavailable instead of assuming nothing is outstanding", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "storage-unavailable" });
    expect(beginLedgerWriteIntent("org1", "submit-opening")).toBeNull();
  });

  it("gives reconciliation guidance for every action", () => {
    expect(ledgerWriteIntentGuidance("submit-opening", "correction")).toMatch(/correction/);
    expect(ledgerWriteIntentGuidance("submit-opening", "supplementary")).toMatch(
      /supplementary/,
    );
    expect(ledgerWriteIntentGuidance("verify-opening", null)).toMatch(/activated/);
    expect(ledgerWriteIntentGuidance("reject-opening", null)).toMatch(/rejected/);
    expect(ledgerWriteIntentGuidance("withdraw-opening", null)).toMatch(/withdrawn/);
  });
});

describe("request-owned intent lifecycle", () => {
  it("reads a started intent as in flight until it settles", () => {
    const intent = startLedgerWriteIntent("org1", "suspend-ledger");
    expect(readLedgerWriteIntent("org1")).toMatchObject({ kind: "pending", inFlight: true });
    settleLedgerWriteIntent(intent!, "unknown");
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      inFlight: false,
      intent: { state: "unresolved", intentId: intent!.intentId },
    });
  });

  it.each(["confirmed", "refused"] as const)("clears its own intent when %s", (outcome) => {
    const intent = startLedgerWriteIntent("org1", "set-period-lock");
    settleLedgerWriteIntent(intent!, outcome);
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
  });

  it("latches an unknown outcome even when the marker was cleared mid-flight", () => {
    const intent = startLedgerWriteIntent("org1", "verify-opening");
    window.localStorage.removeItem(ledgerWriteIntentKey("org1"));
    settleLedgerWriteIntent(intent!, "unknown");
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { state: "unresolved", action: "verify-opening" },
    });
  });

  it("never clears or overwrites another intent or an unreadable marker", () => {
    const intent = startLedgerWriteIntent("org1", "submit-opening");
    window.localStorage.removeItem(ledgerWriteIntentKey("org1"));
    const other = beginLedgerWriteIntent("org1", "reject-opening");
    settleLedgerWriteIntent(intent!, "confirmed");
    settleLedgerWriteIntent(intent!, "unknown");
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { intentId: other!.intentId, state: "dispatching" },
    });

    window.localStorage.setItem(ledgerWriteIntentKey("org2"), "{not json");
    const lost = { ...intent!, organisationId: "org2" };
    settleLedgerWriteIntent(lost, "unknown");
    expect(readLedgerWriteIntent("org2")).toEqual({ kind: "unknown" });
  });

  it("settles only the organisation that sent it and notifies listeners", () => {
    const changed: string[] = [];
    const unsubscribe = subscribeLedgerWriteIntent((org) => changed.push(org));
    const a = startLedgerWriteIntent("orgA", "attest-gap-window");
    const b = startLedgerWriteIntent("orgB", "attest-gap-window");
    settleLedgerWriteIntent(a!, "confirmed");
    expect(readLedgerWriteIntent("orgA")).toEqual({ kind: "none" });
    expect(readLedgerWriteIntent("orgB")).toMatchObject({ kind: "pending", inFlight: true });
    settleLedgerWriteIntent(b!, "unknown");
    unsubscribe();
    expect(changed).toEqual(["orgA", "orgB", "orgA", "orgB"]);
  });
});

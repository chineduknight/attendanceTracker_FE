import {
  LEDGER_WRITE_UNCERTAINTY_PREFIX,
  beginLedgerWrite,
  clearLedgerWriteUncertainty,
  ledgerWriteUncertaintyGuidance,
  ledgerWriteUncertaintyKey,
  markLedgerWriteUncertain,
  readLedgerWriteUncertainty,
  settleLedgerWrite,
  subscribeLedgerWriteUncertainty,
} from "helpers/ledgerWriteUncertainty";

const AT = new Date("2026-10-18T10:00:00.000Z");

beforeEach(() => {
  window.localStorage.clear();
});

describe("ledger write uncertainty marker", () => {
  it("scopes the marker to one organisation and round-trips the action", () => {
    markLedgerWriteUncertain("org1", "create-accounts", AT);

    expect(readLedgerWriteUncertainty("org1")).toEqual({
      organisationId: "org1",
      action: "create-accounts",
      at: AT.toISOString(),
      pending: false,
    });
    expect(readLedgerWriteUncertainty("org2")).toBeNull();
    expect(ledgerWriteUncertaintyKey("org1")).toContain(
      LEDGER_WRITE_UNCERTAINTY_PREFIX,
    );
    expect(window.localStorage.getItem(ledgerWriteUncertaintyKey("org1"))).not.toBeNull();
  });

  it("clears only the organisation it is given", () => {
    markLedgerWriteUncertain("org1", "setup", AT);
    markLedgerWriteUncertain("org2", "update-account", AT);

    clearLedgerWriteUncertainty("org1");

    expect(readLedgerWriteUncertainty("org1")).toBeNull();
    expect(readLedgerWriteUncertainty("org2")).not.toBeNull();
  });

  it("keeps a corrupt marker unresolved instead of allowing a retry", () => {
    window.localStorage.setItem(ledgerWriteUncertaintyKey("org1"), "not json");

    expect(readLedgerWriteUncertainty("org1")).toEqual({
      organisationId: "org1",
      action: "unknown",
      at: "",
      pending: false,
    });
  });

  it("keeps a marker copied from another organisation unresolved", () => {
    window.localStorage.setItem(
      ledgerWriteUncertaintyKey("org1"),
      JSON.stringify({ organisationId: "org2", action: "setup", at: AT.toISOString() }),
    );

    expect(readLedgerWriteUncertainty("org1")).toEqual({
      organisationId: "org1",
      action: "unknown",
      at: "",
      pending: false,
    });
  });

  it("reports nothing for an organisation without a marker or id", () => {
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
    expect(readLedgerWriteUncertainty("")).toBeNull();
  });

  it("gives reconciliation guidance for every action", () => {
    for (const action of [
      "setup",
      "member-receipts",
      "create-accounts",
      "update-account",
      "member-allocations",
      "unknown",
    ] as const) {
      expect(ledgerWriteUncertaintyGuidance(action)).toMatch(/Check/);
    }
  });

  it("round-trips the F3A allocation-setting action across a reload", () => {
    markLedgerWriteUncertain("org1", "member-allocations", AT);
    expect(readLedgerWriteUncertainty("org1")).toEqual({
      organisationId: "org1",
      action: "member-allocations",
      at: AT.toISOString(),
      pending: false,
    });
    expect(ledgerWriteUncertaintyGuidance("member-allocations")).toMatch(/allocations are now on or off/);
  });
});

describe("F3A durable write lifecycle (review of FE #140)", () => {
  const stored = (organisationId: string) =>
    JSON.parse(window.localStorage.getItem(ledgerWriteUncertaintyKey(organisationId)) ?? "null");

  it("stores a pending marker before the request and clears it on a confirmed outcome", () => {
    const writeId = beginLedgerWrite("org1", "member-allocations", AT);
    expect(writeId).toEqual(expect.any(String));
    expect(stored("org1")).toEqual({
      organisationId: "org1",
      action: "member-allocations",
      at: AT.toISOString(),
      phase: "pending",
      writeId,
    });
    expect(readLedgerWriteUncertainty("org1")).toEqual({
      organisationId: "org1",
      action: "member-allocations",
      at: AT.toISOString(),
      pending: true,
    });

    settleLedgerWrite("org1", writeId as string, "confirmed");
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("clears it on a refusal that wrote nothing", () => {
    const writeId = beginLedgerWrite("org1", "create-accounts", AT) as string;
    settleLedgerWrite("org1", writeId, "refused");
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("latches an unknown outcome as unresolved, keeping the action and time", () => {
    const writeId = beginLedgerWrite("org1", "update-account", AT) as string;
    settleLedgerWrite("org1", writeId, "unknown");
    expect(readLedgerWriteUncertainty("org1")).toEqual({
      organisationId: "org1",
      action: "update-account",
      at: AT.toISOString(),
      pending: false,
    });
    expect(stored("org1").phase).toBe("uncertain");
  });

  it("reads a pending marker left by a reloaded page as unresolved", () => {
    // What survives a hard reload: the stored marker, not the running request.
    window.localStorage.setItem(
      ledgerWriteUncertaintyKey("org1"),
      JSON.stringify({
        organisationId: "org1",
        action: "member-allocations",
        at: AT.toISOString(),
        phase: "pending",
        writeId: "from-before-the-reload",
      }),
    );
    expect(readLedgerWriteUncertainty("org1")).toEqual({
      organisationId: "org1",
      action: "member-allocations",
      at: AT.toISOString(),
      pending: false,
    });
    // And it blocks a new write: nothing is sent over it.
    expect(beginLedgerWrite("org1", "member-allocations")).toBeNull();
  });

  it("never starts a write over an existing marker, pending or unresolved", () => {
    const first = beginLedgerWrite("org1", "member-allocations") as string;
    expect(beginLedgerWrite("org1", "create-accounts")).toBeNull();
    settleLedgerWrite("org1", first, "unknown");
    expect(beginLedgerWrite("org1", "create-accounts")).toBeNull();
    markLedgerWriteUncertain("org2", "setup");
    expect(beginLedgerWrite("org2", "member-allocations")).toBeNull();
  });

  it("refuses to start when the marker cannot be stored", () => {
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      expect(beginLedgerWrite("org1", "member-allocations")).toBeNull();
    } finally {
      setItem.mockRestore();
    }
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("never clears a marker it did not write", () => {
    const writeId = beginLedgerWrite("org1", "member-allocations") as string;
    // Acknowledged elsewhere and replaced by an F2 latch before this settles.
    markLedgerWriteUncertain("org1", "setup", AT);
    settleLedgerWrite("org1", writeId, "confirmed");
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("setup");
    settleLedgerWrite("org1", writeId, "unknown");
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("setup");
  });

  it("still latches an unknown outcome that arrives after the marker was acknowledged", () => {
    const writeId = beginLedgerWrite("org1", "member-allocations", AT) as string;
    clearLedgerWriteUncertainty("org1");
    settleLedgerWrite("org1", writeId, "unknown");
    expect(readLedgerWriteUncertainty("org1")).toMatchObject({
      action: "member-allocations",
      pending: false,
    });
  });

  it("only ever touches the organisation that sent the write", () => {
    markLedgerWriteUncertain("org2", "create-accounts", AT);
    const writeId = beginLedgerWrite("org1", "member-allocations") as string;
    settleLedgerWrite("org1", writeId, "confirmed");
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
    expect(readLedgerWriteUncertainty("org2")?.action).toBe("create-accounts");
    // A settle naming org2 with org1's write id changes nothing there.
    const other = beginLedgerWrite("org1", "member-allocations") as string;
    settleLedgerWrite("org2", other, "confirmed");
    expect(readLedgerWriteUncertainty("org2")?.action).toBe("create-accounts");
    // org1's marker survives (fail-safe: it can no longer be confirmed here).
    expect(readLedgerWriteUncertainty("org1")).not.toBeNull();
  });

  it("notifies subscribers with the organisation that changed", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeLedgerWriteUncertainty((org) => seen.push(org));
    const writeId = beginLedgerWrite("org1", "member-allocations") as string;
    settleLedgerWrite("org1", writeId, "unknown");
    clearLedgerWriteUncertainty("org1");
    unsubscribe();
    markLedgerWriteUncertain("org1", "setup");
    expect(seen).toEqual(["org1", "org1", "org1"]);
  });
});

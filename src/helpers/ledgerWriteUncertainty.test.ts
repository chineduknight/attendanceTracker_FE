import {
  LEDGER_WRITE_UNCERTAINTY_PREFIX,
  clearLedgerWriteUncertainty,
  ledgerWriteUncertaintyGuidance,
  ledgerWriteUncertaintyKey,
  markLedgerWriteUncertain,
  readLedgerWriteUncertainty,
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
      "unknown",
    ] as const) {
      expect(ledgerWriteUncertaintyGuidance(action)).toMatch(/Check/);
    }
  });
});

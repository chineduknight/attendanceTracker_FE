import { formatKobo } from "helpers/financeConstants";
import {
  isLedgerUnavailable,
  LEDGER_NOT_ACTIVE_NOTE,
  LEDGER_UNKNOWN_STATE_NOTE,
  ledgerReadiness,
  ledgerStateKey,
  ledgerStatusNote,
  toLedgerAccounts,
  toLedgerJournals,
  toLedgerStatus,
} from "helpers/ledger";

describe("formatKobo", () => {
  it("formats integer kobo with kobo only when nonzero", () => {
    expect(formatKobo(125050)).toMatch(/1,250\.50$/);
    expect(formatKobo(600000)).toMatch(/6,000$/);
    expect(formatKobo(1)).toMatch(/0\.01$/);
    expect(formatKobo(0)).toMatch(/0$/);
    expect(formatKobo(-150)).toMatch(/^-.*1\.50$/);
  });

  it("never rounds a value that is not a safe integer kobo amount", () => {
    expect(formatKobo(1250.5)).toBe("Amount unavailable");
    expect(formatKobo(NaN)).toBe("Amount unavailable");
    expect(formatKobo(Number.MAX_SAFE_INTEGER + 1)).toBe("Amount unavailable");
  });
});

describe("ledger parsing", () => {
  it("reads a gated status and refuses to invent boolean flags", () => {
    expect(
      toLedgerStatus({
        state: "not_active",
        currency: "NGN",
        openingBalancesVerified: false,
        postingEnabled: false,
      }),
    ).toEqual({
      state: { kind: "known", state: "not_active" },
      currency: "NGN",
      openingBalancesVerified: false,
      postingEnabled: false,
      contractVersion: null,
      blockers: null,
      openingDate: null,
      lockedThrough: null,
      revision: null,
      memberReceiptsEnabled: null,
      unconfirmedAttempts: null,
      hasPendingProposal: null,
    });

    expect(toLedgerStatus({ state: "active" })).toEqual({
      state: { kind: "known", state: "active" },
      currency: null,
      openingBalancesVerified: false,
      postingEnabled: false,
      contractVersion: null,
      blockers: null,
      openingDate: null,
      lockedThrough: null,
      revision: null,
      memberReceiptsEnabled: null,
      unconfirmedAttempts: null,
      hasPendingProposal: null,
    });

    expect(
      toLedgerStatus({ state: "active", openingBalancesVerified: "true", postingEnabled: 1 }),
    ).toMatchObject({ openingBalancesVerified: false, postingEnabled: false });
  });

  it("rejects a body with no readable state instead of guessing", () => {
    expect(toLedgerStatus({ state: "" })).toBeNull();
    expect(toLedgerStatus({ state: 42 })).toBeNull();
    expect(toLedgerStatus({})).toBeNull();
    expect(toLedgerStatus([])).toBeNull();
    expect(toLedgerStatus(undefined)).toBeNull();
  });

  it("keeps supplied account fields and never invents an active state", () => {
    expect(
      toLedgerAccounts([
        {
          id: "cash",
          name: "Cash at bank",
          class: "asset",
          subtype: "bank",
          currency: "NGN",
          active: true,
        },
        { id: "dues" },
      ]),
    ).toEqual([
      {
        id: "cash",
        name: "Cash at bank",
        class: "asset",
        subtype: "bank",
        currency: "NGN",
        active: true,
      },
      {
        id: "dues",
        name: "Unnamed account",
        class: null,
        subtype: null,
        currency: null,
        active: null,
      },
    ]);
    expect(toLedgerAccounts({ data: [] })).toBeNull();
  });

  it("distinguishes a genuinely empty account list from a malformed one", () => {
    expect(toLedgerAccounts([])).toEqual([]);
    expect(
      toLedgerAccounts([
        { id: "cash", name: "Cash at bank" },
        { name: "No stable id" },
      ]),
    ).toBeNull();
    expect(toLedgerAccounts(["not an account"])).toBeNull();
  });

  it("keeps a malformed journal line visible with unavailable values", () => {
    const journals = toLedgerJournals([
      {
        id: "j1",
        businessDate: "2026-10-12",
        reference: "RCPT-001",
        lines: [
          { accountId: "cash", side: "debit", amountKobo: 125050 },
          { accountId: "dues", side: "sideways", amountKobo: 12.5 },
        ],
      },
    ]);

    expect(journals?.[0].lines).toEqual([
      { accountId: "cash", side: "debit", amountKobo: 125050 },
      { accountId: "dues", side: null, amountKobo: null },
    ]);
    expect(toLedgerJournals({})).toBeNull();
  });

  it("distinguishes a genuinely empty journal list from a malformed one", () => {
    expect(toLedgerJournals([])).toEqual([]);
    expect(
      toLedgerJournals([
        { id: "j1", businessDate: "2026-10-12", reference: "R1", lines: [] },
      ]),
    ).toEqual([
      {
        id: "j1",
        businessDate: "2026-10-12",
        reference: "R1",
        note: null,
        sourceType: null,
        lines: [],
      },
    ]);
    expect(
      toLedgerJournals([{ businessDate: "2026-10-12", lines: [] }]),
    ).toBeNull();
    expect(toLedgerJournals([{ id: "j1", lines: "not an array" }])).toBeNull();
  });

  it("fails closed instead of dropping a malformed line from a journal", () => {
    expect(
      toLedgerJournals([
        {
          id: "j1",
          lines: [
            { accountId: "cash", side: "debit", amountKobo: 125050 },
            "not a line",
          ],
        },
      ]),
    ).toBeNull();
  });

  it("keeps a line object when only its fields are unusable", () => {
    expect(
      toLedgerJournals([{ id: "j1", lines: [{ side: "debit", amountKobo: 5 }] }])?.[0]
        .lines,
    ).toEqual([{ accountId: "", side: "debit", amountKobo: 5 }]);
  });

  it("treats gated and missing endpoints as neutral, but not a server failure", () => {
    expect(isLedgerUnavailable({ response: { status: 401 } })).toBe(true);
    expect(isLedgerUnavailable({ response: { status: 403 } })).toBe(true);
    expect(isLedgerUnavailable({ response: { status: 404 } })).toBe(true);
    expect(isLedgerUnavailable({ response: { status: 501 } })).toBe(true);
    expect(isLedgerUnavailable({ response: { status: 500 } })).toBe(false);
    expect(isLedgerUnavailable(undefined)).toBe(false);
  });
});

/**
 * The approved F2 read shape must be readable without ever upgrading a
 * non-active ledger into a ready one. These tests lock the tolerant-reader
 * side of RFC v0.3 §8.0/§4.9.
 */
describe("ledger F2 read compatibility", () => {
  const F1_STATUS = {
    state: "not_active",
    currency: "NGN",
    openingBalancesVerified: false,
    postingEnabled: false,
  };

  it("accepts an F1 status with no contractVersion and no additive fields", () => {
    const status = toLedgerStatus(F1_STATUS);

    expect(status).not.toBeNull();
    expect(status).toMatchObject({
      state: { kind: "known", state: "not_active" },
      contractVersion: null,
      blockers: null,
      openingDate: null,
      lockedThrough: null,
      revision: null,
      memberReceiptsEnabled: null,
      unconfirmedAttempts: null,
      hasPendingProposal: null,
    });
    expect(ledgerStateKey(status!)).toBe("not_active");
    expect(ledgerReadiness(status!)).toBe("not_ready");
    expect(ledgerStatusNote(status!)).toBe(LEDGER_NOT_ACTIVE_NOTE);
  });

  it.each([
    ["not_active", "not_ready"],
    ["setup", "not_ready"],
    ["pending_verification", "not_ready"],
    ["active", "active"],
    ["suspended", "not_ready"],
  ])("reads the approved state %s as %s", (state, readiness) => {
    const status = toLedgerStatus({ ...F1_STATUS, state, contractVersion: "f2-0.3" });

    expect(status?.state).toEqual({ kind: "known", state });
    expect(ledgerStateKey(status!)).toBe(state);
    expect(ledgerReadiness(status!)).toBe(readiness);
  });

  it("never upgrades a non-active state because posting flags claim otherwise", () => {
    for (const state of ["not_active", "setup", "pending_verification", "suspended"]) {
      const status = toLedgerStatus({
        ...F1_STATUS,
        state,
        openingBalancesVerified: true,
        postingEnabled: true,
        contractVersion: "f2-0.3",
      });

      expect(ledgerReadiness(status!)).toBe("not_ready");
    }
  });

  it("keeps an unrecognised future state as unknown, never active", () => {
    const status = toLedgerStatus({
      ...F1_STATUS,
      state: "frozen_for_review",
      openingBalancesVerified: true,
      postingEnabled: true,
      contractVersion: "f2-9",
    });

    expect(status?.state).toEqual({ kind: "unknown", raw: "frozen_for_review" });
    expect(ledgerStateKey(status!)).toBe("unknown");
    expect(ledgerReadiness(status!)).toBe("unknown");
    expect(ledgerStatusNote(status!)).toBe(LEDGER_UNKNOWN_STATE_NOTE);
  });

  it("reads every additive status field that the server supplied", () => {
    const status = toLedgerStatus({
      state: "active",
      currency: "NGN",
      openingBalancesVerified: true,
      postingEnabled: true,
      blockers: [],
      openingDate: "2026-11-01",
      lockedThrough: "2026-10-31",
      memberReceiptsEnabled: true,
      revision: 7,
      pendingProposal: null,
      unconfirmedAttempts: 0,
      contractVersion: "f2-0.3",
    });

    expect(status).toEqual({
      state: { kind: "known", state: "active" },
      currency: "NGN",
      openingBalancesVerified: true,
      postingEnabled: true,
      contractVersion: "f2-0.3",
      blockers: [],
      openingDate: "2026-11-01",
      lockedThrough: "2026-10-31",
      revision: 7,
      memberReceiptsEnabled: true,
      unconfirmedAttempts: 0,
      hasPendingProposal: false,
    });
  });

  it("never turns a missing or malformed additive field into a default", () => {
    const status = toLedgerStatus({
      ...F1_STATUS,
      contractVersion: 3,
      blockers: ["LEDGER_WRITES_DISABLED", 4],
      openingDate: "2026-02-31",
      lockedThrough: "31/10/2026",
      revision: -1,
      memberReceiptsEnabled: "true",
      unconfirmedAttempts: 1.5,
    });

    expect(status).toMatchObject({
      contractVersion: null,
      blockers: null,
      openingDate: null,
      lockedThrough: null,
      revision: null,
      memberReceiptsEnabled: null,
      unconfirmedAttempts: null,
    });
  });

  it("keeps an explicit empty blocker list distinct from an absent one", () => {
    expect(toLedgerStatus({ ...F1_STATUS, blockers: [] })?.blockers).toEqual([]);
    expect(toLedgerStatus(F1_STATUS)?.blockers).toBeNull();
    expect(toLedgerStatus({ ...F1_STATUS, blockers: [""] })?.blockers).toBeNull();
  });

  it("reports a pending proposal only when the server sent one", () => {
    expect(toLedgerStatus(F1_STATUS)?.hasPendingProposal).toBeNull();
    expect(
      toLedgerStatus({ ...F1_STATUS, pendingProposal: null })?.hasPendingProposal,
    ).toBe(false);
    expect(
      toLedgerStatus({ ...F1_STATUS, pendingProposal: { id: "p1" } })
        ?.hasPendingProposal,
    ).toBe(true);
    // An inner shape this build does not know is not read, but presence is
    // never downgraded to "no proposal".
    expect(
      toLedgerStatus({ ...F1_STATUS, pendingProposal: "p1" })?.hasPendingProposal,
    ).toBeNull();
  });

  it("does not decode an unrequested paged body as an empty list", () => {
    // F1 arrays stay the only requested shape; a paged body is not what this
    // client asked for, so it must not be presented as "no accounts" or
    // "no journals".
    expect(toLedgerAccounts({ items: [], nextCursor: null })).toBeNull();
    expect(toLedgerJournals({ items: [], nextCursor: null })).toBeNull();
    expect(toLedgerAccounts([])).toEqual([]);
    expect(toLedgerJournals([])).toEqual([]);
  });

  it("keeps the F1 gated explanation intact for dues and levy figures", () => {
    expect(LEDGER_NOT_ACTIVE_NOTE).toMatch(
      /Bookkeeping has not been activated for this organisation/,
    );
    expect(LEDGER_NOT_ACTIVE_NOTE).toMatch(/not verified cash receipts/);
    expect(LEDGER_NOT_ACTIVE_NOTE).toMatch(/ledger cash/);
    expect(LEDGER_NOT_ACTIVE_NOTE).toMatch(/opening balances/);
    expect(LEDGER_NOT_ACTIVE_NOTE).toMatch(/income/);
  });
});

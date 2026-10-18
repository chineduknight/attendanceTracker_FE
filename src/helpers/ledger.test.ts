import { formatKobo } from "helpers/financeConstants";
import {
  isLedgerUnavailable,
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
  it("reads a gated status and fails closed on missing boolean flags", () => {
    expect(
      toLedgerStatus({
        state: "not_active",
        currency: "NGN",
        openingBalancesVerified: false,
        postingEnabled: false,
      }),
    ).toEqual({
      state: "not_active",
      currency: "NGN",
      openingBalancesVerified: false,
      postingEnabled: false,
    });

    expect(toLedgerStatus({ state: "active" })).toEqual({
      state: "active",
      currency: null,
      openingBalancesVerified: false,
      postingEnabled: false,
    });

    expect(
      toLedgerStatus({ state: "active", openingBalancesVerified: "true", postingEnabled: 1 }),
    ).toMatchObject({ openingBalancesVerified: false, postingEnabled: false });
  });

  it("rejects unknown states and non-object bodies instead of guessing", () => {
    expect(toLedgerStatus({ state: "setup_in_progress" })).toBeNull();
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

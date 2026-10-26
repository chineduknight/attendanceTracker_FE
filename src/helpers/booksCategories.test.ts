import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  buildCategoryPayload,
  checkCategoryName,
  freeName,
  groupAccounts,
  missingBookkeepingAccounts,
  suggestedCategoryStates,
} from "helpers/booksCategories";

const status = (overrides: Partial<LedgerStatus> = {}): LedgerStatus => ({
  state: { kind: "known", state: "setup" },
  currency: "NGN",
  openingBalancesVerified: false,
  postingEnabled: false,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: null,
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 0,
  memberReceiptsEnabled: false,
  allocationsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "a1",
  name: "Account",
  class: "expense",
  subtype: null,
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

describe("groupAccounts", () => {
  it("splits ordinary categories, money accounts and bookkeeping accounts", () => {
    const groups = groupAccounts([
      account({ id: "i1", name: "Zonal dues", class: "income" }),
      account({ id: "i2", name: "Donations", class: "income" }),
      account({ id: "e1", name: "Transport" }),
      account({ id: "e2", name: "Utilities", active: false }),
      account({ id: "d1", name: "Dues income", class: "income", subtype: "member_dues_income" }),
      account({ id: "c1", name: "Cash in hand", class: "asset", subtype: "cash" }),
      account({ id: "b1", name: "Main bank", class: "asset", subtype: "bank" }),
      account({ id: "b2", name: "Old bank", class: "asset", subtype: "bank", active: false }),
      account({
        id: "q1",
        name: "Opening balance equity",
        class: "equity",
        subtype: "opening_balance_equity",
      }),
    ]);

    expect(groups.income.map((entry) => entry.name)).toEqual(["Donations", "Zonal dues"]);
    expect(groups.expense.map((entry) => entry.name)).toEqual(["Transport"]);
    expect(groups.retiredExpense.map((entry) => entry.name)).toEqual(["Utilities"]);
    expect(groups.cash.map((entry) => entry.name)).toEqual(["Cash in hand"]);
    expect(groups.bank.map((entry) => entry.name)).toEqual(["Main bank"]);
    expect(groups.retiredMoney.map((entry) => entry.name)).toEqual(["Old bank"]);
    // Dues income is never a category; it is bookkeeping (AGENTS.md §17, §36).
    expect(groups.income.map((entry) => entry.name)).not.toContain("Dues income");
    expect(groups.bookkeeping.map((entry) => entry.name)).toEqual([
      "Dues income",
      "Opening balance equity",
    ]);
  });

  it("keeps an unrecognised role visible instead of dropping it", () => {
    const groups = groupAccounts([
      account({ name: "Suspense", class: "asset", subtype: null }),
    ]);
    expect(groups.bookkeeping.map((entry) => entry.name)).toEqual(["Suspense"]);
  });

  it("lists a retired category under its own kind", () => {
    const groups = groupAccounts([
      account({ id: "e1", name: "Transport", active: false }),
      account({ id: "i1", name: "Donations", class: "income", active: false }),
    ]);
    expect(groups.retiredExpense.map((entry) => entry.name)).toEqual(["Transport"]);
    expect(groups.retiredIncome.map((entry) => entry.name)).toEqual(["Donations"]);
    expect(groups.expense).toEqual([]);
    expect(groups.income).toEqual([]);
  });
});

describe("suggestedCategoryStates", () => {
  it("creates every suggestion when nothing matches", () => {
    const states = suggestedCategoryStates([]);
    expect(states.map((state) => state.kind)).toEqual([
      "create",
      "create",
      "create",
      "create",
      "create",
      "create",
    ]);
  });

  it("hides a suggestion an active account already uses", () => {
    const states = suggestedCategoryStates([
      account({ name: "  donations ", class: "income" }),
    ]);
    expect(states.map((state) => state.suggestion.name)).not.toContain("Donations");
  });

  it("offers Restore for a retired category of the same kind", () => {
    const retired = account({ id: "e1", name: "Transport", active: false });
    const states = suggestedCategoryStates([retired]);
    const transport = states.find((state) => state.suggestion.name === "Transport");
    expect(transport).toEqual({
      kind: "restore",
      suggestion: expect.objectContaining({ name: "Transport", kind: "expense" }),
      account: retired,
    });
  });

  it("recreates a suggestion when only a retired account of the other kind has the name", () => {
    const states = suggestedCategoryStates([
      account({ name: "Transport", class: "income", active: false }),
    ]);
    expect(
      states.find((state) => state.suggestion.name === "Transport")?.kind,
    ).toBe("create");
  });

  it("hides a suggestion when an active account of the other kind uses the name", () => {
    const states = suggestedCategoryStates([
      account({ name: "Utilities", class: "income" }),
    ]);
    expect(states.map((state) => state.suggestion.name)).not.toContain("Utilities");
  });
});

describe("freeName", () => {
  it("keeps a free name", () => {
    expect(freeName("Cash in hand", [])).toBe("Cash in hand");
  });

  it("adds (Books) once, then a number", () => {
    const taken = [account({ name: "cash in hand" })];
    expect(freeName("Cash in hand", taken)).toBe("Cash in hand (Books)");
    expect(
      freeName("Cash in hand", [
        ...taken,
        account({ id: "a2", name: "Cash In Hand (books)" }),
      ]),
    ).toBe("Cash in hand (Books 2)");
  });

  it("ignores a retired name, which may be reused", () => {
    expect(freeName("Cash in hand", [account({ name: "Cash in hand", active: false })])).toBe(
      "Cash in hand",
    );
  });
});

describe("missingBookkeepingAccounts", () => {
  const cash = account({ id: "c1", name: "Cash in hand", class: "asset", subtype: "cash" });
  const equity = account({
    id: "q1",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
  });
  const holding = account({
    id: "h1",
    name: "Member money – unallocated",
    class: "liability",
    subtype: "member_receipts_unallocated",
  });

  it("returns nothing when every required account is active", () => {
    expect(
      missingBookkeepingAccounts(status({ memberReceiptsEnabled: true }), [
        cash,
        equity,
        holding,
      ]),
    ).toEqual([]);
  });

  it("returns cash and equity for an empty ledger when setup provides cash", () => {
    expect(missingBookkeepingAccounts(status(), [], { provideCash: true })).toEqual([
      { name: "Cash in hand", class: "asset", subtype: "cash" },
      {
        name: "Opening balance equity",
        class: "equity",
        subtype: "opening_balance_equity",
      },
    ]);
  });

  it("returns the holding account only while member receipts are on", () => {
    expect(
      missingBookkeepingAccounts(status({ memberReceiptsEnabled: true }), [], {
        provideCash: true,
      }),
    ).toEqual([
      { name: "Cash in hand", class: "asset", subtype: "cash" },
      {
        name: "Opening balance equity",
        class: "equity",
        subtype: "opening_balance_equity",
      },
      {
        name: "Member money – unallocated",
        class: "liability",
        subtype: "member_receipts_unallocated",
      },
    ]);
  });

  it("never requires cash unless setup asks for it", () => {
    expect(missingBookkeepingAccounts(status({ memberReceiptsEnabled: true }), [])).toEqual([
      {
        name: "Opening balance equity",
        class: "equity",
        subtype: "opening_balance_equity",
      },
      {
        name: "Member money – unallocated",
        class: "liability",
        subtype: "member_receipts_unallocated",
      },
    ]);
  });

  it("treats a bank-only ledger with retired cash as complete", () => {
    const bank = account({ id: "b1", name: "Main account", class: "asset", subtype: "bank" });
    expect(
      missingBookkeepingAccounts(status({ memberReceiptsEnabled: true }), [
        account({ ...cash, active: false }),
        bank,
        equity,
        holding,
      ]),
    ).toEqual([]);
  });

  it("adds only the holding account when receipts turn on for a bank-only ledger", () => {
    const bank = account({ id: "b1", name: "Main account", class: "asset", subtype: "bank" });
    expect(
      missingBookkeepingAccounts(status({ memberReceiptsEnabled: true }), [
        account({ ...cash, active: false }),
        bank,
        equity,
      ]),
    ).toEqual([
      {
        name: "Member money – unallocated",
        class: "liability",
        subtype: "member_receipts_unallocated",
      },
    ]);
  });

  it("provides a fresh cash account at setup when only a retired one exists", () => {
    const missing = missingBookkeepingAccounts(
      status(),
      [account({ ...cash, active: false }), equity],
      { provideCash: true },
    );
    expect(missing).toEqual([
      { name: "Cash in hand", class: "asset", subtype: "cash" },
    ]);
  });

  it("renames around an active account of another kind, never duplicating it", () => {
    const missing = missingBookkeepingAccounts(
      status(),
      [
        account({ id: "x1", name: "Cash in hand", class: "expense" }),
        account({ id: "x2", name: "Cash In Hand (Books)", class: "income" }),
      ],
      { provideCash: true },
    );
    expect(missing[0]).toEqual({
      name: "Cash in hand (Books 2)",
      class: "asset",
      subtype: "cash",
    });
  });

  it("builds payloads without bank fields", () => {
    for (const payload of missingBookkeepingAccounts(status({ memberReceiptsEnabled: true }), [], {
      provideCash: true,
    })) {
      expect(Object.keys(payload).sort()).toEqual(["class", "name", "subtype"]);
    }
  });
});

describe("checkCategoryName", () => {
  it("refuses an empty name", () => {
    expect(checkCategoryName("   ", "expense", [])).toEqual({
      kind: "issue",
      message: "Enter a name.",
    });
  });

  it("refuses a name over the limit", () => {
    expect(checkCategoryName("x".repeat(81), "expense", [])).toEqual({
      kind: "issue",
      message: "Use 80 characters or fewer.",
    });
  });

  it("refuses an active duplicate, ignoring case and spacing", () => {
    expect(
      checkCategoryName("  fuel   money ", "expense", [
        account({ name: "Fuel Money" }),
      ]),
    ).toEqual({ kind: "issue", message: '"fuel   money" is already in use.' });
  });

  it("offers a retired category of the same kind for restore", () => {
    const retired = account({ id: "e1", name: "Transport", active: false });
    expect(checkCategoryName("transport", "expense", [retired])).toEqual({
      kind: "retired",
      account: retired,
    });
  });

  it("allows a retired account of the other kind to be reused", () => {
    expect(
      checkCategoryName("Transport", "expense", [
        account({ name: "Transport", class: "income", active: false }),
      ]),
    ).toEqual({ kind: "ok", name: "Transport" });
  });

  it("accepts a free name and trims it", () => {
    expect(checkCategoryName("  Fuel  ", "expense", [])).toEqual({
      kind: "ok",
      name: "Fuel",
    });
  });
});

describe("buildCategoryPayload", () => {
  it("sends a name and the kind only", () => {
    expect(buildCategoryPayload("  Fuel ", "expense")).toEqual({
      name: "Fuel",
      class: "expense",
      subtype: null,
    });
  });
});

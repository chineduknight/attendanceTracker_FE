import { LedgerAccount } from "components/finance/ledgerTypes";
import { BalancesReport } from "components/finance/ledgerReportTypes";
import { LedgerPostingIntentRecord } from "helpers/ledgerPostingIntent";
import { attentionItems, balanceTiles, monthToDate } from "helpers/booksOverview";

const account = (
  id: string,
  name: string,
  cls: string,
  subtype: string | null,
  extra: Partial<LedgerAccount> = {},
): LedgerAccount => ({
  id,
  name,
  class: cls,
  subtype,
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: cls === "asset" ? true : null,
  ...extra,
});

const ACCOUNTS = [
  account("cash", "Cash in hand", "asset", "cash"),
  account("bank", "Main bank", "asset", "bank", { openingVerified: false }),
  account("old", "Old bank", "asset", "bank", { active: false }),
  account("held", "Member money", "liability", "member_receipts_unallocated"),
  account("donations", "Donations", "income", null),
];

const report = (overrides: Partial<BalancesReport> = {}): BalancesReport => ({
  asOf: "2026-10-21",
  accounts: [
    { accountId: "cash", balanceState: "known", balanceKobo: 7300000 },
    { accountId: "bank", balanceState: "unknown", balanceKobo: null },
    { accountId: "old", balanceState: "known", balanceKobo: 200000 },
    { accountId: "held", balanceState: "known", balanceKobo: 300000 },
    { accountId: "donations", balanceState: "known", balanceKobo: 1100000 },
  ],
  moneyTotalKobo: null,
  ...overrides,
});

describe("balanceTiles", () => {
  it("tiles active cash and bank accounts and keeps unknown balances unknown", () => {
    const tiles = balanceTiles(report(), ACCOUNTS, true);
    expect(tiles.active).toEqual([
      { accountId: "cash", name: "Cash in hand", type: "Cash", balanceKobo: 7300000, reason: null },
      { accountId: "bank", name: "Main bank", type: "Bank", balanceKobo: null, reason: "Opening not verified" },
    ]);
  });

  it("lists inactive money accounts and says the total includes them", () => {
    const tiles = balanceTiles(report({ moneyTotalKobo: 9500000 }), ACCOUNTS, true);
    expect(tiles.inactive).toEqual([
      { accountId: "old", name: "Old bank", type: "Bank", balanceKobo: 200000, reason: null },
    ]);
    expect(tiles.totalKobo).toBe(9500000);
    expect(tiles.showTotal).toBe(true);
    expect(tiles.totalIncludesInactive).toBe(true);
  });

  it("hides the total with a single money account", () => {
    const tiles = balanceTiles(
      report({ accounts: [{ accountId: "cash", balanceState: "known", balanceKobo: 1 }], moneyTotalKobo: 1 }),
      [ACCOUNTS[0]],
      false,
    );
    expect(tiles.showTotal).toBe(false);
  });

  it("shows held money only when member receipts are on", () => {
    expect(balanceTiles(report(), ACCOUNTS, true).heldKobo).toBe(300000);
    expect(balanceTiles(report(), ACCOUNTS, false).heldKobo).toBeUndefined();
  });

  it("says Not known yet for an unknown balance with a verified opening", () => {
    const tiles = balanceTiles(
      report({ accounts: [{ accountId: "cash", balanceState: "unknown", balanceKobo: null }] }),
      ACCOUNTS,
      false,
    );
    expect(tiles.active[0].reason).toBe("Not known yet");
  });
});

const pending = (operation: LedgerPostingIntentRecord["operation"]) =>
  ({
    operation,
    summary: {
      operation,
      amountKobo: 500000,
      businessDate: "2026-10-21",
      method: "cash",
      fromAccountName: null,
      toAccountName: "Cash in hand",
      categoryName: "Donations",
    },
  }) as unknown as LedgerPostingIntentRecord;

describe("attentionItems", () => {
  const none = { pending: null, pendingSection: null, unconfirmedAttempts: 0, hasPendingProposal: false, blockers: [] };

  it("is empty when nothing needs attention", () => {
    expect(attentionItems(none)).toEqual([]);
  });

  it("sends an unconfirmed cashbook posting to its sheet", () => {
    const [item] = attentionItems({ ...none, pending: pending("expense"), pendingSection: "cashbook" });
    expect(item.text).toMatch(/wasn't confirmed$/);
    expect(item.target).toEqual({ kind: "sheet", sheet: "money-out" });
    expect(attentionItems({ ...none, pending: pending("receipt"), pendingSection: "cashbook" })[0].target).toEqual({
      kind: "sheet",
      sheet: "money-in",
    });
  });

  it("sends member-money and reversal postings to the screen that retries them", () => {
    expect(
      attentionItems({ ...none, pending: pending("member_receipt"), pendingSection: "memberMoney" })[0].target,
    ).toEqual({ kind: "screen", screen: "held" });
    expect(
      attentionItems({ ...none, pending: pending("allocation"), pendingSection: "allocations" })[0].target,
    ).toEqual({ kind: "screen", screen: "held" });
    expect(attentionItems({ ...none, pending: pending("reversal"), pendingSection: "reversals" })[0].target).toEqual({
      kind: "screen",
      screen: "entry",
    });
  });

  it("names unconfirmed attempts, a pending opening and blockers", () => {
    expect(attentionItems({ ...none, unconfirmedAttempts: 1 })).toEqual([
      { id: "attempts", text: "1 save needs checking", target: { kind: "screen", screen: "manage-attempts" } },
    ]);
    expect(attentionItems({ ...none, unconfirmedAttempts: 3 })[0].text).toBe("3 saves need checking");
    expect(attentionItems({ ...none, hasPendingProposal: true })[0]).toEqual({
      id: "opening",
      text: "Opening balances are waiting for verification",
      target: { kind: "screen", screen: "manage-opening" },
    });
    expect(attentionItems({ ...none, blockers: ["X"] })[0]).toEqual({
      id: "blockers",
      text: "Books can't record entries right now",
      target: { kind: "screen", screen: "manage-status" },
    });
  });
});

describe("monthToDate", () => {
  it("runs from the first of the month to today", () => {
    expect(monthToDate("2026-10-21")).toEqual({ from: "2026-10-01", to: "2026-10-21" });
  });
});

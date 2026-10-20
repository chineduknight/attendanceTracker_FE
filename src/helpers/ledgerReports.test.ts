import {
  asOfIssue,
  balanceGroups,
  cashbookAccounts,
  cashbookDays,
  formatReportKobo,
  formatSignedKobo,
  isCashbookAccount,
  reportQuery,
  reportRangeIssue,
  toBalancesReport,
  toCashbookPage,
  toSummaryReport,
} from "helpers/ledgerReports";
import { toLedgerAccounts } from "helpers/ledger";
import { LedgerAccount } from "components/finance/ledgerTypes";

const id = (char: string) => char.repeat(24);
const CASH = { id: id("c"), name: "Cash in hand", class: "asset", subtype: "cash", currency: "NGN", active: true, openingVerified: true };

const journal = (journalId: string, businessDate: string, extra: Record<string, unknown> = {}) => ({
  id: journalId,
  businessDate,
  reference: null,
  note: null,
  sourceType: "cash_receipt",
  lines: [
    { accountId: CASH.id, side: "debit", amountKobo: 5000 },
    { accountId: id("i"), side: "credit", amountKobo: 5000 },
  ],
  totalKobo: 5000,
  postedAt: "2026-11-07T09:00:00.000Z",
  reversesJournalId: null,
  reversedByJournalId: null,
  entry: { number: "R-000001" },
  ...extra,
});

const knownPage = (overrides: Record<string, unknown> = {}) => ({
  account: CASH,
  balanceState: "known",
  balanceBeforeKobo: 1200000,
  items: [
    { journal: journal(id("1"), "2026-11-07"), direction: "in", amountKobo: 5000, runningBalanceKobo: 1205000 },
    { journal: journal(id("2"), "2026-11-07"), direction: "out", amountKobo: 50000, runningBalanceKobo: 1155000 },
  ],
  dayClosings: [{ date: "2026-11-07", closingKobo: 1155000 }],
  nextCursor: null,
  ...overrides,
});

const accounts = (raw: unknown[]): LedgerAccount[] => toLedgerAccounts(raw) as LedgerAccount[];

describe("cashbook accounts", () => {
  const list = accounts([
    CASH,
    { id: id("b"), name: "Bank", class: "asset", subtype: "bank", active: false, openingVerified: false },
    { id: id("i"), name: "Donations", class: "income", subtype: null, active: true },
    { id: id("e"), name: "Hall hire", class: "expense", subtype: null, active: true },
    { id: id("l"), name: "Member money", class: "liability", subtype: "member_receipts_unallocated", active: true },
    { id: id("q"), name: "Opening equity", class: "equity", subtype: "opening_balance_equity", active: true },
    { id: id("x"), name: "Odd asset", class: "asset", subtype: null, active: true },
  ]);

  it("offers only cash and bank accounts, including inactive and unverified ones", () => {
    expect(cashbookAccounts(list).map((account) => account.name)).toEqual(["Cash in hand", "Bank"]);
    expect(list.filter(isCashbookAccount)).toHaveLength(2);
    expect(cashbookAccounts(null)).toEqual([]);
  });
});

describe("toCashbookPage", () => {
  it("reads the server's balances, rows and closings exactly", () => {
    const page = toCashbookPage(knownPage(), CASH.id);
    expect(page).not.toBeNull();
    expect(page?.balanceBeforeKobo).toBe(1200000);
    expect(page?.items.map((item) => [item.direction, item.amountKobo, item.runningBalanceKobo])).toEqual([
      ["in", 5000, 1205000],
      ["out", 50000, 1155000],
    ]);
    expect(page?.dayClosings).toEqual([{ date: "2026-11-07", closingKobo: 1155000 }]);
  });

  it("keeps a genuine ₦0 balance as 0", () => {
    const page = toCashbookPage(knownPage({ balanceBeforeKobo: 0 }), CASH.id);
    expect(page?.balanceBeforeKobo).toBe(0);
    expect(formatReportKobo(page?.balanceBeforeKobo ?? null)).toBe("₦0");
  });

  it("never shows a figure under an unknown balance state, even if one was sent", () => {
    const page = toCashbookPage(
      knownPage({
        balanceState: "unknown",
        balanceBeforeKobo: 0,
        dayClosings: [{ date: "2026-11-07", closingKobo: 0 }],
      }),
      CASH.id,
    );
    expect(page?.balanceState).toBe("unknown");
    expect(page?.balanceBeforeKobo).toBeNull();
    expect(page?.items.every((item) => item.runningBalanceKobo === null)).toBe(true);
    expect(page?.dayClosings[0].closingKobo).toBeNull();
    expect(formatReportKobo(null)).toBe("Unknown");
  });

  it("treats an unrecognised balance state as unknown", () => {
    expect(toCashbookPage(knownPage({ balanceState: "estimated" }), CASH.id)?.balanceBeforeKobo).toBeNull();
  });

  it.each([
    ["a known page missing its opening figure", { balanceBeforeKobo: null }],
    ["a known row missing its running balance", {
      items: [{ journal: journal(id("1"), "2026-11-07"), direction: "in", amountKobo: 5000, runningBalanceKobo: null }],
    }],
    ["a decimal amount", {
      items: [{ journal: journal(id("1"), "2026-11-07"), direction: "in", amountKobo: 50.5, runningBalanceKobo: 1 }],
    }],
    ["a zero amount", {
      items: [{ journal: journal(id("1"), "2026-11-07"), direction: "in", amountKobo: 0, runningBalanceKobo: 1 }],
    }],
    ["an unknown direction", {
      items: [{ journal: journal(id("1"), "2026-11-07"), direction: "sideways", amountKobo: 5, runningBalanceKobo: 1 }],
    }],
    ["a row without a journal", { items: [{ direction: "in", amountKobo: 5, runningBalanceKobo: 1 }] }],
    ["a day on the page with no closing", { dayClosings: [] }],
    ["a malformed closing date", { dayClosings: [{ date: "07/11/2026", closingKobo: 1 }] }],
    ["a non-string cursor", { nextCursor: 42 }],
    ["items that are not a list", { items: null }],
    ["another account", { account: { ...CASH, id: id("z") } }],
  ])("fails closed on %s", (_label, overrides) => {
    expect(toCashbookPage(knownPage(overrides), CASH.id)).toBeNull();
  });

  it("fails closed on a missing body", () => {
    expect(toCashbookPage(undefined, CASH.id)).toBeNull();
    expect(toCashbookPage([], CASH.id)).toBeNull();
  });

  it("groups consecutive rows by day in the server's order with the server's closing", () => {
    const page = toCashbookPage(
      knownPage({
        items: [
          { journal: journal(id("1"), "2026-11-07"), direction: "in", amountKobo: 5000, runningBalanceKobo: 1205000 },
          { journal: journal(id("2"), "2026-11-08"), direction: "out", amountKobo: 5000, runningBalanceKobo: 1200000 },
        ],
        dayClosings: [
          { date: "2026-11-07", closingKobo: 1205000 },
          { date: "2026-11-08", closingKobo: 1100000 },
        ],
      }),
      CASH.id,
    );
    expect(page && cashbookDays(page).map((day) => [day.date, day.items.length, day.closingKobo])).toEqual([
      ["2026-11-07", 1, 1205000],
      // The whole day's closing, not the last visible row's balance.
      ["2026-11-08", 1, 1100000],
    ]);
  });
});

describe("toBalancesReport", () => {
  const balances = (overrides: Record<string, unknown> = {}) => ({
    asOf: "2026-11-10",
    accounts: [
      { accountId: CASH.id, balanceKobo: 1800000, balanceState: "known" },
      { accountId: id("e"), balanceKobo: -2500, balanceState: "known" },
      { accountId: id("b"), balanceKobo: null, balanceState: "unknown" },
    ],
    moneyTotalKobo: 5205050,
    ...overrides,
  });

  it("keeps the server's balances, signs and total", () => {
    const report = toBalancesReport(balances());
    expect(report?.accounts.map((row) => row.balanceKobo)).toEqual([1800000, -2500, null]);
    expect(report?.moneyTotalKobo).toBe(5205050);
  });

  it("keeps a null money total as unknown, never ₦0", () => {
    expect(toBalancesReport(balances({ moneyTotalKobo: null }))?.moneyTotalKobo).toBeNull();
  });

  it("keeps a genuine zero total", () => {
    expect(toBalancesReport(balances({ moneyTotalKobo: 0 }))?.moneyTotalKobo).toBe(0);
  });

  it.each([
    ["a missing total", { moneyTotalKobo: undefined }],
    ["a string total", { moneyTotalKobo: "5205050" }],
    ["a known balance without a figure", { accounts: [{ accountId: CASH.id, balanceKobo: null, balanceState: "known" }] }],
    ["a row without an account id", { accounts: [{ balanceKobo: 1, balanceState: "known" }] }],
    ["a malformed date", { asOf: "10-11-2026" }],
    ["accounts that are not a list", { accounts: {} }],
  ])("fails closed on %s", (_label, overrides) => {
    expect(toBalancesReport(balances(overrides))).toBeNull();
  });

  it("groups by account type without changing any figure", () => {
    const list = accounts([
      CASH,
      { id: id("e"), name: "Hall hire", class: "expense", subtype: null, active: true },
    ]);
    const report = toBalancesReport(balances());
    const groups = report ? balanceGroups(report, list) : [];
    expect(groups.map((group) => [group.key, group.rows.map((row) => row.balance.balanceKobo)])).toEqual([
      ["money", [1800000]],
      ["expense", [-2500]],
      // Not in the account list: shown, never dropped.
      ["other", [null]],
    ]);
  });
});

describe("toSummaryReport", () => {
  const summary = (overrides: Record<string, unknown> = {}) => ({
    from: "2026-11-01",
    to: "2026-11-30",
    summaryState: "known",
    income: {
      totalKobo: 205000,
      categories: [
        { accountId: id("i"), name: "Donations", active: true, amountKobo: 255000 },
        { accountId: id("j"), name: "Old raffle", active: false, amountKobo: -50000 },
      ],
    },
    expense: { totalKobo: 150000, categories: [] },
    netKobo: 55000,
    memberMoney: {
      heldAtStartKobo: 0,
      openingKobo: 150000,
      receivedKobo: 600000,
      refundedKobo: 30000,
      allocatedKobo: 0,
      reversalsKobo: 0,
      otherKobo: 0,
      heldAtEndKobo: 720000,
    },
    ...overrides,
  });

  it("reads income, expenses, net and member money as sent, including negative categories", () => {
    const report = toSummaryReport(summary());
    expect(report?.summaryState).toBe("known");
    if (report?.summaryState !== "known") return;
    expect(report.income.categories.map((category) => category.amountKobo)).toEqual([255000, -50000]);
    expect(report.income.categories[1].active).toBe(false);
    expect(report.netKobo).toBe(55000);
    expect(report.memberMoney?.heldAtEndKobo).toBe(720000);
    expect(report.memberMoney?.allocatedKobo).toBe(0);
  });

  it("drops every figure from an unknown summary", () => {
    expect(toSummaryReport(summary({ summaryState: "unknown" }))).toEqual({
      summaryState: "unknown",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(toSummaryReport(summary({ summaryState: "pending" }))?.summaryState).toBe("unknown");
  });

  it("keeps a missing member money account distinct from a malformed one", () => {
    const none = toSummaryReport(summary({ memberMoney: null }));
    expect(none?.summaryState === "known" && none.memberMoney).toBeNull();
    expect(toSummaryReport(summary({ memberMoney: undefined }))).toBeNull();
  });

  it.each([
    ["member money without allocatedKobo", {
      memberMoney: { heldAtStartKobo: 0, openingKobo: 0, receivedKobo: 0, refundedKobo: 0, reversalsKobo: 0, otherKobo: 0, heldAtEndKobo: 0 },
    }],
    ["a missing net", { netKobo: null }],
    ["a malformed income section", { income: { totalKobo: 1 } }],
    ["a category with a decimal amount", { expense: { totalKobo: 1, categories: [{ accountId: id("e"), amountKobo: 0.5 }] } }],
    ["a missing period", { from: undefined }],
  ])("fails closed on %s", (_label, overrides) => {
    expect(toSummaryReport(summary(overrides))).toBeNull();
  });
});

describe("report parameters and display", () => {
  it("adds only the parameters that are set", () => {
    expect(reportQuery({ from: "", to: "2026-11-30", limit: 50, cursor: "" })).toBe("?to=2026-11-30&limit=50");
    expect(reportQuery({ asOf: "" })).toBe("");
  });

  it("validates a From/To window against today in Lagos", () => {
    expect(reportRangeIssue("", "", "2026-11-10")).toBeNull();
    expect(reportRangeIssue("2026-11-11", "", "2026-11-10")).toMatch(/From date can't be after today/);
    expect(reportRangeIssue("", "2026-11-11", "2026-11-10")).toMatch(/To date can't be after today/);
    expect(reportRangeIssue("2026-11-05", "2026-11-01", "2026-11-10")).toMatch(/after the To date/);
    expect(reportRangeIssue("2026-02-30", "", "2026-11-10")).toMatch(/valid From/);
    expect(asOfIssue("2026-11-11", "2026-11-10")).toMatch(/after today/);
    expect(asOfIssue("", "2026-11-10")).toBeNull();
  });

  it("signs a movement by its direction and keeps a negative figure negative", () => {
    expect(formatSignedKobo("in", 500000)).toBe("+₦5,000");
    expect(formatSignedKobo("out", 300050)).toBe("−₦3,000.50");
    expect(formatReportKobo(-50000)).toBe("-₦500");
  });
});

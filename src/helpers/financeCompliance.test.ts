import {
  CLEAR_WARNING,
  collectionPct,
  defaultObligationId,
  duesPaymentHint,
  filterCounts,
  formatBusinessDate,
  hasArrearsLens,
  matchesStartDateFilter,
  overallStatus,
  quickAmounts,
  standingLabel,
  toFinanceMember,
  todayBusinessDate,
  visibleRows,
} from "helpers/financeCompliance";
import { ComplianceRow, MonthStatus, Obligation } from "components/finance/financeTypes";

const dues: Obligation = { id: "d26", type: "dues", name: "2026 Dues", year: 2026, amountPerMonth: 500 };
const levy: Obligation = { id: "lv", type: "levy", name: "Building", amount: 10000, date: "2026-06-18" };

const grid = (statuses: MonthStatus[]) =>
  Object.fromEntries(statuses.map((s, i) => [String(i + 1), s]));
const twelve = (head: MonthStatus[], rest: MonthStatus) =>
  grid([...head, ...Array(12 - head.length).fill(rest)]);

const duesRow = (over: Partial<ComplianceRow> = {}): ComplianceRow => ({
  memberId: "m",
  name: "Member",
  accountable: true,
  months: twelve(["paid", "paid", "paid"], "unpaid"),
  totalExpected: 6000,
  totalPaid: 1500,
  balance: 4500,
  paidUpToMonth: 3,
  ...over,
});

const notSet = (name: string): ComplianceRow => ({ memberId: name, name, accountable: false });

describe("overallStatus", () => {
  it("prefers the backend's overall status", () => {
    expect(overallStatus(duesRow({ status: "partial" }))).toBe("partial");
  });

  it("falls back to the month grid for older dues responses", () => {
    expect(overallStatus(duesRow())).toBe("partial");
    expect(overallStatus(duesRow({ months: twelve([], "unpaid") }))).toBe("unpaid");
    expect(overallStatus(duesRow({ months: twelve(["not-due"], "paid") }))).toBe("paid");
  });
});

describe("filters, search and sort", () => {
  const rows = [
    duesRow({ memberId: "a", name: "Chidi", status: "partial", balance: 4500 }),
    duesRow({ memberId: "b", name: "Ada", status: "paid", balance: 0, totalPaid: 6000 }),
    duesRow({ memberId: "c", name: "Bola", status: "unpaid", balance: 6000, totalPaid: 0 }),
    notSet("Aaron"),
  ];

  it("counts each chip, keeping members without a start date out of owing/paid", () => {
    expect(filterCounts(rows)).toEqual({ all: 4, behind: 0, owing: 2, paid: 1, "not-set": 1 });
  });

  it("never counts a levy the member is not liable for as owing", () => {
    const notLiable: ComplianceRow = {
      memberId: "x", name: "Late joiner", accountable: true, liable: false,
      expected: 0, paid: 0, balance: 0, status: "not-due",
    };
    expect(filterCounts([notLiable])).toEqual({ all: 1, behind: 0, owing: 0, paid: 0, "not-set": 0 });
  });

  it("searches by name case-insensitively", () => {
    const shown = visibleRows(rows, { search: "  ADA ", filter: "all", sort: "name" });
    expect(shown.map((r) => r.name)).toEqual(["Ada"]);
  });

  it("sorts by amount owing with members without a start date last", () => {
    const shown = visibleRows(rows, { search: "", filter: "all", sort: "owing" });
    expect(shown.map((r) => r.name)).toEqual(["Bola", "Chidi", "Ada", "Aaron"]);
  });

  it("sorts least-paid first", () => {
    const shown = visibleRows(rows, { search: "", filter: "owing", sort: "progress" });
    expect(shown.map((r) => r.name)).toEqual(["Bola", "Chidi"]);
  });
});

describe("standingLabel", () => {
  it("describes dues progress in words", () => {
    expect(standingLabel(duesRow({ status: "partial" }), dues)).toBe("Paid to Mar");
    expect(standingLabel(duesRow({ status: "paid" }), dues)).toBe("Paid in full");
    expect(
      standingLabel(duesRow({ status: "unpaid", paidUpToMonth: 0, totalPaid: 0 }), dues),
    ).toBe("Nothing paid yet");
    expect(standingLabel(notSet("x"), dues)).toBe("No start date");
  });

  it("describes a levy", () => {
    const row: ComplianceRow = { memberId: "m", name: "M", accountable: true, liable: true, status: "partial" };
    expect(standingLabel(row, levy)).toBe("Part paid");
    expect(standingLabel({ ...row, liable: false }, levy)).toBe("Not liable for this levy");
  });
});

describe("quickAmounts", () => {
  it("offers month multiples and the balance for dues, capped at the balance", () => {
    expect(quickAmounts(dues, duesRow())).toEqual([
      { label: "1 month", amount: 500 },
      { label: "3 months", amount: 1500 },
      { label: "Full balance", amount: 4500 },
    ]);
    // Same amount as one month: the clearer "Full balance" label wins.
    expect(quickAmounts(dues, duesRow({ balance: 500 }))).toEqual([
      { label: "Full balance", amount: 500 },
    ]);
  });

  it("offers only the balance for a levy, and nothing when settled", () => {
    const row: ComplianceRow = { memberId: "m", name: "M", accountable: true, balance: 4000 };
    expect(quickAmounts(levy, row)).toEqual([{ label: "Full balance", amount: 4000 }]);
    expect(quickAmounts(levy, { ...row, balance: 0 })).toEqual([]);
  });
});

describe("duesPaymentHint", () => {
  it("states where the payment starts and its monthly worth", () => {
    expect(duesPaymentHint(dues, duesRow(), 500)).toBe("Fills from Apr onwards — 1 month's worth.");
    expect(duesPaymentHint(dues, duesRow(), 1500)).toBe("Fills from Apr onwards — 3 months' worth.");
    expect(duesPaymentHint(dues, duesRow(), 1250)).toBe(
      "Fills from Apr onwards — about 2.5 months' worth.",
    );
  });

  it("starts at a part-paid month", () => {
    const row = duesRow({ months: twelve(["paid", "partial"], "unpaid") });
    expect(duesPaymentHint(dues, row, 500)).toMatch(/^Fills from Feb/);
  });

  it("says nothing without an amount or an unpaid month", () => {
    expect(duesPaymentHint(dues, duesRow(), 0)).toBeNull();
    expect(duesPaymentHint(dues, duesRow({ months: twelve([], "paid") }), 500)).toBeNull();
  });
});

describe("defaultObligationId", () => {
  const today = new Date(2026, 9, 8);
  it("prefers this year's dues, then the latest levy, then the first", () => {
    const old: Obligation = { ...dues, id: "d25", year: 2025 };
    const newerLevy: Obligation = { ...levy, id: "lv2", date: "2026-09-01" };
    expect(defaultObligationId([old, levy, dues], today)).toBe("d26");
    expect(defaultObligationId([old, levy, newerLevy], today)).toBe("lv2");
    expect(defaultObligationId([old], today)).toBe("d25");
    expect(defaultObligationId([], today)).toBe("");
  });
});

describe("collectionPct", () => {
  it("uses the expected total when sent, else collected + outstanding", () => {
    expect(collectionPct({ totalCollected: 300, totalOutstanding: 700 })).toBe(30);
    expect(collectionPct({ totalCollected: 300, totalOutstanding: 700, totalExpected: 600 })).toBe(50);
    expect(collectionPct({ totalCollected: 0, totalOutstanding: 0 })).toBe(0);
  });
});

describe("members and dates", () => {
  it("normalises id/_id and empty start dates", () => {
    expect(toFinanceMember({ _id: "1", name: "Ada", financialStartDate: "" })).toEqual({
      id: "1", name: "Ada", financialStartDate: null,
    });
    expect(toFinanceMember({ id: "2", name: "Bo", financialStartDate: "2026-03-01" }).financialStartDate)
      .toBe("2026-03-01");
  });

  it("filters by start date", () => {
    const missing = { id: "1", name: "A", financialStartDate: null };
    expect(matchesStartDateFilter(missing, "missing")).toBe(true);
    expect(matchesStartDateFilter(missing, "set")).toBe(false);
    expect(matchesStartDateFilter(missing, "all")).toBe(true);
  });

  it("formats business dates without shifting them", () => {
    expect(formatBusinessDate("2026-03-01")).toBe("1 Mar 2026");
    expect(formatBusinessDate("not a date")).toBe("not a date");
  });
});

describe("arrears lens", () => {
  // Paid Jan–Sep at 500/month, viewed in October: 500 behind, 1500 left this year.
  const oneBehind = duesRow({
    memberId: "a", name: "Ada", status: "partial",
    months: twelve(Array(9).fill("paid"), "unpaid"),
    totalPaid: 4500, balance: 1500, paidUpToMonth: 9,
    dueToDate: 5000, arrears: 500, monthsBehind: 1,
  });
  // Paid through October: nothing overdue, but Nov–Dec still to pay.
  const upToDate = duesRow({
    memberId: "b", name: "Bola", status: "partial",
    months: twelve(Array(10).fill("paid"), "unpaid"),
    totalPaid: 5000, balance: 1000, paidUpToMonth: 10,
    dueToDate: 5000, arrears: 0, monthsBehind: 0,
  });

  it("is detected only when the backend sends arrears", () => {
    expect(hasArrearsLens([oneBehind])).toBe(true);
    expect(hasArrearsLens([duesRow()])).toBe(false);
    expect(hasArrearsLens([notSet("x")])).toBe(false);
  });

  it("separates behind from merely not finished", () => {
    expect(filterCounts([oneBehind, upToDate])).toMatchObject({ behind: 1, owing: 2 });
  });

  it("describes standing by what is overdue", () => {
    expect(standingLabel(oneBehind, dues)).toBe("1 month behind");
    expect(standingLabel({ ...oneBehind, monthsBehind: 3 }, dues)).toBe("3 months behind");
    expect(standingLabel(upToDate, dues)).toBe("Up to date · paid to Oct");
  });

  it("describes a levy that is overdue or not yet due", () => {
    const row: ComplianceRow = {
      memberId: "m", name: "M", accountable: true, liable: true, status: "unpaid",
      expected: 10000, paid: 0, balance: 10000, dueToDate: 10000, arrears: 10000,
    };
    expect(standingLabel(row, levy)).toBe("Overdue");
    expect(standingLabel({ ...row, dueToDate: 0, arrears: 0 }, levy)).toBe("Not due yet");
  });

  it("sorts most behind first", () => {
    const shown = visibleRows([upToDate, oneBehind], { search: "", filter: "all", sort: "behind" });
    expect(shown.map((r) => r.name)).toEqual(["Ada", "Bola"]);
  });

  it("offers clearing the arrears as the first quick amount", () => {
    expect(quickAmounts(dues, oneBehind)).toEqual([
      { label: "Clear arrears", amount: 500 },
      { label: "Full balance", amount: 1500 },
    ]);
  });
});

describe("business dates and warnings", () => {
  it("formats today in local time", () => {
    expect(todayBusinessDate(new Date(2026, 9, 8, 23, 30))).toBe("2026-10-08");
  });

  it("warns that clearing a start date clears payments", () => {
    expect(CLEAR_WARNING).toMatch(/recorded payments, on every obligation, will be cleared/);
  });
});

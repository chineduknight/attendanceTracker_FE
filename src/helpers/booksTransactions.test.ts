import { LedgerAccount } from "components/finance/ledgerTypes";
import { toJournalDetail } from "helpers/ledgerReversals";
import { toTransactionRow, typeChips } from "helpers/booksTransactions";

const account = (id: string, name: string, cls: string, subtype: string | null = null): LedgerAccount => ({
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
});

const ACCOUNTS = [
  account("cash", "Cash in hand", "asset", "cash"),
  account("bank", "Main bank", "asset", "bank"),
  account("donations", "Donations", "income"),
  account("ops", "Operating expenses", "expense"),
  account("held", "Member money", "liability", "member_money_unallocated"),
];

const journal = (sourceType: string, debit: string, credit: string, extra: Record<string, unknown> = {}) => {
  const detail = toJournalDetail({
    id: `j-${sourceType}`,
    businessDate: "2026-10-21",
    reference: null,
    note: null,
    sourceType,
    lines: [
      { accountId: debit, side: "debit", amountKobo: 500000 },
      { accountId: credit, side: "credit", amountKobo: 500000 },
    ],
    totalKobo: 500000,
    postedAt: "2026-10-21T10:00:00.000Z",
    postedBy: { id: "u1", name: "Treasurer" },
    sourceId: null,
    reversesJournalId: null,
    reversedByJournalId: null,
    entry: null,
    ...extra,
  });
  if (!detail) throw new Error("fixture did not parse");
  return detail;
};

describe("typeChips", () => {
  it("offers the cashbook types when member money is off", () => {
    expect(typeChips({ memberReceipts: false, allocations: false }).map((chip) => chip.label)).toEqual([
      "All",
      "Money in",
      "Money out",
      "Transfers",
      "Undone",
    ]);
  });

  it("maps every chip to exactly one server sourceType", () => {
    expect(typeChips({ memberReceipts: true, allocations: true })).toEqual([
      { label: "All", sourceType: "" },
      { label: "Money in", sourceType: "cash_receipt" },
      { label: "Money out", sourceType: "cash_expense" },
      { label: "Transfers", sourceType: "cash_transfer" },
      { label: "Undone", sourceType: "reversal" },
      { label: "For members", sourceType: "member_receipt" },
      { label: "Refunds", sourceType: "member_receipt_refund" },
      { label: "Applied", sourceType: "member_money_allocation" },
    ]);
  });
});

describe("toTransactionRow", () => {
  it("describes a receipt by its category, payer and account", () => {
    const row = toTransactionRow(
      journal("cash_receipt", "cash", "donations", {
        entry: { number: "R-000001", method: "cash", counterpartyName: "Ada" },
      }),
      ACCOUNTS,
    );
    expect(row).toEqual({
      id: "j-cash_receipt",
      kind: "in",
      title: "Donations",
      subtitle: "from Ada · Cash in hand",
      amountText: "+₦5,000",
      date: "2026-10-21",
    });
  });

  it("describes an expense by its category, payee and account", () => {
    const row = toTransactionRow(
      journal("cash_expense", "ops", "bank", {
        entry: { number: "E-000001", method: "bank_transfer", counterpartyName: "Tunde" },
      }),
      ACCOUNTS,
    );
    expect(row).toMatchObject({ kind: "out", title: "Operating expenses", subtitle: "to Tunde · Main bank", amountText: "−₦5,000" });
  });

  it("drops parts that are missing", () => {
    const row = toTransactionRow(journal("cash_receipt", "cash", "donations"), ACCOUNTS);
    expect(row.subtitle).toBe("Cash in hand");
  });

  it("shows a transfer from one account to another without a sign", () => {
    const row = toTransactionRow(journal("cash_transfer", "bank", "cash"), ACCOUNTS);
    expect(row).toMatchObject({ kind: "move", title: "Transfer", subtitle: "Cash in hand → Main bank", amountText: "₦5,000" });
  });

  it("names member money as held, never as income", () => {
    const row = toTransactionRow(
      journal("member_receipt", "cash", "held", { entry: { counterpartyName: "Chika" } }),
      ACCOUNTS,
    );
    expect(row).toMatchObject({ kind: "held", title: "Held for a member", subtitle: "from Chika · Cash in hand", amountText: "+₦5,000" });
  });

  it("names refunds, allocations, openings and reversals", () => {
    expect(toTransactionRow(journal("member_receipt_refund", "held", "cash"), ACCOUNTS)).toMatchObject({
      kind: "refund",
      title: "Refund to a member",
      amountText: "−₦5,000",
    });
    expect(
      toTransactionRow(
        journal("member_money_allocation", "held", "donations", { entry: { obligationType: "levy" } }),
        ACCOUNTS,
      ),
    ).toMatchObject({ kind: "applied", title: "Applied to a levy", amountText: "₦5,000" });
    expect(toTransactionRow(journal("opening_balance", "cash", "donations"), ACCOUNTS)).toMatchObject({
      kind: "opening",
      title: "Opening balance",
    });
    expect(toTransactionRow(journal("reversal", "donations", "cash"), ACCOUNTS)).toMatchObject({
      kind: "reversal",
      title: "Undo of an earlier entry",
    });
    expect(toTransactionRow(journal("manual_adjustment", "cash", "donations"), ACCOUNTS)).toMatchObject({
      kind: "other",
      title: "Entry",
    });
  });

  it("shows an unknown total as Unknown, never ₦0", () => {
    const row = toTransactionRow({ ...journal("cash_receipt", "cash", "donations"), totalKobo: null }, ACCOUNTS);
    expect(row.amountText).toBe("Unknown");
  });
});

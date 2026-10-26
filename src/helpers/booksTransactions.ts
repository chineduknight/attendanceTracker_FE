import { LedgerAccount, LedgerJournalLine } from "components/finance/ledgerTypes";
import { formatKobo } from "helpers/financeConstants";
import { JournalDetail } from "helpers/ledgerReversals";
import { UNKNOWN_FIGURE } from "helpers/ledgerReports";

/**
 * Plain-language Books transactions. Filters are sent to the server: the
 * paged journal read filters by one `sourceType` (and account and dates), so
 * a chip never filters an already-loaded page and implies results it hasn't
 * seen.
 */

/** "" means no filter. */
export interface JournalFilters {
  sourceType: string;
  accountId: string;
  from: string;
  to: string;
}

export const EMPTY_JOURNAL_FILTERS: JournalFilters = { sourceType: "", accountId: "", from: "", to: "" };

export interface TypeChip {
  label: string;
  sourceType: string;
}

export const typeChips = ({
  memberReceipts,
  allocations,
}: {
  memberReceipts: boolean;
  allocations: boolean;
}): TypeChip[] => [
  { label: "All", sourceType: "" },
  { label: "Money in", sourceType: "cash_receipt" },
  { label: "Money out", sourceType: "cash_expense" },
  { label: "Transfers", sourceType: "cash_transfer" },
  { label: "Undone", sourceType: "reversal" },
  ...(memberReceipts
    ? [
        { label: "For members", sourceType: "member_receipt" },
        { label: "Refunds", sourceType: "member_receipt_refund" },
      ]
    : []),
  ...(allocations ? [{ label: "Applied", sourceType: "member_money_allocation" }] : []),
];

export type TransactionKind =
  | "in"
  | "out"
  | "move"
  | "held"
  | "refund"
  | "applied"
  | "opening"
  | "reversal"
  | "other";

export interface TransactionRow {
  id: string;
  kind: TransactionKind;
  title: string;
  subtitle: string;
  amountText: string;
  date: string;
}

const accountName = (
  accounts: readonly LedgerAccount[],
  lines: readonly LedgerJournalLine[],
  side: "debit" | "credit",
): string | null => {
  const line = lines.find((entry) => entry.side === side);
  return (line && accounts.find((acc) => acc.id === line.accountId)?.name) ?? null;
};

const joined = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ");

const SIGN: Partial<Record<TransactionKind, string>> = {
  in: "+",
  held: "+",
  out: "−",
  refund: "−",
};

export const toTransactionRow = (
  journal: JournalDetail,
  accounts: readonly LedgerAccount[],
): TransactionRow => {
  const debit = accountName(accounts, journal.lines, "debit");
  const credit = accountName(accounts, journal.lines, "credit");
  const who = journal.counterpartyName;

  const describe = (): Pick<TransactionRow, "kind" | "title" | "subtitle"> => {
    switch (journal.sourceType) {
      case "cash_receipt":
        return { kind: "in", title: credit ?? "Money in", subtitle: joined(who && `from ${who}`, debit) };
      case "cash_expense":
        return { kind: "out", title: debit ?? "Money out", subtitle: joined(who && `to ${who}`, credit) };
      case "cash_transfer":
        return { kind: "move", title: "Transfer", subtitle: `${credit ?? "An account"} → ${debit ?? "an account"}` };
      case "member_receipt":
        return { kind: "held", title: "Held for a member", subtitle: joined(who && `from ${who}`, debit) };
      case "member_receipt_refund":
        return { kind: "refund", title: "Refund to a member", subtitle: joined(credit) };
      case "member_money_allocation":
        return {
          kind: "applied",
          title: journal.obligationType === "levy" ? "Applied to a levy" : "Applied to dues",
          subtitle: "",
        };
      case "opening_balance":
      case "opening_balance_correction":
        return { kind: "opening", title: "Opening balance", subtitle: "" };
      case "reversal":
        return { kind: "reversal", title: "Undo of an earlier entry", subtitle: journal.note ?? "" };
      default:
        return { kind: "other", title: "Entry", subtitle: journal.reference ?? "" };
    }
  };

  const row = describe();
  const amountText =
    journal.totalKobo === null ? UNKNOWN_FIGURE : `${SIGN[row.kind] ?? ""}${formatKobo(journal.totalKobo)}`;
  return { id: journal.id, ...row, amountText, date: journal.businessDate ?? "" };
};

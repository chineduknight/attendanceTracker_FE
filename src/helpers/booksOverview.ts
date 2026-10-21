import { LedgerAccount } from "components/finance/ledgerTypes";
import { BalancesReport } from "components/finance/ledgerReportTypes";
import { PostingOperation, PostingSection } from "components/finance/ledgerPostingTypes";
import { BooksScreen, BooksSheet } from "helpers/booksNavigation";
import { LedgerPostingIntentRecord } from "helpers/ledgerPostingIntent";
import { postingSummaryText } from "helpers/ledgerPostings";

/**
 * What the Books Overview shows. Every figure is the server's: no subtotal,
 * no "available" amount, and an unknown balance stays unknown (never ₦0).
 */

export interface BalanceTile {
  accountId: string;
  name: string;
  type: "Cash" | "Bank";
  balanceKobo: number | null;
  reason: string | null;
}

const isMoneyAccount = (account: LedgerAccount) =>
  account.class === "asset" && (account.subtype === "cash" || account.subtype === "bank");

const isHoldingAccount = (account: LedgerAccount) =>
  account.class === "liability" && account.subtype === "member_receipts_unallocated";

export const balanceTiles = (
  report: BalancesReport,
  accounts: readonly LedgerAccount[],
  memberReceiptsOn: boolean,
) => {
  const balanceOf = (accountId: string) =>
    report.accounts.find((entry) => entry.accountId === accountId);

  const tile = (account: LedgerAccount): BalanceTile => {
    const balanceKobo = balanceOf(account.id)?.balanceKobo ?? null;
    return {
      accountId: account.id,
      name: account.name,
      type: account.subtype === "cash" ? "Cash" : "Bank",
      balanceKobo,
      reason:
        balanceKobo !== null
          ? null
          : account.openingVerified === false
            ? "Opening not verified"
            : "Not known yet",
    };
  };

  const money = accounts.filter(isMoneyAccount);
  const active = money.filter((account) => account.active !== false).map(tile);
  // Inactive accounts the server still reports: the server total counts the
  // ones that were opened, so hiding them would leave the total unexplained.
  const inactive = money
    .filter((account) => account.active === false && balanceOf(account.id))
    .map(tile);

  const holding = accounts.find(isHoldingAccount);
  return {
    active,
    inactive,
    totalKobo: report.moneyTotalKobo,
    showTotal: active.length + inactive.length >= 2,
    totalIncludesInactive: inactive.some((entry) => entry.balanceKobo !== null),
    heldKobo:
      memberReceiptsOn && holding ? balanceOf(holding.id)?.balanceKobo ?? null : undefined,
  };
};

export interface AttentionItem {
  id: string;
  text: string;
  target: { kind: "sheet"; sheet: BooksSheet } | { kind: "screen"; screen: BooksScreen };
}

const CASHBOOK_SHEETS: Partial<Record<PostingOperation, BooksSheet>> = {
  receipt: "money-in",
  expense: "money-out",
  transfer: "transfer",
};

const pendingTarget = (
  record: LedgerPostingIntentRecord,
  section: PostingSection | null,
): AttentionItem["target"] => {
  const sheet = CASHBOOK_SHEETS[record.operation];
  if (section === "cashbook" && sheet) return { kind: "sheet", sheet };
  if (section === "reversals") return { kind: "screen", screen: "entry" };
  if (section === "memberMoney" || section === "allocations") return { kind: "screen", screen: "held" };
  return { kind: "screen", screen: "overview" };
};

export const attentionItems = ({
  pending,
  pendingSection,
  unconfirmedAttempts,
  hasPendingProposal,
  blockers,
}: {
  pending: LedgerPostingIntentRecord | null;
  /** The section that offers the pending posting's retry (`retrySectionFor`). */
  pendingSection: PostingSection | null;
  unconfirmedAttempts: number | null;
  hasPendingProposal: boolean | null;
  blockers: readonly string[];
}): AttentionItem[] => {
  const items: AttentionItem[] = [];
  if (pending) {
    items.push({
      id: "pending",
      text: `${postingSummaryText(pending.summary)} wasn't confirmed`,
      target: pendingTarget(pending, pendingSection),
    });
  }
  if (unconfirmedAttempts) {
    items.push({
      id: "attempts",
      text:
        unconfirmedAttempts === 1
          ? "1 save needs checking"
          : `${unconfirmedAttempts} saves need checking`,
      target: { kind: "screen", screen: "manage-attempts" },
    });
  }
  if (hasPendingProposal === true) {
    items.push({
      id: "opening",
      text: "Opening balances are waiting for verification",
      target: { kind: "screen", screen: "manage-opening" },
    });
  }
  if (blockers.length) {
    items.push({
      id: "blockers",
      text: "Books can't record entries right now",
      target: { kind: "screen", screen: "manage-status" },
    });
  }
  return items;
};

/** Business dates for "This month": the 1st to today, both in Lagos. */
export const monthToDate = (todayLagos: string) => ({
  from: `${todayLagos.slice(0, 7)}-01`,
  to: todayLagos,
});

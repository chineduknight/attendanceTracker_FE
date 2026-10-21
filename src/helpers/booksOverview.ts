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

export type AttentionTarget =
  | { kind: "sheet"; sheet: BooksSheet }
  | { kind: "screen"; screen: BooksScreen; journalId?: string };

export interface AttentionItem {
  id: string;
  text: string;
  /** Why there is no link, or what to do once there. */
  note?: string;
  /** null: nothing in Books can recover it, and `note` says so. */
  target: AttentionTarget | null;
}

/** Which places Books can open for this officer and build. */
export interface PendingReach {
  canManage: boolean;
  /** Money in, Money out and Transfer can open (their retry lives there). */
  sheets: boolean;
  /** Held for members is shown. */
  held: boolean;
  /** Unconfirmed saves is shown. */
  attempts: boolean;
}

const CASHBOOK_SHEETS: Partial<Record<PostingOperation, BooksSheet>> = {
  receipt: "money-in",
  expense: "money-out",
  transfer: "transfer",
};

const NO_MANAGE_NOTE = "Only an officer who can manage finance can retry it.";
const UNSUPPORTED_NOTE = "Books can't retry it here. Don't enter it again; contact support.";

/**
 * Where an unconfirmed posting can be recovered. Every link lands on the
 * screen that offers its retry (or its owner resolution); when none can be
 * reached, the item explains instead of linking to a dead end.
 */
const pendingTarget = (
  record: LedgerPostingIntentRecord,
  section: PostingSection | null,
  reach: PendingReach,
): Pick<AttentionItem, "target" | "note"> => {
  if (!reach.canManage) return { target: null, note: NO_MANAGE_NOTE };
  if (record.retryMode === "owner") {
    return reach.attempts
      ? {
          target: { kind: "screen", screen: "manage-attempts" },
          note: "Resend can't fix it. Resolve it in Unconfirmed saves.",
        }
      : { target: null, note: UNSUPPORTED_NOTE };
  }
  switch (section) {
    case "cashbook":
      // Every cashbook sheet shows the retry, whatever the operation.
      return reach.sheets
        ? { target: { kind: "sheet", sheet: CASHBOOK_SHEETS[record.operation] ?? "money-in" } }
        : { target: null, note: UNSUPPORTED_NOTE };
    case "memberMoney":
    case "allocations":
      return reach.held
        ? { target: { kind: "screen", screen: "held" } }
        : { target: null, note: UNSUPPORTED_NOTE };
    case "reversals": {
      const journalId = record.reversalTarget?.journalId;
      // The Reversals section shows its retry on any open entry.
      return journalId
        ? { target: { kind: "screen", screen: "entry", journalId } }
        : { target: { kind: "screen", screen: "transactions" }, note: "Open any entry to retry it." };
    }
    default:
      return { target: null, note: UNSUPPORTED_NOTE };
  }
};

export const attentionItems = ({
  pending,
  sectionFor,
  reach,
  unconfirmedAttempts,
  hasPendingProposal,
  blockers,
}: {
  pending: readonly LedgerPostingIntentRecord[];
  /** The section that offers a pending posting's retry (`retrySectionFor`). */
  sectionFor: (record: LedgerPostingIntentRecord) => PostingSection | null;
  reach: PendingReach;
  unconfirmedAttempts: number | null;
  hasPendingProposal: boolean | null;
  blockers: readonly string[];
}): AttentionItem[] => {
  const items: AttentionItem[] = pending.map((record) => ({
    id: `pending-${record.key}`,
    text: `${postingSummaryText(record.summary)} wasn't confirmed`,
    ...pendingTarget(record, sectionFor(record), reach),
  }));
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

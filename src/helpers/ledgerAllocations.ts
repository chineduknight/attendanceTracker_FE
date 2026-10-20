/**
 * F3-3 allocation readiness and the position check before an allocation
 * (F3 RFC v0.3 §5.3, O2, O5, O6, O9; backend FRONTEND_API F3-3).
 *
 * Pure helpers. They decide what to OFFER; the server decides what is
 * allowed and checks both caps again when the allocation is saved. Every
 * figure shown here is the server's: the recorded cap is the position's own
 * `unlinkedKobo` (recorded − allocated, floored at 0, as the server reports
 * it), never one the client computes.
 */

import { formatKobo } from "helpers/financeConstants";
import { ledgerWriteReadiness, memberMoneyReadiness, PostingReadiness } from "helpers/ledgerPostings";
import { memberIncomeAccountStates } from "helpers/ledgerSetup";
import { flagExplanation, sameId } from "helpers/ledgerReconciliation";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { PositionsReport, ReconciliationPosition } from "components/finance/ledgerReconciliationTypes";

export const ALLOCATION_NOT_PAYMENT_NOTE =
  "Allocating recognises held member money as dues or levy income. It does not record a payment in Finance and doesn't change anyone's compliance: record the payment in Finance first (or as well).";

/**
 * Everything an allocation needs before a form is offered: ledger write
 * readiness, member receipts with a holding account, the organisation's
 * allocations setting and both member income accounts.
 */
export const allocationReadiness = ({
  status,
  canManage,
  accounts,
}: {
  status: LedgerStatus;
  canManage: boolean;
  accounts: readonly LedgerAccount[] | null;
}): PostingReadiness => {
  const write = ledgerWriteReadiness({
    status,
    canManage,
    forbiddenReason:
      "Only officers with permission to manage finance can allocate member money. You can still view it.",
  });
  if (!write.ready) return write;
  const memberMoney = memberMoneyReadiness({ status, accounts });
  if (!memberMoney.ready) return memberMoney;
  if (status.allocationsEnabled !== true) {
    return {
      ready: false,
      reason:
        status.allocationsEnabled === false
          ? "Member money allocations are turned off for this organisation. A finance manager can turn them on in Bookkeeping setup. Earlier allocations can still be reversed."
          : "The server didn't report whether member money allocations are on, so none can be made.",
    };
  }
  const income = memberIncomeAccountStates(accounts ?? []);
  if (!income.member_dues_income.active || !income.member_levy_income.active) {
    return {
      ready: false,
      reason:
        "An active member dues income account and an active member levy income account are both needed. Add or reactivate them in Bookkeeping setup.",
    };
  }
  return { ready: true, reason: null };
};

/** What the server's current position allows for one member and obligation. */
export type PositionGate =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: string }
  /** Finance has no payment row and nothing is allocated: recorded ₦0. */
  | { kind: "none"; reason: string }
  | { kind: "blocked"; reason: string; position: ReconciliationPosition }
  | { kind: "open"; position: ReconciliationPosition; capKobo: number };

export const NO_PAYMENT_RECORDED_REASON =
  "Finance has no payment recorded for this member on this obligation, so its recorded value is ₦0 and nothing can be allocated to it. Record the payment in Finance first.";

export const positionGate = ({
  report,
  isLoading,
  isError,
  memberId,
  obligationId,
}: {
  report: PositionsReport | null;
  isLoading: boolean;
  isError: boolean;
  memberId: string;
  obligationId: string;
}): PositionGate => {
  if (isLoading) return { kind: "loading" };
  if (isError || !report) {
    return {
      kind: "unavailable",
      reason:
        "This member's current Finance position couldn't be read, so no allocation is offered. Check again in a moment.",
    };
  }
  if (report.items.length === 0) return { kind: "none", reason: NO_PAYMENT_RECORDED_REASON };
  const position = report.items[0];
  if (
    report.items.length > 1 ||
    !sameId(position.memberId, memberId) ||
    !sameId(position.obligationId, obligationId)
  ) {
    return {
      kind: "unavailable",
      reason: "The server's position didn't match this member and obligation, so no allocation is offered.",
    };
  }
  if (position.recordedState === "ambiguous") {
    return { kind: "blocked", reason: flagExplanation("AMBIGUOUS"), position };
  }
  if (position.recordedState === "unknown") {
    return { kind: "blocked", reason: flagExplanation("NEEDS_REVIEW"), position };
  }
  if (position.flags.includes("MEMBER_ARCHIVED") || position.flags.includes("OBLIGATION_ARCHIVED")) {
    return {
      kind: "blocked",
      reason: "This member or obligation is archived or missing, so no new allocation can be made to it.",
      position,
    };
  }
  const cap = position.unlinkedKobo;
  if (cap === null || cap < 1) {
    return {
      kind: "blocked",
      reason: position.flags.includes("OVER_LINKED")
        ? flagExplanation("OVER_LINKED")
        : "Everything Finance records for this position is already linked to allocations, so nothing more can be allocated to it.",
      position,
    };
  }
  return { kind: "open", position, capKobo: cap };
};

/** The recorded cap, in the server's own figures. */
export const allocationCapIssue = (amountKobo: number, gate: PositionGate): string | null => {
  if (gate.kind !== "open") return null;
  if (amountKobo <= gate.capKobo) return null;
  return `Finance records ${formatKobo(gate.position.recordedKobo as number)} for this member on this obligation and ${formatKobo(
    gate.position.allocatedKobo,
  )} is already allocated to it, so at most ${formatKobo(gate.capKobo)} can be allocated.`;
};

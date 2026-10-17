import { ComplianceRow, CorrectionGuard } from "components/finance/financeTypes";

const isRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/**
 * A fresh copy of the row's correction guard, or null when the backend did
 * not send one or sent a malformed one. Null fails closed: no correction
 * goes out without a precondition. Revisions are checked by type, never by
 * truthiness, so a 0 revision survives.
 */
export const correctionGuardOf = (row: ComplianceRow | undefined): CorrectionGuard | null => {
  const guard = row?.correctionGuard as Partial<CorrectionGuard> | undefined;
  if (!guard || typeof guard !== "object") return null;
  const { paymentRowExists, paymentRevision, memberFinanceRevision } = guard;
  if (typeof paymentRowExists !== "boolean" || !isRevision(memberFinanceRevision)) return null;
  if (paymentRevision !== null && !isRevision(paymentRevision)) return null;
  // No payment row has no revision to compare against.
  if (!paymentRowExists && paymentRevision !== null) return null;
  return { paymentRowExists, paymentRevision, memberFinanceRevision };
};

export const sameCorrectionGuard = (a: CorrectionGuard | null, b: CorrectionGuard | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.paymentRowExists === b.paymentRowExists &&
    a.paymentRevision === b.paymentRevision &&
    a.memberFinanceRevision === b.memberFinanceRevision);

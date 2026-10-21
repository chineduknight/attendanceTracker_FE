import { CorrectionGuard } from "components/finance/financeTypes";

interface RecordInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  amount: number;
}
interface DuesCorrectionInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  monthlyPaid: Record<string, number>;
  /** Confirms the correction may overwrite the row's unapplied credit. */
  replaceUnappliedCredit?: boolean;
  /** The guard of the row shown when the correction editor opened. */
  expectedCorrectionGuard: CorrectionGuard;
}
interface LevyCorrectionInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  amountPaid: number;
  replaceUnappliedCredit?: boolean;
  expectedCorrectionGuard: CorrectionGuard;
}

/** Copied field by field so nothing else on the snapshot leaks into the body. */
const guardBody = ({ paymentRowExists, paymentRevision, memberFinanceRevision }: CorrectionGuard) => ({
  paymentRowExists,
  paymentRevision,
  memberFinanceRevision,
});

export function buildRecordPaymentPayload(input: RecordInput) {
  const { organisationId, obligationId, memberId, amount } = input;
  return { organisationId, obligationId, memberId, amount };
}

export function buildDuesCorrectionPayload(input: DuesCorrectionInput) {
  const { organisationId, obligationId, memberId, monthlyPaid, replaceUnappliedCredit, expectedCorrectionGuard } =
    input;
  return {
    organisationId,
    obligationId,
    memberId,
    monthlyPaid,
    expectedCorrectionGuard: guardBody(expectedCorrectionGuard),
    // Sent only when confirmed. It never waives the guard above.
    ...(replaceUnappliedCredit ? { replaceUnappliedCredit: true } : {}),
  };
}

export function buildLevyCorrectionPayload(input: LevyCorrectionInput) {
  const { organisationId, obligationId, memberId, amountPaid, replaceUnappliedCredit, expectedCorrectionGuard } =
    input;
  return {
    organisationId,
    obligationId,
    memberId,
    amountPaid,
    expectedCorrectionGuard: guardBody(expectedCorrectionGuard),
    ...(replaceUnappliedCredit ? { replaceUnappliedCredit: true } : {}),
  };
}

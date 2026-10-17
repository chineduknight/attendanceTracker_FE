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
}
interface LevyCorrectionInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  amountPaid: number;
  replaceUnappliedCredit?: boolean;
}

export function buildRecordPaymentPayload(input: RecordInput) {
  const { organisationId, obligationId, memberId, amount } = input;
  return { organisationId, obligationId, memberId, amount };
}

export function buildDuesCorrectionPayload(input: DuesCorrectionInput) {
  const { organisationId, obligationId, memberId, monthlyPaid, replaceUnappliedCredit } = input;
  return {
    organisationId,
    obligationId,
    memberId,
    monthlyPaid,
    // Sent only when confirmed, so older backends never see the field.
    ...(replaceUnappliedCredit ? { replaceUnappliedCredit: true } : {}),
  };
}

export function buildLevyCorrectionPayload(input: LevyCorrectionInput) {
  const { organisationId, obligationId, memberId, amountPaid, replaceUnappliedCredit } = input;
  return {
    organisationId,
    obligationId,
    memberId,
    amountPaid,
    ...(replaceUnappliedCredit ? { replaceUnappliedCredit: true } : {}),
  };
}

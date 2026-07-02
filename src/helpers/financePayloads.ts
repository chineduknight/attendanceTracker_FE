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
}
interface LevyCorrectionInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  amountPaid: number;
}

export function buildRecordPaymentPayload(input: RecordInput) {
  const { organisationId, obligationId, memberId, amount } = input;
  return { organisationId, obligationId, memberId, amount };
}

export function buildDuesCorrectionPayload(input: DuesCorrectionInput) {
  const { organisationId, obligationId, memberId, monthlyPaid } = input;
  return { organisationId, obligationId, memberId, monthlyPaid };
}

export function buildLevyCorrectionPayload(input: LevyCorrectionInput) {
  const { organisationId, obligationId, memberId, amountPaid } = input;
  return { organisationId, obligationId, memberId, amountPaid };
}

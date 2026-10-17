import {
  buildRecordPaymentPayload,
  buildDuesCorrectionPayload,
  buildLevyCorrectionPayload,
} from "helpers/financePayloads";
import { formatMoney, statusMeta } from "helpers/financeConstants";
import type { MonthStatus } from "components/finance/financeTypes";

describe("finance payload builders", () => {
  const base = { organisationId: "org1", obligationId: "ob1", memberId: "m1" };
  const guard = { paymentRowExists: true, paymentRevision: 2, memberFinanceRevision: 5 };

  it("builds a record-payment payload without a correction guard", () => {
    expect(buildRecordPaymentPayload({ ...base, amount: 1500 })).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      amount: 1500,
    });
  });

  it("builds a dues correction payload with a monthlyPaid map and the expected guard", () => {
    expect(
      buildDuesCorrectionPayload({ ...base, monthlyPaid: { "1": 500, "2": 500 }, expectedCorrectionGuard: guard })
    ).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      monthlyPaid: { "1": 500, "2": 500 },
      expectedCorrectionGuard: guard,
    });
  });

  it("builds a levy correction payload with amountPaid and the expected guard", () => {
    expect(buildLevyCorrectionPayload({ ...base, amountPaid: 10000, expectedCorrectionGuard: guard })).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      amountPaid: 10000,
      expectedCorrectionGuard: guard,
    });
  });

  it("adds replaceUnappliedCredit only when confirmed, always alongside the guard", () => {
    const monthlyPaid = { "7": 1000 };
    const input = { ...base, monthlyPaid, expectedCorrectionGuard: guard };
    expect(buildDuesCorrectionPayload({ ...input, replaceUnappliedCredit: false })).not.toHaveProperty(
      "replaceUnappliedCredit",
    );
    expect(buildDuesCorrectionPayload({ ...input, replaceUnappliedCredit: true })).toEqual({
      ...input,
      replaceUnappliedCredit: true,
    });
    expect(
      buildLevyCorrectionPayload({ ...base, amountPaid: 0, replaceUnappliedCredit: true, expectedCorrectionGuard: guard }),
    ).toEqual({ ...base, amountPaid: 0, replaceUnappliedCredit: true, expectedCorrectionGuard: guard });
  });

  it("keeps no-row, legacy-row and zero revisions distinct and copies only the guard fields", () => {
    const sent = (expectedCorrectionGuard: object) =>
      buildLevyCorrectionPayload({
        ...base,
        amountPaid: 1,
        expectedCorrectionGuard: expectedCorrectionGuard as never,
      }).expectedCorrectionGuard;
    expect(sent({ paymentRowExists: false, paymentRevision: null, memberFinanceRevision: 0 })).toEqual({
      paymentRowExists: false,
      paymentRevision: null,
      memberFinanceRevision: 0,
    });
    expect(sent({ paymentRowExists: true, paymentRevision: null, memberFinanceRevision: 0 })).toEqual({
      paymentRowExists: true,
      paymentRevision: null,
      memberFinanceRevision: 0,
    });
    expect(sent({ paymentRowExists: true, paymentRevision: 0, memberFinanceRevision: 0, extra: "x" })).toEqual({
      paymentRowExists: true,
      paymentRevision: 0,
      memberFinanceRevision: 0,
    });
  });
});

describe("statusMeta", () => {
  it("labels and colours each status, falling back to not-due", () => {
    expect(statusMeta("paid")).toEqual({ label: "Paid", scheme: "green" });
    expect(statusMeta("partial")).toEqual({ label: "Part paid", scheme: "orange" });
    expect(statusMeta("unpaid")).toEqual({ label: "Unpaid", scheme: "red" });
    expect(statusMeta("not-due")).toEqual({ label: "Not due", scheme: "gray" });
    expect(statusMeta("unknown")).toEqual({ label: "Unknown", scheme: "yellow" });
    expect(statusMeta("mystery" as MonthStatus)).toEqual({ label: "Not due", scheme: "gray" });
  });
});

describe("formatMoney", () => {
  it("drops kobo on whole amounts but keeps it when present", () => {
    expect(formatMoney(751000)).toMatch(/751,000$/);
    expect(formatMoney(1250.5)).toMatch(/1,250\.50$/);
    expect(formatMoney(0)).toMatch(/0$/);
  });
});

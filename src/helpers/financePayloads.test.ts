import {
  buildRecordPaymentPayload,
  buildDuesCorrectionPayload,
  buildLevyCorrectionPayload,
} from "helpers/financePayloads";
import { statusMeta } from "helpers/financeConstants";
import type { MonthStatus } from "components/finance/financeTypes";

describe("finance payload builders", () => {
  const base = { organisationId: "org1", obligationId: "ob1", memberId: "m1" };

  it("builds a record-payment payload", () => {
    expect(buildRecordPaymentPayload({ ...base, amount: 1500 })).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      amount: 1500,
    });
  });

  it("builds a dues correction payload with a monthlyPaid map", () => {
    expect(
      buildDuesCorrectionPayload({ ...base, monthlyPaid: { "1": 500, "2": 500 } })
    ).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      monthlyPaid: { "1": 500, "2": 500 },
    });
  });

  it("builds a levy correction payload with amountPaid", () => {
    expect(buildLevyCorrectionPayload({ ...base, amountPaid: 10000 })).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      amountPaid: 10000,
    });
  });
});

describe("statusMeta", () => {
  it("labels and colours each status, falling back to not-due", () => {
    expect(statusMeta("paid")).toEqual({ label: "Paid", scheme: "green" });
    expect(statusMeta("partial")).toEqual({ label: "Part paid", scheme: "orange" });
    expect(statusMeta("unpaid")).toEqual({ label: "Unpaid", scheme: "red" });
    expect(statusMeta("not-due")).toEqual({ label: "Not due", scheme: "gray" });
    expect(statusMeta("unknown" as MonthStatus)).toEqual({ label: "Not due", scheme: "gray" });
  });
});

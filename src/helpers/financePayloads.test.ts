import {
  buildRecordPaymentPayload,
  buildDuesCorrectionPayload,
  buildLevyCorrectionPayload,
} from "helpers/financePayloads";
import { monthStatusColor } from "helpers/financeConstants";
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

describe("monthStatusColor", () => {
  it("maps each status to a distinct color and falls back for unknown", () => {
    expect(monthStatusColor("paid")).toBe("green.100");
    expect(monthStatusColor("partial")).toBe("yellow.100");
    expect(monthStatusColor("unpaid")).toBe("red.100");
    expect(monthStatusColor("not-due")).toBe("gray.100");
    expect(monthStatusColor("unknown" as MonthStatus)).toBe("gray.100");
  });
});

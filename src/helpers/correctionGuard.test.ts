import { correctionGuardOf, sameCorrectionGuard } from "helpers/correctionGuard";
import { ComplianceRow } from "components/finance/financeTypes";

const row = (correctionGuard?: unknown): ComplianceRow =>
  ({ memberId: "m1", name: "Ada", accountable: true, correctionGuard }) as ComplianceRow;

describe("correctionGuardOf", () => {
  it("returns a copy of a well-formed guard, keeping zero revisions", () => {
    const guard = { paymentRowExists: true, paymentRevision: 0, memberFinanceRevision: 0 };
    const copy = correctionGuardOf(row(guard));
    expect(copy).toEqual(guard);
    expect(copy).not.toBe(guard);
  });

  it("accepts no payment row and a legacy row without a revision as distinct guards", () => {
    expect(correctionGuardOf(row({ paymentRowExists: false, paymentRevision: null, memberFinanceRevision: 3 })))
      .toEqual({ paymentRowExists: false, paymentRevision: null, memberFinanceRevision: 3 });
    expect(correctionGuardOf(row({ paymentRowExists: true, paymentRevision: null, memberFinanceRevision: 3 })))
      .toEqual({ paymentRowExists: true, paymentRevision: null, memberFinanceRevision: 3 });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["no member revision", { paymentRowExists: true, paymentRevision: 1 }],
    ["null member revision", { paymentRowExists: true, paymentRevision: 1, memberFinanceRevision: null }],
    ["string revision", { paymentRowExists: true, paymentRevision: "1", memberFinanceRevision: 0 }],
    ["negative revision", { paymentRowExists: true, paymentRevision: -1, memberFinanceRevision: 0 }],
    ["fractional revision", { paymentRowExists: true, paymentRevision: 1.5, memberFinanceRevision: 0 }],
    ["no row but a revision", { paymentRowExists: false, paymentRevision: 0, memberFinanceRevision: 0 }],
    ["non-boolean row flag", { paymentRowExists: 1, paymentRevision: 0, memberFinanceRevision: 0 }],
  ])("fails closed on a %s guard", (_, guard) => {
    expect(correctionGuardOf(row(guard))).toBeNull();
  });
});

describe("sameCorrectionGuard", () => {
  const a = { paymentRowExists: true, paymentRevision: 2, memberFinanceRevision: 5 };
  it("compares by value", () => {
    expect(sameCorrectionGuard(a, { ...a })).toBe(true);
    expect(sameCorrectionGuard(a, { ...a, paymentRevision: 3 })).toBe(false);
    expect(sameCorrectionGuard(a, { ...a, memberFinanceRevision: 6 })).toBe(false);
    expect(sameCorrectionGuard(a, { ...a, paymentRevision: null })).toBe(false);
    expect(sameCorrectionGuard(null, null)).toBe(true);
    expect(sameCorrectionGuard(a, null)).toBe(false);
  });
});

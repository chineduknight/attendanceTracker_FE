import { caretAfter, formatAmount, significantBefore, toRawAmount } from "helpers/amount";

describe("amount helpers", () => {
  it("formats thousands while keeping the raw value plain", () => {
    expect(formatAmount("6000")).toBe("6,000");
    expect(formatAmount("1234567.5")).toBe("1,234,567.5");
    expect(formatAmount("999")).toBe("999");
    expect(formatAmount("")).toBe("");
  });

  it("keeps a trailing decimal point while typing", () => {
    expect(toRawAmount("6,000.")).toBe("6000.");
    expect(formatAmount("6000.")).toBe("6,000.");
  });

  it("strips separators, letters and extra points, and caps decimals", () => {
    expect(toRawAmount("6,000")).toBe("6000");
    expect(toRawAmount("₦1,2a3.4.5")).toBe("123.45");
    expect(toRawAmount("10.999")).toBe("10.99");
    expect(toRawAmount("10.9", 0)).toBe("10");
  });

  it("drops leading zeros but keeps zero itself", () => {
    expect(toRawAmount("007")).toBe("7");
    expect(toRawAmount("0")).toBe("0");
    expect(toRawAmount("0.5")).toBe("0.5");
    expect(formatAmount(".5")).toBe("0.5");
  });

  it("keeps the caret after the same digit when separators appear", () => {
    // Typing the 4th zero at the end of "600" + "0" -> "6,000": caret at end.
    expect(caretAfter("6,000", significantBefore("6000", 4))).toBe(5);
    // Inserting "5" after the "1" in "1,000" -> "15000" -> "15,000".
    expect(caretAfter("15,000", significantBefore("15,000", 2))).toBe(2);
    expect(caretAfter("6,000", 0)).toBe(0);
  });
});

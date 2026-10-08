import {
  DEFAULT_WELFARE_REVIEW_WINDOW_DAYS,
  effectiveWelfareSettings,
  parseWelfareReviewWindow,
  welfareReviewWindowError,
} from "helpers/welfareSettings";

describe("welfare settings", () => {
  it("reads a legacy organisation with no stored welfare settings as the default 14", () => {
    expect(DEFAULT_WELFARE_REVIEW_WINDOW_DAYS).toBe(14);
    expect(effectiveWelfareSettings(undefined)).toEqual({ reviewWindowDays: 14 });
    expect(effectiveWelfareSettings(null)).toEqual({ reviewWindowDays: 14 });
    expect(effectiveWelfareSettings({})).toEqual({ reviewWindowDays: 14 });
    expect(effectiveWelfareSettings({ welfareSettings: null })).toEqual({
      reviewWindowDays: 14,
    });
  });

  it("reads stored values across the accepted range", () => {
    [7, 14, 30, 90].forEach((reviewWindowDays) => {
      expect(
        effectiveWelfareSettings({ welfareSettings: { reviewWindowDays } }),
      ).toEqual({ reviewWindowDays });
    });
  });

  it("falls back to the default for out-of-range or non-integer stored values", () => {
    [6, 91, 13.5, NaN, "30" as unknown as number].forEach((reviewWindowDays) => {
      expect(
        effectiveWelfareSettings({ welfareSettings: { reviewWindowDays } }),
      ).toEqual({ reviewWindowDays: 14 });
    });
  });

  it("never hands out a shared object", () => {
    const settings = effectiveWelfareSettings(undefined);
    settings.reviewWindowDays = 90;
    expect(effectiveWelfareSettings(undefined).reviewWindowDays).toBe(14);
  });

  it("validates the raw form input: blank uses the default, otherwise integer 7–90", () => {
    expect(welfareReviewWindowError("")).toBeNull();
    expect(welfareReviewWindowError("  ")).toBeNull();
    expect(welfareReviewWindowError("7")).toBeNull();
    expect(welfareReviewWindowError("14")).toBeNull();
    expect(welfareReviewWindowError("90")).toBeNull();
    expect(welfareReviewWindowError("6")).toMatch(/between 7 and 90/);
    expect(welfareReviewWindowError("91")).toMatch(/between 7 and 90/);
    expect(welfareReviewWindowError("13.5")).toBe("Must be a whole number");
    expect(welfareReviewWindowError("abc")).toBe("Must be a whole number");
  });

  it("maps a validated input to the number to send (blank = default)", () => {
    expect(parseWelfareReviewWindow("")).toBe(14);
    expect(parseWelfareReviewWindow("  ")).toBe(14);
    expect(parseWelfareReviewWindow(" 7 ")).toBe(7);
    expect(parseWelfareReviewWindow("30")).toBe(30);
  });
});

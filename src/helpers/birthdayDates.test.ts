import {
  formatBirthdayForRange,
  formatBirthdayRangeDate,
  getBirthdayDateInRange,
  parseBirthdayValue,
} from "./birthdayDates";

describe("birthday date helpers", () => {
  it("formats birthday weekdays using the selected range year", () => {
    expect(
      formatBirthdayForRange("1990-09-04", "2026-09-01", "2026-09-30")
    ).toBe("Fri, 04 Sep");
  });

  it("uses the matching year when the selected range crosses years", () => {
    const birthday = getBirthdayDateInRange(
      "1990-01-03",
      "2025-12-20",
      "2026-01-10"
    );

    expect(birthday?.getFullYear()).toBe(2026);
    expect(
      formatBirthdayForRange("1990-01-03", "2025-12-20", "2026-01-10")
    ).toBe("Sat, 03 Jan");
  });

  it("keeps invalid values as display fallbacks", () => {
    expect(parseBirthdayValue("not-a-date")).toBeNull();
    expect(
      formatBirthdayForRange("not-a-date", "2026-09-01", "2026-09-30")
    ).toBe("not-a-date");
  });

  it("includes the year in share range labels", () => {
    expect(formatBirthdayRangeDate("2026-09-01")).toBe("01-Sep-2026");
  });
});

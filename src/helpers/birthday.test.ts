import {
  birthdayDisplayDate,
  birthdayMonthDay,
  birthdayOccurrenceDate,
  birthdayOccurrenceInRange,
  birthdayRangeForPreset,
  birthdayRelativeLabel,
  birthdayShareHeader,
  formatBirthdayRangeDate,
  formatBirthdayShareRangeDate,
  localBusinessDate,
  parseLegacyDob,
} from "helpers/birthday";

const AS_OF = "2026-10-07";
const WEEK = { fromDate: "2026-10-07", toDate: "2026-10-14" };
const RANGE_30 = { fromDate: "2026-10-07", toDate: "2026-11-06" };

describe("birthday occurrence resolution", () => {
  it("prefers birthdayOccurrence metadata over the legacy dob", () => {
    const member = {
      name: "Ada",
      dob: "Mon, 13 October",
      birthdayOccurrence: {
        month: 10,
        day: 9,
        occurrenceDate: "2026-10-09",
      },
    };
    expect(birthdayOccurrenceDate(member)).toBe("2026-10-09");
    expect(birthdayOccurrenceInRange(member, WEEK)).toBe("2026-10-09");
  });

  it("treats metadata with an invalid occurrenceDate as absent", () => {
    const member = {
      dob: "1990-10-13",
      birthdayOccurrence: { month: 10, day: 13, occurrenceDate: "not-a-date" },
    };
    expect(birthdayOccurrenceDate(member)).toBeNull();
    // Falls back to the legacy month/day anchored to the range.
    expect(birthdayOccurrenceInRange(member, WEEK)).toBe("2026-10-13");
  });

  it("parses the legacy display string even when its weekday belongs to another year", () => {
    expect(birthdayOccurrenceInRange({ dob: "Mon, 13 October" }, WEEK)).toBe(
      "2026-10-13",
    );
    expect(birthdayOccurrenceInRange({ dob: "1990-10-13" }, WEEK)).toBe(
      "2026-10-13",
    );
  });

  it("wraps December → January with the actual occurrence year", () => {
    const wrap = { fromDate: "2026-12-28", toDate: "2027-01-05" };
    expect(birthdayOccurrenceInRange({ dob: "Dec 30" }, wrap)).toBe(
      "2026-12-30",
    );
    expect(birthdayOccurrenceInRange({ dob: "Jan 3" }, wrap)).toBe("2027-01-03");
    expect(birthdayDisplayDate("2027-01-03")).toBe("Sun, 3 Jan");
    expect(birthdayRelativeLabel("2026-12-30", "2026-12-28")).toBe("In 2 days");
  });

  it("keeps Feb 29 strict: only leap years have an occurrence", () => {
    expect(
      birthdayOccurrenceInRange(
        { dob: "Feb 29" },
        { fromDate: "2026-02-01", toDate: "2026-03-05" },
      ),
    ).toBeNull();
    expect(
      birthdayOccurrenceInRange(
        { dob: "Feb 29" },
        { fromDate: "2028-02-01", toDate: "2028-03-05" },
      ),
    ).toBe("2028-02-29");
  });

  it("returns null for malformed values without crashing", () => {
    expect(parseLegacyDob("not a date")).toBeNull();
    expect(parseLegacyDob("")).toBeNull();
    expect(parseLegacyDob(null)).toBeNull();
    expect(birthdayMonthDay("??")).toBeNull();
    expect(birthdayOccurrenceInRange({ dob: "??" }, WEEK)).toBeNull();
    expect(birthdayOccurrenceInRange({}, WEEK)).toBeNull();
    expect(birthdayRelativeLabel("garbage", AS_OF)).toBeNull();
    expect(birthdayDisplayDate("garbage")).toBe("garbage");
  });
});

describe("birthday relative labels", () => {
  it("labels Today, Tomorrow and In N days", () => {
    expect(birthdayRelativeLabel("2026-10-07", AS_OF)).toBe("Today");
    expect(birthdayRelativeLabel("2026-10-08", AS_OF)).toBe("Tomorrow");
    expect(birthdayRelativeLabel("2026-10-13", AS_OF)).toBe("In 6 days");
  });

  it("has no label for past occurrences", () => {
    expect(birthdayRelativeLabel("2026-10-06", AS_OF)).toBeNull();
  });

  it("shows a date with weekday but never age, birth year or 'turning'", () => {
    const label = birthdayDisplayDate("2026-10-13");
    expect(label).toBe("Tue, 13 Oct");
    expect(label).not.toMatch(/\d{4}/);
    expect(label).not.toMatch(/age|turning|year/i);
  });
});

describe("birthdayRangeForPreset", () => {
  it("returns full-date ranges with Next 7/30 including today", () => {
    expect(birthdayRangeForPreset("today", AS_OF)).toEqual({
      fromDate: "2026-10-07",
      toDate: "2026-10-07",
    });
    expect(birthdayRangeForPreset("next7", AS_OF)).toEqual({
      fromDate: "2026-10-07",
      toDate: "2026-10-14",
    });
    expect(birthdayRangeForPreset("next30", AS_OF)).toEqual(RANGE_30);
  });

  it("wraps year boundaries", () => {
    expect(birthdayRangeForPreset("next30", "2026-12-31")).toEqual({
      fromDate: "2026-12-31",
      toDate: "2027-01-30",
    });
  });

  it("covers calendar months for This Month, Next Month and 3 Months", () => {
    expect(birthdayRangeForPreset("thisMonth", AS_OF)).toEqual({
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
    });
    expect(birthdayRangeForPreset("nextMonth", AS_OF)).toEqual({
      fromDate: "2026-11-01",
      toDate: "2026-11-30",
    });
    expect(birthdayRangeForPreset("threeMonths", AS_OF)).toEqual({
      fromDate: "2026-10-01",
      toDate: "2027-01-31",
    });
  });

  it("defaults the anchor to the local business date", () => {
    expect(localBusinessDate(new Date("2026-10-07T15:00:00Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("shared birthday text", () => {
  it("puts the year in the share header for a same-year range", () => {
    expect(birthdayShareHeader({ fromDate: "2026-09-01", toDate: "2026-09-30" })).toBe(
      "🎂 Birthdays (1 Sep 2026 to 30 Sep 2026)",
    );
  });

  it("shows both years when the range crosses into a new year", () => {
    expect(birthdayShareHeader({ fromDate: "2026-12-28", toDate: "2027-01-05" })).toBe(
      "🎂 Birthdays (28 Dec 2026 to 5 Jan 2027)",
    );
  });

  it("keeps the on-screen range label compact, without the year", () => {
    expect(formatBirthdayRangeDate("2026-09-01")).toBe("1 Sep");
    expect(formatBirthdayShareRangeDate("2026-09-01")).toBe("1 Sep 2026");
  });

  it("falls back to the stored value when a date can't be parsed", () => {
    expect(formatBirthdayShareRangeDate("not-a-date")).toBe("not-a-date");
  });

  it("takes a shared row's weekday from the occurrence in the range, across years", () => {
    const range = { fromDate: "2026-12-28", toDate: "2027-01-05" };
    const occurrence = birthdayOccurrenceInRange({ dob: "1990-01-03" }, range);
    expect(occurrence).toBe("2027-01-03");
    expect(birthdayDisplayDate(occurrence as string)).toBe("Sun, 3 Jan");
  });
});

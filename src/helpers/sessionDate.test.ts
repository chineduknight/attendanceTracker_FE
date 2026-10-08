import { formatSessionDate, parseSessionDate } from "helpers/sessionDate";

describe("session dates", () => {
  it("keeps the stored calendar day whatever the device timezone", () => {
    // UTC midnight would be the previous evening west of UTC; the calendar
    // part is what the officer recorded.
    expect(formatSessionDate("2026-09-01T00:00:00.000Z")).toBe("Tue 01 Sep 26");
    expect(formatSessionDate("2026-09-01")).toBe("Tue 01 Sep 26");
    expect(parseSessionDate("2026-09-01T00:00:00.000Z")?.getDate()).toBe(1);
  });

  it("returns nothing for missing or invalid values", () => {
    expect(formatSessionDate(undefined)).toBe("");
    expect(formatSessionDate("not a date")).toBe("");
    expect(parseSessionDate("2026-13-45")).toBeNull();
  });

  it("supports other display patterns", () => {
    expect(formatSessionDate("2026-09-01", "dd/MM/yyyy")).toBe("01/09/2026");
  });
});

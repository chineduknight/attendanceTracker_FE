import { formatRangeLabel, DATE_PRESETS } from "components/analytics/useDateRange";

describe("useDateRange helpers", () => {
  it("formats a same-year range without repeating the year on the start", () => {
    expect(formatRangeLabel("2026-01-05", "2026-06-30")).toBe("Jan 5 – Jun 30, 2026");
  });

  it("shows both years for a cross-year range", () => {
    expect(formatRangeLabel("2025-12-20", "2026-01-10")).toBe("Dec 20, 2025 – Jan 10, 2026");
  });

  it("exposes the five presets", () => {
    expect(DATE_PRESETS.map((p) => p.label)).toEqual([
      "This Month", "Last Month", "This Quarter", "Last Quarter", "This Year",
    ]);
  });
});

import {
  readAnalyticsParams,
  sameSearch,
  writeAnalyticsParams,
} from "components/analytics/analyticsSearchParams";
import { presetFor } from "components/analytics/useDateRange";

const TODAY = new Date(2026, 9, 17); // Oct 17, 2026
const read = (search: string) =>
  readAnalyticsParams(new URLSearchParams(search), TODAY);

describe("readAnalyticsParams", () => {
  it("defaults a bare address to this month, all statuses, no view", () => {
    expect(read("")).toEqual({
      fromDate: "2026-10-01",
      toDate: "2026-10-31",
      statuses: [],
      view: null,
      q: "",
      member: null,
    });
  });

  it("reads a full address", () => {
    expect(
      read("fromDate=2026-09-01&toDate=2026-09-30&status=active,alumni&view=grid&q=bo&member=m2")
    ).toEqual({
      fromDate: "2026-09-01",
      toDate: "2026-09-30",
      statuses: ["active", "alumni"],
      view: "grid",
      q: "bo",
      member: "m2",
    });
  });

  it.each([
    ["only one date", "fromDate=2026-09-01"],
    ["From after To", "fromDate=2026-09-30&toDate=2026-09-01"],
    ["not a business date", "fromDate=2026-9-1&toDate=2026-09-30"],
    ["an impossible date", "fromDate=2026-02-31&toDate=2026-03-01"],
  ])("replaces a range with %s by this month", (_, search) => {
    expect(read(search)).toMatchObject({ fromDate: "2026-10-01", toDate: "2026-10-31" });
  });

  it("ignores an unknown view", () => {
    expect(read("view=table").view).toBeNull();
  });
});

describe("writeAnalyticsParams", () => {
  it("round-trips and leaves out empty fields", () => {
    const state = read("fromDate=2026-09-01&toDate=2026-09-30&status=active");
    expect(writeAnalyticsParams(state).toString()).toBe(
      "fromDate=2026-09-01&toDate=2026-09-30&status=active"
    );
    const full = read("fromDate=2026-09-01&toDate=2026-09-30&view=list&q=a+b&member=m1");
    expect(read(writeAnalyticsParams(full).toString())).toEqual(full);
  });
});

describe("sameSearch", () => {
  it("compares range and statuses only", () => {
    const a = { fromDate: "2026-09-01", toDate: "2026-09-30", statuses: ["active"] };
    expect(sameSearch(a, { ...a })).toBe(true);
    expect(sameSearch(a, { ...a, statuses: [] })).toBe(false);
    expect(sameSearch(a, { ...a, toDate: "2026-09-29" })).toBe(false);
  });
});

describe("presetFor", () => {
  it("names the preset matching a range exactly", () => {
    expect(presetFor("2026-10-01", "2026-10-31", TODAY)).toBe("This Month");
    expect(presetFor("2026-07-01", "2026-09-30", TODAY)).toBe("Last Quarter");
    expect(presetFor("2026-10-02", "2026-10-31", TODAY)).toBeNull();
    expect(presetFor("", "", TODAY)).toBeNull();
  });
});

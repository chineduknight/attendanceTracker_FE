import { getStatusMeta, STATUS_META } from "components/analytics/statusMeta";

describe("getStatusMeta", () => {
  it("returns the meta for a known status", () => {
    expect(getStatusMeta("present")).toEqual(STATUS_META.present);
    expect(getStatusMeta("apology").full).toBe("Apology");
  });

  it("falls back to the empty meta for unknown/undefined status", () => {
    expect(getStatusMeta(undefined).short).toBe("-");
    expect(getStatusMeta("bogus").full).toBe("No record");
  });
});

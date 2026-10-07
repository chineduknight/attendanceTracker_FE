import { isManualEntry, splitStoredRoster } from "helpers/storedRoster";

const entry = (
  memberId: string,
  name: string | null,
  manuallyAdded?: boolean
) => ({
  memberId,
  member: name === null ? null : { name },
  attendanceStatus: "present",
  ...(manuallyAdded === undefined ? {} : { manuallyAdded }),
});

describe("splitStoredRoster", () => {
  it("counts expected, manual and whole-roster entries separately", () => {
    const result = splitStoredRoster([
      entry("m1", "Ada"),
      entry("m2", "Bola", false),
      entry("m3", "Chioma", true),
      entry("m4", null),
      entry("m5", null, true),
    ]);
    expect(result.expectedCount).toBe(3);
    expect(result.manualCount).toBe(2);
    expect(result.rosterCount).toBe(5);
    expect(result.resolved.map((e) => e.memberId)).toEqual(["m1", "m2", "m3"]);
  });

  it("keeps an unresolved manual entry identified as manual", () => {
    const { unresolved } = splitStoredRoster([
      entry("m4", null),
      entry("m5", null, true),
    ]);
    expect(unresolved).toEqual([
      { memberId: "m4", attendanceStatus: "present", manuallyAdded: false },
      { memberId: "m5", attendanceStatus: "present", manuallyAdded: true },
    ]);
  });

  it("treats missing provenance as expected", () => {
    expect(isManualEntry({})).toBe(false);
    expect(isManualEntry({ manuallyAdded: false })).toBe(false);
    expect(isManualEntry({ manuallyAdded: true })).toBe(true);
  });
});

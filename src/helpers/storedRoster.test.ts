import {
  hasUnsavedStatusChanges,
  isManualEntry,
  mergeStoredRoster,
  splitStoredRoster,
  unresolvedMemberLabel,
} from "helpers/storedRoster";

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

describe("unresolvedMemberLabel", () => {
  it("is a neutral placeholder in the organisation's own term", () => {
    expect(unresolvedMemberLabel("Member")).toBe(
      "Former member (profile unavailable)",
    );
    expect(unresolvedMemberLabel("Student")).toBe(
      "Former student (profile unavailable)",
    );
  });
});

describe("mergeStoredRoster", () => {
  const row = (id: string, attendanceStatus: string) => ({ id, name: id, attendanceStatus });

  it("keeps unsaved statuses and follows the server for who is on the roster", () => {
    const editing = [row("ada", "late"), row("bola", "present"), row("chi", "present")];
    // Chi was just removed and Dayo just added on the server.
    const stored = [row("ada", "absent"), row("bola", "present"), row("dayo", "present")];
    expect(mergeStoredRoster(editing, stored)).toEqual([
      row("ada", "late"),
      row("bola", "present"),
      row("dayo", "present"),
    ]);
  });
});

describe("hasUnsavedStatusChanges", () => {
  const stored = [
    { memberId: "ada", attendanceStatus: "present" },
    { memberId: "bola", attendanceStatus: "absent" },
  ];

  it("is false while every status matches the stored record", () => {
    expect(
      hasUnsavedStatusChanges(
        [
          { id: "ada", attendanceStatus: "present" },
          { id: "bola", attendanceStatus: "absent" },
        ],
        stored,
      ),
    ).toBe(false);
  });

  it("is true once a status differs, ignoring rows the record does not have yet", () => {
    expect(
      hasUnsavedStatusChanges([{ id: "ada", attendanceStatus: "late" }], stored),
    ).toBe(true);
    expect(
      hasUnsavedStatusChanges([{ id: "new", attendanceStatus: "late" }], stored),
    ).toBe(false);
  });
});

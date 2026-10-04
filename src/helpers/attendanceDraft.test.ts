import { reconcileAttendanceDraft } from "helpers/attendanceDraft";

const roster = [
  { id: "m1", name: "Ada" },
  { id: "m2", name: "Bola" },
  { id: "m3", name: "Chidi" },
];

describe("reconcileAttendanceDraft", () => {
  it("keeps saved statuses for members still on the roster", () => {
    const result = reconcileAttendanceDraft(
      [
        { id: "m1", name: "Ada", attendanceStatus: "present" },
        { id: "m2", name: "Bola", attendanceStatus: "apology" },
      ],
      roster
    );

    expect(result).toEqual([
      { id: "m1", name: "Ada", attendanceStatus: "present" },
      { id: "m2", name: "Bola", attendanceStatus: "apology" },
      { id: "m3", name: "Chidi", attendanceStatus: "absent" },
    ]);
  });

  it("drops draft members who are no longer on the roster", () => {
    const result = reconcileAttendanceDraft(
      [
        { id: "deleted", name: "Gone", attendanceStatus: "present" },
        { id: "m1", name: "Ada", attendanceStatus: "present" },
      ],
      roster
    );

    expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("ignores a stale draft name and uses the fresh roster name", () => {
    const result = reconcileAttendanceDraft(
      [{ id: "m1", name: "Old Name", attendanceStatus: "present" }],
      roster
    );

    expect(result[0]).toEqual({
      id: "m1",
      name: "Ada",
      attendanceStatus: "present",
    });
  });

  it("defaults everyone when no usable draft exists", () => {
    const expected = roster.map((member) => ({
      ...member,
      attendanceStatus: "absent",
    }));

    expect(reconcileAttendanceDraft(null, roster)).toEqual(expected);
    expect(reconcileAttendanceDraft(undefined, roster)).toEqual(expected);
    expect(reconcileAttendanceDraft({ not: "an array" }, roster)).toEqual(
      expected
    );
    expect(reconcileAttendanceDraft([], roster)).toEqual(expected);
  });

  it("ignores malformed draft entries and unknown statuses", () => {
    const result = reconcileAttendanceDraft(
      [
        null,
        { id: "m1" },
        { id: "m2", attendanceStatus: "unknown" },
        { name: "No id", attendanceStatus: "present" },
        { id: "m3", attendanceStatus: "present" },
      ],
      roster
    );

    expect(result).toEqual([
      { id: "m1", name: "Ada", attendanceStatus: "absent" },
      { id: "m2", name: "Bola", attendanceStatus: "absent" },
      { id: "m3", name: "Chidi", attendanceStatus: "present" },
    ]);
  });

  it("honours a custom default status", () => {
    const result = reconcileAttendanceDraft([], roster, "present");
    expect(result.every((m) => m.attendanceStatus === "present")).toBe(true);
  });
});

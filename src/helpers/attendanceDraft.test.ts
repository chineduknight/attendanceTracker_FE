import { reconcileAttendanceDraft } from "helpers/attendanceDraft";
import { createStatusConfig } from "helpers/attendanceStatuses";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";

const roster = [
  { id: "m1", name: "Ada" },
  { id: "m2", name: "Bola" },
  { id: "m3", name: "Chidi" },
];

const statuses = createStatusConfig(CUSTOM_STATUSES);

describe("reconcileAttendanceDraft", () => {
  it("keeps saved active statuses, including custom ones", () => {
    const result = reconcileAttendanceDraft(
      [
        { id: "m1", name: "Ada", attendanceStatus: "late" },
        { id: "m2", name: "Bola", attendanceStatus: "excused" },
      ],
      roster,
      statuses
    );

    expect(result).toEqual([
      { id: "m1", name: "Ada", attendanceStatus: "late" },
      { id: "m2", name: "Bola", attendanceStatus: "excused" },
      { id: "m3", name: "Chidi", attendanceStatus: "no_show" },
    ]);
  });

  it("gives newly eligible members the configured default", () => {
    const result = reconcileAttendanceDraft(
      [{ id: "m1", attendanceStatus: "present" }],
      roster,
      statuses
    );
    expect(result.map((m) => m.attendanceStatus)).toEqual([
      "present",
      "no_show",
      "no_show",
    ]);
  });

  it("drops draft members who are no longer on the roster", () => {
    const result = reconcileAttendanceDraft(
      [
        { id: "deleted", name: "Gone", attendanceStatus: "present" },
        { id: "m1", name: "Ada", attendanceStatus: "present" },
      ],
      roster,
      statuses
    );

    expect(result.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("ignores a stale draft name and uses the fresh roster name", () => {
    const result = reconcileAttendanceDraft(
      [{ id: "m1", name: "Old Name", attendanceStatus: "present" }],
      roster,
      statuses
    );

    expect(result[0]).toEqual({
      id: "m1",
      name: "Ada",
      attendanceStatus: "present",
    });
  });

  it("resets inactive and unknown draft statuses to the default", () => {
    const result = reconcileAttendanceDraft(
      [
        { id: "m1", attendanceStatus: "remote" },
        { id: "m2", attendanceStatus: "apology" },
        { id: "m3", attendanceStatus: "late" },
      ],
      roster,
      statuses
    );

    expect(result.map((m) => m.attendanceStatus)).toEqual([
      "no_show",
      "no_show",
      "late",
    ]);
  });

  it("defaults everyone when no usable draft exists", () => {
    const expected = roster.map((member) => ({
      ...member,
      attendanceStatus: "no_show",
    }));

    expect(reconcileAttendanceDraft(null, roster, statuses)).toEqual(expected);
    expect(reconcileAttendanceDraft(undefined, roster, statuses)).toEqual(
      expected
    );
    expect(
      reconcileAttendanceDraft({ not: "an array" }, roster, statuses)
    ).toEqual(expected);
    expect(reconcileAttendanceDraft([], roster, statuses)).toEqual(expected);
  });

  it("ignores malformed draft entries", () => {
    const result = reconcileAttendanceDraft(
      [
        null,
        { id: "m1" },
        { name: "No id", attendanceStatus: "present" },
        { id: "m3", attendanceStatus: "present" },
      ],
      roster,
      statuses
    );

    expect(result.map((m) => m.attendanceStatus)).toEqual([
      "no_show",
      "no_show",
      "present",
    ]);
  });
});

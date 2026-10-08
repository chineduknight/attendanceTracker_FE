import { restoreStatuses, updateStatuses } from "helpers/attendanceBulk";

const roster = [
  { id: "m1", name: "Ada", attendanceStatus: "absent" },
  { id: "m2", name: "Bola", attendanceStatus: "remote" },
  { id: "m3", name: "Chi", attendanceStatus: "late" },
];

describe("updateStatuses", () => {
  it("changes only the targeted members and snapshots their previous statuses", () => {
    const { members, snapshot } = updateStatuses(roster, new Set(["m1", "m2"]), () => "present");
    expect(members.map((m) => m.attendanceStatus)).toEqual(["present", "present", "late"]);
    expect(Array.from(snapshot.entries())).toEqual([
      ["m1", "absent"],
      ["m2", "remote"],
    ]);
    expect(members[2]).toBe(roster[2]);
  });

  it("passes each member's current status to the transition", () => {
    const { members } = updateStatuses(roster, new Set(["m3"]), (s) => `${s}!`);
    expect(members[2].attendanceStatus).toBe("late!");
  });
});

describe("restoreStatuses", () => {
  it("restores captured members, including an inactive historical status", () => {
    const { members, snapshot } = updateStatuses(roster, new Set(["m1", "m2"]), () => "present");
    expect(restoreStatuses(members, snapshot)).toEqual(roster);
  });

  it("skips captured members who left the roster and leaves others untouched", () => {
    const snapshot = new Map([
      ["gone", "present"],
      ["m1", "late"],
    ]);
    const restored = restoreStatuses(roster, snapshot);
    expect(restored.map((m) => m.attendanceStatus)).toEqual(["late", "remote", "late"]);
    expect(restored).toHaveLength(3);
  });
});

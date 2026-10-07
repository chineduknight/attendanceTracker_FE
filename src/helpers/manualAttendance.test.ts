import { createStatusConfig } from "helpers/attendanceStatuses";
import {
  isActivePresentStatus,
  manualCandidates,
  nextPresentStatus,
  presentStatuses,
  reconcileManualDraft,
  toManualAdditionPayload,
} from "helpers/manualAttendance";
import {
  CUSTOM_STATUSES,
  statusDefinition,
} from "test-utils/attendanceStatusFixtures";

// present, late (present behavior), excused, no_show, remote (inactive present).
const statuses = createStatusConfig(CUSTOM_STATUSES);

describe("present-behavior statuses", () => {
  it("offers only active statuses whose behavior is present", () => {
    expect(presentStatuses(statuses).map((s) => s.key)).toEqual([
      "present",
      "late",
    ]);
    expect(isActivePresentStatus(statuses, "late")).toBe(true);
    expect(isActivePresentStatus(statuses, "excused")).toBe(false);
    expect(isActivePresentStatus(statuses, "no_show")).toBe(false);
    expect(isActivePresentStatus(statuses, "remote")).toBe(false);
    expect(isActivePresentStatus(statuses, "mystery")).toBe(false);
  });

  it("judges by behavior, never by a literal 'present' key", () => {
    const renamed = createStatusConfig([
      statusDefinition({ key: "here", label: "Here" }),
      statusDefinition({
        key: "present",
        label: "Gone",
        behavior: "absent",
        isDefault: true,
      }),
    ]);
    expect(presentStatuses(renamed).map((s) => s.key)).toEqual(["here"]);
    expect(isActivePresentStatus(renamed, "present")).toBe(false);
  });

  it("cycles a manual entry through present statuses only", () => {
    expect(nextPresentStatus(statuses, "present")).toBe("late");
    expect(nextPresentStatus(statuses, "late")).toBe("present");
    // An inactive historical present status re-enters at the first one.
    expect(nextPresentStatus(statuses, "remote")).toBe("present");
  });

  it("keeps the status rather than inventing an absence when none is present", () => {
    const noPresent = createStatusConfig([
      statusDefinition({
        key: "absent",
        label: "Absent",
        behavior: "absent",
        isDefault: true,
      }),
    ]);
    expect(nextPresentStatus(noPresent, "remote")).toBe("remote");
  });
});

describe("toManualAdditionPayload", () => {
  it("trims the reason and sends only member, status and reason", () => {
    expect(
      toManualAdditionPayload({
        memberId: "m1",
        status: "late",
        reason: "  Joined the sectional  ",
      })
    ).toEqual({ memberId: "m1", status: "late", reason: "Joined the sectional" });
  });

  it("omits a blank reason", () => {
    expect(
      toManualAdditionPayload({ memberId: "m1", status: "late", reason: "  " })
    ).toEqual({ memberId: "m1", status: "late" });
  });
});

describe("manualCandidates", () => {
  it("excludes the roster only and sorts by name", () => {
    const members = [
      { id: "m3", name: "Chioma", part: "alto" },
      { id: "m1", name: "Ada", part: "soprano" },
      { id: "m2", name: "Bola", part: "tenor" },
    ];
    expect(manualCandidates(members, ["m2"]).map((m) => m.name)).toEqual([
      "Ada",
      "Chioma",
    ]);
  });
});

describe("reconcileManualDraft", () => {
  const members = [
    { id: "m1", name: "Ada" },
    { id: "m2", name: "Bola (renamed)" },
    { id: "m3", name: "Chioma" },
  ];

  it("keeps valid additions with current names and reasons", () => {
    const { manual, promoted } = reconcileManualDraft(
      [{ id: "m2", name: "Bola", attendanceStatus: "late", reason: "Leave ended early" }],
      new Set(["m1"]),
      members,
      statuses
    );
    expect(manual).toEqual([
      {
        id: "m2",
        name: "Bola (renamed)",
        attendanceStatus: "late",
        reason: "Leave ended early",
      },
    ]);
    expect(promoted.size).toBe(0);
  });

  it("moves a member who became expected out, keeping their status", () => {
    const { manual, promoted } = reconcileManualDraft(
      [{ id: "m1", name: "Ada", attendanceStatus: "late" }],
      new Set(["m1"]),
      members,
      statuses
    );
    expect(manual).toEqual([]);
    expect(Array.from(promoted)).toEqual([["m1", "late"]]);
  });

  it("drops removed members and duplicates, and repairs non-present statuses", () => {
    const { manual } = reconcileManualDraft(
      [
        { id: "gone", name: "Gone", attendanceStatus: "present" },
        { id: "m3", name: "Chioma", attendanceStatus: "no_show" },
        { id: "m3", name: "Chioma", attendanceStatus: "late" },
        null,
        "junk",
      ],
      new Set(),
      members,
      statuses
    );
    expect(manual).toEqual([
      { id: "m3", name: "Chioma", attendanceStatus: "present" },
    ]);
  });

  it("ignores a draft that is not a list", () => {
    expect(
      reconcileManualDraft({ m1: "late" }, new Set(), members, statuses).manual
    ).toEqual([]);
  });
});

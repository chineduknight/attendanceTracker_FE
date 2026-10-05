import {
  createStatusConfig,
  DEFAULT_ATTENDANCE_STATUSES,
} from "helpers/attendanceStatuses";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";

const statuses = createStatusConfig(CUSTOM_STATUSES);

describe("createStatusConfig", () => {
  it("resolves configured label, short label, color and behavior", () => {
    expect(statuses.resolve("late")).toMatchObject({
      label: "Late",
      shortLabel: "L",
      color: "yellow",
      behavior: "present",
    });
    expect(statuses.resolve("excused").behavior).toBe("excused");
  });

  it("uses the configured default", () => {
    expect(statuses.defaultStatus.key).toBe("no_show");
  });

  it("cycles through active statuses in configured order", () => {
    expect(statuses.next("present")).toBe("late");
    expect(statuses.next("late")).toBe("excused");
    expect(statuses.next("excused")).toBe("no_show");
    expect(statuses.next("no_show")).toBe("present");
  });

  it("enters the active cycle deterministically from inactive or unknown", () => {
    expect(statuses.next("remote")).toBe("present");
    expect(statuses.next("bogus")).toBe("present");
    expect(statuses.next(undefined)).toBe("present");
  });

  it("still resolves an inactive historical status", () => {
    expect(statuses.isKnown("remote")).toBe(true);
    expect(statuses.isActive("remote")).toBe(false);
    expect(statuses.resolve("remote").label).toBe("Remote");
    expect(statuses.active.map((s) => s.key)).not.toContain("remote");
  });

  it("falls back to a neutral unknown status", () => {
    expect(statuses.resolve("apology")).toMatchObject({
      key: "apology",
      label: "Unknown",
      shortLabel: "?",
      color: "gray",
      behavior: "absent",
    });
    expect(statuses.resolve(undefined).label).toBe("Unknown");
  });

  it("ranks by configured order with unknown keys last", () => {
    const keys = ["bogus", "no_show", "remote", "present", "late"];
    expect([...keys].sort((a, b) => statuses.rank(a) - statuses.rank(b))).toEqual(
      ["present", "late", "no_show", "remote", "bogus"]
    );
  });

  it("counts every active status plus inactive/unknown ones that occur", () => {
    const counts = statuses.countStatuses([
      "present",
      "late",
      "late",
      "remote",
      "bogus",
    ]);
    expect(counts.map(({ status, count }) => [status.label, count])).toEqual([
      ["Present", 1],
      ["Late", 2],
      ["Excused", 0],
      ["No Show", 0],
      ["Remote", 1],
      ["Unknown", 1],
    ]);
  });

  it("falls back to the default configuration when none is provided", () => {
    const fallback = createStatusConfig(undefined);
    expect(fallback.all).toBe(DEFAULT_ATTENDANCE_STATUSES);
    expect(fallback.defaultStatus.key).toBe("absent");
    expect(fallback.next("absent")).toBe("present");
    expect(fallback.next("present")).toBe("apology");
    expect(fallback.next("apology")).toBe("absent");
  });
});

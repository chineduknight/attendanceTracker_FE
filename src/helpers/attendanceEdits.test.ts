import {
  resolveEditsRemaining,
  resolveEditCount,
  canEditAttendance,
} from "helpers/attendanceEdits";

describe("attendanceEdits", () => {
  it("uses editsRemaining when present", () => {
    expect(resolveEditsRemaining({ editsRemaining: 2 })).toBe(2);
    expect(canEditAttendance({ editsRemaining: 2 })).toBe(true);
  });

  it("treats editsRemaining of 0 as not editable", () => {
    expect(resolveEditsRemaining({ editsRemaining: 0 })).toBe(0);
    expect(canEditAttendance({ editsRemaining: 0 })).toBe(false);
  });

  it("falls back to the legacy one-edit rule when editsRemaining is absent", () => {
    expect(resolveEditsRemaining({ hasBeenUpdated: false })).toBe(1);
    expect(canEditAttendance({ hasBeenUpdated: false })).toBe(true);
    expect(resolveEditsRemaining({ hasBeenUpdated: true })).toBe(0);
    expect(canEditAttendance({ hasBeenUpdated: true })).toBe(false);
  });

  it("resolves editCount, falling back to hasBeenUpdated", () => {
    expect(resolveEditCount({ editCount: 3 })).toBe(3);
    expect(resolveEditCount({ hasBeenUpdated: true })).toBe(1);
    expect(resolveEditCount({ hasBeenUpdated: false })).toBe(0);
  });
});

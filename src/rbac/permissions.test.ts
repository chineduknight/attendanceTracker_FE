import {
  PERMISSION_AREAS,
  ALL_PERMISSIONS,
  isPermissionKey,
  splitPermission,
} from "rbac/permissions";

describe("permission model", () => {
  it("derives all 12 permission keys from 6 areas x 2 actions", () => {
    expect(PERMISSION_AREAS).toHaveLength(6);
    expect(ALL_PERMISSIONS).toHaveLength(12);
    expect(ALL_PERMISSIONS).toContain("attendance.view");
    expect(ALL_PERMISSIONS).toContain("officers.manage");
  });

  it("guards permission keys", () => {
    expect(isPermissionKey("finance.view")).toBe(true);
    expect(isPermissionKey("finance.delete")).toBe(false);
    expect(isPermissionKey("nope")).toBe(false);
  });

  it("splits a key into area and action", () => {
    expect(splitPermission("members.manage")).toEqual({
      area: "members",
      action: "manage",
    });
  });
});

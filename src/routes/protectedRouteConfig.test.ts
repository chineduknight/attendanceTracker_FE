import { matchRoutes } from "react-router-dom";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";
import { PROTECTED_PATHS } from "routes/pagePath";
import { isPermissionKey } from "rbac/permissions";

const permFor = (path: string) =>
  PAGE_ROUTES.find((route) => route.path === path)?.perm;

describe("PAGE_ROUTES", () => {
  it("gives every route a non-empty title", () => {
    PAGE_ROUTES.forEach((route) => {
      expect(route.title.trim().length).toBeGreaterThan(0);
    });
  });

  it("only hides the back button on Dashboard and Organisations", () => {
    const noBack = PAGE_ROUTES.filter((r) => r.showBack === false).map((r) => r.path);
    expect(noBack.sort()).toEqual(
      [PROTECTED_PATHS.DASHBOARD, PROTECTED_PATHS.ALL_ORG].sort()
    );
  });

  it("resolves every route's own path to itself via matchRoutes", () => {
    PAGE_ROUTES.forEach((route) => {
      const concretePath = route.path.replace(/:[^/]+/g, "test-id");
      const matches = matchRoutes(PAGE_ROUTES, concretePath);
      const winner = matches?.[matches.length - 1]?.route;
      expect(winner?.path).toBe(route.path);
    });
  });
});

describe("PAGE_ROUTES permissions", () => {
  it("requires manage permissions for write routes", () => {
    expect(permFor(PROTECTED_PATHS.ADD_MEMBER)).toBe("members.manage");
    expect(permFor(PROTECTED_PATHS.UPDATE_MEMBER)).toBe("members.manage");
    expect(permFor(PROTECTED_PATHS.USER_MODEL)).toBe("members.manage");
    expect(permFor(PROTECTED_PATHS.CATEGORY)).toBe("categories.manage");
    expect(permFor(PROTECTED_PATHS.SUB_CATEGORY)).toBe("categories.manage");
    expect(permFor(PROTECTED_PATHS.CREATE_ATTENDANCE)).toBe("attendance.manage");
    expect(permFor(PROTECTED_PATHS.MARK_ATTENANCE)).toBe("attendance.manage");
    expect(permFor(PROTECTED_PATHS.UPDATE_ATTENANCE)).toBe("attendance.manage");
  });

  it("requires view permissions for read routes", () => {
    expect(permFor(PROTECTED_PATHS.VIEW_MEMBER)).toBe("members.view");
    expect(permFor(PROTECTED_PATHS.BIRTHDAY)).toBe("members.view");
    expect(permFor(PROTECTED_PATHS.ATTENDANCE)).toBe("attendance.view");
    expect(permFor(PROTECTED_PATHS.ALL_ATTENDANCE)).toBe("attendance.view");
    expect(permFor(PROTECTED_PATHS.ANALYTICS)).toBe("attendance.view");
    expect(permFor(PROTECTED_PATHS.MEMBER_ANALYTICS)).toBe("attendance.view");
    expect(permFor(PROTECTED_PATHS.FINANCE)).toBe("finance.view");
    expect(permFor(PROTECTED_PATHS.OFFICERS_ROLES)).toBe("officers.view");
    expect(permFor(PROTECTED_PATHS.SETTINGS)).toBe("settings.view");
  });

  it("leaves the org picker and dashboard ungated", () => {
    expect(permFor(PROTECTED_PATHS.ALL_ORG)).toBeUndefined();
    expect(permFor(PROTECTED_PATHS.DASHBOARD)).toBeUndefined();
  });

  it("only declares valid permission keys", () => {
    PAGE_ROUTES.forEach((route) => {
      if (route.perm) expect(isPermissionKey(route.perm)).toBe(true);
    });
  });
});

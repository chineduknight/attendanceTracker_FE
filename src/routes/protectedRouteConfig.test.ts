import { matchRoutes } from "react-router-dom";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";
import { PROTECTED_PATHS } from "routes/pagePath";
import { isPermissionKey } from "rbac/permissions";
import { resolveText } from "config/presentationLabels";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

const SCHOOL = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  attendanceSingular: "Session",
  attendancePlural: "Sessions",
  categorySingular: "Activity",
  subCategorySingular: "Activity type",
  officerPlural: "Coordinators",
};
const titleFor = (path: string, terms = DEFAULT_TERMINOLOGY) =>
  resolveText(PAGE_ROUTES.find((route) => route.path === path)!.title, terms);
const featureFor = (path: string) =>
  PAGE_ROUTES.find((route) => route.path === path)?.feature;

const permFor = (path: string) =>
  PAGE_ROUTES.find((route) => route.path === path)?.perm;

describe("PAGE_ROUTES", () => {
  it("gives every route a non-empty title", () => {
    PAGE_ROUTES.forEach((route) => {
      expect(resolveText(route.title, DEFAULT_TERMINOLOGY).trim().length).toBeGreaterThan(0);
    });
  });

  it("keeps today's titles with default terminology", () => {
    expect(titleFor(PROTECTED_PATHS.ADD_MEMBER)).toBe("Add Member");
    expect(titleFor(PROTECTED_PATHS.VIEW_MEMBER)).toBe("View Members");
    expect(titleFor(PROTECTED_PATHS.CREATE_ATTENDANCE)).toBe("Create Attendance");
    expect(titleFor(PROTECTED_PATHS.ALL_ATTENDANCE)).toBe("All Attendance");
    expect(titleFor(PROTECTED_PATHS.ANALYTICS)).toBe("Attendance Analytics");
    expect(titleFor(PROTECTED_PATHS.OFFICERS_ROLES)).toBe("Officers & Roles");
    expect(titleFor(PROTECTED_PATHS.CATEGORY)).toBe("Create Category");
    expect(titleFor(PROTECTED_PATHS.UPDATE_MEMBER)).toBe("Update Member");
    expect(titleFor(PROTECTED_PATHS.ATTENDANCE)).toBe("View Attendance");
    expect(titleFor(PROTECTED_PATHS.MEMBER_ANALYTICS)).toBe("Member Analytics");
    expect(titleFor(PROTECTED_PATHS.MARK_ATTENANCE)).toBe("Mark Attendance");
    // The one default wording change: the contract's "Sub-category" term.
    expect(titleFor(PROTECTED_PATHS.SUB_CATEGORY)).toBe("Create Sub-category");
  });

  it("derives titles from the organisation's terminology without changing paths", () => {
    expect(titleFor(PROTECTED_PATHS.ADD_MEMBER, SCHOOL)).toBe("Add Student");
    expect(titleFor(PROTECTED_PATHS.UPDATE_MEMBER, SCHOOL)).toBe("Update Student");
    expect(titleFor(PROTECTED_PATHS.VIEW_MEMBER, SCHOOL)).toBe("View Students");
    expect(titleFor(PROTECTED_PATHS.MEMBER_ANALYTICS, SCHOOL)).toBe("Student Analytics");
    expect(titleFor(PROTECTED_PATHS.CREATE_ATTENDANCE, SCHOOL)).toBe("Create Session");
    expect(titleFor(PROTECTED_PATHS.ALL_ATTENDANCE, SCHOOL)).toBe("All Sessions");
    expect(titleFor(PROTECTED_PATHS.CATEGORY, SCHOOL)).toBe("Create Activity");
    expect(titleFor(PROTECTED_PATHS.SUB_CATEGORY, SCHOOL)).toBe("Create Activity type");
    expect(titleFor(PROTECTED_PATHS.OFFICERS_ROLES, SCHOOL)).toBe("Coordinators & Roles");
    expect(titleFor(PROTECTED_PATHS.MARK_ATTENANCE, SCHOOL)).toBe("Mark Session");
    expect(titleFor(PROTECTED_PATHS.ATTENDANCE, SCHOOL)).toBe("View Session");
    expect(PAGE_ROUTES.find((r) => r.path === PROTECTED_PATHS.ADD_MEMBER)?.path).toBe("/member/add");
  });

  it("maps only the optional modules to a feature", () => {
    expect(featureFor(PROTECTED_PATHS.FINANCE)).toBe("finance");
    expect(featureFor(PROTECTED_PATHS.BIRTHDAY)).toBe("birthdays");
    expect(featureFor(PROTECTED_PATHS.ANALYTICS)).toBe("analytics");
    expect(featureFor(PROTECTED_PATHS.MEMBER_ANALYTICS)).toBe("analytics");
    const gated = PAGE_ROUTES.filter((r) => r.feature).map((r) => r.path);
    expect(gated).toHaveLength(4);
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

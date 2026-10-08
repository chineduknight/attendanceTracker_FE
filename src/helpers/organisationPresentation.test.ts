import {
  DEFAULT_FEATURE_VISIBILITY,
  DEFAULT_TERMINOLOGY,
  effectiveFeatureVisibility,
  effectiveTerminology,
  isFeatureVisible,
  lowerTerm,
  termError,
  withArticle,
} from "helpers/organisationPresentation";

describe("organisation presentation", () => {
  it("defaults to today's wording and every module visible", () => {
    expect(effectiveTerminology(undefined)).toEqual({
      memberSingular: "Member",
      memberPlural: "Members",
      attendanceSingular: "Attendance",
      attendancePlural: "Attendance",
      categorySingular: "Category",
      categoryPlural: "Categories",
      subCategorySingular: "Sub-category",
      subCategoryPlural: "Sub-categories",
      officerSingular: "Officer",
      officerPlural: "Officers",
    });
    expect(effectiveFeatureVisibility(null)).toEqual({ finance: true, birthdays: true, analytics: true, welfare: true });
  });

  it("merges a partial legacy config over the defaults, ignoring blank or invalid values", () => {
    const org = {
      terminology: { memberSingular: " Student ", memberPlural: "", officerPlural: "Coordinators" },
      featureVisibility: { finance: false, birthdays: "no" as unknown as boolean },
    };
    expect(effectiveTerminology(org)).toMatchObject({
      memberSingular: "Student",
      memberPlural: "Members",
      officerPlural: "Coordinators",
      attendanceSingular: "Attendance",
    });
    expect(effectiveFeatureVisibility(org)).toEqual({ finance: false, birthdays: true, analytics: true, welfare: true });
    expect(isFeatureVisible(org, "finance")).toBe(false);
    expect(isFeatureVisible(org, "analytics")).toBe(true);
  });

  it("never hands out the shared default objects", () => {
    const terms = effectiveTerminology(undefined);
    terms.memberSingular = "Mutated";
    expect(DEFAULT_TERMINOLOGY.memberSingular).toBe("Member");
    expect(effectiveFeatureVisibility(undefined)).not.toBe(DEFAULT_FEATURE_VISIBILITY);
  });

  it("lowercases only plainly capitalised words inside sentences", () => {
    expect(lowerTerm("Member")).toBe("member");
    expect(lowerTerm("Activity type")).toBe("activity type");
    expect(lowerTerm("Sub-category")).toBe("sub-category");
    expect(lowerTerm("CYON Member")).toBe("CYON member");
    expect(lowerTerm("MP")).toBe("MP");
  });

  it("picks the indefinite article from the term", () => {
    expect(withArticle("officer")).toBe("an officer");
    expect(withArticle("coordinator")).toBe("a coordinator");
  });

  it("validates terms: required, trimmed, at most 40 characters", () => {
    expect(termError("  ")).toBe("Required");
    expect(termError("x".repeat(41))).toMatch(/At most 40/);
    expect(termError(` ${"x".repeat(40)} `)).toBeNull();
  });
});

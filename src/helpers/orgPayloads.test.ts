import { buildOrgUpdatePayload } from "helpers/orgPayloads";
import {
  createStatusRow,
  toStatusRows,
} from "helpers/attendanceStatusSettings";
import { DEFAULT_ATTENDANCE_STATUSES } from "helpers/attendanceStatuses";
import {
  DEFAULT_FEATURE_VISIBILITY,
  DEFAULT_TERMINOLOGY,
} from "helpers/organisationPresentation";

describe("buildOrgUpdatePayload", () => {
  const base = {
    name: "VOB Choir",
    image: "https://cdn.example.com/logo.png",
    collapseAttendanceByDay: true,
    attendanceEligibilityEnabled: false,
    welfareReviewWindowDays: "",
    terminology: { ...DEFAULT_TERMINOLOGY },
    featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY },
  };
  const rows = toStatusRows(DEFAULT_ATTENDANCE_STATUSES);

  it("maps a numeric string to an integer", () => {
    expect(
      buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "3" }, rows),
    ).toEqual({
      name: "VOB Choir",
      image: "https://cdn.example.com/logo.png",
      collapseAttendanceByDay: true,
      maxAttendanceEdits: 3,
      attendanceStatuses: DEFAULT_ATTENDANCE_STATUSES,
      attendanceEligibilityEnabled: false,
      welfareSettings: { reviewWindowDays: 14 },
      terminology: { ...DEFAULT_TERMINOLOGY },
      featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY },
    });
  });

  it("keeps 0 (editing disabled) rather than treating it as blank", () => {
    expect(
      buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "0" }, rows)
        .maxAttendanceEdits,
    ).toBe(0);
  });

  it("maps a blank maxAttendanceEdits to null (use default)", () => {
    expect(
      buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "  " }, rows)
        .maxAttendanceEdits,
    ).toBeNull();
  });

  it("sends a cleared logo as an empty image", () => {
    const result = buildOrgUpdatePayload(
      { ...base, image: "   ", maxAttendanceEdits: "" },
      rows,
    );
    expect(result.image).toBe("");
  });

  it("trims name and image (both always present)", () => {
    const result = buildOrgUpdatePayload(
      {
        name: "  VOB Choir  ",
        image: "  https://x/y.png ",
        collapseAttendanceByDay: false,
        maxAttendanceEdits: "",
        attendanceEligibilityEnabled: false,
        welfareReviewWindowDays: "",
        terminology: { ...DEFAULT_TERMINOLOGY },
        featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY },
      },
      rows,
    );
    expect(result.name).toBe("VOB Choir");
    expect(result.image).toBe("https://x/y.png");
  });

  it("sends statuses alongside every other setting, without client-only fields", () => {
    const withLate = [...rows, createStatusRow("Late", rows)];
    const result = buildOrgUpdatePayload(
      { ...base, maxAttendanceEdits: "2" },
      withLate,
    );

    expect(result).toMatchObject({
      name: "VOB Choir",
      image: "https://cdn.example.com/logo.png",
      collapseAttendanceByDay: true,
      maxAttendanceEdits: 2,
      attendanceEligibilityEnabled: false,
      welfareSettings: { reviewWindowDays: 14 },
      terminology: { ...DEFAULT_TERMINOLOGY },
      featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY },
    });
    expect(result.attendanceStatuses.map((s) => s.key)).toEqual([
      "present",
      "apology",
      "absent",
      "late",
    ]);
    expect(result.attendanceStatuses[3]).not.toHaveProperty("persisted");
  });

  it("sends complete trimmed terminology and visibility, never RBAC annotations", () => {
    const form = {
      ...base,
      maxAttendanceEdits: "",
      attendanceEligibilityEnabled: true,
      terminology: {
        ...DEFAULT_TERMINOLOGY,
        memberSingular: "  Student ",
        memberPlural: "Students",
        officerPlural: " Coordinators",
      },
      featureVisibility: { finance: false, birthdays: false, analytics: true, welfare: false },
      // Fields a stale caller might spread in must never reach the backend.
      permissions: ["finance.view"],
      isOwner: true,
      roleName: "Owner",
    };

    const result = buildOrgUpdatePayload(form, rows);

    expect(result).toEqual({
      name: "VOB Choir",
      image: "https://cdn.example.com/logo.png",
      collapseAttendanceByDay: true,
      maxAttendanceEdits: null,
      attendanceStatuses: DEFAULT_ATTENDANCE_STATUSES,
      attendanceEligibilityEnabled: true,
      terminology: {
        ...DEFAULT_TERMINOLOGY,
        memberSingular: "Student",
        memberPlural: "Students",
        officerPlural: "Coordinators",
      },
      featureVisibility: { finance: false, birthdays: false, analytics: true, welfare: false },
      welfareSettings: { reviewWindowDays: 14 },
    });
  });

  describe("attendance eligibility setting", () => {
    it.each([true, false])("sends attendanceEligibilityEnabled: %s with every other setting", (enabled) => {
      expect(
        buildOrgUpdatePayload(
          { ...base, maxAttendanceEdits: "2", attendanceEligibilityEnabled: enabled },
          rows,
        ),
      ).toEqual({
        name: "VOB Choir",
        image: "https://cdn.example.com/logo.png",
        collapseAttendanceByDay: true,
        maxAttendanceEdits: 2,
        attendanceStatuses: DEFAULT_ATTENDANCE_STATUSES,
        attendanceEligibilityEnabled: enabled,
        welfareSettings: { reviewWindowDays: 14 },
        terminology: { ...DEFAULT_TERMINOLOGY },
        featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY },
      });
    });

    it("omits the switch for a backend that does not support it, keeping presentation", () => {
      const result = buildOrgUpdatePayload(
        { ...base, maxAttendanceEdits: "", attendanceEligibilityEnabled: true },
        rows,
        { includeEligibilitySetting: false },
      );
      expect(result).not.toHaveProperty("attendanceEligibilityEnabled");
      expect(result.terminology).toEqual(DEFAULT_TERMINOLOGY);
    });

    it("sends the switch independently of presentation support", () => {
      const result = buildOrgUpdatePayload(
        { ...base, maxAttendanceEdits: "", attendanceEligibilityEnabled: true },
        rows,
        { includePresentation: false },
      );
      expect(result.attendanceEligibilityEnabled).toBe(true);
      expect(result).not.toHaveProperty("terminology");
      expect(result).not.toHaveProperty("featureVisibility");
    });
  });

  describe("welfare settings", () => {
    it("sends the review window with every other setting by default", () => {
      const result = buildOrgUpdatePayload(
        { ...base, maxAttendanceEdits: "", welfareReviewWindowDays: "30" },
        rows,
      );
      expect(result.welfareSettings).toEqual({ reviewWindowDays: 30 });
    });

    it("maps a blank review window to the effective default", () => {
      const result = buildOrgUpdatePayload(
        { ...base, maxAttendanceEdits: "", welfareReviewWindowDays: "  " },
        rows,
      );
      expect(result.welfareSettings).toEqual({ reviewWindowDays: 14 });
    });

    it("omits welfareSettings for a backend that does not support it", () => {
      const result = buildOrgUpdatePayload(
        { ...base, maxAttendanceEdits: "" },
        rows,
        { includeWelfareSettings: false },
      );
      expect(result).not.toHaveProperty("welfareSettings");
      expect(result.terminology).toEqual(DEFAULT_TERMINOLOGY);
    });
  });
});


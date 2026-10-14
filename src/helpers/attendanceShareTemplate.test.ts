import {
  effectiveAttendanceShareTemplate,
  isAttendanceShareTemplate,
} from "helpers/attendanceShareTemplate";
import { EMPTY_ORG, OrganisationType } from "zStore";

describe("effectiveAttendanceShareTemplate", () => {
  it.each(["generic", "choir"] as const)("returns a stored %s", (value) => {
    expect(effectiveAttendanceShareTemplate({ attendanceShareTemplate: value })).toBe(value);
  });

  it("keeps choir for an organisation persisted before the setting existed", () => {
    // Older builds persisted the selected organisation without the field.
    const legacy: OrganisationType = { ...EMPTY_ORG, id: "org1" };
    expect(legacy).not.toHaveProperty("attendanceShareTemplate");
    expect(effectiveAttendanceShareTemplate(legacy)).toBe("choir");
  });

  it.each([null, undefined, "", "Generic", "CHOIR", "band", 1, true, {}])(
    "falls back to choir for %p",
    (value) => {
      expect(effectiveAttendanceShareTemplate({ attendanceShareTemplate: value })).toBe("choir");
    },
  );

  it("falls back to choir without an organisation", () => {
    expect(effectiveAttendanceShareTemplate(null)).toBe("choir");
    expect(effectiveAttendanceShareTemplate(undefined)).toBe("choir");
  });
});

describe("isAttendanceShareTemplate", () => {
  it("accepts only the exact backend values", () => {
    expect(isAttendanceShareTemplate("generic")).toBe(true);
    expect(isAttendanceShareTemplate("choir")).toBe(true);
    expect(isAttendanceShareTemplate(" generic")).toBe(false);
    expect(isAttendanceShareTemplate(undefined)).toBe(false);
  });
});

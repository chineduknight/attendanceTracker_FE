import { buildAttendanceShareMessage, ShareMember } from "helpers/attendanceShareMessage";
import { createStatusConfig } from "helpers/attendanceStatuses";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

const member = (
  name: string,
  attendanceStatus: string,
  part = "tenor",
): ShareMember => ({
  attendanceStatus,
  member: { name, status: "active", gender: "male", part },
});

const build = (members: ShareMember[]) =>
  buildAttendanceShareMessage({
    orgName: "VOB Choir",
    sessionName: "Rehearsal",
    formattedDate: "Tue 01 Sep 26",
    members,
    statuses: createStatusConfig(CUSTOM_STATUSES),
    random: () => 0,
  });

describe("buildAttendanceShareMessage", () => {
  it("groups by behavior and uses configured labels", () => {
    const message = build([
      member("Ada", "present"),
      member("Bayo", "late"),
      member("Chidi", "excused"),
      member("Dayo", "no_show"),
    ]);

    expect(message).toContain("✅ Present: 1  |  ✅ Late: 1  |  🟡 Excused: 1");
    expect(message).toContain("*Tenor — 2*\nBro Ada\nBro Bayo");
    expect(message).toContain("*EXCUSED — 1*\nBro Chidi — Tenor");
    expect(message).toContain("*Absent Members: 1*");
    expect(message).not.toMatch(/apolog/i);
  });

  it("does not crash on inactive or unknown statuses", () => {
    expect(() => build([member("Ada", "remote"), member("Bayo", "mystery")])).not.toThrow();
  });

  it("uses the organisation's terms for the generic headings", () => {
    const message = buildAttendanceShareMessage({
      orgName: "VOB Choir",
      sessionName: "Rehearsal",
      formattedDate: "Tue 01 Sep 26",
      members: [member("Ada", "present")],
      statuses: createStatusConfig(CUSTOM_STATUSES),
      terminology: {
        ...DEFAULT_TERMINOLOGY,
        memberPlural: "Students",
        attendanceSingular: "Session",
      },
      random: () => 0,
    });

    expect(message).toContain("VOB CHOIR SESSION*");
    expect(message).toContain("*PRESENT STUDENTS*");
    expect(message).toContain("*Absent Students: 0*");
  });
});

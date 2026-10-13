import {
  buildAttendanceShareMessage,
  ShareMember,
} from "helpers/attendanceShareMessage";
import { createStatusConfig } from "helpers/attendanceStatuses";
import {
  CUSTOM_STATUSES,
  statusDefinition,
} from "test-utils/attendanceStatusFixtures";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

const member = (
  name: string,
  attendanceStatus: string,
  over: Partial<NonNullable<ShareMember["member"]>> = {},
): ShareMember => ({
  attendanceStatus,
  member: { name, status: "active", gender: "male", part: "tenor", ...over },
});

/** A stored roster entry whose member profile no longer resolves. */
const unresolved = (attendanceStatus: string): ShareMember => ({
  attendanceStatus,
  member: null,
});

const build = (members: ShareMember[], random: () => number = () => 0) =>
  buildAttendanceShareMessage({
    orgName: "VOB Choir",
    sessionName: "Rehearsal",
    formattedDate: "Tue 01 Sep 26",
    members,
    statuses: createStatusConfig(CUSTOM_STATUSES),
    random,
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

  it("counts the absences of members whatever their membership status", () => {
    const message = build([
      member("Ada", "no_show", { status: "active" }),
      member("Bayo", "no_show", { status: "associate" }),
      member("Chidi", "no_show", { status: "probationary" }),
      member("Dayo", "no_show", { status: "student" }),
      member("Efe", "no_show", { status: "inactive" }),
    ]);

    expect(message).toContain("*Absent Members: 5*");
  });

  it("keeps present + excused + absent equal to the saved roster count", () => {
    const message = build([
      member("Ada", "present"),
      member("Bayo", "late"), // present behaviour
      member("Chidi", "excused"),
      member("Dayo", "no_show"),
      member("Efe", "mystery"), // unknown key fails closed into absent
      unresolved("excused"),
      unresolved("no_show"),
    ]);

    // Present section: Ada + Bayo. Excused list: Chidi + unresolved. Absent: 3.
    expect(message).toContain("*Tenor — 2*");
    expect(message).toContain("*EXCUSED — 2*");
    expect(message).toContain("*Absent Members: 3*");
  });

  it("counts an unknown historical status as absent without crashing", () => {
    const message = build([member("Ada", "remote"), member("Bayo", "mystery")]);

    // Remote is present behaviour (recorded, now inactive); the unknown key
    // counts as absent rather than being dropped.
    expect(message).toContain("✅ Remote: 1");
    expect(message).toContain("*Absent Members: 1*");
  });

  it("lists an unresolved present member under a neutral placeholder, never Bro/Sis", () => {
    const message = build([unresolved("present")]);

    expect(message).toContain("*Other — 1*\nFormer member (profile unavailable)");
    expect(message).toContain("✅ Present: 1");
    expect(message).not.toMatch(/Bro Former|Sis Former/);
  });

  it("lists an unresolved excused member in the combined excused list", () => {
    const message = build([unresolved("excused"), member("Chidi", "excused")]);

    expect(message).toContain("*EXCUSED — 2*");
    expect(message).toContain("Former member (profile unavailable) — Other");
    expect(message).not.toMatch(/Bro Former|Sis Former/);
  });

  it("counts an unresolved absent member exactly like a resolved one", () => {
    expect(build([member("Ada", "no_show")])).toContain("*Absent Members: 1*");
    expect(build([unresolved("no_show")])).toContain("*Absent Members: 1*");
  });

  it("lists several configured excused statuses in one labelled section", () => {
    const definitions = [
      statusDefinition({ key: "present", label: "Present", color: "green" }),
      statusDefinition({
        key: "apology",
        label: "Apology",
        color: "orange",
        behavior: "excused",
      }),
      statusDefinition({
        key: "sick",
        label: "Sick",
        color: "yellow",
        behavior: "excused",
      }),
      statusDefinition({
        key: "absent",
        label: "Absent",
        color: "red",
        behavior: "absent",
        isDefault: true,
      }),
    ];
    const message = buildAttendanceShareMessage({
      orgName: "VOB Choir",
      sessionName: "Rehearsal",
      formattedDate: "Tue 01 Sep 26",
      members: [member("Ada", "apology"), member("Bayo", "sick")],
      statuses: createStatusConfig(definitions),
      random: () => 0,
    });

    expect(message).toContain("*EXCUSED — 2*");
    expect(message).toContain("Bro Ada — Tenor (Apology)");
    expect(message).toContain("Bro Bayo — Tenor (Sick)");
  });

  it("picks the closing tone from the corrected totals", () => {
    // 2 present against 8 recorded absences is a low session — the absent
    // members' profiles not being active any more must not change that.
    const message = build([
      member("Ada", "present"),
      member("Bayo", "present"),
      ...["C", "D", "E", "F", "G", "H", "I", "J"].map((name) =>
        member(`Absent ${name}`, "no_show", { status: "inactive" }),
      ),
    ]);

    expect(message).toContain(
      "Our strength depends on every voice taking its place.",
    );
  });

  it("does not call a session strong when absent members are not active", () => {
    const message = build([
      ...Array.from({ length: 7 }, (_, i) => member(`Present ${i}`, "present")),
      ...Array.from({ length: 8 }, (_, i) =>
        member(`Absent ${i}`, "no_show", { status: "inactive" }),
      ),
    ]);

    expect(message).not.toContain(
      "Great music is built long before the performance",
    );
    expect(message).toContain(
      "Thank you to everyone who attended or communicated their absence.",
    );
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

  it("uses the organisation's member term in the unresolved placeholder", () => {
    const message = buildAttendanceShareMessage({
      orgName: "VOB Choir",
      sessionName: "Rehearsal",
      formattedDate: "Tue 01 Sep 26",
      members: [unresolved("present")],
      statuses: createStatusConfig(CUSTOM_STATUSES),
      terminology: { ...DEFAULT_TERMINOLOGY, memberSingular: "Student" },
      random: () => 0,
    });

    expect(message).toContain("Former student (profile unavailable)");
  });
});

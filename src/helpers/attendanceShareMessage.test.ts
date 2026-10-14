import {
  awayForShare,
  buildAttendanceShareMessage,
  ShareMember,
} from "helpers/attendanceShareMessage";
import { AttendanceAvailability } from "helpers/attendanceAvailability";
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

    // No present member has a voice part, so there is no lone "Other" group.
    expect(message).toContain(
      "*PRESENT MEMBERS — 1*\n\nFormer member (profile unavailable)",
    );
    expect(message).not.toContain("*Other —");
    expect(message).toContain("✅ Present: 1");
    expect(message).not.toMatch(/Bro Former|Sis Former/);
  });

  it("lists an unresolved excused member in the combined excused list", () => {
    const message = build([unresolved("excused"), member("Chidi", "excused")]);

    expect(message).toContain(
      "*EXCUSED — 2*\nBro Chidi — Tenor\nFormer member (profile unavailable)",
    );
    expect(message).not.toContain("— Other");
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

const CHOIR_WORDS = /choir|music|rehears|voice|sound|perform|🎶|\bBro\b|\bSis\b|\bOther\b/i;

const roster = (
  definitions: ReturnType<typeof statusDefinition>[],
  members: ShareMember[],
  over: Partial<Parameters<typeof buildAttendanceShareMessage>[0]> = {},
) =>
  buildAttendanceShareMessage({
    orgName: "Lakeside Tennis Club",
    sessionName: "Squad Training",
    formattedDate: "Tue 06 Oct 26",
    members,
    statuses: createStatusConfig(definitions),
    random: () => 0,
    ...over,
  });

describe("buildAttendanceShareMessage — generic template", () => {
  const TENNIS_STATUSES = [
    statusDefinition({ key: "played", label: "Played", color: "green" }),
    statusDefinition({ key: "late", label: "Late", color: "yellow" }),
    statusDefinition({ key: "injured", label: "Injured", color: "orange", behavior: "excused" }),
    statusDefinition({ key: "away", label: "Away at Tournament", color: "orange", behavior: "excused" }),
    statusDefinition({ key: "apology", label: "Apology", color: "orange", behavior: "excused" }),
    statusDefinition({ key: "absent", label: "Absent", color: "red", behavior: "absent", isDefault: true }),
  ];
  const TENNIS_TERMS = {
    ...DEFAULT_TERMINOLOGY,
    memberSingular: "Player",
    memberPlural: "Players",
    attendanceSingular: "Session",
  };
  const tennis = (members: ShareMember[], random: () => number = () => 0) =>
    roster(TENNIS_STATUSES, members, {
      terminology: TENNIS_TERMS,
      template: "generic",
      random,
    });

  // Gender and part are present on purpose: the generic template ignores them.
  const TENNIS_ROSTER = [
    member("Babatunde Fasina", "played", { gender: "male", part: "tenor" }),
    member("Adaeze Ezeani", "played", { gender: "female", part: "" }),
    member("Chika Obi", "late", { gender: "female", part: "soprano" }),
    member("Ovie Edewor", "injured"),
    member("Obiageli Chukwu", "away", { gender: "female" }),
    member("Halima Tanko", "apology", { gender: " FEMALE " }),
    member("Dayo Ade", "absent", { status: "inactive" }),
  ];

  it("lays out a tennis club session with plain names and configured labels", () => {
    const message = tennis(TENNIS_ROSTER);

    expect(message).toBe(
      [
        "*LAKESIDE TENNIS CLUB SESSION*",
        "*Squad Training*\n📅 Tue 06 Oct 26",
        "✅ Played: 2  |  ✅ Late: 1  |  🟡 Injured: 1  |  🟡 Away at Tournament: 1  |  🟡 Apology: 1",
        "*PRESENT PLAYERS — 3*",
        "Adaeze Ezeani\nBabatunde Fasina\nChika Obi",
        "*EXCUSED — 3*\nHalima Tanko — Apology\nObiageli Chukwu — Away at Tournament\nOvie Edewor — Injured",
        "🔴 *Absent Players: 1*",
        // 3 of 7 present and 3 excused: the excused-heavy tone.
        "_Thank you to everyone who was present and to those who let us know they could not attend. Let us keep growing in consistency and commitment._",
      ].join("\n\n"),
    );
    expect(message).not.toMatch(CHOIR_WORDS);
  });

  it("treats Attended and Attended Online as present and Work Commitment as excused", () => {
    const message = roster(
      [
        statusDefinition({ key: "attended", label: "Attended", color: "green" }),
        statusDefinition({ key: "online", label: "Attended Online", color: "teal" }),
        statusDefinition({ key: "work", label: "Work Commitment", color: "orange", behavior: "excused" }),
        statusDefinition({ key: "absent", label: "Absent", color: "red", behavior: "absent", isDefault: true }),
      ],
      [
        member("Ngozi Eze", "attended"),
        member("Femi Bello", "online", { gender: "male" }),
        member("Kemi Ade", "online"),
        member("Tunde Ola", "work", { gender: "male", part: "bass" }),
        member("Ifeoma Nwosu", "absent"),
      ],
      { orgName: "Lagos Product Network", template: "generic" },
    );

    expect(message).toContain("*LAGOS PRODUCT NETWORK ATTENDANCE*");
    expect(message).toContain("✅ Attended: 1  |  ✅ Attended Online: 2  |  🟡 Work Commitment: 1");
    expect(message).toContain(
      "*PRESENT MEMBERS — 3*\n\nFemi Bello\nKemi Ade\nNgozi Eze",
    );
    expect(message).toContain("*WORK COMMITMENT — 1*\nTunde Ola");
    expect(message).toContain("*Absent Members: 1*");
    expect(message).not.toMatch(CHOIR_WORDS);
  });

  it("names a single excused status in the heading for a youth fellowship", () => {
    const message = roster(
      [
        statusDefinition({ key: "present", label: "Present", color: "green" }),
        statusDefinition({ key: "apology", label: "Apology", color: "orange", behavior: "excused" }),
        statusDefinition({ key: "absent", label: "Absent", color: "red", behavior: "absent", isDefault: true }),
      ],
      [
        member("Zainab Musa", "present"),
        member("Uche Okafor", "apology"),
        member("Amaka Obi", "apology", { gender: "female" }),
      ],
      {
        orgName: "St Mary's Youth Fellowship",
        template: "generic",
        terminology: {
          ...DEFAULT_TERMINOLOGY,
          memberSingular: "Youth Member",
          memberPlural: "Youth Members",
          attendanceSingular: "Meeting",
        },
      },
    );

    expect(message).toContain("*ST MARY'S YOUTH FELLOWSHIP MEETING*");
    expect(message).toContain("*PRESENT YOUTH MEMBERS — 1*\n\nZainab Musa");
    expect(message).toContain("*APOLOGY — 2*\nAmaka Obi\nUche Okafor");
    expect(message).not.toMatch(/\(Apology\)|— Apology/);
    expect(message).toContain("*Absent Youth Members: 0*");
  });

  it("uses a neutral header when the organisation has no name", () => {
    const message = roster(TENNIS_STATUSES, [member("Ada", "played")], {
      orgName: "",
      template: "generic",
    });
    expect(message.startsWith("*ORGANISATION ATTENDANCE*")).toBe(true);
  });

  it("says nobody was present without an empty list", () => {
    const message = tennis([member("Ada", "absent")]);
    expect(message).toContain("*PRESENT PLAYERS — 0*\n\nNo players recorded as present.");
  });

  it("keeps manual additions, unresolved entries and unknown keys in the counts", () => {
    const entries: ShareMember[] = [
      member("Ada", "played"),
      member("Bayo", "late"), // e.g. a manual addition: present behaviour
      unresolved("played"),
      unresolved("injured"),
      member("Chidi", "mystery"), // unknown historical key fails closed
      unresolved("absent"),
    ];
    const message = tennis(entries);

    expect(message).toContain(
      "*PRESENT PLAYERS — 3*\n\nAda\nBayo\nFormer player (profile unavailable)",
    );
    expect(message).toContain("*INJURED — 1*\nFormer player (profile unavailable)");
    expect(message).toContain("*Absent Players: 2*");
    // 3 present + 1 excused + 2 absent = the six saved entries.
    expect(3 + 1 + 2).toBe(entries.length);
    expect(message).not.toMatch(CHOIR_WORDS);
  });

  it.each([
    ["strong", ["played", "played", "played", "played", "absent"], "Thank you for showing up and contributing to today's session."],
    ["low", ["played", "absent", "absent", "absent"], "Every person's presence makes a difference."],
    ["excused-heavy", ["played", "played", "apology", "apology", "absent"], "Thank you to everyone who was present and to those who let us know"],
    ["general", ["played", "played", "played", "absent", "absent"], "Thank you to everyone who attended or communicated their absence."],
  ])("picks a generic %s closing line from the saved totals", (_tone, keys, expected) => {
    const message = tennis(keys.map((key, i) => member(`M${i}`, key)));
    expect(message).toContain(expected);
    expect(message).not.toMatch(CHOIR_WORDS);
  });

  it("only ever picks closing lines free of choir language", () => {
    const sessions = [
      ["played", "played", "played"],
      ["absent", "absent", "played"],
      ["played", "apology", "absent"],
      ["played", "played", "apology", "absent", "absent"],
    ];
    sessions.forEach((keys) =>
      [0, 0.5, 0.99].forEach((r) => {
        const message = tennis(keys.map((key, i) => member(`M${i}`, key)), () => r);
        expect(message).not.toMatch(CHOIR_WORDS);
      }),
    );
  });
});

describe("buildAttendanceShareMessage — choir template", () => {
  const choir = (members: ShareMember[], random: () => number = () => 0) =>
    buildAttendanceShareMessage({
      orgName: "VOB Choir",
      sessionName: "Rehearsal",
      formattedDate: "Tue 01 Sep 26",
      members,
      statuses: createStatusConfig(CUSTOM_STATUSES),
      template: "choir",
      random,
    });

  it("is the template used when none is given", () => {
    const entries = [member("Ada", "present"), member("Bayo", "excused")];
    expect(build(entries)).toBe(choir(entries));
  });

  it.each([
    ["male", "Bro Ada"],
    ["female", "Sis Ada"],
    ["MALE", "Bro Ada"],
    ["  Female ", "Sis Ada"],
    ["", "Ada"],
    [undefined, "Ada"],
    ["nonbinary", "Ada"],
    ["other", "Ada"],
  ])("titles gender %p as %p", (gender, expected) => {
    const message = choir([member("Ada", "present", { gender })]);
    expect(message).toContain(`*Tenor — 1*\n${expected}`);
    expect(message.split("\n")).toContain(expected);
  });

  it("never guesses Sis for a member without a gender", () => {
    const message = choir([
      member("Ada", "present", { gender: undefined }),
      member("Bimpe", "excused", { gender: "" }),
    ]);
    expect(message).not.toMatch(/\bSis\b|\bBro\b/);
  });

  it.each([
    ["Bro John", "female"],
    ["Bro. John", "male"],
    ["sis Mary", "female"],
    ["Sis Mary", "male"],
  ])("keeps the saved title of %p (gender %p) without doubling it", (name, gender) => {
    const message = choir([member(name, "present", { gender })]);
    expect(message.split("\n")).toContain(name);
    expect(message).not.toMatch(/(Bro|Sis) (Bro|Sis)/i);
  });

  it("does not mistake a name that starts like a title for one", () => {
    expect(choir([member("Brooke", "present", { gender: "female" })])).toContain("Sis Brooke");
    expect(choir([member("Sisi", "present", { gender: "female" })])).toContain("Sis Sisi");
  });

  it("orders voice parts Soprano, Alto, Tenor, Bass, then other parts, then Other", () => {
    const message = choir([
      member("Tade", "present", { part: "Tenor" }),
      member("Bola", "present", { part: "bass" }),
      member("Ama", "late", { part: "alto", gender: "female" }),
      member("Sade", "present", { part: "SOPRANO", gender: "female" }),
      member("Bari", "present", { part: "Baritone" }),
      member("Nobody", "present", { part: "  " }),
      member("Ayo", "present", { part: "tenor" }),
    ]);

    expect(message).toContain(
      [
        "*PRESENT MEMBERS*",
        "*Soprano — 1*\nSis Sade",
        "*Alto — 1*\nSis Ama",
        "*Tenor — 2*\nBro Ayo\nBro Tade",
        "*Bass — 1*\nBro Bola",
        "*Baritone — 1*\nBro Bari",
        "*Other — 1*\nBro Nobody",
      ].join("\n\n"),
    );
  });

  it("lists names plainly when no present member has a voice part", () => {
    const message = choir([
      member("Bayo", "present", { part: undefined }),
      member("Ada", "late", { part: "" }),
    ]);
    expect(message).toContain("*PRESENT MEMBERS — 2*\n\nBro Ada\nBro Bayo");
    expect(message).not.toContain("*Other —");
  });

  it("shows an excused member's voice part only when one exists", () => {
    const message = choir([
      member("Ada", "excused", { part: "alto", gender: "female" }),
      member("Bayo", "excused", { part: undefined }),
    ]);
    expect(message).toContain("*EXCUSED — 2*\nSis Ada — Alto\nBro Bayo");
    expect(message).not.toContain("— Other");
  });

  it("keeps the music-themed header and closing lines", () => {
    const strong = choir([member("Ada", "present")]);
    expect(strong.startsWith("🎶 *VOB CHOIR ATTENDANCE*")).toBe(true);
    expect(strong).toContain("Great music is built long before the performance");
    expect(choir([member("Ada", "present")], () => 0.99)).toContain(
      "we become stronger as one choir",
    );
  });

  it("keeps the choir fallback header for an unnamed organisation", () => {
    expect(
      buildAttendanceShareMessage({
        orgName: "",
        sessionName: "Rehearsal",
        formattedDate: "Tue 01 Sep 26",
        members: [],
        statuses: createStatusConfig(CUSTOM_STATUSES),
        template: "choir",
        random: () => 0,
      }),
    ).toContain("🎶 *CHOIR ATTENDANCE*");
  });
});

describe("buildAttendanceShareMessage — both templates count the same roster", () => {
  const ENTRIES: ShareMember[] = [
    member("Ada", "present"),
    member("Bayo", "late", { status: "associate" }),
    member("Chidi", "excused"),
    member("Dayo", "no_show", { status: "inactive" }),
    member("Efe", "remote"), // inactive historical status, present behaviour
    member("Fola", "mystery"), // unknown key: absent
    unresolved("present"),
    unresolved("excused"),
    unresolved("no_show"),
  ];

  it.each(["generic", "choir"] as const)(
    "%s: present + excused + absent equals the saved roster",
    (template) => {
      const message = buildAttendanceShareMessage({
        orgName: "Org",
        sessionName: "Session",
        formattedDate: "Tue 01 Sep 26",
        members: ENTRIES,
        statuses: createStatusConfig(CUSTOM_STATUSES),
        template,
        random: () => 0,
      });

      expect(message).toContain(
        // Configured order; the inactive historical status is still listed.
        "✅ Present: 2  |  ✅ Late: 1  |  🟡 Excused: 2  |  ✅ Remote: 1",
      );
      expect(message).toContain("*EXCUSED — 2*");
      expect(message).toContain("*Absent Members: 3*");
      // 4 present + 2 excused + 3 absent = 9 saved entries.
      expect(4 + 2 + 3).toBe(ENTRIES.length);
      // Neither template invents a title for an unresolved profile.
      expect(message).not.toMatch(/(Bro|Sis) Former/);
      // 4 of 9 present (44%) with 22% excused: the excused-heavy tone.
      expect(message).toContain(
        template === "choir"
          ? "Let us keep growing in consistency and readiness."
          : "Let us keep growing in consistency and commitment.",
      );
    },
  );
});

describe("awayForShare", () => {
  const SESSION_DATE = "2026-10-06";
  // Shaped like GET /attendance/:organisationId/availability?date=… rows.
  const period = (
    memberId: string,
    name: string | null,
    startDate: string,
    endDate: string,
    over: Partial<AttendanceAvailability> = {},
  ): AttendanceAvailability => ({
    id: `${memberId}-${startDate}`,
    organisationId: "org1",
    memberId,
    member: name === null ? undefined : { id: memberId, name },
    startDate,
    endDate,
    reason: "Medical leave",
    createdBy: { id: "u1", username: "officer" },
    updatedBy: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...over,
  });
  const away = (
    periods: AttendanceAvailability[],
    rosterMemberIds: string[] = [],
    sessionDate = SESSION_DATE,
  ) => awayForShare(periods, { sessionDate, rosterMemberIds });

  it("lists names alphabetically with each period's end date", () => {
    expect(
      away([
        period("m2", "Chidi Bello", "2026-10-01", "2026-11-10"),
        period("m1", "Ada Okafor", "2026-10-06", "2026-10-25"),
      ]),
    ).toEqual([
      { name: "Ada Okafor", endDate: "2026-10-25" },
      { name: "Chidi Bello", endDate: "2026-11-10" },
    ]);
  });

  it.each([
    ["first day", "2026-10-06", "2026-10-20"],
    ["last day", "2026-09-30", "2026-10-06"],
    ["a one-day period", "2026-10-06", "2026-10-06"],
  ])("includes a period covering the session on its %s", (_case, start, end) => {
    expect(away([period("m1", "Ada", start, end)])).toEqual([
      { name: "Ada", endDate: end },
    ]);
  });

  it.each([
    ["ended the day before", "2026-09-01", "2026-10-05"],
    ["starts the day after", "2026-10-07", "2026-10-20"],
    ["has a malformed start", "06/10/2026", "2026-10-20"],
    ["has an impossible end", "2026-10-01", "2026-10-32"],
    ["ends on a timestamp", "2026-10-01", "2026-10-20T00:00:00.000Z"],
  ])("skips a period that %s", (_case, start, end) => {
    expect(away([period("m1", "Ada", start, end)])).toEqual([]);
  });

  it("lists nobody for an invalid session date", () => {
    expect(away([period("m1", "Ada", "2026-10-01", "2026-10-20")], [], "")).toEqual([]);
  });

  it("leaves out everyone on the saved roster, whatever their status", () => {
    // m1 present, m2 excused, m3 absent, m4 a manual Present addition, m5 an
    // entry whose profile no longer resolves: only m6 is away.
    const periods = ["m1", "m2", "m3", "m4", "m5", "m6"].map((id) =>
      period(id, `Name ${id}`, "2026-10-01", "2026-10-20"),
    );
    expect(away(periods, ["m1", "m2", "m3", "m4", "m5"])).toEqual([
      { name: "Name m6", endDate: "2026-10-20" },
    ]);
  });

  it("lists a member once, with the latest end date of overlapping periods", () => {
    expect(
      away([
        period("m1", "Ada", "2026-10-01", "2026-10-20"),
        period("m1", "Ada", "2026-10-05", "2026-12-01"),
        period("m1", "Ada", "2026-10-06", "2026-10-10"),
      ]),
    ).toEqual([{ name: "Ada", endDate: "2026-12-01" }]);
  });

  it("keeps two people who share a name, in a stable order", () => {
    const first = period("m1", "Ada Okafor", "2026-10-01", "2026-10-20");
    const second = period("m2", "Ada Okafor", "2026-10-01", "2026-10-20");
    const expected = [
      { name: "Ada Okafor", endDate: "2026-10-20" },
      { name: "Ada Okafor", endDate: "2026-10-20" },
    ];
    expect(away([first, second])).toEqual(expected);
    expect(away([second, first])).toEqual(expected);
  });

  it("skips rows without a member id or a name rather than inventing one", () => {
    expect(
      away([
        period("", "Ghost", "2026-10-01", "2026-10-20"),
        period("m2", null, "2026-10-01", "2026-10-20"),
        period("m3", "   ", "2026-10-01", "2026-10-20"),
        { ...period("m4", "Nameless", "2026-10-01", "2026-10-20"), member: null as never },
        period("m5", "Efe", "2026-10-01", "2026-10-20"),
      ]),
    ).toEqual([{ name: "Efe", endDate: "2026-10-20" }]);
  });

  it("keeps a saved title as part of the name", () => {
    expect(away([period("m1", "Bro Tunde", "2026-10-01", "2026-10-20")])).toEqual([
      { name: "Bro Tunde", endDate: "2026-10-20" },
    ]);
  });
});

describe("buildAttendanceShareMessage — AWAY section", () => {
  const TENNIS_STATUSES = [
    statusDefinition({ key: "played", label: "Played", color: "green" }),
    statusDefinition({ key: "away", label: "Away at Tournament", color: "orange", behavior: "excused" }),
    statusDefinition({ key: "absent", label: "Absent", color: "red", behavior: "absent", isDefault: true }),
  ];
  const ROSTER = [
    member("Babatunde Fasina", "played"),
    member("Obiageli Chukwu", "away", { gender: "female" }),
    member("Dayo Ade", "absent"),
  ];
  const AWAY = [
    { name: "Ada Okafor", endDate: "2026-10-25" },
    { name: "Chidi Bello", endDate: "2026-11-10" },
  ];
  const message = (
    template: "generic" | "choir",
    away?: { name: string; endDate: string }[],
    random: () => number = () => 0,
  ) => roster(TENNIS_STATUSES, ROSTER, { template, away, random });

  it.each(["generic", "choir"] as const)(
    "%s: lists AWAY after Excused and before the Absent count",
    (template) => {
      const text = message(template, AWAY);
      const away = "*AWAY — 2*\nAda Okafor — Until 25 Oct 2026\nChidi Bello — Until 10 Nov 2026";
      expect(text).toContain(`${away}\n\n🔴 *Absent Members: 1*`);
      expect(text.indexOf("*AWAY AT TOURNAMENT — 1*")).toBeLessThan(text.indexOf(away));
      // Plain names in both templates: never a guessed title.
      expect(text).not.toMatch(/(Bro|Sis) (Ada|Chidi)/);
    },
  );

  it("adds no figure in either template and lists AWAY identically in both", () => {
    const figures = (text: string) =>
      text
        .split("\n")
        .filter((line) => /: \d|— \d/.test(line) && !line.startsWith("*AWAY"));
    const generic = message("generic", AWAY);
    const choir = message("choir", AWAY);
    expect(figures(generic)).toEqual(figures(message("generic")));
    expect(figures(choir)).toEqual(figures(message("choir")));
    expect(generic.match(/\*AWAY — 2\*[^]*?\n\n/)?.[0]).toBe(
      choir.match(/\*AWAY — 2\*[^]*?\n\n/)?.[0],
    );
  });

  it.each(["generic", "choir"] as const)(
    "%s: is byte-for-byte unchanged with nobody away",
    (template) => {
      expect(message(template, [])).toBe(message(template));
    },
  );

  it("keeps an excused 'Away at Tournament' status in Excused, with no AWAY section", () => {
    const text = message("generic");
    expect(text).toContain("🟡 Away at Tournament: 1");
    expect(text).toContain("*AWAY AT TOURNAMENT — 1*\nObiageli Chukwu");
    expect(text).not.toMatch(/^\*AWAY — /m);
  });

  it("does not change the closing tone, however many are away", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `Member ${i}`,
      endDate: "2026-10-25",
    }));
    for (const template of ["generic", "choir"] as const) {
      const closing = (text: string) => text.split("\n\n").pop();
      expect(closing(message(template, many))).toBe(closing(message(template)));
    }
  });

  it("formats the end date the same in any device timezone", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["Pacific/Honolulu", "UTC", "Africa/Lagos", "Pacific/Kiritimati"]) {
        process.env.TZ = tz;
        expect(message("generic", [{ name: "Ada", endDate: "2026-10-25" }])).toContain(
          "Ada — Until 25 Oct 2026",
        );
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it("never prints a reason, start date or id", () => {
    const periods: AttendanceAvailability[] = [
      {
        id: "avail-77",
        organisationId: "org1",
        memberId: "member-42",
        member: { id: "member-42", name: "Ada Okafor" },
        startDate: "2026-10-01",
        endDate: "2026-10-25",
        reason: "Surgery recovery",
        createdBy: "user-9",
        updatedBy: null,
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:00:00.000Z",
      },
    ];
    const text = message(
      "choir",
      awayForShare(periods, { sessionDate: "2026-10-06", rosterMemberIds: [] }),
    );
    expect(text).toContain("*AWAY — 1*\nAda Okafor — Until 25 Oct 2026");
    expect(text).not.toMatch(/Surgery|avail-77|member-42|user-9|org1|01 Oct|2026-10-01/);
  });
});

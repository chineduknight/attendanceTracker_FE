import {
  clearNewAttendanceDraft,
  discardNewAttendanceDraft,
  expectedRosterDraftKey,
  manualRosterDraftKey,
  newAttendanceDraftIdentity,
  newAttendanceDraftToSession,
  organisationDraftKeys,
  readNewAttendanceDraft,
  writeNewAttendanceDraft,
} from "helpers/newAttendanceDraft";

const ORG = "orgA";
const OFFICER = "officerA";
const OTHER_OFFICER = "officerB";
// Keys are asserted as literals on purpose: they are what browsers hold.
const META_KEY = "attendance-new-draft-orgA-by-officerA";
// A draft saved before drafts had owners, under its original keys.
const LEGACY_META_KEY = "attendance-new-draft-orgA";
const LEGACY_ROSTER_KEY = "attendance-draft-orgA-2026-10-01-Sunday Mass";
const LEGACY_MANUAL_KEY = "attendance-manual-draft-orgA-2026-10-01-Sunday Mass";
const SESSION = {
  name: "Sunday Mass",
  date: "2026-10-01",
  categoryId: "c1",
  subCategoryId: "s1",
  eligibilityRules: [{ field: "part", values: ["soprano"] }],
};
/** A record as the pre-ownership frontend wrote it. */
const LEGACY_RECORD = { version: 1, organisationId: ORG, ...SESSION };
/** A current record, owned by OFFICER. */
const OWNED_RECORD = { ...LEGACY_RECORD, ownerId: OFFICER };
const seedLegacy = () => {
  localStorage.setItem(LEGACY_META_KEY, JSON.stringify(LEGACY_RECORD));
  localStorage.setItem(LEGACY_ROSTER_KEY, '[{"id":"m1","attendanceStatus":"late"}]');
  localStorage.setItem(LEGACY_MANUAL_KEY, "[]");
};
const legacyStorage = () =>
  [LEGACY_META_KEY, LEGACY_ROSTER_KEY, LEGACY_MANUAL_KEY].map((key) => localStorage.getItem(key));

const stored = (key = META_KEY) => JSON.parse(localStorage.getItem(key) as string);

beforeEach(() => localStorage.clear());

describe("newAttendanceDraft keys", () => {
  it("scopes an officer's roster keys to them", () => {
    const identity = newAttendanceDraftIdentity(SESSION);
    expect(identity).toBe("2026-10-01-Sunday Mass");
    expect(expectedRosterDraftKey(ORG, OFFICER, identity)).toBe(
      "attendance-draft-orgA-by-officerA-2026-10-01-Sunday Mass",
    );
    expect(manualRosterDraftKey(ORG, OFFICER, identity)).toBe(
      "attendance-manual-draft-orgA-by-officerA-2026-10-01-Sunday Mass",
    );
  });

  it("falls back for a half session, never producing an empty identity", () => {
    expect(newAttendanceDraftIdentity({})).toBe("undated-untitled");
    expect(newAttendanceDraftIdentity({ date: "2026-10-01" })).toBe(
      "2026-10-01-untitled",
    );
    expect(newAttendanceDraftIdentity({ name: "Sunday Mass" })).toBe(
      "undated-Sunday Mass",
    );
  });
});

describe("writeNewAttendanceDraft / readNewAttendanceDraft", () => {
  it("stores a stable normalised record owned by the officer and reads it back", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);

    expect(stored()).toEqual({
      version: 1,
      organisationId: ORG,
      ownerId: OFFICER,
      name: "Sunday Mass",
      date: "2026-10-01",
      categoryId: "c1",
      subCategoryId: "s1",
      eligibilityRules: [{ field: "part", values: ["soprano"] }],
    });
    expect(readNewAttendanceDraft(ORG, OFFICER)).toEqual(stored());
  });

  it("stores absent category values as null and rules as an array", () => {
    writeNewAttendanceDraft(ORG, OFFICER, {
      name: "Rehearsal",
      date: "2026-10-01",
    });

    expect(stored()).toEqual({
      version: 1,
      organisationId: ORG,
      ownerId: OFFICER,
      name: "Rehearsal",
      date: "2026-10-01",
      categoryId: null,
      subCategoryId: null,
      eligibilityRules: [],
    });
  });

  it("keeps drafts apart per organisation", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    expect(readNewAttendanceDraft("orgB", OFFICER)).toBeNull();
  });

  it("never gives one officer another officer's draft, nor anyone signed out", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)).toBeNull();
    expect(readNewAttendanceDraft(ORG, null)).toBeNull();
  });

  it("keeps two officers' drafts side by side, neither overwriting the other", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    writeNewAttendanceDraft(ORG, OTHER_OFFICER, { name: "Vigil", date: "2026-10-02" });
    expect(readNewAttendanceDraft(ORG, OFFICER)?.name).toBe("Sunday Mass");
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)?.name).toBe("Vigil");
  });

  it("never offers a legacy unowned draft to anyone, and leaves it exactly as it is", () => {
    seedLegacy();
    const before = legacyStorage();
    expect(readNewAttendanceDraft(ORG, OFFICER)).toBeNull();
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)).toBeNull();
    expect(readNewAttendanceDraft(ORG, null)).toBeNull();
    // Reading never moves, rewrites or claims it.
    expect(legacyStorage()).toEqual(before);
    expect(localStorage.getItem(META_KEY)).toBeNull();
  });

  it("still saves and reads the officer's own draft beside a legacy one", () => {
    seedLegacy();
    const before = legacyStorage();
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    expect(readNewAttendanceDraft(ORG, OFFICER)?.ownerId).toBe(OFFICER);
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)).toBeNull();
    expect(legacyStorage()).toEqual(before);
  });

  it.each([
    ["an owner other than its key's", META_KEY, { ...SESSION, version: 1, organisationId: ORG, ownerId: OTHER_OFFICER }],
    ["no owner under an owned key", META_KEY, LEGACY_RECORD],
  ])("ignores a record naming %s", (_label, key, record) => {
    localStorage.setItem(key, JSON.stringify(record));
    expect(readNewAttendanceDraft(ORG, OFFICER)).toBeNull();
  });

  it.each([
    ["missing record", null],
    ["broken json", "{ nope"],
    ["not an object", JSON.stringify("Sunday")],
    ["wrong version", JSON.stringify({ ...OWNED_RECORD, version: 2 })],
    [
      "foreign organisation",
      JSON.stringify({ ...OWNED_RECORD, organisationId: "orgB" }),
    ],
    ["blank name", JSON.stringify({ ...OWNED_RECORD, name: "   " })],
    ["missing date", JSON.stringify({ ...OWNED_RECORD, date: undefined })],
    ["wrong date shape", JSON.stringify({ ...OWNED_RECORD, date: "10/01/2026" })],
    ["impossible date", JSON.stringify({ ...OWNED_RECORD, date: "2026-10-32" })],
    [
      "rules not an array",
      JSON.stringify({ ...OWNED_RECORD, eligibilityRules: "all" }),
    ],
    [
      "unreadable rules",
      JSON.stringify({
        ...OWNED_RECORD,
        eligibilityRules: [{ field: "part", values: [] }],
      }),
    ],
  ])("ignores %s", (_label, value) => {
    if (value !== null) localStorage.setItem(META_KEY, value);
    expect(readNewAttendanceDraft(ORG, OFFICER)).toBeNull();
  });

  it("coerces non-string category values to null instead of failing the draft", () => {
    localStorage.setItem(
      META_KEY,
      JSON.stringify({ ...OWNED_RECORD, categoryId: 7, subCategoryId: {} }),
    );
    expect(readNewAttendanceDraft(ORG, OFFICER)).toMatchObject({
      categoryId: null,
      subCategoryId: null,
    });
  });
});

describe("newAttendanceDraftToSession", () => {
  it("shapes the working state exactly like the Continue payload", () => {
    writeNewAttendanceDraft(ORG, OFFICER, { name: "Rehearsal", date: "2026-10-01" });
    expect(newAttendanceDraftToSession(readNewAttendanceDraft(ORG, OFFICER)!)).toEqual({
      name: "Rehearsal",
      date: "2026-10-01",
      organisationId: ORG,
      eligibilityRules: [],
    });
  });

  it("keeps stored category ids and rules", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    expect(newAttendanceDraftToSession(readNewAttendanceDraft(ORG, OFFICER)!)).toEqual({
      name: "Sunday Mass",
      date: "2026-10-01",
      organisationId: ORG,
      categoryId: "c1",
      subCategoryId: "s1",
      eligibilityRules: [{ field: "part", values: ["soprano"] }],
    });
  });
});

describe("draft cleanup", () => {
  const identity = newAttendanceDraftIdentity(SESSION);
  const seedRosters = (organisationId: string, ownerId: string) => {
    localStorage.setItem(expectedRosterDraftKey(organisationId, ownerId, identity), "[]");
    localStorage.setItem(manualRosterDraftKey(organisationId, ownerId, identity), "[]");
  };
  const rostersOf = (organisationId: string, ownerId: string) => [
    localStorage.getItem(expectedRosterDraftKey(organisationId, ownerId, identity)),
    localStorage.getItem(manualRosterDraftKey(organisationId, ownerId, identity)),
  ];

  it("clearNewAttendanceDraft removes only the metadata", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    seedRosters(ORG, OFFICER);

    clearNewAttendanceDraft(ORG, OFFICER);

    expect(localStorage.getItem(META_KEY)).toBeNull();
    expect(rostersOf(ORG, OFFICER)).toEqual(["[]", "[]"]);
  });

  it("discardNewAttendanceDraft removes only that officer's draft", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    writeNewAttendanceDraft(ORG, OTHER_OFFICER, SESSION);
    writeNewAttendanceDraft("orgB", OFFICER, SESSION);
    seedLegacy();
    const legacyBefore = legacyStorage();
    seedRosters(ORG, OFFICER);
    seedRosters(ORG, OTHER_OFFICER);
    seedRosters("orgB", OFFICER);

    discardNewAttendanceDraft(ORG, { ...SESSION, ownerId: OFFICER });

    expect(localStorage.getItem(META_KEY)).toBeNull();
    expect(rostersOf(ORG, OFFICER)).toEqual([null, null]);
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)?.ownerId).toBe(OTHER_OFFICER);
    expect(rostersOf(ORG, OTHER_OFFICER)).toEqual(["[]", "[]"]);
    // Legacy data sharing the same session identity is not this discard's.
    expect(legacyStorage()).toEqual(legacyBefore);
    expect(readNewAttendanceDraft("orgB", OFFICER)).not.toBeNull();
    expect(rostersOf("orgB", OFFICER)).toEqual(["[]", "[]"]);
  });

  it("organisationDraftKeys lists every officer's and the legacy draft keys, for that organisation only", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    seedLegacy();
    seedRosters(ORG, OFFICER);
    writeNewAttendanceDraft("orgA2", OFFICER, SESSION);
    seedRosters("orgA2", OFFICER);
    localStorage.setItem("unrelated", "1");

    expect(organisationDraftKeys(ORG).sort()).toEqual(
      [
        META_KEY,
        LEGACY_META_KEY,
        expectedRosterDraftKey(ORG, OFFICER, identity),
        manualRosterDraftKey(ORG, OFFICER, identity),
        LEGACY_ROSTER_KEY,
        LEGACY_MANUAL_KEY,
      ].sort(),
    );
  });
});

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
// Keys are asserted as literals on purpose: they are what browsers already
// hold, and legacy drafts must keep resolving to exactly these.
const META_KEY = "attendance-new-draft-orgA-by-officerA";
const LEGACY_META_KEY = "attendance-new-draft-orgA";
const SESSION = {
  name: "Sunday Mass",
  date: "2026-10-01",
  categoryId: "c1",
  subCategoryId: "s1",
  eligibilityRules: [{ field: "part", values: ["soprano"] }],
};
/** A record as the pre-ownership frontend wrote it. */
const LEGACY_RECORD = { version: 1, organisationId: ORG, ...SESSION };

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

  it("keeps a legacy draft's original roster keys", () => {
    const identity = newAttendanceDraftIdentity(SESSION);
    expect(expectedRosterDraftKey(ORG, null, identity)).toBe(
      "attendance-draft-orgA-2026-10-01-Sunday Mass",
    );
    expect(manualRosterDraftKey(ORG, null, identity)).toBe(
      "attendance-manual-draft-orgA-2026-10-01-Sunday Mass",
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

  it("never gives one officer another officer's draft", () => {
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

  it("offers a legacy unowned draft to any officer, unchanged and unmigrated", () => {
    localStorage.setItem(LEGACY_META_KEY, JSON.stringify(LEGACY_RECORD));
    const legacy = { ...LEGACY_RECORD, ownerId: null };
    expect(readNewAttendanceDraft(ORG, OFFICER)).toEqual(legacy);
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)).toEqual(legacy);
    // Reading never moves or rewrites it.
    expect(stored(LEGACY_META_KEY)).toEqual(LEGACY_RECORD);
    expect(localStorage.getItem(META_KEY)).toBeNull();
  });

  it("prefers the officer's own draft over a legacy one", () => {
    localStorage.setItem(LEGACY_META_KEY, JSON.stringify(LEGACY_RECORD));
    writeNewAttendanceDraft(ORG, OFFICER, { name: "Vigil", date: "2026-10-02" });
    expect(readNewAttendanceDraft(ORG, OFFICER)?.name).toBe("Vigil");
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)?.ownerId).toBeNull();
  });

  it.each([
    ["an owner other than its key's", META_KEY, { ...SESSION, version: 1, organisationId: ORG, ownerId: OTHER_OFFICER }],
    ["an owner under the legacy key", LEGACY_META_KEY, { ...LEGACY_RECORD, ownerId: OTHER_OFFICER }],
  ])("ignores a record naming %s", (_label, key, record) => {
    localStorage.setItem(key, JSON.stringify(record));
    expect(readNewAttendanceDraft(ORG, OFFICER)).toBeNull();
  });

  it.each([
    ["missing record", null],
    ["broken json", "{ nope"],
    ["not an object", JSON.stringify("Sunday")],
    ["wrong version", JSON.stringify({ ...LEGACY_RECORD, version: 2 })],
    [
      "foreign organisation",
      JSON.stringify({ ...LEGACY_RECORD, organisationId: "orgB" }),
    ],
    ["blank name", JSON.stringify({ ...LEGACY_RECORD, name: "   " })],
    ["missing date", JSON.stringify({ ...LEGACY_RECORD, date: undefined })],
    ["wrong date shape", JSON.stringify({ ...LEGACY_RECORD, date: "10/01/2026" })],
    ["impossible date", JSON.stringify({ ...LEGACY_RECORD, date: "2026-10-32" })],
    [
      "rules not an array",
      JSON.stringify({ ...LEGACY_RECORD, eligibilityRules: "all" }),
    ],
    [
      "unreadable rules",
      JSON.stringify({
        ...LEGACY_RECORD,
        eligibilityRules: [{ field: "part", values: [] }],
      }),
    ],
  ])("ignores %s", (_label, value) => {
    if (value !== null) localStorage.setItem(LEGACY_META_KEY, value);
    expect(readNewAttendanceDraft(ORG, OFFICER)).toBeNull();
  });

  it("coerces non-string category values to null instead of failing the draft", () => {
    localStorage.setItem(
      LEGACY_META_KEY,
      JSON.stringify({ ...LEGACY_RECORD, categoryId: 7, subCategoryId: {} }),
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
  const seedRosters = (organisationId: string, ownerId: string | null) => {
    localStorage.setItem(expectedRosterDraftKey(organisationId, ownerId, identity), "[]");
    localStorage.setItem(manualRosterDraftKey(organisationId, ownerId, identity), "[]");
  };
  const rostersOf = (organisationId: string, ownerId: string | null) => [
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
    localStorage.setItem(LEGACY_META_KEY, JSON.stringify(LEGACY_RECORD));
    seedRosters(ORG, OFFICER);
    seedRosters(ORG, OTHER_OFFICER);
    seedRosters(ORG, null);
    seedRosters("orgB", OFFICER);

    discardNewAttendanceDraft(ORG, { ...SESSION, ownerId: OFFICER });

    expect(localStorage.getItem(META_KEY)).toBeNull();
    expect(rostersOf(ORG, OFFICER)).toEqual([null, null]);
    expect(readNewAttendanceDraft(ORG, OTHER_OFFICER)?.ownerId).toBe(OTHER_OFFICER);
    expect(rostersOf(ORG, OTHER_OFFICER)).toEqual(["[]", "[]"]);
    expect(stored(LEGACY_META_KEY)).toEqual(LEGACY_RECORD);
    expect(rostersOf(ORG, null)).toEqual(["[]", "[]"]);
    expect(readNewAttendanceDraft("orgB", OFFICER)).not.toBeNull();
    expect(rostersOf("orgB", OFFICER)).toEqual(["[]", "[]"]);
  });

  it("discards a legacy draft by its original keys", () => {
    localStorage.setItem(LEGACY_META_KEY, JSON.stringify(LEGACY_RECORD));
    seedRosters(ORG, null);
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    seedRosters(ORG, OFFICER);

    discardNewAttendanceDraft(ORG, { ...SESSION, ownerId: null });

    expect(localStorage.getItem(LEGACY_META_KEY)).toBeNull();
    expect(rostersOf(ORG, null)).toEqual([null, null]);
    expect(readNewAttendanceDraft(ORG, OFFICER)?.ownerId).toBe(OFFICER);
    expect(rostersOf(ORG, OFFICER)).toEqual(["[]", "[]"]);
  });

  it("organisationDraftKeys lists every officer's and the legacy draft keys, for that organisation only", () => {
    writeNewAttendanceDraft(ORG, OFFICER, SESSION);
    localStorage.setItem(LEGACY_META_KEY, JSON.stringify(LEGACY_RECORD));
    seedRosters(ORG, OFFICER);
    seedRosters(ORG, null);
    writeNewAttendanceDraft("orgA2", OFFICER, SESSION);
    seedRosters("orgA2", OFFICER);
    localStorage.setItem("unrelated", "1");

    expect(organisationDraftKeys(ORG).sort()).toEqual(
      [
        META_KEY,
        LEGACY_META_KEY,
        expectedRosterDraftKey(ORG, OFFICER, identity),
        manualRosterDraftKey(ORG, OFFICER, identity),
        expectedRosterDraftKey(ORG, null, identity),
        manualRosterDraftKey(ORG, null, identity),
      ].sort(),
    );
  });
});

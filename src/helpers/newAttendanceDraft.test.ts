import {
  clearNewAttendanceDraft,
  discardNewAttendanceDraft,
  expectedRosterDraftKey,
  manualRosterDraftKey,
  newAttendanceDraftIdentity,
  newAttendanceDraftToSession,
  readNewAttendanceDraft,
  writeNewAttendanceDraft,
} from "helpers/newAttendanceDraft";

const ORG = "orgA";
const META_KEY = "attendance-new-draft-orgA";
const SESSION = {
  version: 1,
  organisationId: ORG,
  name: "Sunday Mass",
  date: "2026-10-01",
  categoryId: "c1",
  subCategoryId: "s1",
  eligibilityRules: [{ field: "part", values: ["soprano"] }],
};

const stored = () => JSON.parse(localStorage.getItem(META_KEY) as string);

beforeEach(() => localStorage.clear());

describe("newAttendanceDraft keys", () => {
  it("derives the same identity and roster keys the marking pages use", () => {
    const identity = newAttendanceDraftIdentity(SESSION);
    expect(identity).toBe("2026-10-01-Sunday Mass");
    expect(expectedRosterDraftKey(ORG, identity)).toBe(
      "attendance-draft-orgA-2026-10-01-Sunday Mass",
    );
    expect(manualRosterDraftKey(ORG, identity)).toBe(
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
  it("stores a stable normalised record and reads it back", () => {
    writeNewAttendanceDraft(ORG, SESSION);

    expect(stored()).toEqual({
      version: 1,
      organisationId: ORG,
      name: "Sunday Mass",
      date: "2026-10-01",
      categoryId: "c1",
      subCategoryId: "s1",
      eligibilityRules: [{ field: "part", values: ["soprano"] }],
    });
    expect(readNewAttendanceDraft(ORG)).toEqual(stored());
  });

  it("stores absent category values as null and rules as an array", () => {
    writeNewAttendanceDraft(ORG, {
      name: "Rehearsal",
      date: "2026-10-01",
    });

    expect(stored()).toEqual({
      version: 1,
      organisationId: ORG,
      name: "Rehearsal",
      date: "2026-10-01",
      categoryId: null,
      subCategoryId: null,
      eligibilityRules: [],
    });
  });

  it("keeps drafts apart per organisation", () => {
    writeNewAttendanceDraft(ORG, SESSION);
    expect(readNewAttendanceDraft("orgB")).toBeNull();
  });

  it.each([
    ["missing record", null],
    ["broken json", "{ nope"],
    ["not an object", JSON.stringify("Sunday")],
    ["wrong version", JSON.stringify({ ...SESSION, version: 2 })],
    [
      "foreign organisation",
      JSON.stringify({ ...SESSION, organisationId: "orgB" }),
    ],
    ["blank name", JSON.stringify({ ...SESSION, name: "   " })],
    ["missing date", JSON.stringify({ ...SESSION, date: undefined })],
    ["wrong date shape", JSON.stringify({ ...SESSION, date: "10/01/2026" })],
    ["impossible date", JSON.stringify({ ...SESSION, date: "2026-10-32" })],
    [
      "rules not an array",
      JSON.stringify({ ...SESSION, eligibilityRules: "all" }),
    ],
    [
      "unreadable rules",
      JSON.stringify({
        ...SESSION,
        eligibilityRules: [{ field: "part", values: [] }],
      }),
    ],
  ])("ignores %s", (_label, value) => {
    if (value !== null) localStorage.setItem(META_KEY, value);
    expect(readNewAttendanceDraft(ORG)).toBeNull();
  });

  it("coerces non-string category values to null instead of failing the draft", () => {
    localStorage.setItem(
      META_KEY,
      JSON.stringify({ ...SESSION, categoryId: 7, subCategoryId: {} }),
    );
    expect(readNewAttendanceDraft(ORG)).toMatchObject({
      categoryId: null,
      subCategoryId: null,
    });
  });
});

describe("newAttendanceDraftToSession", () => {
  it("shapes the working state exactly like the Continue payload", () => {
    writeNewAttendanceDraft(ORG, { name: "Rehearsal", date: "2026-10-01" });
    expect(newAttendanceDraftToSession(readNewAttendanceDraft(ORG)!)).toEqual({
      name: "Rehearsal",
      date: "2026-10-01",
      eligibilityRules: [],
    });
  });

  it("keeps stored category ids and rules", () => {
    writeNewAttendanceDraft(ORG, SESSION);
    expect(newAttendanceDraftToSession(readNewAttendanceDraft(ORG)!)).toEqual({
      name: "Sunday Mass",
      date: "2026-10-01",
      categoryId: "c1",
      subCategoryId: "s1",
      eligibilityRules: [{ field: "part", values: ["soprano"] }],
    });
  });
});

describe("draft cleanup", () => {
  it("clearNewAttendanceDraft removes only the metadata", () => {
    writeNewAttendanceDraft(ORG, SESSION);
    const identity = newAttendanceDraftIdentity(SESSION);
    localStorage.setItem(expectedRosterDraftKey(ORG, identity), "[]");
    localStorage.setItem(manualRosterDraftKey(ORG, identity), "[]");

    clearNewAttendanceDraft(ORG);

    expect(localStorage.getItem(META_KEY)).toBeNull();
    expect(localStorage.getItem(expectedRosterDraftKey(ORG, identity))).toBe(
      "[]",
    );
    expect(localStorage.getItem(manualRosterDraftKey(ORG, identity))).toBe(
      "[]",
    );
  });

  it("discardNewAttendanceDraft removes the metadata and both roster drafts, leaving other organisations alone", () => {
    writeNewAttendanceDraft(ORG, SESSION);
    writeNewAttendanceDraft("orgB", {
      ...SESSION,
      name: "Vigil",
    });
    const identity = newAttendanceDraftIdentity(SESSION);
    localStorage.setItem(expectedRosterDraftKey(ORG, identity), "[]");
    localStorage.setItem(manualRosterDraftKey(ORG, identity), "[]");
    const otherIdentity = newAttendanceDraftIdentity({
      date: "2026-10-02",
      name: "Vigil",
    });
    localStorage.setItem(expectedRosterDraftKey("orgB", otherIdentity), "[]");

    discardNewAttendanceDraft(ORG, SESSION);

    expect(localStorage.getItem(META_KEY)).toBeNull();
    expect(
      localStorage.getItem(expectedRosterDraftKey(ORG, identity)),
    ).toBeNull();
    expect(
      localStorage.getItem(manualRosterDraftKey(ORG, identity)),
    ).toBeNull();
    expect(readNewAttendanceDraft("orgB")).not.toBeNull();
    expect(
      localStorage.getItem(expectedRosterDraftKey("orgB", otherIdentity)),
    ).toBe("[]");
  });
});

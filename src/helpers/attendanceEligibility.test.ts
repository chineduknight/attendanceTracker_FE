import {
  countEligibleMembers,
  eligibilityFields,
  eligibilityIssues,
  filterEligibleMembers,
  matchesEligibility,
  normalizeEligibilityRules,
  setRuleValues,
  summarizeEligibilityRules,
} from "helpers/attendanceEligibility";
import { MEMBER_MODEL, ROSTER } from "test-utils/eligibilityFixtures";

const names = (rules: Parameters<typeof filterEligibleMembers>[1]) =>
  filterEligibleMembers(ROSTER, rules).map((m) => m.name);

describe("eligibilityFields", () => {
  it("offers only option fields with options", () => {
    const fields = eligibilityFields([
      ...MEMBER_MODEL,
      { name: "joined", type: "date" },
      { name: "team", type: "option", options: [] },
    ]);
    expect(fields.map((f) => f.name)).toEqual(["part", "gender", "status", "probationstatus"]);
  });

  it("tolerates a missing model", () => {
    expect(eligibilityFields(undefined)).toEqual([]);
  });
});

describe("matching", () => {
  it("[] matches everyone", () => {
    expect(names([])).toHaveLength(8);
  });

  it("one field, one value", () => {
    expect(names([{ field: "part", values: ["soprano"] }])).toEqual(["Ada", "Bisi"]);
  });

  it("ORs values within a field", () => {
    expect(names([{ field: "part", values: ["soprano", "alto"] }])).toEqual([
      "Ada", "Bisi", "Chioma", "Dayo",
    ]);
  });

  it("ANDs across fields", () => {
    expect(
      names([
        { field: "part", values: ["soprano", "alto"] },
        { field: "status", values: ["active"] },
      ])
    ).toEqual(["Ada", "Chioma"]);
  });

  it("does not match a member missing the field", () => {
    const hana = ROSTER.find((m) => m.name === "Hana")!;
    expect(matchesEligibility(hana, [{ field: "part", values: ["soprano", "alto", "tenor", "bass"] }])).toBe(false);
    expect(matchesEligibility(hana, [{ field: "status", values: ["active"] }])).toBe(true);
  });

  it("counts eligible members", () => {
    expect(countEligibleMembers(ROSTER, [{ field: "gender", values: ["male"] }])).toBe(3);
  });
});

describe("normalizeEligibilityRules", () => {
  it("turns anything but an array into Everyone", () => {
    expect(normalizeEligibilityRules(undefined)).toEqual([]);
    expect(normalizeEligibilityRules(null)).toEqual([]);
    expect(normalizeEligibilityRules({ field: "part" })).toEqual([]);
  });

  it("drops malformed and empty rules, de-duplicates values and merges fields", () => {
    expect(
      normalizeEligibilityRules([
        { field: "part", values: ["soprano", "soprano"] },
        { field: "status", values: [] },
        { field: "", values: ["x"] },
        { values: ["x"] },
        "part",
        { field: "part", values: ["alto", 3, ""] },
      ])
    ).toEqual([{ field: "part", values: ["soprano", "alto"] }]);
  });
});

describe("eligibilityIssues", () => {
  it("is empty for rules the model still understands", () => {
    expect(eligibilityIssues([{ field: "part", values: ["alto"] }], MEMBER_MODEL)).toEqual([]);
  });

  it("flags a removed field, a non-option field and a removed option", () => {
    expect(
      eligibilityIssues(
        [
          { field: "section", values: ["a"] },
          { field: "profession", values: ["Engineer"] },
          { field: "part", values: ["alto", "mezzo"] },
        ],
        MEMBER_MODEL
      )
    ).toEqual([
      { field: "section", kind: "missing-field" },
      { field: "profession", kind: "not-option" },
      { field: "part", kind: "missing-option", values: ["mezzo"] },
    ]);
  });
});

describe("summarizeEligibilityRules", () => {
  it("reads as a friendly sentence", () => {
    expect(
      summarizeEligibilityRules([
        { field: "part", values: ["soprano", "alto"] },
        { field: "status", values: ["active"] },
      ])
    ).toBe("Part: Soprano, Alto · Status: Active");
    expect(summarizeEligibilityRules([])).toBe("Everyone");
  });
});

describe("setRuleValues", () => {
  const rules = [
    { field: "part", values: ["soprano"] },
    { field: "status", values: ["active"] },
  ];

  it("replaces a field in place, appends a new one and removes an emptied one", () => {
    expect(setRuleValues(rules, "part", ["alto"])).toEqual([
      { field: "part", values: ["alto"] },
      { field: "status", values: ["active"] },
    ]);
    expect(setRuleValues(rules, "gender", ["male"])).toHaveLength(3);
    expect(setRuleValues(rules, "part", [])).toEqual([{ field: "status", values: ["active"] }]);
  });
});

import {
  countEligibleMembers,
  describeEligibilityIssue,
  isUnreadableEligibility,
  eligibilityFields,
  eligibilityIssues,
  filterEligibleMembers,
  matchesEligibility,
  normalizeEligibilityRules,
  setRuleValues,
  summarizeEligibilityRules,
} from "helpers/attendanceEligibility";
import { MEMBER_MODEL, ROSTER } from "test-utils/eligibilityFixtures";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

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

describe("isUnreadableEligibility", () => {
  it("only treats missing rules as readable Everyone", () => {
    expect(isUnreadableEligibility(undefined)).toBe(false);
    expect(isUnreadableEligibility(null)).toBe(false);
    expect(isUnreadableEligibility([])).toBe(false);
    expect(isUnreadableEligibility([{ field: "part", values: ["alto"] }])).toBe(false);
    expect(isUnreadableEligibility("part")).toBe(true);
    expect(isUnreadableEligibility([{ field: "part", values: [] }])).toBe(true);
    expect(isUnreadableEligibility([{ field: "part", values: [3] }])).toBe(true);
  });
});

describe("describeEligibilityIssue", () => {
  it("names the field and options", () => {
    expect(describeEligibilityIssue({ field: "section", kind: "missing-field" })).toBe(
      "Section is no longer a member field."
    );
    expect(describeEligibilityIssue({ field: "profession", kind: "not-option" })).toBe(
      "Profession is no longer an option field."
    );
    expect(
      describeEligibilityIssue({ field: "part", kind: "missing-option", values: ["mezzo", "contralto"] })
    ).toBe("Part: Mezzo, Contralto are no longer an option.");
  });

  it("names the organisation's member term", () => {
    const terms = { ...DEFAULT_TERMINOLOGY, memberSingular: "Student" };
    expect(
      describeEligibilityIssue({ field: "section", kind: "missing-field" }, undefined, terms)
    ).toBe("Section is no longer a student field.");
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

describe("backend-compatible casing", () => {
  it("matches member values and field names case-insensitively", () => {
    const legacy = { id: "x", name: "Legacy", Part: " Soprano " };
    expect(matchesEligibility(legacy, [{ field: "part", values: ["soprano"] }])).toBe(true);
    expect(matchesEligibility(legacy, [{ field: "part", values: ["alto"] }])).toBe(false);
  });

  it("does not flag a stored lowercased field or canonical option as stale", () => {
    const model = [{ name: "Part", type: "option", options: ["Soprano", "Alto"] }];
    expect(eligibilityIssues([{ field: "part", values: ["soprano"] }], model)).toEqual([]);
  });
});

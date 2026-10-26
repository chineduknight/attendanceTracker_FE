import {
  readMemberListParams,
  reconcileMemberListFilters,
  writeMemberListParams,
} from "helpers/memberListFilters";

const p = (query: string) => new URLSearchParams(query);

describe("readMemberListParams", () => {
  it("reads the search and each selected option value", () => {
    expect(
      readMemberListParams(p("q=ada&filter.part=soprano&filter.part=alto")),
    ).toEqual({
      q: "ada",
      filters: { part: ["soprano", "alto"] },
    });
  });

  it("ignores unrelated, empty and duplicate params", () => {
    expect(
      readMemberListParams(
        p("q=ada&filter.part=soprano&filter.part=soprano&filter.=alto&filter.voice="),
      ),
    ).toEqual({
      q: "ada",
      filters: { part: ["soprano"] },
    });
  });

  it("starts empty when the address carries no list state", () => {
    expect(readMemberListParams(p("org=o1"))).toEqual({ q: "", filters: {} });
  });
});

describe("writeMemberListParams", () => {
  it("writes the search and one param per selected value", () => {
    expect(
      writeMemberListParams({
        q: "ada",
        filters: { part: ["soprano", "alto"] },
      }).toString(),
    ).toBe("q=ada&filter.part=soprano&filter.part=alto");
  });

  it("omits cleared values and keeps unrelated params", () => {
    expect(
      writeMemberListParams(
        { q: "", filters: {} },
        p("theme=dark&q=old&filter.part=tenor"),
      ).toString(),
    ).toBe("theme=dark");
  });

  it("keeps an option value containing a comma whole", () => {
    const written = writeMemberListParams({
      q: "",
      filters: { part: ["Soprano, first"] },
    });
    expect(written.getAll("filter.part")).toEqual(["Soprano, first"]);
  });
});

describe("reconcileMemberListFilters", () => {
  const FIELDS = [
    { name: "part", options: ["soprano", "tenor"] },
    { name: "voice", options: ["bass"] },
  ];

  it("keeps filters the model still offers", () => {
    expect(
      reconcileMemberListFilters({ part: ["tenor"], voice: ["bass"] }, FIELDS),
    ).toEqual({ part: ["tenor"], voice: ["bass"] });
  });

  it("drops an unknown field and an option that no longer exists", () => {
    expect(
      reconcileMemberListFilters(
        { part: ["mezzo", "tenor"], section: ["front"] },
        FIELDS,
      ),
    ).toEqual({ part: ["tenor"] });
  });
});

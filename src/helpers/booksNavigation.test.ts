import {
  BOOKS_HOME,
  BooksLocation,
  parentOf,
  readBooksLocation,
  readFinanceTab,
  writeBooksLocation,
  writeFinanceTab,
} from "helpers/booksNavigation";

const p = (query: string) => new URLSearchParams(query);

describe("readFinanceTab", () => {
  it("defaults to Collect when the tab is missing or unknown", () => {
    expect(readFinanceTab(p(""))).toBe("collect");
    expect(readFinanceTab(p("tab=nope"))).toBe("collect");
  });

  it("reads a known tab", () => {
    expect(readFinanceTab(p("tab=books"))).toBe("books");
    expect(readFinanceTab(p("tab=start-dates"))).toBe("start-dates");
  });
});

describe("writeFinanceTab", () => {
  it("drops every Books param when leaving Books", () => {
    const next = writeFinanceTab(p("tab=books&books=reports&org=o1&journal=j1&sheet=money-in"), "collect");
    expect(next.toString()).toBe("tab=collect");
  });

  it("keeps unrelated params", () => {
    expect(writeFinanceTab(p("x=1"), "books").toString()).toBe("x=1&tab=books");
  });
});

describe("readBooksLocation", () => {
  it("reads a screen for the organisation that wrote it", () => {
    expect(readBooksLocation(p("tab=books&books=reports&org=o1"), "o1")).toEqual({
      location: { screen: "reports", sheet: null, journalId: null },
      valid: true,
    });
  });

  it("ignores another organisation's Books params", () => {
    expect(readBooksLocation(p("tab=books&books=entry&journal=j1&org=o1"), "o2")).toEqual({
      location: BOOKS_HOME,
      valid: false,
    });
  });

  it("treats no Books params as the Overview", () => {
    expect(readBooksLocation(p("tab=books"), "o1")).toEqual({ location: BOOKS_HOME, valid: true });
  });

  it("rejects an entry without a journal, an unknown sheet and an unknown screen", () => {
    expect(readBooksLocation(p("books=entry&org=o1"), "o1").valid).toBe(false);
    expect(readBooksLocation(p("sheet=bogus&org=o1"), "o1").valid).toBe(false);
    expect(readBooksLocation(p("books=bogus&org=o1"), "o1").valid).toBe(false);
  });
});

describe("writeBooksLocation", () => {
  const all: BooksLocation[] = [
    ...(
      [
        "overview",
        "transactions",
        "reports",
        "held",
        "manage",
        "manage-status",
        "manage-setup",
        "manage-opening",
        "manage-reconciliation",
        "manage-attempts",
      ] as const
    ).map((screen) => ({ screen, sheet: null, journalId: null })),
    { screen: "overview", sheet: "money-in", journalId: null },
    { screen: "entry", sheet: null, journalId: "j1" },
  ];

  it.each(all)("round-trips %o", (location) => {
    const written = writeBooksLocation(new URLSearchParams(), "o1", location);
    expect(written.get("tab")).toBe("books");
    expect(written.get("org")).toBe("o1");
    expect(readBooksLocation(written, "o1")).toEqual({ location, valid: true });
  });

  it("omits defaults", () => {
    expect(writeBooksLocation(p("tab=books&books=reports&org=o1"), "o1", BOOKS_HOME).toString()).toBe(
      "tab=books&org=o1",
    );
  });
});

describe("parentOf", () => {
  it("steps back one level", () => {
    expect(parentOf({ screen: "manage-setup", sheet: null, journalId: null }).screen).toBe("manage");
    expect(parentOf({ screen: "entry", sheet: null, journalId: "j1" })).toEqual({
      screen: "transactions",
      sheet: null,
      journalId: null,
    });
    expect(parentOf({ screen: "overview", sheet: "transfer", journalId: null })).toEqual(BOOKS_HOME);
    expect(parentOf({ screen: "manage", sheet: null, journalId: null })).toEqual(BOOKS_HOME);
  });
});

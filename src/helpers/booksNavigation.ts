/**
 * Where the officer is inside Finance, kept in the `/finance` query string so
 * the phone's Back and Forward move through the Books screens.
 *
 * Books params are tied to the organisation that wrote them (`org`): after an
 * organisation switch, Back can land on a URL holding Organisation A's screen
 * or journal id, and that must never be read under Organisation B.
 */

export const FINANCE_TABS = ["collect", "obligations", "start-dates", "books"] as const;
export type FinanceTab = (typeof FINANCE_TABS)[number];

export const BOOKS_SCREENS = [
  "overview",
  "transactions",
  "reports",
  "held",
  "entry",
  "manage",
  "manage-status",
  "manage-setup",
  "manage-opening",
  "manage-reconciliation",
  "manage-attempts",
] as const;
export type BooksScreen = (typeof BOOKS_SCREENS)[number];

export const BOOKS_SHEETS = ["money-in", "money-out", "transfer"] as const;
export type BooksSheet = (typeof BOOKS_SHEETS)[number];

export interface BooksLocation {
  screen: BooksScreen;
  sheet: BooksSheet | null;
  journalId: string | null;
}

export const BOOKS_HOME: BooksLocation = { screen: "overview", sheet: null, journalId: null };

const TAB = "tab";
const SCREEN = "books";
const SHEET = "sheet";
const JOURNAL = "journal";
const ORG = "org";
const BOOKS_PARAMS = [SCREEN, SHEET, JOURNAL, ORG];

const isOneOf = <T extends string>(values: readonly T[], value: string | null): value is T =>
  value !== null && (values as readonly string[]).includes(value);

export const readFinanceTab = (params: URLSearchParams): FinanceTab => {
  const tab = params.get(TAB);
  return isOneOf(FINANCE_TABS, tab) ? tab : "collect";
};

export const writeFinanceTab = (params: URLSearchParams, tab: FinanceTab): URLSearchParams => {
  const next = new URLSearchParams(params);
  if (tab !== "books") BOOKS_PARAMS.forEach((key) => next.delete(key));
  next.set(TAB, tab);
  return next;
};

/** `valid: false` asks the caller to replace the URL with the Books Overview. */
export const readBooksLocation = (
  params: URLSearchParams,
  organisationId: string,
): { location: BooksLocation; valid: boolean } => {
  const screen = params.get(SCREEN);
  const sheet = params.get(SHEET);
  const journalId = params.get(JOURNAL);
  if (screen === null && sheet === null && journalId === null) {
    return { location: BOOKS_HOME, valid: true };
  }
  const location: BooksLocation = {
    screen: isOneOf(BOOKS_SCREENS, screen) ? screen : "overview",
    sheet: isOneOf(BOOKS_SHEETS, sheet) ? sheet : null,
    journalId: journalId || null,
  };
  const valid =
    params.get(ORG) === organisationId &&
    (screen === null || isOneOf(BOOKS_SCREENS, screen)) &&
    (sheet === null || isOneOf(BOOKS_SHEETS, sheet)) &&
    (location.screen === "entry") === (location.journalId !== null);
  return valid ? { location, valid } : { location: BOOKS_HOME, valid: false };
};

export const writeBooksLocation = (
  params: URLSearchParams,
  organisationId: string,
  location: BooksLocation,
): URLSearchParams => {
  const next = new URLSearchParams(params);
  BOOKS_PARAMS.forEach((key) => next.delete(key));
  next.set(TAB, "books");
  next.set(ORG, organisationId);
  if (location.screen !== "overview") next.set(SCREEN, location.screen);
  if (location.sheet) next.set(SHEET, location.sheet);
  if (location.screen === "entry" && location.journalId) next.set(JOURNAL, location.journalId);
  return next;
};

export const parentOf = (location: BooksLocation): BooksLocation => {
  if (location.sheet) return { ...location, sheet: null };
  if (location.screen === "entry") return { screen: "transactions", sheet: null, journalId: null };
  if (location.screen.startsWith("manage-")) return { screen: "manage", sheet: null, journalId: null };
  return BOOKS_HOME;
};

import { format, isValid, parseISO } from "date-fns";
import { DATE_INPUT_FORMAT, DATE_PRESETS } from "components/analytics/useDateRange";

export type AnalyticsView = "list" | "grid";

/** The report that was searched: what the backend is asked for. */
export interface AnalyticsSearch {
  fromDate: string;
  toDate: string;
  /** Member statuses; empty means all. */
  statuses: string[];
}

/**
 * Everything the Analytics page keeps in its address, so Back from a member
 * (or a refresh) returns to the same report instead of an empty page.
 */
export interface AnalyticsPageState extends AnalyticsSearch {
  /** null until the officer picks one; the page then follows screen width. */
  view: AnalyticsView | null;
  /** Name search over the report on screen. */
  q: string;
  /** The member last opened from this report, marked on return. */
  member: string | null;
}

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isBusinessDate = (value: string | null): value is string =>
  Boolean(value && BUSINESS_DATE.test(value) && isValid(parseISO(value)));

/** The first visit's report: This Month. */
export const defaultRange = (today: Date) => {
  const { from, to } = DATE_PRESETS[0].getRange(today);
  return {
    fromDate: format(from, DATE_INPUT_FORMAT),
    toDate: format(to, DATE_INPUT_FORMAT),
  };
};

/**
 * Reads the page state from the address. A missing or malformed range (a
 * hand-edited link, From after To) falls back to This Month as a whole, so a
 * half-valid range never runs.
 */
export const readAnalyticsParams = (
  params: URLSearchParams,
  today: Date
): AnalyticsPageState => {
  const from = params.get("fromDate");
  const to = params.get("toDate");
  const range =
    isBusinessDate(from) && isBusinessDate(to) && from <= to
      ? { fromDate: from, toDate: to }
      : defaultRange(today);
  const view = params.get("view");
  return {
    ...range,
    statuses: (params.get("status") ?? "").split(",").filter(Boolean),
    view: view === "list" || view === "grid" ? view : null,
    q: params.get("q") ?? "",
    member: params.get("member") || null,
  };
};

export const writeAnalyticsParams = (state: AnalyticsPageState): URLSearchParams => {
  const params = new URLSearchParams({
    fromDate: state.fromDate,
    toDate: state.toDate,
  });
  if (state.statuses.length) params.set("status", state.statuses.join(","));
  if (state.view) params.set("view", state.view);
  if (state.q) params.set("q", state.q);
  if (state.member) params.set("member", state.member);
  return params;
};

export const sameSearch = (a: AnalyticsSearch, b: AnalyticsSearch) =>
  a.fromDate === b.fromDate &&
  a.toDate === b.toDate &&
  a.statuses.join(",") === b.statuses.join(",");

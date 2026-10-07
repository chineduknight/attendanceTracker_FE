import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isExists,
  isValid,
  parse,
  parseISO,
  startOfMonth,
} from "date-fns";

/**
 * Phase 7B birthday helpers.
 *
 * The backend's Phase 7B response adds `birthdayOccurrence` metadata; once it
 * is present it is calendar truth. Until then, legacy `dob` values (including
 * the display string `Mon, 13 October`) are parsed here — the single legacy
 * parser shared by the Birthday page and the Welfare snapshot. Never derive
 * age, birth year or "turning" wording: this is calendar UX only.
 */

export interface BirthdayOccurrence {
  month: number;
  day: number;
  /** YYYY-MM-DD, inside the requested full-date range. */
  occurrenceDate: string;
}

/** One Birthday API member; legacy rows may only carry `dob`. */
export interface BirthdayMember {
  _id?: string;
  name?: string | null;
  dob?: string | null;
  birthdayOccurrence?: BirthdayOccurrence | null;
  [key: string]: unknown;
}

export interface BirthdayRange {
  /** YYYY-MM-DD, inclusive. */
  fromDate: string;
  /** YYYY-MM-DD, inclusive. */
  toDate: string;
}

export type BirthdayPreset =
  | "today"
  | "next7"
  | "next30"
  | "thisMonth"
  | "nextMonth"
  | "threeMonths";

/** The current local business date (YYYY-MM-DD); the same anchor Welfare uses. */
export const localBusinessDate = (date: Date = new Date()): string =>
  format(date, "yyyy-MM-dd");

/** Compact range label, e.g. "7 Oct". */
export const formatBirthdayRangeDate = (value: string): string => {
  const parsed = parseISO(value);
  return isValid(parsed) ? format(parsed, "d MMM") : value;
};

/**
 * Full-date ranges for the proactive presets. `next7` and `next30` include
 * today, matching the Welfare snapshot window (no silent redefinition).
 */
export const birthdayRangeForPreset = (
  preset: BirthdayPreset,
  asOf: string = localBusinessDate(),
): BirthdayRange => {
  const anchor = parseISO(asOf);
  switch (preset) {
    case "today":
      return { fromDate: asOf, toDate: asOf };
    case "next7":
      return {
        fromDate: asOf,
        toDate: format(addDays(anchor, 7), "yyyy-MM-dd"),
      };
    case "next30":
      return {
        fromDate: asOf,
        toDate: format(addDays(anchor, 30), "yyyy-MM-dd"),
      };
    case "thisMonth":
      return {
        fromDate: format(startOfMonth(anchor), "yyyy-MM-dd"),
        toDate: format(endOfMonth(anchor), "yyyy-MM-dd"),
      };
    case "nextMonth": {
      const next = addMonths(anchor, 1);
      return {
        fromDate: format(startOfMonth(next), "yyyy-MM-dd"),
        toDate: format(endOfMonth(next), "yyyy-MM-dd"),
      };
    }
    case "threeMonths":
      return {
        fromDate: format(startOfMonth(anchor), "yyyy-MM-dd"),
        toDate: format(endOfMonth(addMonths(anchor, 3)), "yyyy-MM-dd"),
      };
  }
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Metadata occurrence when present and well-formed, else null. */
export const birthdayOccurrenceDate = (
  member: BirthdayMember | null | undefined,
): string | null => {
  const occurrence = member?.birthdayOccurrence?.occurrenceDate;
  if (typeof occurrence !== "string" || !ISO_DATE.test(occurrence)) {
    return null;
  }
  return isValid(parseISO(occurrence)) ? occurrence : null;
};

const FALLBACK_FORMATS = [
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "dd-MM-yyyy",
  "MM-dd-yyyy",
  "MMM d, yyyy",
  "MMMM d, yyyy",
  "dd MMM yyyy",
  "d MMM yyyy",
  "dd MMMM yyyy",
  "d MMMM yyyy",
  "MMM d",
  "MMMM d",
  "d MMM",
  "d MMMM",
  "MM-dd",
  "dd-MM",
  "MM/dd",
  "dd/MM",
];

const WEEKDAY_PREFIX = /^[A-Za-z]{3,9},\s*/;

// A leap-capable reference year: a year-less "Feb 29" must keep its
// month/day instead of rolling into Mar 1 on a non-leap reference year.
const PARSE_REFERENCE = new Date(2000, 0, 1);

/**
 * Legacy `dob` → Date; null when unreadable. Never throws.
 * The weekday prefix is dropped before parsing so a display string whose
 * weekday belongs to a different year can never fail validation.
 */
export const parseLegacyDob = (dob: unknown): Date | null => {
  if (dob instanceof Date) return isValid(dob) ? dob : null;
  if (typeof dob === "number") {
    const parsed = new Date(dob);
    return isValid(parsed) ? parsed : null;
  }
  if (typeof dob !== "string") return null;
  const raw = dob.trim();
  if (!raw) return null;

  const isoParsed = parseISO(raw);
  if (isValid(isoParsed)) return isoParsed;

  const withoutWeekday = raw.replace(WEEKDAY_PREFIX, "");
  const candidates = withoutWeekday === raw ? [raw] : [raw, withoutWeekday];

  for (const candidate of candidates) {
    for (const dateFormat of FALLBACK_FORMATS) {
      const parsed = parse(candidate, dateFormat, PARSE_REFERENCE);
      if (isValid(parsed)) return parsed;
    }
  }

  const nativeParsed = new Date(raw);
  return isValid(nativeParsed) ? nativeParsed : null;
};

/** Month/day of a legacy `dob`, or null when unreadable. */
export const birthdayMonthDay = (
  dob: unknown,
): { month: number; day: number } | null => {
  const parsed = parseLegacyDob(dob);
  return parsed
    ? { month: parsed.getMonth() + 1, day: parsed.getDate() }
    : null;
};

// Strict calendar semantics: Feb 29 only exists in leap years, and is never
// silently reinterpreted as Feb 28 or Mar 1.
const firstOccurrenceInRange = (
  month: number,
  day: number,
  range: BirthdayRange,
): string | null => {
  const start = parseISO(range.fromDate);
  const end = parseISO(range.toDate);
  if (!isValid(start) || !isValid(end)) return null;
  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
    if (!isExists(year, month - 1, day)) continue;
    const candidate = new Date(year, month - 1, day);
    if (
      differenceInCalendarDays(candidate, start) >= 0 &&
      differenceInCalendarDays(end, candidate) >= 0
    ) {
      return format(candidate, "yyyy-MM-dd");
    }
  }
  return null;
};

/**
 * The member's occurrence inside `range`. Metadata wins whenever present;
 * otherwise the legacy `dob` is parsed and anchored to the range. Null when
 * neither resolves — callers fall back to raw display text.
 */
export const birthdayOccurrenceInRange = (
  member: BirthdayMember | null | undefined,
  range: BirthdayRange,
): string | null => {
  const fromMetadata = birthdayOccurrenceDate(member);
  if (fromMetadata) return fromMetadata;
  const monthDay = birthdayMonthDay(member?.dob);
  if (!monthDay) return null;
  return firstOccurrenceInRange(monthDay.month, monthDay.day, range);
};

/** "Today" / "Tomorrow" / "In N days"; null for past or invalid dates. */
export const birthdayRelativeLabel = (
  occurrenceDate: string,
  asOf: string,
): string | null => {
  const occurrence = parseISO(occurrenceDate);
  const anchor = parseISO(asOf);
  if (!isValid(occurrence) || !isValid(anchor)) return null;
  const days = differenceInCalendarDays(occurrence, anchor);
  if (days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
};

/** "Tue, 13 Oct" — date and weekday only, never age or birth year. */
export const birthdayDisplayDate = (occurrenceDate: string): string => {
  const parsed = parseISO(occurrenceDate);
  return isValid(parsed) ? format(parsed, "EEE, d MMM") : occurrenceDate;
};

/** Whether the member model configures `dob` as a date field. */
export const hasDobDateField = (
  fields: readonly { name: string; type: string }[],
): boolean =>
  fields.some(
    (field) =>
      field.name.trim().toLowerCase() === "dob" &&
      field.type.trim().toLowerCase() === "date",
  );

import { format, isValid, parseISO } from "date-fns";

const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * A session's stored date is a calendar date, sent as YYYY-MM-DD and returned
 * as UTC midnight ("2026-09-01T00:00:00.000Z"). Reading that with new Date()
 * shifts it to the previous day on devices west of UTC, so take the calendar
 * part only. Timestamps (createdAt, updatedAt) are different: format those
 * as real instants.
 */
export const parseSessionDate = (value?: string | null): Date | null => {
  const day = value?.match(BUSINESS_DATE)?.[0];
  if (!day) return null;
  const date = parseISO(day);
  return isValid(date) ? date : null;
};

/** e.g. "Tue 01 Sep 26"; "" when the stored value is missing or invalid. */
export const formatSessionDate = (value?: string | null, pattern = "EEE dd MMM yy") => {
  const date = parseSessionDate(value);
  return date ? format(date, pattern) : "";
};

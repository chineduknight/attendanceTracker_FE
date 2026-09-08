import {
  format,
  isExists,
  isValid,
  parse,
  parseISO,
  startOfDay,
} from "date-fns";

export const parseBirthdayValue = (dob: unknown): Date | null => {
  if (dob instanceof Date) {
    return isValid(dob) ? dob : null;
  }

  if (typeof dob === "number") {
    const parsed = new Date(dob);
    return isValid(parsed) ? parsed : null;
  }

  if (typeof dob !== "string") {
    return null;
  }

  const rawDob = dob.trim();
  if (!rawDob) {
    return null;
  }

  const isoParsed = parseISO(rawDob);
  if (isValid(isoParsed)) {
    return isoParsed;
  }

  const nativeParsed = new Date(rawDob);
  if (isValid(nativeParsed)) {
    return nativeParsed;
  }

  const fallbackFormats = [
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

  for (const dateFormat of fallbackFormats) {
    const parsed = parse(rawDob, dateFormat, new Date());
    if (isValid(parsed)) {
      return parsed;
    }
  }

  return null;
};

export const getBirthdayDateInRange = (
  dob: unknown,
  fromDate: string,
  toDate: string
): Date | null => {
  const parsedDob = parseBirthdayValue(dob);
  const parsedFrom = parseISO(fromDate);
  const parsedTo = parseISO(toDate);

  if (!parsedDob || !isValid(parsedFrom) || !isValid(parsedTo)) {
    return parsedDob;
  }

  const birthMonth = parsedDob.getMonth();
  const birthDate = parsedDob.getDate();
  const rangeStart = startOfDay(parsedFrom);
  const rangeEnd = startOfDay(parsedTo);
  const startTime = Math.min(rangeStart.getTime(), rangeEnd.getTime());
  const endTime = Math.max(rangeStart.getTime(), rangeEnd.getTime());
  const startYear = Math.min(rangeStart.getFullYear(), rangeEnd.getFullYear());
  const endYear = Math.max(rangeStart.getFullYear(), rangeEnd.getFullYear());

  for (let year = startYear; year <= endYear; year += 1) {
    if (!isExists(year, birthMonth, birthDate)) {
      continue;
    }

    const candidate = startOfDay(new Date(year, birthMonth, birthDate));
    const candidateTime = candidate.getTime();

    if (candidateTime >= startTime && candidateTime <= endTime) {
      return candidate;
    }
  }

  return null;
};

export const formatBirthdayForRange = (
  dob: unknown,
  fromDate: string,
  toDate: string
) => {
  const birthdayDate = getBirthdayDateInRange(dob, fromDate, toDate);
  return birthdayDate ? format(birthdayDate, "EEE, dd MMM") : String(dob);
};

export const formatBirthdayRangeDate = (date: string) => {
  const parsed = parseISO(date);
  return isValid(parsed) ? format(parsed, "dd-MMM-yyyy") : date;
};

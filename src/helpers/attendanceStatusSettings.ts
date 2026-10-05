import {
  AttendanceStatusDefinition,
  DEFAULT_ATTENDANCE_STATUSES,
} from "helpers/attendanceStatuses";

export const MAX_ATTENDANCE_STATUSES = 10;

/**
 * An editable status row. `persisted` rows came from the backend: their key
 * and behavior are locked and they can only be deactivated, never removed.
 */
export interface StatusRow extends AttendanceStatusDefinition {
  persisted: boolean;
}

export const toStatusRows = (
  definitions: readonly AttendanceStatusDefinition[] | null | undefined,
): StatusRow[] =>
  (definitions?.length ? definitions : DEFAULT_ATTENDANCE_STATUSES).map(
    (definition) => ({ ...definition, persisted: true }),
  );

export const toStatusDefinitions = (
  rows: readonly StatusRow[],
): AttendanceStatusDefinition[] =>
  rows.map(({ persisted, ...definition }) => ({
    ...definition,
    label: definition.label.trim(),
    shortLabel: definition.shortLabel.trim(),
  }));

const slugify = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Stable key derived once from the initial label, unique within `rows`. */
export const generateStatusKey = (
  label: string,
  rows: readonly StatusRow[],
): string => {
  const base = slugify(label) || "status";
  const taken = new Set(rows.map((row) => row.key));
  let key = base;
  for (let suffix = 2; taken.has(key); suffix += 1) key = `${base}_${suffix}`;
  return key;
};

const deriveShortLabel = (label: string): string => {
  const words = label.trim().split(/\s+/).filter(Boolean);
  const short =
    words.length > 1
      ? words.map((word) => word[0]).join("")
      : (words[0] ?? "").slice(0, 2);
  return short.slice(0, 3).toUpperCase();
};

export const createStatusRow = (
  label: string,
  rows: readonly StatusRow[],
): StatusRow => ({
  key: generateStatusKey(label, rows),
  label: label.trim(),
  shortLabel: deriveShortLabel(label),
  color: "blue",
  behavior: "present",
  active: true,
  isDefault: false,
  persisted: false,
});

export const moveStatusRow = (
  rows: readonly StatusRow[],
  index: number,
  delta: -1 | 1,
): StatusRow[] => {
  const target = index + delta;
  if (target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const setDefaultStatus = (
  rows: readonly StatusRow[],
  key: string,
): StatusRow[] => rows.map((row) => ({ ...row, isDefault: row.key === key }));

const duplicates = (values: string[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  values.forEach((value) => {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  });
  return Array.from(repeated);
};

/** Client-side mirror of the backend rules. Returns human-readable errors. */
export const validateStatusRows = (rows: readonly StatusRow[]): string[] => {
  const errors: string[] = [];
  const active = rows.filter((row) => row.active);
  const defaults = rows.filter((row) => row.isDefault);
  const normalise = (value: string) => value.trim().toLowerCase();

  if (rows.length > MAX_ATTENDANCE_STATUSES) {
    errors.push(`Use at most ${MAX_ATTENDANCE_STATUSES} statuses.`);
  }
  if (rows.some((row) => !row.label.trim() || !row.shortLabel.trim())) {
    errors.push("Every status needs a label and a short label.");
  }
  duplicates(rows.map((row) => row.key)).forEach((key) =>
    errors.push(`Key "${key}" is used more than once.`),
  );
  duplicates(rows.map((row) => normalise(row.label)).filter(Boolean)).forEach(
    (label) => errors.push(`Label "${label}" is used more than once.`),
  );
  duplicates(
    rows.map((row) => normalise(row.shortLabel)).filter(Boolean),
  ).forEach((short) =>
    errors.push(`Short label "${short}" is used more than once.`),
  );

  if (defaults.some((row) => !row.active)) {
    errors.push("An inactive status cannot be the default.");
  }
  if (defaults.filter((row) => row.active).length !== 1) {
    errors.push("Choose exactly one active default status.");
  }
  if (defaults.some((row) => row.behavior !== "absent")) {
    errors.push("The default status must have Absent behavior.");
  }
  if (!active.some((row) => row.behavior === "present")) {
    errors.push("At least one active status must have Present behavior.");
  }
  if (!active.some((row) => row.behavior === "absent")) {
    errors.push("At least one active status must have Absent behavior.");
  }

  return errors;
};

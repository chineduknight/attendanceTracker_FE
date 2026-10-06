/**
 * Organisation-defined attendance statuses.
 *
 * Every organisation names its own statuses (`Present`, `Late`, `No Show`, …),
 * but each one maps to a stable behavior class the backend uses for analytics:
 * - `present` counts as attendance and extends a streak
 * - `excused` counts toward the attendance rate but does not extend a streak
 * - `absent`  earns no attendance credit and breaks a streak
 *
 * Components never compare against literal status keys — they resolve a key
 * through an `AttendanceStatusConfig` built from the selected organisation.
 */
import { lowerTerm } from "helpers/organisationPresentation";

export type AttendanceBehavior = "present" | "excused" | "absent";

export const ATTENDANCE_STATUS_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "cyan",
  "purple",
  "pink",
] as const;

export type AttendanceStatusColor = (typeof ATTENDANCE_STATUS_COLORS)[number];

export interface AttendanceStatusDefinition {
  key: string;
  label: string;
  shortLabel: string;
  color: AttendanceStatusColor;
  behavior: AttendanceBehavior;
  active: boolean;
  isDefault: boolean;
}

export const ATTENDANCE_BEHAVIORS: readonly AttendanceBehavior[] = [
  "present",
  "excused",
  "absent",
];

/** Semantic buckets used by analytics totals — not configured labels. */
export const BEHAVIOR_META: Record<
  AttendanceBehavior,
  { label: string; color: AttendanceStatusColor }
> = {
  present: { label: "Present", color: "green" },
  excused: { label: "Excused", color: "orange" },
  absent: { label: "Absent", color: "red" },
};

/**
 * Explanation of one behavior for the settings editor, in the organisation's
 * attendance term. Behavior is semantic, so the wording never changes meaning.
 */
export const behaviorDescription = (
  behavior: AttendanceBehavior,
  attendanceSingular: string,
): string => {
  const term = lowerTerm(attendanceSingular);
  switch (behavior) {
    case "present":
      return `Counts as ${term} and extends the streak.`;
    case "excused":
      return `Counts toward the ${term} rate but does not extend the streak.`;
    case "absent":
      return `No ${term} credit and breaks the streak.`;
  }
};

/**
 * The configuration every organisation starts with — identical to the
 * backend's effective defaults. Array order is the display and tap-cycle
 * order, so tapping from the default walks Absent → Present → Apology → Absent.
 */
export const DEFAULT_ATTENDANCE_STATUSES: readonly AttendanceStatusDefinition[] =
  [
    {
      key: "present",
      label: "Present",
      shortLabel: "P",
      color: "green",
      behavior: "present",
      active: true,
      isDefault: false,
    },
    {
      key: "apology",
      label: "Apology",
      shortLabel: "AP",
      color: "orange",
      behavior: "excused",
      active: true,
      isDefault: false,
    },
    {
      key: "absent",
      label: "Absent",
      shortLabel: "A",
      color: "red",
      behavior: "absent",
      active: true,
      isDefault: true,
    },
  ];

/** Neutral rendering for a key the organisation never defined. */
export const UNKNOWN_STATUS: AttendanceStatusDefinition = {
  key: "",
  label: "Unknown",
  shortLabel: "?",
  color: "gray",
  behavior: "absent",
  active: false,
  isDefault: false,
};

export interface StatusCount {
  status: AttendanceStatusDefinition;
  count: number;
}

export interface AttendanceStatusConfig {
  /** Every configured definition (active and inactive) in configured order. */
  all: readonly AttendanceStatusDefinition[];
  /** Active definitions in configured order — the tap cycle. */
  active: readonly AttendanceStatusDefinition[];
  defaultStatus: AttendanceStatusDefinition;
  /** Configured definition for `key`, or the neutral unknown fallback. */
  resolve: (key: string | null | undefined) => AttendanceStatusDefinition;
  isKnown: (key: string | null | undefined) => boolean;
  isActive: (key: string | null | undefined) => boolean;
  /**
   * The status after `key` in the active cycle. An inactive or unknown value
   * enters the cycle at its first active status.
   */
  next: (key: string | null | undefined) => string;
  /** Sort rank in configured order; unknown keys sort last. */
  rank: (key: string | null | undefined) => number;
  /**
   * Count `keys` per status: every active status (even at zero) in configured
   * order, followed by any inactive or unknown status that actually occurs.
   */
  countStatuses: (keys: readonly string[]) => StatusCount[];
  /**
   * Definitions worth a legend entry: every active status plus any inactive
   * or unknown status that occurs in `usedKeys`.
   */
  legendFor: (usedKeys: Iterable<string>) => AttendanceStatusDefinition[];
}

const pickDefault = (
  active: readonly AttendanceStatusDefinition[],
): AttendanceStatusDefinition =>
  active.find((status) => status.isDefault) ??
  active.find((status) => status.behavior === "absent") ??
  active[0] ??
  UNKNOWN_STATUS;

export const createStatusConfig = (
  definitions: readonly AttendanceStatusDefinition[] | null | undefined,
): AttendanceStatusConfig => {
  // A persisted store from before statuses existed (or an org the backend has
  // not backfilled) still renders with the default configuration.
  const all = definitions?.length ? definitions : DEFAULT_ATTENDANCE_STATUSES;
  const active = all.filter((status) => status.active);
  const defaultStatus = pickDefault(active);
  const byKey = new Map(all.map((status) => [status.key, status]));
  const indexByKey = new Map(all.map((status, index) => [status.key, index]));

  const resolve = (key: string | null | undefined) =>
    (key != null && byKey.get(key)) || { ...UNKNOWN_STATUS, key: key ?? "" };
  const isKnown = (key: string | null | undefined) =>
    key != null && byKey.has(key);
  const isActive = (key: string | null | undefined) =>
    isKnown(key) && byKey.get(key as string)!.active;

  const next = (key: string | null | undefined) => {
    if (!active.length) return defaultStatus.key;
    const index = active.findIndex((status) => status.key === key);
    return active[(index + 1) % active.length].key;
  };

  const rank = (key: string | null | undefined) =>
    (key == null ? undefined : indexByKey.get(key)) ?? all.length;

  const legendFor = (usedKeys: Iterable<string>) => {
    const extraKeys = new Set<string>();
    Array.from(usedKeys).forEach((key) => {
      if (!isActive(key)) extraKeys.add(key);
    });
    const extras = Array.from(extraKeys)
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map(resolve);
    return [...active, ...extras];
  };

  const countStatuses = (keys: readonly string[]) => {
    const counts = new Map<string, number>();
    keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
    return legendFor(counts.keys()).map((status) => ({
      status,
      count: counts.get(status.key) ?? 0,
    }));
  };

  return {
    all,
    active,
    defaultStatus,
    resolve,
    isKnown,
    isActive,
    next,
    rank,
    countStatuses,
    legendFor,
  };
};

/** Chakra token for a status color used as a solid fill. */
export const solidColor = (color: AttendanceStatusColor): string =>
  `${color}.500`;

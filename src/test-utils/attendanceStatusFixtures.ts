import { AttendanceStatusDefinition } from "helpers/attendanceStatuses";

export const statusDefinition = (
  over: Partial<AttendanceStatusDefinition> & { key: string; label: string }
): AttendanceStatusDefinition => ({
  shortLabel: over.label.slice(0, 2).toUpperCase(),
  color: "gray",
  behavior: "present",
  active: true,
  isDefault: false,
  ...over,
});

/** A choir-style org: Present / Late / Excused / No Show (default). */
export const CUSTOM_STATUSES: AttendanceStatusDefinition[] = [
  statusDefinition({ key: "present", label: "Present", shortLabel: "P", color: "green" }),
  statusDefinition({ key: "late", label: "Late", shortLabel: "L", color: "yellow" }),
  statusDefinition({
    key: "excused",
    label: "Excused",
    shortLabel: "EX",
    color: "orange",
    behavior: "excused",
  }),
  statusDefinition({
    key: "no_show",
    label: "No Show",
    shortLabel: "NS",
    color: "red",
    behavior: "absent",
    isDefault: true,
  }),
  statusDefinition({
    key: "remote",
    label: "Remote",
    shortLabel: "R",
    color: "teal",
    active: false,
  }),
];

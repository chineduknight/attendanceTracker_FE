/**
 * Which WhatsApp share layout an organisation uses for attendance. Display
 * only: the template changes the wording of the next generated message and
 * never the figures, which always come from the saved roster.
 *
 * - `generic`: plain names and general-purpose closing lines.
 * - `choir`: Bro/Sis where gender is explicit, voice-part grouping and the
 *   music-themed closing lines.
 */
export const ATTENDANCE_SHARE_TEMPLATES = ["generic", "choir"] as const;

export type AttendanceShareTemplate = (typeof ATTENDANCE_SHARE_TEMPLATES)[number];

/**
 * The layout used when an organisation has no valid stored value: an older
 * backend, an organisation created before the setting, or a selected org
 * persisted by an older build. Choir is what those organisations already see.
 */
export const LEGACY_ATTENDANCE_SHARE_TEMPLATE: AttendanceShareTemplate = "choir";

export const isAttendanceShareTemplate = (
  value: unknown,
): value is AttendanceShareTemplate =>
  typeof value === "string" &&
  (ATTENDANCE_SHARE_TEMPLATES as readonly string[]).includes(value);

/** The template to format with; absent or malformed values fall back to choir. */
export const effectiveAttendanceShareTemplate = (
  org: { attendanceShareTemplate?: unknown } | null | undefined,
): AttendanceShareTemplate => {
  const stored = org?.attendanceShareTemplate;
  return isAttendanceShareTemplate(stored)
    ? stored
    : LEGACY_ATTENDANCE_SHARE_TEMPLATE;
};

export const ATTENDANCE_SHARE_TEMPLATE_OPTIONS: ReadonlyArray<{
  value: AttendanceShareTemplate;
  label: string;
  description: string;
}> = [
  {
    value: "generic",
    label: "Generic",
    description: "Plain names and general-purpose messages",
  },
  {
    value: "choir",
    label: "Choir",
    description: "Bro/Sis when known, voice-part grouping and choir messages",
  },
];

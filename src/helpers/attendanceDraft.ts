export type AttendanceStatus = "absent" | "present" | "apology";

export interface RosterMember {
  id: string;
  name: string;
}

export interface AttendanceDraftEntry {
  id: string;
  attendanceStatus: AttendanceStatus;
}

const ATTENDANCE_STATUSES: readonly AttendanceStatus[] = [
  "absent",
  "present",
  "apology",
];

const isAttendanceStatus = (value: unknown): value is AttendanceStatus =>
  typeof value === "string" &&
  (ATTENDANCE_STATUSES as readonly string[]).includes(value);

/**
 * Merge a locally-saved draft onto the current member roster.
 *
 * Draft entries whose member no longer exists are dropped, newly eligible
 * members are added with the default status, and each entry's identity (id and
 * name) comes from the roster rather than the draft so a stale cached roster can
 * never override or corrupt the current session.
 */
export function reconcileAttendanceDraft<T extends RosterMember>(
  draft: unknown,
  roster: T[],
  defaultStatus: AttendanceStatus = "absent"
): Array<T & { attendanceStatus: AttendanceStatus }> {
  const statusById = new Map<string, AttendanceStatus>();

  if (Array.isArray(draft)) {
    draft.forEach((entry) => {
      const candidate = entry as Partial<AttendanceDraftEntry> | null;
      if (
        candidate &&
        typeof candidate.id === "string" &&
        isAttendanceStatus(candidate.attendanceStatus)
      ) {
        statusById.set(candidate.id, candidate.attendanceStatus);
      }
    });
  }

  return roster.map((member) => ({
    ...member,
    attendanceStatus: statusById.get(member.id) ?? defaultStatus,
  }));
}

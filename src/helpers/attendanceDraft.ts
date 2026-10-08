import { AttendanceStatusConfig } from "helpers/attendanceStatuses";

export interface RosterMember {
  id: string;
  name: string;
}

export interface AttendanceDraftEntry {
  id: string;
  attendanceStatus: string;
}

/**
 * Merge a locally-saved draft onto the current member roster for a NEW session.
 *
 * Draft entries whose member no longer exists are dropped, and each entry's
 * identity (id and name) comes from the roster rather than the draft so a stale
 * cached roster can never override or corrupt the current session. Newly
 * eligible members, and any draft status that is unknown or no longer active
 * for the organisation, start at the configured default status.
 *
 * Editing a historical session does not go through here: statuses the backend
 * returns for an existing record are rendered as-is, even when inactive.
 */
export function reconcileAttendanceDraft<T extends RosterMember>(
  draft: unknown,
  roster: T[],
  statuses: AttendanceStatusConfig
): Array<T & { attendanceStatus: string }> {
  const statusById = new Map<string, string>();

  if (Array.isArray(draft)) {
    draft.forEach((entry) => {
      const candidate = entry as Partial<AttendanceDraftEntry> | null;
      if (
        candidate &&
        typeof candidate.id === "string" &&
        statuses.isActive(candidate.attendanceStatus)
      ) {
        statusById.set(candidate.id, candidate.attendanceStatus as string);
      }
    });
  }

  return roster.map((member) => ({
    ...member,
    attendanceStatus:
      statusById.get(member.id) ?? statuses.defaultStatus.key,
  }));
}

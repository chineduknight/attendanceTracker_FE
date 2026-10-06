/** One entry of a saved attendance record's frozen roster. */
export interface StoredRosterEntry {
  memberId: string;
  /** Null when the member's profile can no longer be resolved. */
  member: { name: string } | null;
  attendanceStatus: string;
}

export interface UnresolvedRosterEntry {
  memberId: string;
  attendanceStatus: string;
}

/**
 * Splits a stored roster into entries whose member still resolves and those
 * that don't. The stored roster stays authoritative: unresolved entries were
 * still expected, so they count toward the roster size and are never dropped,
 * only shown read-only (the backend keeps them when they are not submitted).
 */
export const splitStoredRoster = <T extends StoredRosterEntry>(
  attendance: readonly T[],
) => {
  const resolved: Array<T & { member: NonNullable<T["member"]> }> = [];
  const unresolved: UnresolvedRosterEntry[] = [];
  attendance.forEach((entry) => {
    if (entry.member != null) {
      // cast: the null check above narrows `entry.member`, but TS can't carry
      // that narrowing onto the generic `T` itself.
      resolved.push(entry as T & { member: NonNullable<T["member"]> });
    } else {
      unresolved.push({
        memberId: entry.memberId,
        attendanceStatus: entry.attendanceStatus,
      });
    }
  });
  return { resolved, unresolved, expectedCount: attendance.length };
};

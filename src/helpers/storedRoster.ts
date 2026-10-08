/** One entry of a saved attendance record's frozen roster. */
export interface StoredRosterEntry {
  memberId: string;
  /** Null when the member's profile can no longer be resolved. */
  member: { name: string } | null;
  attendanceStatus: string;
  /**
   * True for a member deliberately added to this one session although they
   * were not expected (Phase 6F). Missing on legacy entries, which are expected.
   */
  manuallyAdded?: boolean;
  manualAdditionReason?: string | null;
  manuallyAddedAt?: string | null;
}

export interface UnresolvedRosterEntry {
  memberId: string;
  attendanceStatus: string;
  manuallyAdded: boolean;
}

/** Whether a stored entry is a manual one-session addition (missing → expected). */
export const isManualEntry = (entry: Pick<StoredRosterEntry, "manuallyAdded">) =>
  entry.manuallyAdded === true;

/**
 * Splits a stored roster into entries whose member still resolves and those
 * that don't. The stored roster stays authoritative: unresolved entries are
 * never dropped, only shown read-only (the backend keeps them when they are
 * not submitted), and they keep whether they were added manually.
 *
 * Counts describe the stored session, whatever is resolvable:
 * - `expectedCount`: entries that were expected (not manually added)
 * - `manualCount`: entries added manually for this session only
 * - `rosterCount`: every stored entry
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
        manuallyAdded: isManualEntry(entry),
      });
    }
  });
  const manualCount = attendance.filter(isManualEntry).length;
  return {
    resolved,
    unresolved,
    expectedCount: attendance.length - manualCount,
    manualCount,
    rosterCount: attendance.length,
  };
};

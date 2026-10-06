/** A roster entry that carries one attendance status. */
export interface MarkedMember {
  id: string;
  attendanceStatus: string;
}

/** `memberId -> attendanceStatus` captured before a change, for Undo. */
export type StatusSnapshot = ReadonlyMap<string, string>;

export interface StatusUpdate<T> {
  members: T[];
  /** Previous status of every targeted member that is in the roster. */
  snapshot: StatusSnapshot;
}

/**
 * Moves each member in `memberIds` to `nextStatus(currentStatus)` and leaves
 * everyone else untouched. Returns the new roster together with the targeted
 * members' previous statuses so the change can be undone exactly — including
 * an inactive historical status a bulk action overwrote.
 */
export function updateStatuses<T extends MarkedMember>(
  members: readonly T[],
  memberIds: ReadonlySet<string>,
  nextStatus: (currentStatus: string) => string,
): StatusUpdate<T> {
  const snapshot = new Map<string, string>();
  const next = members.map((member) => {
    if (!memberIds.has(member.id)) return member;
    snapshot.set(member.id, member.attendanceStatus);
    return { ...member, attendanceStatus: nextStatus(member.attendanceStatus) };
  });
  return { members: next, snapshot };
}

/**
 * Restores the statuses captured in `snapshot`. Members that have since left
 * the roster are skipped; members the snapshot never captured are untouched.
 */
export function restoreStatuses<T extends MarkedMember>(
  members: readonly T[],
  snapshot: StatusSnapshot,
): T[] {
  return members.map((member) => {
    const previous = snapshot.get(member.id);
    return previous === undefined
      ? member
      : { ...member, attendanceStatus: previous };
  });
}

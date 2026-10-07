/**
 * Manual per-session attendance exceptions (Phase 6F): a member who was not
 * expected for a session but physically attended, added to that session only.
 *
 * A manual entry only ever holds a status whose behavior is `present` — it
 * records physical attendance, never an artificial absence or excuse. The
 * backend enforces this too; these helpers keep the UI from offering anything
 * else.
 */
import {
  AttendanceStatusConfig,
  AttendanceStatusDefinition,
} from "helpers/attendanceStatuses";

export const MANUAL_ADDITION_REASON_MAX = 200;

/** What an officer chooses when adding a member manually. */
export interface ManualAdditionInput {
  memberId: string;
  status: string;
  reason: string;
}

/** Request body for one manual addition — never any server-owned metadata. */
export interface ManualAdditionPayload {
  memberId: string;
  status: string;
  reason?: string;
}

/** A draft manual addition on a new session, persisted with the draft. */
export interface ManualDraftMember {
  id: string;
  name: string;
  attendanceStatus: string;
  reason?: string;
}

interface NamedMember {
  id: string;
  name: string;
}

/** Active statuses a manual entry may take, in configured order. */
export const presentStatuses = (
  statuses: AttendanceStatusConfig,
): AttendanceStatusDefinition[] =>
  statuses.active.filter((status) => status.behavior === "present");

/** Whether `key` is an active present-behavior status (never by literal key). */
export const isActivePresentStatus = (
  statuses: AttendanceStatusConfig,
  key: string | null | undefined,
) => statuses.isActive(key) && statuses.resolve(key).behavior === "present";

/**
 * The tap-cycle for a manual entry: the next active present-behavior status.
 * An inactive or non-present value enters at the first one; with no present
 * status configured the value is kept rather than turned into an absence.
 */
export const nextPresentStatus = (
  statuses: AttendanceStatusConfig,
  key: string,
): string => {
  const cycle = presentStatuses(statuses);
  if (!cycle.length) return key;
  const index = cycle.findIndex((status) => status.key === key);
  return cycle[(index + 1) % cycle.length].key;
};

/** Trims the reason and omits it when blank (the backend stores blank as null). */
export const toManualAdditionPayload = ({
  memberId,
  status,
  reason,
}: ManualAdditionInput): ManualAdditionPayload => {
  const trimmed = reason.trim();
  return trimmed ? { memberId, status, reason: trimmed } : { memberId, status };
};

/**
 * Members who may be added manually: every current member not already on the
 * session roster, by name. Eligibility and availability are deliberately not
 * applied — failing them is exactly why a member would be added manually.
 */
export const manualCandidates = <T extends NamedMember>(
  members: readonly T[],
  rosterIds: Iterable<string>,
): T[] => {
  const excluded = new Set(rosterIds);
  return members
    .filter((member) => !excluded.has(member.id))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export interface ManualDraftReconciliation {
  /** Manual additions that are still valid and still not expected. */
  manual: ManualDraftMember[];
  /** `memberId -> status` of manual additions that have since become expected. */
  promoted: ReadonlyMap<string, string>;
}

/**
 * Reconciles a locally-saved list of manual additions for a NEW session
 * against the freshly derived expected roster and the current members.
 *
 * - A member who has become expected leaves the manual list; their chosen
 *   status is handed back in `promoted` so the expected roster can keep it.
 *   They are never submitted through both `memberStatuses` and
 *   `manualAdditions`.
 * - A member who no longer exists is dropped; names come from current members.
 * - A status that is no longer an active present-behavior status falls back
 *   to the first one; with none configured the addition is dropped.
 */
export function reconcileManualDraft(
  draft: unknown,
  expectedIds: ReadonlySet<string>,
  members: readonly NamedMember[],
  statuses: AttendanceStatusConfig,
): ManualDraftReconciliation {
  const manual: ManualDraftMember[] = [];
  const promoted = new Map<string, string>();
  if (!Array.isArray(draft)) return { manual, promoted };

  const memberById = new Map(members.map((member) => [member.id, member]));
  const fallbackStatus = presentStatuses(statuses)[0]?.key;
  const seen = new Set<string>();

  draft.forEach((entry) => {
    const candidate = entry as Partial<ManualDraftMember> | null;
    const id = candidate?.id;
    if (typeof id !== "string" || seen.has(id)) return;
    seen.add(id);
    const member = memberById.get(id);
    if (!member) return;
    const status = isActivePresentStatus(statuses, candidate?.attendanceStatus)
      ? (candidate?.attendanceStatus as string)
      : fallbackStatus;
    if (!status) return;
    if (expectedIds.has(id)) {
      promoted.set(id, status);
      return;
    }
    manual.push({
      id,
      name: member.name,
      attendanceStatus: status,
      ...(typeof candidate?.reason === "string" && candidate.reason
        ? { reason: candidate.reason }
        : {}),
    });
  });

  return { manual, promoted };
}

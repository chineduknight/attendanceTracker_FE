/**
 * Editing a stored attendance as one atomic Update: every status, detail and
 * manual add/remove is held locally and sent in a single
 * `PUT /attendance/:id`, which costs exactly one edit.
 */
import { resolveEditsRemaining } from "helpers/attendanceEdits";
import {
  ManualAdditionPayload,
  ManualDraftMember,
  toManualAdditionPayload,
} from "helpers/manualAttendance";
import { isManualEntry, StoredRosterEntry } from "helpers/storedRoster";

export interface EditDetails {
  name: string;
  date: string;
  categoryId: string;
  subCategoryId: string;
}

interface EditRow {
  id: string;
  attendanceStatus: string;
}

/**
 * The stored record as the edit screen loaded it. It is fixed for the whole
 * edit (a background refetch must not move it), so `expectedEditCount` always
 * names the version the officer actually edited.
 */
export interface EditBaseline {
  editCount: number;
  editsRemaining: number;
  editsLocked: boolean;
  details: EditDetails;
  /** Every stored entry's status, unresolved entries included. */
  statuses: ReadonlyMap<string, string>;
  /** Manual entries on the stored roster: the only ones Update can remove. */
  manualIds: ReadonlySet<string>;
}

interface StoredRecord {
  name?: string;
  date?: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
  editCount?: number;
  editsRemaining?: number;
  editsLocked?: boolean;
  hasBeenUpdated?: boolean;
  attendance?: readonly Pick<StoredRosterEntry, "memberId" | "attendanceStatus" | "manuallyAdded">[];
}

export const toEditBaseline = (record: StoredRecord): EditBaseline => {
  const entries = record.attendance ?? [];
  return {
    // The backend compares a missing editCount as 0 (even on a legacy record
    // flagged hasBeenUpdated), so expectedEditCount must too.
    editCount: typeof record.editCount === "number" ? record.editCount : 0,
    editsRemaining: resolveEditsRemaining(record),
    editsLocked: record.editsLocked === true,
    details: {
      name: record.name ?? "",
      date: (record.date ?? "").slice(0, 10),
      categoryId: record.categoryId ?? "",
      subCategoryId: record.subCategoryId ?? "",
    },
    statuses: new Map(entries.map((entry) => [entry.memberId, entry.attendanceStatus])),
    manualIds: new Set(entries.filter(isManualEntry).map((entry) => entry.memberId)),
  };
};

/** Whether this edit may still be saved: not locked and an edit remains. */
export const canSaveEdit = (baseline: EditBaseline): boolean =>
  !baseline.editsLocked && baseline.editsRemaining > 0;

/** Manual rows that were not on the stored roster: added in this edit. */
export const pendingAdditions = <T extends EditRow>(
  manual: readonly T[],
  baseline: EditBaseline,
): T[] => manual.filter((row) => !baseline.manualIds.has(row.id));

/**
 * Whether anything would change on Update: details, a status of a member who
 * stays, or a manual addition or removal.
 */
export const hasPendingEdits = (
  baseline: EditBaseline,
  {
    details,
    rows,
    manual,
    removals,
  }: {
    details: EditDetails;
    rows: readonly EditRow[];
    manual: readonly EditRow[];
    removals: readonly string[];
  },
): boolean =>
  removals.length > 0 ||
  pendingAdditions(manual, baseline).length > 0 ||
  (Object.keys(baseline.details) as (keyof EditDetails)[]).some(
    (key) => (details[key] ?? "") !== baseline.details[key],
  ) ||
  rows.some(
    (row) =>
      baseline.statuses.has(row.id) &&
      baseline.statuses.get(row.id) !== row.attendanceStatus,
  );

/** Session fields exactly as the edit holds them; sent as today's PUT does. */
export interface EditSessionFields {
  name?: string;
  date?: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
}

export interface AtomicEditPayload extends EditSessionFields {
  organisationId: string;
  memberStatuses: { memberId: string; status: string }[];
  manualAdditions?: ManualAdditionPayload[];
  manualRemovals?: string[];
  expectedEditCount: number;
}

/**
 * The single Update body. `memberStatuses` is the full list for resolvable
 * members who stay (expected and stored manual); newly added members carry
 * their status in `manualAdditions` only, and removed members appear in
 * `manualRemovals` only. Unresolved stored entries are never listed, so the
 * backend keeps them untouched. No eligibility rules or manual metadata.
 */
export const buildAtomicEditPayload = ({
  organisationId,
  session,
  expected,
  manual,
  removals,
  baseline,
}: {
  organisationId: string;
  session: EditSessionFields;
  expected: readonly EditRow[];
  manual: readonly ManualDraftMember[];
  removals: readonly string[];
  baseline: EditBaseline;
}): AtomicEditPayload => {
  const additions = pendingAdditions(manual, baseline);
  const retained = [
    ...expected,
    ...manual.filter((row) => baseline.manualIds.has(row.id)),
  ];
  const { name, date, categoryId, subCategoryId } = session;
  return {
    name,
    date,
    categoryId,
    subCategoryId,
    organisationId,
    memberStatuses: retained.map((row) => ({
      memberId: row.id,
      status: row.attendanceStatus,
    })),
    ...(additions.length
      ? {
          manualAdditions: additions.map((row) =>
            toManualAdditionPayload({
              memberId: row.id,
              status: row.attendanceStatus,
              reason: row.reason ?? "",
            }),
          ),
        }
      : {}),
    ...(removals.length ? { manualRemovals: [...removals] } : {}),
    expectedEditCount: baseline.editCount,
  };
};

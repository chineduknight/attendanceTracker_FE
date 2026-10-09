/**
 * Unfinished NEW-attendance drafts (resume / discard).
 *
 * The draft METADATA is the session an officer was marking — name, date,
 * category, eligibility rules — saved per organisation when Create Attendance
 * Continue succeeds. The expected roster and the manual additions keep using
 * their own localStorage keys; both are derived here from the same identity,
 * so resume and cleanup always touch exactly the same keys.
 *
 * Update mode never reads or writes any of this: an edit of an existing
 * attendance has no resumable draft, the stored record is the only truth.
 */
import {
  AttendanceEligibilityRule,
  isUnreadableEligibility,
  normalizeEligibilityRules,
} from "helpers/attendanceEligibility";
import { isValidAvailabilityDate } from "helpers/attendanceAvailability";

/** The session fields a draft metadata record captures. */
export interface NewAttendanceDraft {
  version: 1;
  organisationId: string;
  name: string;
  date: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
  eligibilityRules: AttendanceEligibilityRule[];
}

/** The working-session fields needed to write or discard a draft. */
export interface NewAttendanceDraftSource {
  name: string;
  date: string;
  categoryId?: string | null;
  subCategoryId?: string | null;
  eligibilityRules?: AttendanceEligibilityRule[];
}

/** The metadata key: one unfinished draft per organisation. */
const metadataKey = (organisationId: string) =>
  `attendance-new-draft-${organisationId}`;

/**
 * `${date}-${name}` — the identity of a NEW session's roster drafts, kept
 * verbatim from the original draft-key format. Name and date are fixed once
 * Continue succeeds, so every page derives identical keys from it.
 */
export const newAttendanceDraftIdentity = (draft: {
  date?: string | null;
  name?: string | null;
}): string => `${draft.date || "undated"}-${draft.name || "untitled"}`;

/** The expected-roster draft key for a new session. */
export const expectedRosterDraftKey = (
  organisationId: string,
  identity: string
): string => `attendance-draft-${organisationId}-${identity}`;

/** The manual-additions draft key for a new session. */
export const manualRosterDraftKey = (
  organisationId: string,
  identity: string
): string => `attendance-manual-draft-${organisationId}-${identity}`;

/**
 * The organisation's unfinished draft metadata, or null when there is none or
 * it cannot be trusted. A malformed record is ignored — never guessed at — so
 * corrupted storage can never surface a phantom resume card or a session
 * whose eligibility rules have quietly widened to Everyone.
 */
export const readNewAttendanceDraft = (
  organisationId: string
): NewAttendanceDraft | null => {
  const stored = localStorage.getItem(metadataKey(organisationId));
  if (!stored) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const candidate = parsed as Partial<NewAttendanceDraft>;
  if (candidate.version !== 1) return null;
  if (candidate.organisationId !== organisationId) return null;
  if (typeof candidate.name !== "string" || !candidate.name.trim()) return null;
  if (
    typeof candidate.date !== "string" ||
    !isValidAvailabilityDate(candidate.date)
  )
    return null;
  if (
    !Array.isArray(candidate.eligibilityRules) ||
    isUnreadableEligibility(candidate.eligibilityRules)
  )
    return null;
  const text = (value: unknown) =>
    typeof value === "string" && value ? value : null;
  return {
    version: 1,
    organisationId,
    name: candidate.name,
    date: candidate.date,
    categoryId: text(candidate.categoryId),
    subCategoryId: text(candidate.subCategoryId),
    eligibilityRules: normalizeEligibilityRules(candidate.eligibilityRules),
  };
};

/**
 * Saves the organisation's unfinished draft metadata. `session` is the
 * canonical Continue payload; empty category values are stored as null so the
 * record's shape is stable.
 */
export const writeNewAttendanceDraft = (
  organisationId: string,
  session: NewAttendanceDraftSource
): void => {
  const draft: NewAttendanceDraft = {
    version: 1,
    organisationId,
    name: session.name,
    date: session.date,
    categoryId: session.categoryId || null,
    subCategoryId: session.subCategoryId || null,
    eligibilityRules: normalizeEligibilityRules(session.eligibilityRules),
  };
  localStorage.setItem(metadataKey(organisationId), JSON.stringify(draft));
};

/** Removes the organisation's draft metadata (nothing else). */
export const clearNewAttendanceDraft = (organisationId: string): void => {
  localStorage.removeItem(metadataKey(organisationId));
};

/**
 * Forgets everything a new-session draft owns: its metadata and both roster
 * drafts. Other organisations' drafts are untouched.
 */
export const discardNewAttendanceDraft = (
  organisationId: string,
  draft: { date?: string | null; name?: string | null }
): void => {
  const identity = newAttendanceDraftIdentity(draft);
  clearNewAttendanceDraft(organisationId);
  localStorage.removeItem(expectedRosterDraftKey(organisationId, identity));
  localStorage.removeItem(manualRosterDraftKey(organisationId, identity));
};

/**
 * The working-state object for a resumed draft, shaped exactly like the
 * Continue payload Create Attendance stores (empty category values omitted).
 */
export const newAttendanceDraftToSession = (draft: NewAttendanceDraft) => ({
  name: draft.name,
  date: draft.date,
  ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
  ...(draft.subCategoryId ? { subCategoryId: draft.subCategoryId } : {}),
  eligibilityRules: draft.eligibilityRules,
});

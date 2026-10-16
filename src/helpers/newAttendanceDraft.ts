/**
 * Unfinished NEW-attendance drafts (resume / discard).
 *
 * The draft METADATA is the session an officer was marking — name, date,
 * category, eligibility rules — saved per organisation AND per officer when
 * Create Attendance Continue succeeds. The expected roster and the manual
 * additions keep using their own localStorage keys; all three are derived
 * here from the same organisation, owner and identity, so resume and cleanup
 * always touch exactly the same keys.
 *
 * Ownership: a browser can be shared by several officers. A draft belongs to
 * the officer who started it, and only they are offered it. Drafts saved
 * before drafts had owners (legacy, `ownerId: null`) keep their original keys
 * and stay available to any officer of the organisation on this browser, as
 * they always were: nobody can tell whose they are, and hiding them would
 * strand their author's marks. They are never migrated or deleted here; they
 * go when someone submits or discards them.
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

/** The officer a draft belongs to; null only for a legacy, unowned draft. */
export type DraftOwner = string | null;

/** The session fields a draft metadata record captures. */
export interface NewAttendanceDraft {
  version: 1;
  organisationId: string;
  ownerId: DraftOwner;
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

// An owned draft's keys carry `-by-<officer id>` right after the organisation
// id. A legacy key has a date or "undated" there, so the two never collide.
const ownerSegment = (ownerId: DraftOwner) => (ownerId ? `-by-${ownerId}` : "");

/** The metadata key: one unfinished draft per organisation and officer. */
const metadataKey = (organisationId: string, ownerId: DraftOwner) =>
  `attendance-new-draft-${organisationId}${ownerSegment(ownerId)}`;

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
  ownerId: DraftOwner,
  identity: string,
): string => `attendance-draft-${organisationId}${ownerSegment(ownerId)}-${identity}`;

/** The manual-additions draft key for a new session. */
export const manualRosterDraftKey = (
  organisationId: string,
  ownerId: DraftOwner,
  identity: string,
): string =>
  `attendance-manual-draft-${organisationId}${ownerSegment(ownerId)}-${identity}`;

/** One stored metadata record, or null when it is missing or untrustworthy. */
const readDraftAt = (
  organisationId: string,
  ownerId: DraftOwner,
): NewAttendanceDraft | null => {
  const stored = localStorage.getItem(metadataKey(organisationId, ownerId));
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
  // The record must name the owner its key does (a legacy record names none).
  if ((candidate.ownerId ?? null) !== ownerId) return null;
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
    ownerId,
    name: candidate.name,
    date: candidate.date,
    categoryId: text(candidate.categoryId),
    subCategoryId: text(candidate.subCategoryId),
    eligibilityRules: normalizeEligibilityRules(candidate.eligibilityRules),
  };
};

/**
 * The unfinished draft `officerId` may continue in this organisation: their
 * own, otherwise a legacy unowned one, or null. Another officer's draft is
 * never returned. A malformed record is ignored — never guessed at — so
 * corrupted storage can never surface a phantom resume card or a session
 * whose eligibility rules have quietly widened to Everyone.
 */
export const readNewAttendanceDraft = (
  organisationId: string,
  officerId: DraftOwner,
): NewAttendanceDraft | null =>
  (officerId ? readDraftAt(organisationId, officerId) : null) ??
  readDraftAt(organisationId, null);

/**
 * Saves `ownerId`'s unfinished draft metadata for the organisation. `session`
 * is the canonical Continue payload; empty category values are stored as null
 * so the record's shape is stable. New drafts always have an owner.
 */
export const writeNewAttendanceDraft = (
  organisationId: string,
  ownerId: string,
  session: NewAttendanceDraftSource,
): void => {
  const draft: NewAttendanceDraft = {
    version: 1,
    organisationId,
    ownerId,
    name: session.name,
    date: session.date,
    categoryId: session.categoryId || null,
    subCategoryId: session.subCategoryId || null,
    eligibilityRules: normalizeEligibilityRules(session.eligibilityRules),
  };
  localStorage.setItem(metadataKey(organisationId, ownerId), JSON.stringify(draft));
};

/** Removes one draft's metadata (nothing else). */
export const clearNewAttendanceDraft = (
  organisationId: string,
  ownerId: DraftOwner,
): void => {
  localStorage.removeItem(metadataKey(organisationId, ownerId));
};

/**
 * Forgets everything a new-session draft owns: its metadata and both roster
 * drafts. Other officers' and other organisations' drafts are untouched.
 */
export const discardNewAttendanceDraft = (
  organisationId: string,
  draft: { ownerId: DraftOwner; date?: string | null; name?: string | null },
): void => {
  const identity = newAttendanceDraftIdentity(draft);
  clearNewAttendanceDraft(organisationId, draft.ownerId);
  localStorage.removeItem(
    expectedRosterDraftKey(organisationId, draft.ownerId, identity),
  );
  localStorage.removeItem(
    manualRosterDraftKey(organisationId, draft.ownerId, identity),
  );
};

/**
 * Every new-attendance draft key this browser holds for the organisation,
 * whoever owns it — for forgetting a deleted organisation only.
 */
export const organisationDraftKeys = (organisationId: string): string[] => {
  const prefixes = [
    "attendance-new-draft-",
    "attendance-draft-",
    "attendance-manual-draft-",
  ].map((prefix) => `${prefix}${organisationId}-`);
  const legacyMetadata = metadataKey(organisationId, null);
  return Object.keys(localStorage).filter(
    (key) =>
      key === legacyMetadata || prefixes.some((prefix) => key.startsWith(prefix)),
  );
};

/**
 * The working-state object for a resumed draft, shaped exactly like the
 * Continue payload Create Attendance stores (empty category values omitted),
 * stamped with its organisation so it can never be marked under another one.
 */
export const newAttendanceDraftToSession = (draft: NewAttendanceDraft) => ({
  name: draft.name,
  date: draft.date,
  organisationId: draft.organisationId,
  ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
  ...(draft.subCategoryId ? { subCategoryId: draft.subCategoryId } : {}),
  eligibilityRules: draft.eligibilityRules,
});

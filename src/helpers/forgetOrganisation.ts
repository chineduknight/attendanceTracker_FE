import useGlobalStore, { EMPTY_ORG } from "zStore";
import { queryClient } from "services/api/apiHelper";
import {
  clearNewAttendanceDraft,
  discardNewAttendanceDraft,
  readNewAttendanceDraft,
} from "helpers/newAttendanceDraft";
import {
  legacyShownFieldsStorageKey,
  shownFieldsStorageKey,
} from "helpers/memberListFields";

/** Roster draft keys are `<prefix><organisationId>-<session identity>`. */
const ROSTER_DRAFT_PREFIXES = ["attendance-draft-", "attendance-manual-draft-"];

/**
 * Forget everything this device holds for an organisation that no longer
 * exists (it was just deleted). Other organisations are untouched.
 *
 * - The selection is cleared at once if it was the deleted one, instead of
 *   waiting for the organisation list to reload (which may fail offline).
 * - The in-progress attendance session goes too when it belongs to that
 *   organisation. A session with no organisation stamp (an edit, or legacy
 *   state) can only belong to the selected one, so it goes when the selected
 *   organisation was deleted.
 * - Its unfinished drafts, member-list preferences and cached server data
 *   are removed.
 */
export const forgetOrganisation = (organisationId: string): void => {
  if (!organisationId) return;
  const store = useGlobalStore.getState();
  const wasSelected = store.organisation.id === organisationId;
  const sessionOrg = store.currentAttendance.organisationId;
  if (sessionOrg === organisationId || (sessionOrg === undefined && wasSelected)) {
    store.clearCurrentAttendance();
  }
  if (wasSelected) store.updateOrganisation(EMPTY_ORG);

  const draft = readNewAttendanceDraft(organisationId);
  if (draft) discardNewAttendanceDraft(organisationId, draft);
  else clearNewAttendanceDraft(organisationId);
  // Roster drafts whose metadata was already gone.
  const ownPrefixes = ROSTER_DRAFT_PREFIXES.map((prefix) => `${prefix}${organisationId}-`);
  Object.keys(localStorage)
    .filter((key) => ownPrefixes.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(shownFieldsStorageKey(organisationId));
  localStorage.removeItem(legacyShownFieldsStorageKey(organisationId));

  // Every tenant-owned query key carries the organisation id.
  queryClient.removeQueries({
    predicate: (query) => (query.queryKey as readonly unknown[]).includes(organisationId),
  });
};

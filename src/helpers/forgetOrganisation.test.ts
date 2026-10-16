import useGlobalStore, { EMPTY_CURRENT_ATTENDANCE, EMPTY_ORG } from "zStore";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { forgetOrganisation } from "helpers/forgetOrganisation";
import {
  expectedRosterDraftKey,
  manualRosterDraftKey,
  newAttendanceDraftIdentity,
  readNewAttendanceDraft,
  writeNewAttendanceDraft,
} from "helpers/newAttendanceDraft";
import { legacyShownFieldsStorageKey, shownFieldsStorageKey } from "helpers/memberListFields";

const SESSION = { name: "Sunday Service", date: "2026-10-11" };
const identity = newAttendanceDraftIdentity(SESSION);
const OFFICER = "officerA";
const OTHER_OFFICER = "officerB";
const rosterKeys = (organisationId: string, ownerId: string | null) => [
  expectedRosterDraftKey(organisationId, ownerId, identity),
  manualRosterDraftKey(organisationId, ownerId, identity),
];

// Two officers' drafts and a legacy unowned one, as a shared browser holds.
const seedDevice = (organisationId: string) => {
  writeNewAttendanceDraft(organisationId, OFFICER, SESSION);
  writeNewAttendanceDraft(organisationId, OTHER_OFFICER, SESSION);
  localStorage.setItem(
    `attendance-new-draft-${organisationId}`,
    JSON.stringify({ version: 1, organisationId, eligibilityRules: [], ...SESSION }),
  );
  [OFFICER, OTHER_OFFICER, null].forEach((ownerId) =>
    rosterKeys(organisationId, ownerId).forEach((key) => localStorage.setItem(key, "[]")),
  );
  localStorage.setItem(shownFieldsStorageKey(organisationId), '["part"]');
  localStorage.setItem(legacyShownFieldsStorageKey(organisationId), '["part"]');
  queryClient.setQueryData(queryKeys.members(organisationId), { data: [] });
  queryClient.setQueryData(queryKeys.finance.obligations(organisationId), { data: [] });
};

const select = (id: string, currentAttendanceOrg?: string) =>
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id, name: id },
    currentAttendance: { ...EMPTY_CURRENT_ATTENDANCE, name: "In progress", organisationId: currentAttendanceOrg },
  });

beforeEach(() => {
  localStorage.clear();
  queryClient.clear();
  seedDevice("orgA");
  seedDevice("orgB");
  queryClient.setQueryData(queryKeys.allOrganisations, { data: [] });
});

describe("forgetOrganisation", () => {
  it("clears the selection, session, drafts, preferences and cache of the deleted, selected org", () => {
    select("orgA", "orgA");
    forgetOrganisation("orgA");

    const state = useGlobalStore.getState();
    expect(state.organisation).toEqual(EMPTY_ORG);
    expect(state.currentAttendance.name).toBe("");
    // Every officer's drafts and the legacy one: the organisation is gone.
    expect(readNewAttendanceDraft("orgA", OFFICER)).toBeNull();
    expect(readNewAttendanceDraft("orgA", OTHER_OFFICER)).toBeNull();
    [OFFICER, OTHER_OFFICER, null].forEach((ownerId) =>
      rosterKeys("orgA", ownerId).forEach((key) => expect(localStorage.getItem(key)).toBeNull()),
    );
    expect(localStorage.getItem(shownFieldsStorageKey("orgA"))).toBeNull();
    expect(localStorage.getItem(legacyShownFieldsStorageKey("orgA"))).toBeNull();
    expect(queryClient.getQueryData(queryKeys.members("orgA"))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.finance.obligations("orgA"))).toBeUndefined();
  });

  it("leaves every other organisation's state alone", () => {
    select("orgA", "orgA");
    forgetOrganisation("orgA");

    expect(readNewAttendanceDraft("orgB", OFFICER)?.ownerId).toBe(OFFICER);
    expect(readNewAttendanceDraft("orgB", OTHER_OFFICER)?.ownerId).toBe(OTHER_OFFICER);
    expect(localStorage.getItem("attendance-new-draft-orgB")).not.toBeNull();
    [OFFICER, OTHER_OFFICER, null].forEach((ownerId) =>
      rosterKeys("orgB", ownerId).forEach((key) => expect(localStorage.getItem(key)).toBe("[]")),
    );
    expect(localStorage.getItem(shownFieldsStorageKey("orgB"))).toBe('["part"]');
    expect(queryClient.getQueryData(queryKeys.members("orgB"))).toEqual({ data: [] });
    expect(queryClient.getQueryData(queryKeys.allOrganisations)).toEqual({ data: [] });
  });

  it("keeps the selection and its session when another organisation is deleted", () => {
    select("orgB", "orgB");
    forgetOrganisation("orgA");

    const state = useGlobalStore.getState();
    expect(state.organisation.id).toBe("orgB");
    expect(state.currentAttendance.name).toBe("In progress");
    expect(readNewAttendanceDraft("orgA", OFFICER)).toBeNull();
  });

  it("clears an unstamped session only when the selected organisation is deleted", () => {
    select("orgA", undefined);
    forgetOrganisation("orgB");
    expect(useGlobalStore.getState().currentAttendance.name).toBe("In progress");

    forgetOrganisation("orgA");
    expect(useGlobalStore.getState().currentAttendance.name).toBe("");
  });

  it("touches only the exact organisation when one id is a prefix of another", () => {
    seedDevice("org1");
    seedDevice("org10");
    select("org10", "org10");
    forgetOrganisation("org1");

    expect(useGlobalStore.getState().organisation.id).toBe("org10");
    expect(useGlobalStore.getState().currentAttendance.name).toBe("In progress");
    expect(readNewAttendanceDraft("org10", OFFICER)?.ownerId).toBe(OFFICER);
    expect(localStorage.getItem("attendance-new-draft-org10")).not.toBeNull();
    rosterKeys("org10", OFFICER).forEach((key) => expect(localStorage.getItem(key)).toBe("[]"));
    rosterKeys("org10", null).forEach((key) => expect(localStorage.getItem(key)).toBe("[]"));
    expect(localStorage.getItem(shownFieldsStorageKey("org10"))).toBe('["part"]');
    expect(queryClient.getQueryData(queryKeys.members("org10"))).toEqual({ data: [] });
    expect(readNewAttendanceDraft("org1", OFFICER)).toBeNull();
    rosterKeys("org1", OFFICER).forEach((key) => expect(localStorage.getItem(key)).toBeNull());
  });

  it("removes roster drafts even when their draft metadata is already gone", () => {
    localStorage.removeItem("attendance-new-draft-orgA");
    localStorage.removeItem("attendance-new-draft-orgA-by-officerA");
    select("orgB");
    forgetOrganisation("orgA");
    [OFFICER, null].forEach((ownerId) =>
      rosterKeys("orgA", ownerId).forEach((key) => expect(localStorage.getItem(key)).toBeNull()),
    );
  });
});

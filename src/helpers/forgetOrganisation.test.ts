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

const seedDevice = (organisationId: string) => {
  writeNewAttendanceDraft(organisationId, SESSION);
  localStorage.setItem(expectedRosterDraftKey(organisationId, identity), "[]");
  localStorage.setItem(manualRosterDraftKey(organisationId, identity), "[]");
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
    expect(readNewAttendanceDraft("orgA")).toBeNull();
    expect(localStorage.getItem(expectedRosterDraftKey("orgA", identity))).toBeNull();
    expect(localStorage.getItem(manualRosterDraftKey("orgA", identity))).toBeNull();
    expect(localStorage.getItem(shownFieldsStorageKey("orgA"))).toBeNull();
    expect(localStorage.getItem(legacyShownFieldsStorageKey("orgA"))).toBeNull();
    expect(queryClient.getQueryData(queryKeys.members("orgA"))).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.finance.obligations("orgA"))).toBeUndefined();
  });

  it("leaves every other organisation's state alone", () => {
    select("orgA", "orgA");
    forgetOrganisation("orgA");

    expect(readNewAttendanceDraft("orgB")).not.toBeNull();
    expect(localStorage.getItem(expectedRosterDraftKey("orgB", identity))).toBe("[]");
    expect(localStorage.getItem(manualRosterDraftKey("orgB", identity))).toBe("[]");
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
    expect(readNewAttendanceDraft("orgA")).toBeNull();
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
    expect(readNewAttendanceDraft("org10")).not.toBeNull();
    expect(localStorage.getItem(expectedRosterDraftKey("org10", identity))).toBe("[]");
    expect(localStorage.getItem(manualRosterDraftKey("org10", identity))).toBe("[]");
    expect(localStorage.getItem(shownFieldsStorageKey("org10"))).toBe('["part"]');
    expect(queryClient.getQueryData(queryKeys.members("org10"))).toEqual({ data: [] });
    expect(readNewAttendanceDraft("org1")).toBeNull();
    expect(localStorage.getItem(expectedRosterDraftKey("org1", identity))).toBeNull();
  });

  it("removes roster drafts even when their draft metadata is already gone", () => {
    localStorage.removeItem("attendance-new-draft-orgA");
    select("orgB");
    forgetOrganisation("orgA");
    expect(localStorage.getItem(expectedRosterDraftKey("orgA", identity))).toBeNull();
    expect(localStorage.getItem(manualRosterDraftKey("orgA", identity))).toBeNull();
  });
});

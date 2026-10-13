import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_CURRENT_ATTENDANCE, EMPTY_ORG } from "zStore";
import Organisations from "pages/Organisations";
import { renderRoute } from "test-utils/renderWithProviders";
import { chooseMenuItem, confirmInDialog } from "test-utils/render";
import { queryKeys } from "services/api/queryKeys";
import {
  expectedRosterDraftKey,
  manualRosterDraftKey,
  newAttendanceDraftIdentity,
  readNewAttendanceDraft,
  writeNewAttendanceDraft,
} from "helpers/newAttendanceDraft";
import { shownFieldsStorageKey } from "helpers/memberListFields";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), delete: jest.fn() },
}));
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as { get: jest.Mock; delete: jest.Mock };

const OWNED = { ...EMPTY_ORG, id: "o1", name: "Demo Choir", isOwner: true, roleName: "Chairman", permissions: [] };
const MEMBER_ONLY = { ...EMPTY_ORG, id: "o2", name: "Tennis Club", isOwner: false, roleName: "Usher", permissions: ["attendance.view"] };

const renderPage = () => renderRoute(<Organisations />, "/organisations", "/organisations");

describe("<Organisations>", () => {
  beforeEach(() => {
    queryClient.clear();
    jest.clearAllMocks();
    useGlobalStore.setState({ organisation: EMPTY_ORG });
  });

  it("shows a loader, not 'No organisation yet', while the list loads", () => {
    api.get.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.queryByText("No organisation yet")).not.toBeInTheDocument();
  });

  it("shows the backend error with Try again instead of an empty list", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 500, data: { error: "Database offline" } } });
    renderPage();
    expect(await screen.findByText("Couldn't load your organisations")).toBeInTheDocument();
    expect(screen.getByText("Database offline")).toBeInTheDocument();
    expect(screen.queryByText("No organisation yet")).not.toBeInTheDocument();

    api.get.mockResolvedValueOnce({ data: { data: [OWNED] } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Demo Choir")).toBeInTheDocument();
  });

  it("offers to add the first organisation when there are none", async () => {
    api.get.mockResolvedValue({ data: { data: [] } });
    renderPage();
    expect(await screen.findByText("No organisation yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add organisation" }));
    expect(mockNavigate).toHaveBeenCalledWith("/add-org");
  });

  it("selects an organisation and opens its dashboard from the row", async () => {
    api.get.mockResolvedValue({ data: { data: [OWNED, MEMBER_ONLY] } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Tennis Club/ }));
    expect(useGlobalStore.getState().organisation.id).toBe("o2");
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard", expect.anything());
  });

  it("offers Settings and Delete only where permitted", async () => {
    api.get.mockResolvedValue({ data: { data: [OWNED, MEMBER_ONLY] } });
    renderPage();
    await screen.findByText("Demo Choir");
    expect(screen.getByRole("button", { name: "More actions for Demo Choir" })).toBeInTheDocument();
    // No settings.view and not the owner: nothing to offer.
    expect(screen.queryByRole("button", { name: "More actions for Tennis Club" })).not.toBeInTheDocument();
  });

  it("deletes after confirmation, by the organisation's URL", async () => {
    api.get.mockResolvedValue({ data: { data: [OWNED] } });
    api.delete.mockResolvedValue({ data: { data: {} } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "More actions for Demo Choir" }));
    await chooseMenuItem(await screen.findByRole("menuitem", { name: "Delete" }));
    await confirmInDialog("Delete");
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/organisations/o1", expect.anything()));
  });

  it("forgets a deleted organisation that was selected, and nothing on a failed delete", async () => {
    useGlobalStore.setState({ organisation: { ...OWNED } });
    api.get.mockResolvedValue({ data: { data: [OWNED] } });
    const deleteOnce = async () => {
      fireEvent.click(await screen.findByRole("button", { name: "More actions for Demo Choir" }));
      await chooseMenuItem(await screen.findByRole("menuitem", { name: "Delete" }));
      await confirmInDialog("Delete");
    };
    renderPage();

    api.delete.mockRejectedValueOnce({ response: { status: 500, data: { error: "Try later" } } });
    await deleteOnce();
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(useGlobalStore.getState().organisation.id).toBe("o1");

    api.delete.mockResolvedValueOnce({ data: { data: {} } });
    await deleteOnce();
    await waitFor(() => expect(useGlobalStore.getState().organisation).toEqual(EMPTY_ORG));
  });

  it("opens settings for that organisation from the menu", async () => {
    api.get.mockResolvedValue({ data: { data: [OWNED] } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "More actions for Demo Choir" }));
    await chooseMenuItem(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(useGlobalStore.getState().organisation.id).toBe("o1");
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });
});

describe("<Organisations> delete and this device's data", () => {
  const SESSION = { name: "Sunday Service", date: "2026-10-11" };
  const identity = newAttendanceDraftIdentity(SESSION);
  const A = { ...OWNED, id: "64a000000000000000000001", name: "Choir A" };
  const B = { ...OWNED, id: "64a000000000000000000002", name: "Band B" };

  const seed = (id: string) => {
    writeNewAttendanceDraft(id, SESSION);
    localStorage.setItem(expectedRosterDraftKey(id, identity), "[]");
    localStorage.setItem(manualRosterDraftKey(id, identity), "[]");
    localStorage.setItem(shownFieldsStorageKey(id), '["part"]');
    queryClient.setQueryData(queryKeys.members(id), { data: [] });
  };
  /** Which of an organisation's local data is still on the device. */
  const kept = (id: string) => ({
    draft: readNewAttendanceDraft(id) !== null,
    roster: localStorage.getItem(expectedRosterDraftKey(id, identity)) !== null,
    manual: localStorage.getItem(manualRosterDraftKey(id, identity)) !== null,
    fields: localStorage.getItem(shownFieldsStorageKey(id)) !== null,
    cache: queryClient.getQueryData(queryKeys.members(id)) !== undefined,
  });
  const ALL = { draft: true, roster: true, manual: true, fields: true, cache: true };
  const NONE = { draft: false, roster: false, manual: false, fields: false, cache: false };

  const openDelete = async (name: string) => {
    fireEvent.click(await screen.findByRole("button", { name: `More actions for ${name}` }));
    await chooseMenuItem(await screen.findByRole("menuitem", { name: "Delete" }));
    return screen.findByRole("alertdialog");
  };
  const selection = () => useGlobalStore.getState();

  beforeEach(() => {
    localStorage.clear();
    queryClient.clear();
    jest.clearAllMocks();
    seed(A.id);
    seed(B.id);
    useGlobalStore.setState({
      organisation: { ...A },
      currentAttendance: { ...EMPTY_CURRENT_ATTENDANCE, name: "A in progress", organisationId: A.id },
    });
    api.get.mockResolvedValue({ data: { data: [A, B] } });
  });

  it("a cancelled delete sends nothing and leaves everything", async () => {
    renderPage();
    fireEvent.click(within(await openDelete("Choir A")).getByRole("button", { name: "Cancel" }));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(api.delete).not.toHaveBeenCalled();
    expect(selection().organisation.id).toBe(A.id);
    expect(selection().currentAttendance.name).toBe("A in progress");
    expect(kept(A.id)).toEqual(ALL);
    expect(kept(B.id)).toEqual(ALL);
  });

  it("a failed delete leaves the selection, its session and its data", async () => {
    api.delete.mockRejectedValue({ response: { status: 500, data: { error: "Try later" } } });
    renderPage();
    fireEvent.click(within(await openDelete("Choir A")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledTimes(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(selection().organisation.id).toBe(A.id);
    expect(selection().currentAttendance.name).toBe("A in progress");
    expect(kept(A.id)).toEqual(ALL);
    expect(kept(B.id)).toEqual(ALL);
  });

  it("deleting another organisation keeps the selected one, its session and its data", async () => {
    api.delete.mockResolvedValue({ data: { data: {} } });
    renderPage();
    fireEvent.click(within(await openDelete("Band B")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith(`/organisations/${B.id}`, expect.anything()));
    await waitFor(() => expect(kept(B.id)).toEqual(NONE));

    expect(selection().organisation.id).toBe(A.id);
    expect(selection().currentAttendance.name).toBe("A in progress");
    expect(kept(A.id)).toEqual(ALL);
  });

  it("deleting the selected organisation forgets it and only it", async () => {
    api.delete.mockResolvedValue({ data: { data: {} } });
    renderPage();
    fireEvent.click(within(await openDelete("Choir A")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(selection().organisation).toEqual(EMPTY_ORG));

    expect(selection().currentAttendance.name).toBe("");
    expect(kept(A.id)).toEqual(NONE);
    expect(kept(B.id)).toEqual(ALL);
  });
});

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Organisations from "pages/Organisations";
import { renderRoute } from "test-utils/renderWithProviders";
import { chooseMenuItem, confirmInDialog } from "test-utils/render";

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

  it("opens settings for that organisation from the menu", async () => {
    api.get.mockResolvedValue({ data: { data: [OWNED] } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "More actions for Demo Choir" }));
    await chooseMenuItem(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(useGlobalStore.getState().organisation.id).toBe("o1");
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });
});

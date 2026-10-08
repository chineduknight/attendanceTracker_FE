import { screen, fireEvent } from "@testing-library/react";
import { render } from "test-utils/render";
import { MemoryRouter } from "react-router-dom";
import useGlobalStore, { EMPTY_USER } from "zStore";
import AppHeader from "components/AppHeader";

const mockNavigate = jest.fn();

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("components/NavDrawer", () => {
  return function MockedNavDrawer({ isOpen }: any) {
    return isOpen ? <div data-testid="nav-drawer">Change password</div> : null;
  };
});
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

describe("<AppHeader>", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    window.history.replaceState(null, "");
    useGlobalStore.setState({ user: EMPTY_USER });
  });

  it("renders the given title", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Finance" />
      </MemoryRouter>
    );
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("hides the back button when showBack is false", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Dashboard" showBack={false} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText("Back")).not.toBeInTheDocument();
  });

  it("shows the back button by default", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Category" />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  it("opens the nav drawer when the hamburger is clicked", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Category" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByText("Change password")).toBeInTheDocument();
  });

  it("navigates back when the back chevron is clicked and there is history", () => {
    window.history.pushState({ idx: 1 }, "");
    render(
      <MemoryRouter>
        <AppHeader title="Category" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("navigates to Dashboard when the back chevron is clicked with no history", () => {
    window.history.replaceState(null, "");
    render(
      <MemoryRouter>
        <AppHeader title="Category" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("shows the logged-in user's avatar and opens the drawer when clicked", () => {
    useGlobalStore.setState({ user: { ...EMPTY_USER, username: "Ada Lovelace" } });
    render(
      <MemoryRouter>
        <AppHeader title="Category" />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Account menu")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Account menu"));
    expect(screen.getByText("Change password")).toBeInTheDocument();
  });
});

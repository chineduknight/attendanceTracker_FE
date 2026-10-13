import { screen, fireEvent } from "@testing-library/react";
import { render } from "test-utils/render";
import { MemoryRouter } from "react-router-dom";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";
import NavDrawer from "components/NavDrawer";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// ChangePasswordModal calls useMutationWrapper -> react-query's useMutation,
// which throws without a QueryClientProvider ancestor (absent from this
// isolated render tree) — mocked out since its internals aren't under test here.
jest.mock("components/auth/ChangePasswordModal", () => {
  return function MockChangePasswordModal() {
    return null;
  };
});

const setState = (over: { organisation?: Partial<typeof EMPTY_ORG> }) =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, username: "Ada Lovelace", email: "ada@example.com" },
    organisation: { ...EMPTY_ORG, ...over.organisation },
  });

const renderDrawer = (onClose = jest.fn()) =>
  render(
    <MemoryRouter>
      <NavDrawer isOpen onClose={onClose} />
    </MemoryRouter>
  );

describe("<NavDrawer>", () => {
  it("shows the signed-in user's profile info", () => {
    setState({});
    renderDrawer();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("only shows nav links the user has permission for", () => {
    setState({ organisation: { permissions: ["finance.view"] } });
    renderDrawer();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.queryByText("Officers & Roles")).not.toBeInTheDocument();
  });

  it("logs out and closes the drawer on Logout click", () => {
    setState({});
    const onClose = jest.fn();
    renderDrawer(onClose);
    fireEvent.click(screen.getByText("Logout"));
    expect(useGlobalStore.getState().user).toEqual(EMPTY_USER);
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the colour-mode control hidden while dark mode is off", () => {
    setState({});
    renderDrawer();
    expect(screen.queryByText("Appearance")).not.toBeInTheDocument();
  });
});

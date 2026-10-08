import { screen, fireEvent, waitFor, act } from "@testing-library/react";
import { render } from "test-utils/render";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import axiosInstance from "services/api";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import OfficersRoles from "pages/OfficersRoles";

jest.mock("react-toastify", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const OFFICER_A = {
  userId: "u1",
  username: "Officer A",
  email: "a@example.com",
  roleId: "r1",
  roleName: "Admin",
  permissions: ["officers.view"],
};

const OFFICER_B = {
  userId: "u2",
  username: "Officer B",
  email: "b@example.com",
  roleId: "r2",
  roleName: "Viewer",
  permissions: ["officers.view"],
};

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OfficersRoles />
      </MemoryRouter>
    </QueryClientProvider>
  );

const setOrg = (id: string) =>
  act(() => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id,
        permissions: ["officers.view", "officers.manage"],
      },
    });
  });

let getSpy: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  useGlobalStore.setState({ organisation: EMPTY_ORG });
  getSpy = jest.spyOn(axiosInstance, "get").mockImplementation((url: string) => {
    if (url === "/organisations/orgA/officers") {
      return Promise.resolve({ data: { data: [OFFICER_A] } });
    }
    if (url === "/organisations/orgB/officers") {
      return Promise.resolve({ data: { data: [OFFICER_B] } });
    }
    if (url.endsWith("/roles")) {
      return Promise.resolve({
        data: { data: [{ id: "r1", name: "Admin", permissions: [], isSystem: true }] },
      });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

afterEach(() => {
  getSpy.mockRestore();
});

test("an Organisation A modal target cannot survive a switch to Organisation B", async () => {
  setOrg("orgA");
  renderPage();

  expect(await screen.findByText("Officer A")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Invite officer" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();

  setOrg("orgB");

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(await screen.findByText("Officer B")).toBeInTheDocument();
  expect(screen.queryByText("Officer A")).not.toBeInTheDocument();

  // The subtree was remounted for B: its lists carry only B data.
  const urlsAfterSwitch = getSpy.mock.calls.map(([url]) => String(url));
  expect(urlsAfterSwitch.some((url) => url.includes("/organisations/orgB/"))).toBe(true);
});

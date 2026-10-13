import { fireEvent, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { chooseMenuItem, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import axiosInstance from "services/api";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import OfficersTab from "components/officers/OfficersTab";
import RolesTab from "components/officers/RolesTab";
import PendingInvitesTab from "components/officers/PendingInvitesTab";
import { describePermissions } from "components/officers/PermissionSummary";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";
import { PermissionKey } from "rbac/permissions";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const OWNER = { userId: "u0", username: "knight", email: "k@example.com", roleId: "r0", roleName: "Chairman", permissions: ["attendance.view", "attendance.manage", "members.view"] };
const SECRETARY = { userId: "u1", username: "secretary", email: "s@example.com", roleId: "r1", roleName: "Secretary", permissions: ["members.view"] };

const renderTab = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

const asOfficer = (permissions: PermissionKey[]) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "orgA", owner: "u0", permissions } });

let getSpy: jest.SpyInstance;
const serve = (byUrl: Record<string, unknown>) => {
  getSpy = jest.spyOn(axiosInstance, "get").mockImplementation((url: string) =>
    url in byUrl ? Promise.resolve({ data: { data: byUrl[url] } }) : Promise.resolve({ data: { data: [] } })
  );
};

beforeEach(() => queryClient.clear());
afterEach(() => getSpy?.mockRestore());

describe("describePermissions", () => {
  it("turns keys into readable lines in catalogue order, with the org's terms", () => {
    expect(
      describePermissions(["members.view", "attendance.manage", "attendance.view"], {
        ...DEFAULT_TERMINOLOGY,
        memberPlural: "Choristers",
      })
    ).toEqual(["Attendance: View, Manage", "Choristers: View"]);
  });
});

describe("<OfficersTab> rows", () => {
  it("shows a permission count that expands into readable names, not raw keys", async () => {
    asOfficer(["officers.view"]);
    serve({ "/organisations/orgA/officers": [OWNER] });
    renderTab(<OfficersTab organisationId="orgA" />);
    const summary = await screen.findByRole("button", { name: "3 permissions" });
    expect(screen.queryByText("attendance.view")).not.toBeInTheDocument();
    fireEvent.click(summary);
    expect(summary).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Attendance: View, Manage")).toBeInTheDocument();
    expect(screen.getByText("Members: View")).toBeInTheDocument();
  });

  it("offers actions only to managers and never on the owner's row", async () => {
    asOfficer(["officers.view", "officers.manage"]);
    serve({ "/organisations/orgA/officers": [OWNER, SECRETARY] });
    renderTab(<OfficersTab organisationId="orgA" />);
    expect(await screen.findByRole("button", { name: "Actions for secretary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for knight" })).not.toBeInTheDocument();
    expect(screen.getByText("Owner")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Actions for secretary" }));
    await chooseMenuItem(await screen.findByRole("menuitem", { name: "Change role" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("has no actions for a view-only officer", async () => {
    asOfficer(["officers.view"]);
    serve({ "/organisations/orgA/officers": [OWNER, SECRETARY] });
    renderTab(<OfficersTab organisationId="orgA" />);
    await screen.findByText("secretary");
    expect(screen.queryByRole("button", { name: /^Actions for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Invite/ })).not.toBeInTheDocument();
  });

  it("shows the backend error with Try again, not 'No officers yet'", async () => {
    asOfficer(["officers.view"]);
    getSpy = jest.spyOn(axiosInstance, "get").mockRejectedValue({ response: { status: 500, data: { error: "Database offline" } } });
    renderTab(<OfficersTab organisationId="orgA" />);
    expect(await screen.findByText("Couldn't load officers")).toBeInTheDocument();
    expect(screen.getByText("Database offline")).toBeInTheDocument();
    expect(screen.queryByText("No officers yet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("<RolesTab> rows", () => {
  it("gives custom roles an actions menu and built-in roles none", async () => {
    asOfficer(["officers.view", "officers.manage"]);
    serve({
      "/organisations/orgA/roles": [
        { id: "r0", name: "Chairman", permissions: ["attendance.view"], isSystem: true },
        { id: "r1", name: "Secretary", permissions: ["members.view"], isSystem: false },
      ],
    });
    renderTab(<RolesTab organisationId="orgA" />);
    expect(await screen.findByRole("button", { name: "Actions for the Secretary role" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Actions for the Chairman role" })).not.toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();
  });
});

describe("<PendingInvitesTab> rows", () => {
  it("names the invite on its Revoke button", async () => {
    asOfficer(["officers.view", "officers.manage"]);
    serve({ "/organisations/orgA/officers/invites": [{ id: "i1", email: "new@example.com", roleId: "r1", roleName: "Secretary" }] });
    renderTab(<PendingInvitesTab organisationId="orgA" />);
    expect(await screen.findByRole("button", { name: "Revoke the invite for new@example.com" })).toBeInTheDocument();
  });

  it("says when there are none", async () => {
    asOfficer(["officers.view"]);
    serve({});
    renderTab(<PendingInvitesTab organisationId="orgA" />);
    expect(await screen.findByText("No pending invites")).toBeInTheDocument();
  });
});

import { act, screen } from "@testing-library/react";
import { render } from "test-utils/render";
import { MemoryRouter } from "react-router-dom";
import useGlobalStore, { EMPTY_ORG, OrganisationType } from "zStore";
import Dashboard from "pages/Dashboard";
import { PermissionKey } from "rbac/permissions";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

const SCHOOL_TERMS = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  attendanceSingular: "Session",
  attendancePlural: "Sessions",
  categorySingular: "Activity",
  categoryPlural: "Activities",
  subCategorySingular: "Activity type",
  subCategoryPlural: "Activity types",
  officerSingular: "Coordinator",
  officerPlural: "Coordinators",
};

const selectOrg = (over: Partial<OrganisationType>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "orgB", isOwner: true, ...over } });

const renderDashboard = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
const actionLabels = () => screen.getAllByRole("button").map((b) => b.textContent);

const TODAY = [
  "Add Member",
  "View Members",
  "Create Attendance",
  "All Attendance",
  "Analytics",
  "Welfare & Engagement",
  "Birthday",
  "Finance",
  "Officers & Roles",
  "Settings",
];

describe("presentation-aware navigation", () => {
  it("keeps today's actions for a default organisation", () => {
    selectOrg({});
    renderDashboard();
    expect(actionLabels()).toEqual(TODAY);
  });

  it("falls back to defaults for a stale cached org without presentation config", () => {
    selectOrg({ terminology: undefined, featureVisibility: undefined });
    renderDashboard();
    expect(actionLabels()).toEqual(TODAY);
  });

  it("uses the organisation's terms and hides modules it turned off", () => {
    selectOrg({
      id: "orgA",
      terminology: SCHOOL_TERMS,
      featureVisibility: { finance: false, birthdays: false, analytics: true, welfare: true },
    });
    renderDashboard();
    expect(actionLabels()).toEqual([
      "Add Student",
      "View Students",
      "Create Session",
      "All Sessions",
      "Analytics",
      "Welfare & Engagement",
      "Coordinators & Roles",
      "Settings",
    ]);
  });

  it("still hides actions the officer isn't permitted to use, independently of visibility", () => {
    const permissions: PermissionKey[] = ["members.view", "attendance.view"];
    selectOrg({ isOwner: false, permissions, featureVisibility: { finance: true, birthdays: false, analytics: true, welfare: true } });
    renderDashboard();
    // Finance is visible but not permitted; Birthday is permitted but hidden.
    expect(actionLabels()).toEqual(["View Members", "All Attendance", "Analytics", "Welfare & Engagement"]);
  });

  it("swaps labels and modules immediately when switching A → B → A", () => {
    const orgA = {
      id: "orgA",
      terminology: SCHOOL_TERMS,
      featureVisibility: { finance: false, birthdays: false, analytics: true, welfare: true },
    };
    selectOrg(orgA);
    renderDashboard();
    expect(screen.getByText("Add Student")).toBeInTheDocument();

    act(() => selectOrg({ id: "orgB" }));
    expect(actionLabels()).toEqual(TODAY);

    act(() => selectOrg(orgA));
    expect(screen.getByText("Coordinators & Roles")).toBeInTheDocument();
    expect(screen.queryByText("Finance")).not.toBeInTheDocument();
  });
});

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "react-toastify";
import useGlobalStore, { EMPTY_ORG, OrganisationType } from "zStore";
import { applyRoutePermissions } from "routes/protectedRoutes";
import { PROTECTED_PATHS } from "routes/pagePath";
import { HIDDEN_FEATURE_MESSAGE } from "routes/RequireFeature";

jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), info: jest.fn(), success: jest.fn() } }));

const routes = applyRoutePermissions([
  { path: PROTECTED_PATHS.FINANCE, element: <div>finance page</div>, title: "Finance", perm: "finance.view", feature: "finance" },
  { path: PROTECTED_PATHS.MEMBER_ANALYTICS, element: <div>member analytics</div>, title: "Member Analytics", perm: "attendance.view", feature: "analytics" },
  { path: PROTECTED_PATHS.WELFARE, element: <div>welfare page</div>, title: "Welfare & Engagement", perm: "attendance.view", feature: "welfare" },
]);

const selectOrg = (over: Partial<OrganisationType>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", permissions: [], ...over } });

const visit = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {routes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path={PROTECTED_PATHS.DASHBOARD} element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("feature-hidden routes", () => {
  beforeEach(() => jest.clearAllMocks());

  it("redirects a hidden module to the dashboard with a neutral notice", () => {
    selectOrg({ isOwner: true, featureVisibility: { finance: false, birthdays: true, analytics: true, welfare: true } });
    visit(PROTECTED_PATHS.FINANCE);
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(toast.info).toHaveBeenCalledWith(HIDDEN_FEATURE_MESSAGE);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("hides member analytics with analytics", () => {
    selectOrg({ isOwner: true, featureVisibility: { finance: true, birthdays: true, analytics: false, welfare: true } });
    visit("/analytics/member/m1");
    expect(screen.getByText("dashboard")).toBeInTheDocument();
  });

  it("hides welfare when the organisation turns it off", () => {
    selectOrg({ isOwner: true, featureVisibility: { finance: true, birthdays: true, analytics: true, welfare: false } });
    visit(PROTECTED_PATHS.WELFARE);
    expect(screen.getByText("dashboard")).toBeInTheDocument();
  });

  it("still applies RBAC to a visible module", () => {
    selectOrg({ permissions: ["members.view"] });
    visit(PROTECTED_PATHS.FINANCE);
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("You don't have access to that.");
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("renders a visible, permitted module and treats a legacy org without config as visible", () => {
    selectOrg({ permissions: ["finance.view"], featureVisibility: undefined });
    visit(PROTECTED_PATHS.FINANCE);
    expect(screen.getByText("finance page")).toBeInTheDocument();
  });

  it("re-checks visibility against the organisation selected now", () => {
    selectOrg({ isOwner: true });
    visit(PROTECTED_PATHS.FINANCE);
    expect(screen.getByText("finance page")).toBeInTheDocument();
    act(() => selectOrg({ id: "org2", isOwner: true, featureVisibility: { finance: false, birthdays: true, analytics: true, welfare: true } }));
    expect(screen.getByText("dashboard")).toBeInTheDocument();
  });
});

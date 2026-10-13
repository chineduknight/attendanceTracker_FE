import { screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "test-utils/render";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { applyRoutePermissions } from "routes/protectedRoutes";
import { PROTECTED_PATHS } from "routes/pagePath";

jest.mock("react-toastify", () => ({ toast: { info: jest.fn(), error: jest.fn() } }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toast } = require("react-toastify");

const ROUTES = applyRoutePermissions([
  { path: PROTECTED_PATHS.ALL_ORG, element: <div>organisation picker</div>, title: "Organisations", needsOrganisation: false },
  { path: PROTECTED_PATHS.ADD_ORG, element: <div>add org</div>, title: "New Organisation", needsOrganisation: false },
  { path: PROTECTED_PATHS.DASHBOARD, element: <div>dashboard</div>, title: "Dashboard" },
  { path: PROTECTED_PATHS.FINANCE, element: <div>finance</div>, title: "Finance", perm: "finance.view" },
]);

const visit = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        {ROUTES.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
      </Routes>
    </MemoryRouter>,
  );

describe("organisation pages without a selected organisation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useGlobalStore.setState({ organisation: EMPTY_ORG });
  });

  it.each([PROTECTED_PATHS.DASHBOARD, PROTECTED_PATHS.FINANCE])(
    "%s sends the officer to choose an organisation",
    async (path) => {
      visit(path);
      expect(await screen.findByText("organisation picker")).toBeInTheDocument();
      expect(toast.info).toHaveBeenCalledWith("Choose an organisation first.");
      // Not the permission guard's misleading message.
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it.each([
    [PROTECTED_PATHS.ALL_ORG, "organisation picker"],
    [PROTECTED_PATHS.ADD_ORG, "add org"],
  ])("%s still works", async (path, text) => {
    visit(path);
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("shows a permitted page once an organisation is selected", async () => {
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", permissions: ["finance.view"] } });
    visit(PROTECTED_PATHS.FINANCE);
    expect(await screen.findByText("finance")).toBeInTheDocument();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("leaves a missing permission to the permission guard once an organisation is selected", async () => {
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", permissions: [] } });
    visit(PROTECTED_PATHS.FINANCE);
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("You don't have access to that.");
    expect(toast.info).not.toHaveBeenCalled();
  });
});

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import ProtectedLayout from "components/ProtectedLayout";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// NavDrawer renders ChangePasswordModal, which calls useMutation and requires a
// QueryClientProvider. This layout test tree is intentionally isolated (no app-level
// providers), so NavDrawer is mocked here — matching the pattern already used in
// AppHeader.test.tsx — to keep this suite focused on ProtectedLayout's route-matching
// behavior rather than NavDrawer's internals.
jest.mock("components/NavDrawer", () => () => null);

// ProtectedLayout now calls useSyncSelectedOrg(), which uses useQueryWrapper
// (react-query's useQuery) internally, so every render needs a QueryClientProvider.
const renderWithProviders = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

describe("<ProtectedLayout>", () => {
  it("shows the matched route's title and its child content", () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/finance"]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/finance" element={<div>finance page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("finance page content")).toBeInTheDocument();
  });

  it("resolves titles for dynamic route segments", () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/attendance/abc123"]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/attendance/:id" element={<div>attendance detail</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("View Attendance")).toBeInTheDocument();
  });

  it("hides the back button on Dashboard", () => {
    renderWithProviders(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<div>dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByLabelText("Back")).not.toBeInTheDocument();
  });

  it("titles the page with the selected organisation's terminology", () => {
    useGlobalStore.setState({
      organisation: {
        // No id: keeps the org-sync query idle so the test stays synchronous.
        ...EMPTY_ORG,
        terminology: { ...DEFAULT_TERMINOLOGY, memberSingular: "Student", memberPlural: "Students" },
      },
    });
    renderWithProviders(
      <MemoryRouter initialEntries={["/view-member"]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/view-member" element={<div>members</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("View Students")).toBeInTheDocument();
    act(() => useGlobalStore.setState({ organisation: EMPTY_ORG }));
  });
});


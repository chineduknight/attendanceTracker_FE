import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedLayout from "components/ProtectedLayout";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
// NavDrawer renders ChangePasswordModal, which calls useMutation and requires a
// QueryClientProvider. This layout test tree is intentionally isolated (no app-level
// providers), so NavDrawer is mocked here — matching the pattern already used in
// AppHeader.test.tsx — to keep this suite focused on ProtectedLayout's route-matching
// behavior rather than NavDrawer's internals.
jest.mock("components/NavDrawer", () => () => null);

describe("<ProtectedLayout>", () => {
  it("shows the matched route's title and its child content", () => {
    render(
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
    render(
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
    render(
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
});

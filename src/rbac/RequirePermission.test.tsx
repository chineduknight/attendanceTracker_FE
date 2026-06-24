import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { RequirePermission } from "rbac/RequirePermission";

jest.mock("react-toastify", () => ({ toast: { error: jest.fn() } }));

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/officers"]}>
      <Routes>
        <Route
          path="/officers"
          element={
            <RequirePermission perm="officers.view">
              <div>officers page</div>
            </RequirePermission>
          }
        />
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("<RequirePermission>", () => {
  it("renders the page when permitted", () => {
    setOrg({ permissions: ["officers.view"] });
    renderAt();
    expect(screen.getByText("officers page")).toBeInTheDocument();
  });

  it("redirects to dashboard when not permitted", () => {
    setOrg({ permissions: [] });
    renderAt();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.queryByText("officers page")).not.toBeInTheDocument();
  });
});

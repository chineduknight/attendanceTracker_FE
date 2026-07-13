import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import OrganisationSettings from "pages/OrganisationSettings";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// Resolve the settings GET so the form (not the spinner) renders.
jest.mock("services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() =>
      Promise.resolve({
        data: {
          data: {
            id: "org1",
            name: "VOB Choir",
            image: "",
            collapseAttendanceByDay: false,
            maxAttendanceEdits: 3,
          },
        },
      }),
    ),
    put: jest.fn(() => Promise.resolve({ data: { data: {} } })),
  },
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<OrganisationSettings />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

describe("<OrganisationSettings>", () => {
  it("shows the form with a Save button for a manager", async () => {
    setOrg({ id: "org1", permissions: ["settings.view", "settings.manage"] });
    renderPage();
    expect(await screen.findByLabelText("Organisation Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Logo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Max attendance edits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
  });

  it("hides Save for a view-only user", async () => {
    setOrg({ id: "org1", permissions: ["settings.view"] });
    renderPage();
    await screen.findByLabelText("Organisation Name");
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
  });
});

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import OrganisationSettings from "pages/OrganisationSettings";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// Resolve the settings GET so the form (not the spinner) renders.
// NOTE: CRA's jest config runs with `resetMocks: true`, which strips mock
// *implementations* (not just call history) before every test. An
// implementation attached inline here would only ever run for a single test
// in the file, so `get`/`put` are re-armed in `beforeEach` below via the
// references pulled from the mocked module itself (avoids referencing
// not-yet-initialized outer `const`s inside the hoisted jest.mock factory).
jest.mock("services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPut: jest.Mock = mockedAxios.put;

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
  beforeEach(() => {
    // Each test renders against the same singleton queryClient; clear its
    // cache so a previous test's cached ["organisation", "org1"] response
    // doesn't leak in and skip a fresh GET/reset() for this test.
    queryClient.clear();
    // resetMocks (see note above) wipes implementations before every test,
    // so restore the default GET/PUT behaviour here each time.
    mockGet.mockImplementation(() =>
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
    );
    mockPut.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("shows the form with a Save button for a manager", async () => {
    setOrg({ id: "org1", permissions: ["settings.view", "settings.manage"] });
    renderPage();
    expect(await screen.findByLabelText(/Organisation Name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Logo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Max attendance edits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
  });

  it("hides Save for a view-only user", async () => {
    setOrg({ id: "org1", permissions: ["settings.view"] });
    renderPage();
    await screen.findByLabelText(/Organisation Name/);
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
  });

  it("preserves RBAC permissions on save (merge, not replace)", async () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        permissions: ["settings.view", "settings.manage"],
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const axiosInstance = require("services/api").default;
    axiosInstance.put.mockResolvedValueOnce({
      data: {
        data: {
          id: "org1",
          name: "VOB Choir",
          image: "",
          collapseAttendanceByDay: true,
          maxAttendanceEdits: 5,
        },
      },
    });
    renderPage();
    const saveBtn = await screen.findByRole("button", { name: /Save/ });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(axiosInstance.put).toHaveBeenCalled());
    await waitFor(() => {
      const org = useGlobalStore.getState().organisation;
      expect(org.permissions).toEqual(["settings.view", "settings.manage"]);
      expect(org.name).toBe("VOB Choir");
    });
  });
});

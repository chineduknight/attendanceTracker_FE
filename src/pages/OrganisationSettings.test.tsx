import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import OrganisationSettings from "pages/OrganisationSettings";
import {
  DEFAULT_FEATURE_VISIBILITY,
  DEFAULT_TERMINOLOGY,
} from "helpers/organisationPresentation";

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
    // cache so a previous test's cached organisation-detail response
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
            // A backend that supports presentation settings always returns both.
            terminology: { ...DEFAULT_TERMINOLOGY },
            featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY },
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

  describe("attendance statuses", () => {
    const manager = () =>
      setOrg({ id: "org1", permissions: ["settings.view", "settings.manage"] });

    it("loads the default configuration for an org without custom statuses", async () => {
      manager();
      renderPage();
      await screen.findByText("Attendance statuses");
      ["present", "apology", "absent"].forEach((key) =>
        expect(screen.getByTestId(`status-row-${key}`)).toBeInTheDocument(),
      );
    });

    it("adds `late` and saves it with every other setting", async () => {
      manager();
      renderPage();
      fireEvent.change(await screen.findByLabelText("New status label"), {
        target: { value: "Late" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add status" }));
      expect(screen.getByTestId("status-row-late")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Save/ }));
      await waitFor(() => expect(mockPut).toHaveBeenCalled());
      const body = mockPut.mock.calls[0][1];
      expect(body).toMatchObject({
        name: "VOB Choir",
        image: "",
        collapseAttendanceByDay: false,
        maxAttendanceEdits: 3,
      });
      expect(body.attendanceStatuses.map((s: { key: string }) => s.key)).toEqual([
        "present",
        "apology",
        "absent",
        "late",
      ]);
      await waitFor(() =>
        expect(
          useGlobalStore.getState().organisation.attendanceStatuses.map((s) => s.key),
        ).toContain("late"),
      );
    });

    it("locks behavior on persisted statuses but not on new ones", async () => {
      manager();
      renderPage();
      const present = await screen.findByTestId("status-row-present");
      expect(within(present).getByLabelText("Behavior")).toBeDisabled();
      expect(
        within(present).queryByRole("button", { name: /Remove/ }),
      ).not.toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("New status label"), {
        target: { value: "Late" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add status" }));
      const late = screen.getByTestId("status-row-late");
      expect(within(late).getByLabelText("Behavior")).toBeEnabled();
      fireEvent.click(within(late).getByRole("button", { name: "Remove Late" }));
      expect(screen.queryByTestId("status-row-late")).not.toBeInTheDocument();
    });

    it("blocks saving an invalid configuration", async () => {
      manager();
      renderPage();
      const absent = await screen.findByTestId("status-row-absent");
      fireEvent.click(within(absent).getByLabelText("Active"));
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("An inactive status cannot be the default.");
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("is read-only for a view-only user", async () => {
      setOrg({ id: "org1", permissions: ["settings.view"] });
      renderPage();
      const present = await screen.findByTestId("status-row-present");
      expect(within(present).getByLabelText("Label")).toHaveAttribute("readonly");
      expect(within(present).getByLabelText("Active")).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Add status" })).not.toBeInTheDocument();
    });
  });

  describe("terminology and visible modules", () => {
    it("shows read-only presentation controls to a view-only user", async () => {
      setOrg({ id: "org1", permissions: ["settings.view"] });
      renderPage();
      const member = await screen.findByLabelText(/Member singular/);
      expect(member).toHaveAttribute("readonly");
      expect(screen.getByLabelText("Finance")).toBeDisabled();
      expect(screen.getByText(/do not rename stored data or API fields/)).toBeInTheDocument();
      expect(screen.getByText(/Permissions are unchanged/)).toBeInTheDocument();
    });

    it("loads stored terms over defaults and saves complete config with every other setting", async () => {
      mockGet.mockImplementation(() =>
        Promise.resolve({
          data: {
            data: {
              id: "org1",
              name: "VOB Choir",
              image: "",
              collapseAttendanceByDay: false,
              maxAttendanceEdits: 3,
              terminology: { memberSingular: "Chorister", memberPlural: "Choristers" },
              featureVisibility: { finance: true, birthdays: false, analytics: true },
            },
          },
        }),
      );
      setOrg({ id: "org1", roleName: "Owner", isOwner: true, permissions: ["settings.view", "settings.manage"] });
      renderPage();
      const memberSingular = (await screen.findByLabelText(/Member singular/)) as HTMLInputElement;
      expect(memberSingular.value).toBe("Chorister");
      expect((screen.getByLabelText(/Officer plural/) as HTMLInputElement).value).toBe("Officers");
      // Stored visibility loads into the switches.
      expect(screen.getByLabelText("Birthdays")).not.toBeChecked();
      expect(screen.getByLabelText("Finance")).toBeChecked();
      mockPut.mockImplementation((_url: string, sent: Record<string, unknown>) =>
        Promise.resolve({ data: { data: { id: "org1", name: "VOB Choir", ...sent } } })
      );

      fireEvent.change(screen.getByLabelText(/Officer plural/), { target: { value: " Coordinators " } });
      fireEvent.click(screen.getByLabelText("Finance"));
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));

      await waitFor(() => expect(mockPut).toHaveBeenCalled());
      const body = mockPut.mock.calls[0][1];
      expect(body.terminology).toEqual({
        memberSingular: "Chorister",
        memberPlural: "Choristers",
        attendanceSingular: "Attendance",
        attendancePlural: "Attendance",
        categorySingular: "Category",
        categoryPlural: "Categories",
        subCategorySingular: "Sub-category",
        subCategoryPlural: "Sub-categories",
        officerSingular: "Officer",
        officerPlural: "Coordinators",
      });
      expect(body.featureVisibility).toEqual({ finance: false, birthdays: false, analytics: true });
      expect(body).toMatchObject({ name: "VOB Choir", maxAttendanceEdits: 3 });
      ["permissions", "isOwner", "roleName"].forEach((key) => expect(body).not.toHaveProperty(key));

      // The selected org updates at once (navigation reads it) and keeps RBAC.
      await waitFor(() =>
        expect(useGlobalStore.getState().organisation.terminology?.officerPlural).toBe("Coordinators")
      );
      const org = useGlobalStore.getState().organisation;
      expect(org.featureVisibility?.finance).toBe(false);
      expect(org.roleName).toBe("Owner");
      expect(org.permissions).toEqual(["settings.view", "settings.manage"]);
    });

    it("blocks saving a blank or over-long term", async () => {
      setOrg({ id: "org1", permissions: ["settings.view", "settings.manage"] });
      renderPage();
      const field = await screen.findByLabelText(/Member plural/);
      fireEvent.change(field, { target: { value: "   " } });
      fireEvent.change(screen.getByLabelText(/Officer singular/), { target: { value: "x".repeat(41) } });
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));
      expect(await screen.findByText("Required")).toBeInTheDocument();
      expect(screen.getByText(/At most 40 characters/)).toBeInTheDocument();
      expect(mockPut).not.toHaveBeenCalled();
    });

    it("keeps saving against an older backend that doesn't return presentation settings", async () => {
      mockGet.mockImplementation(() =>
        Promise.resolve({
          data: { data: { id: "org1", name: "VOB Choir", image: "", collapseAttendanceByDay: false, maxAttendanceEdits: 3 } },
        }),
      );
      setOrg({ id: "org1", permissions: ["settings.view", "settings.manage"] });
      renderPage();
      await screen.findByLabelText(/Organisation Name/);
      expect(screen.queryByText("Terminology")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Save/ }));
      await waitFor(() => expect(mockPut).toHaveBeenCalled());
      const body = mockPut.mock.calls[0][1];
      expect(body).not.toHaveProperty("terminology");
      expect(body).not.toHaveProperty("featureVisibility");
    });

    it("ignores a save reply for an organisation the officer has switched away from", async () => {
      let reply: (value: unknown) => void = () => undefined;
      mockPut.mockImplementation(() => new Promise((resolve) => { reply = resolve; }));
      setOrg({ id: "org1", permissions: ["settings.view", "settings.manage"] });
      renderPage();
      fireEvent.click(await screen.findByRole("button", { name: /Save/ }));
      await waitFor(() => expect(mockPut).toHaveBeenCalled());

      act(() => setOrg({ id: "org2", name: "Band", permissions: ["settings.view"] }));
      await act(async () => {
        reply({ data: { data: { id: "org1", name: "VOB Choir" } } });
      });

      expect(useGlobalStore.getState().organisation.id).toBe("org2");
    });
  });
});

import { confirmInDialog, generatedCss } from "test-utils/render";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { system } from "styles/theme";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore, { EMPTY_CURRENT_ATTENDANCE, EMPTY_ORG } from "zStore";
import CreateAttendance from "pages/CreateAttendance";
import { PROTECTED_PATHS } from "routes/pagePath";
import { AttendanceTemplate } from "helpers/attendanceTemplates";
import { CategoryType } from "hooks/useCategories";
import { MEMBER_MODEL, ROSTER } from "test-utils/eligibilityFixtures";
import { format } from "date-fns";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
// Keep the real endpoint constants; only the axios instance is faked.
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPost: jest.Mock = mockedAxios.post;
const mockPut: jest.Mock = mockedAxios.put;
const mockDelete: jest.Mock = mockedAxios.delete;

const CATEGORIES: CategoryType[] = [
  {
    id: "c1",
    name: "Rehearsal",
    status: "active",
    subCategories: [
      { id: "s1", name: "Choir", status: "active", parentCategoryId: "c1" },
    ],
  },
  { id: "c2", name: "Service", status: "active", subCategories: [] },
];

const template = (over: Partial<AttendanceTemplate>): AttendanceTemplate => ({
  id: "t1",
  organisationId: "orgA",
  name: "Thursday Rehearsal",
  categoryId: "c1",
  subCategoryId: "s1",
  eligibilityRules: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

let templatesByOrg: Record<string, Partial<AttendanceTemplate>[]>;
let rosterByOrg: Record<string, typeof ROSTER>;
let modelByOrg: Record<string, typeof MEMBER_MODEL>;

/** Eligibility is off unless a test opts in, as for a new organisation. */
const selectOrg = (id: string, { eligibility = false } = {}) =>
  useGlobalStore.setState({
    organisation: {
      ...EMPTY_ORG,
      id,
      permissions: [],
      attendanceEligibilityEnabled: eligibility,
    },
  });

const renderPage = () =>
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/create"]}>
          <Routes>
            <Route path="/create" element={<CreateAttendance />} />
            <Route
              path={PROTECTED_PATHS.MARK_ATTENANCE}
              element={<div>marking</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );

const nameInput = () => screen.getByLabelText(/Name/) as HTMLInputElement;
const dateInput = () => screen.getByLabelText(/Date/) as HTMLInputElement;
const categorySelect = () =>
  screen.getByLabelText("Category") as HTMLSelectElement;
const subCategorySelect = () =>
  screen.getByLabelText("Sub-category") as HTMLSelectElement;
const templateSelect = () =>
  screen.getByLabelText("Template") as HTMLSelectElement;
const button = (name: string) => screen.getByRole("button", { name });
const waitForContinue = () =>
  waitFor(() => expect(button("Continue")).toBeEnabled());

const type = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

const pickEligibility = async (field: string, option: string) => {
  fireEvent.keyDown(screen.getByLabelText(`${field} eligibility`), {
    key: "ArrowDown",
  });
  fireEvent.click(await screen.findByRole("option", { name: option }));
};
const expectedText = () => screen.getByText(/^Expected members:/).textContent;
const waitForRoster = () => screen.findByText(/^Expected members: \d+ of/);

const orgBInvalidated = () =>
  queryClient.getQueryState(queryKeys.attendanceTemplates("orgB"))
    ?.isInvalidated;

const confirmDialog = () => confirmInDialog("Delete");

const mockApi = () => {
  mockGet.mockImplementation((url: string) => {
    const templates = url.match(/^\/attendance\/(\w+)\/templates$/);
    if (templates) {
      return Promise.resolve({
        data: { data: templatesByOrg[templates[1]] ?? [] },
      });
    }
    const orgScoped = url.match(/^\/organisations\/(\w+)\/(members|model)$/);
    if (orgScoped) {
      const [, orgId, resource] = orgScoped;
      return Promise.resolve({
        data: {
          data:
            resource === "members"
              ? rosterByOrg[orgId]
              : { fields: modelByOrg[orgId] },
        },
      });
    }
    if (url.endsWith("/category"))
      return Promise.resolve({ data: { data: CATEGORIES } });
    return Promise.resolve({ data: { data: [] } });
  });
  mockPost.mockImplementation((_url: string, body: object) =>
    Promise.resolve({ data: { data: template({ id: "t-new", ...body }) } }),
  );
  mockPut.mockImplementation((url: string, body: object) =>
    Promise.resolve({
      data: { data: template({ id: url.split("/").pop(), ...body }) },
    }),
  );
  mockDelete.mockImplementation(() =>
    Promise.resolve({ data: { data: "deleted" } }),
  );
};

describe("<CreateAttendance> session templates", () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.getState().clearCurrentAttendance();
    selectOrg("orgA");
    templatesByOrg = { orgA: [template({})], orgB: [] };
    rosterByOrg = { orgA: ROSTER, orgB: ROSTER.slice(0, 3) };
    modelByOrg = { orgA: MEMBER_MODEL, orgB: MEMBER_MODEL };
    mockApi();
  });

  it("lists the current organisation's templates", async () => {
    renderPage();
    expect(
      await screen.findByRole("option", { name: "Thursday Rehearsal" }),
    ).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/attendance/orgA/templates");
  });

  it("defaults the session date to today's local business date", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    expect(dateInput().value).toBe(format(new Date(), "MMM d, yyyy"));
  });

  it("keeps the normal create flow when there are no templates", async () => {
    templatesByOrg.orgA = [];
    renderPage();
    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    type(nameInput(), "Ad-hoc meeting");
    type(dateInput(), "2026-10-01");
    await waitFor(() => expect(button("Continue")).toBeEnabled());
    await waitForContinue();
    fireEvent.click(button("Continue"));
    expect(await screen.findByText("marking")).toBeInTheDocument();
    expect(useGlobalStore.getState().currentAttendance).toEqual({
      name: "Ad-hoc meeting",
      date: "2026-10-01",
      eligibilityRules: [],
    });
  });

  it("fills name, category and sub-category from a template without changing the date", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    await screen.findByRole("option", { name: "Rehearsal" });
    type(dateInput(), "2026-10-01");

    type(templateSelect(), "t1");

    expect(nameInput().value).toBe("Thursday Rehearsal");
    expect(categorySelect().value).toBe("c1");
    expect(subCategorySelect().value).toBe("s1");
    expect(dateInput().value).toBe("Oct 1, 2026");
  });

  it("saves the current details as a new, selected template without date, status or member data", async () => {
    templatesByOrg.orgA = [];
    renderPage();
    await screen.findByText(/No templates yet/);
    await waitFor(() =>
      expect(categorySelect().options.length).toBeGreaterThan(1),
    );
    type(nameInput(), "Friday Vigil");
    type(categorySelect(), "c2");
    type(dateInput(), "2026-10-02");
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(queryKeys.attendanceTemplates("orgB"), {
      data: [],
    });

    templatesByOrg.orgA = [
      template({
        id: "t-new",
        name: "Friday Vigil",
        categoryId: "c2",
        subCategoryId: null,
      }),
    ];
    fireEvent.click(button("Save as template"));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith("/attendance/orgA/templates", {
      name: "Friday Vigil",
      categoryId: "c2",
      subCategoryId: null,
      eligibilityRules: [],
    });
    await waitFor(() => expect(templateSelect().value).toBe("t-new"));
    expect(toast.success).toHaveBeenCalledWith(
      'Saved "Friday Vigil" as a template',
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.attendanceTemplates("orgA"),
    });
    expect(orgBInvalidated()).toBe(false);
    // Saving does not navigate or clear what was typed.
    expect(dateInput().value).toBe("Oct 2, 2026");
    invalidate.mockRestore();
  });

  it("blocks an obvious duplicate name client-side", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(nameInput(), "thursday rehearsal");
    fireEvent.click(button("Save as template"));
    expect(toast.error).toHaveBeenCalledWith(
      'A template named "thursday rehearsal" already exists',
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("requires a name before saving a template", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    fireEvent.click(button("Save as template"));
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Enter the attendance name/),
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("updates the selected template from the current details, excluding the date", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Rehearsal" });
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(templateSelect(), "t1");
    type(nameInput(), "Thursday Practice");
    type(categorySelect(), "c2");
    type(dateInput(), "2026-10-01");
    queryClient.setQueryData(queryKeys.attendanceTemplates("orgB"), {
      data: [],
    });

    fireEvent.click(button("Update template"));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        mockGet.mock.calls.filter(
          ([url]) => url === "/attendance/orgA/templates",
        ),
      ).toHaveLength(2),
    );
    expect(orgBInvalidated()).toBe(false);
    expect(mockPut).toHaveBeenCalledWith("/attendance/orgA/templates/t1", {
      name: "Thursday Practice",
      categoryId: "c2",
      subCategoryId: null,
      eligibilityRules: [],
    });
  });

  it("deletes the selected template after confirmation and keeps the entered details", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Rehearsal" });
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(templateSelect(), "t1");
    type(dateInput(), "2026-10-01");

    fireEvent.click(button("Delete template"));
    templatesByOrg.orgA = [];
    queryClient.setQueryData(queryKeys.attendanceTemplates("orgB"), {
      data: [],
    });
    await confirmDialog();

    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0][0]).toBe("/attendance/orgA/templates/t1");
    await screen.findByText(/No templates yet/);
    expect(orgBInvalidated()).toBe(false);
    expect(nameInput().value).toBe("Thursday Rehearsal");
    expect(categorySelect().value).toBe("c1");
    expect(subCategorySelect().value).toBe("s1");
    expect(dateInput().value).toBe("Oct 1, 2026");
  });

  it("resets the selected template and details on organisation switch and never shows A's templates in B", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Rehearsal" });
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(templateSelect(), "t1");
    expect(nameInput().value).toBe("Thursday Rehearsal");

    act(() => selectOrg("orgB"));

    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Thursday Rehearsal" }),
    ).not.toBeInTheDocument();
    expect(nameInput().value).toBe("");
    expect(
      screen.queryByRole("button", { name: "Update template" }),
    ).not.toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/attendance/orgB/templates");
  });

  it("shows a load error rather than an empty state when the template list fails", async () => {
    // React Query logs the failed request; the failure itself is the scenario.
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const serve = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((url: string) =>
      url.endsWith("/templates")
        ? Promise.reject(new Error("offline"))
        : serve(url),
    );
    renderPage();
    expect(
      await screen.findByText(/Templates could not be loaded/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No templates yet/)).not.toBeInTheDocument();
  });

  it("does not mark templates stale or apply them when categories fail to load", async () => {
    // React Query logs the failed request; the failure itself is the scenario.
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    templatesByOrg.orgA = [template({})];
    const serve = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((url: string) =>
      url.endsWith("/category")
        ? Promise.reject(new Error("offline"))
        : serve(url),
    );
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(templateSelect(), "t1");
    expect(screen.queryByText("Needs update")).not.toBeInTheDocument();
    expect(button("Apply")).toBeDisabled();
    expect(nameInput().value).toBe("");
  });

  describe("stale templates", () => {
    beforeEach(() => {
      templatesByOrg.orgA = [
        template({
          id: "t-stale",
          name: "Old Vigil",
          categoryId: "archived",
          subCategoryId: null,
        }),
      ];
    });

    const selectStale = async () => {
      renderPage();
      await screen.findByRole("option", { name: "Rehearsal" });
      await screen.findByRole("option", { name: "Old Vigil (Needs update)" });
      type(templateSelect(), "t-stale");
    };

    it("is marked Needs update, cannot be applied and fills nothing", async () => {
      await selectStale();
      expect(screen.getByText("Needs update")).toBeInTheDocument();
      expect(button("Apply")).toBeDisabled();
      expect(nameInput().value).toBe("");
      expect(categorySelect().value).toBe("");
    });

    it("can be repaired with Update using the current valid details", async () => {
      await selectStale();
      type(nameInput(), "Old Vigil");
      type(categorySelect(), "c2");
      fireEvent.click(button("Update template"));
      await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
      expect(mockPut).toHaveBeenCalledWith(
        "/attendance/orgA/templates/t-stale",
        {
          name: "Old Vigil",
          categoryId: "c2",
          subCategoryId: null,
          eligibilityRules: [],
        },
      );
    });

    it("can be deleted", async () => {
      await selectStale();
      fireEvent.click(button("Delete template"));
      await confirmDialog();
      await waitFor(() =>
        expect(mockDelete.mock.calls[0][0]).toBe(
          "/attendance/orgA/templates/t-stale",
        ),
      );
    });
  });
});

describe("<CreateAttendance> eligibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.getState().clearCurrentAttendance();
    selectOrg("orgA", { eligibility: true });
    templatesByOrg = { orgA: [], orgB: [] };
    rosterByOrg = { orgA: ROSTER, orgB: ROSTER.slice(0, 3) };
    modelByOrg = { orgA: MEMBER_MODEL, orgB: MEMBER_MODEL };
    mockApi();
  });

  const fillDetails = () => {
    type(nameInput(), "Rehearsal");
    type(dateInput(), "2026-10-01");
  };

  const seedAvailability = (memberId = "m1") => {
    queryClient.setQueryData(
      queryKeys.attendanceAvailability.date("orgA", "2026-10-01"),
      {
        data: [
          {
            memberId,
            startDate: "2026-10-01",
            endDate: "2026-10-01",
          },
        ],
      },
    );
  };

  it("does not trust cached availability while a fresh date request is pending", async () => {
    seedAvailability("m1");
    let resolveFresh!: (value: unknown) => void;
    const fresh = new Promise((resolve) => {
      resolveFresh = resolve;
    });
    const baseGet = mockGet.getMockImplementation() as (
      url: string,
    ) => Promise<unknown>;
    mockGet.mockImplementation((url: string) =>
      url.includes("/availability") ? fresh : baseGet(url),
    );

    renderPage();
    await waitForRoster();
    fillDetails();
    expect(button("Continue")).toBeDisabled();
    expect(
      screen.getByText("Checking attendance availability..."),
    ).toBeInTheDocument();

    resolveFresh({ data: { data: [] } });
    await waitFor(() => expect(button("Continue")).toBeEnabled());
    expect(
      screen.queryByText("Checking attendance availability..."),
    ).not.toBeInTheDocument();
  });

  it("keeps Continue blocked when a fresh request fails over cached availability", async () => {
    seedAvailability("m1");
    let rejectFresh!: (error: Error) => void;
    const fresh = new Promise((_, reject) => {
      rejectFresh = reject;
    });
    const baseGet = mockGet.getMockImplementation() as (
      url: string,
    ) => Promise<unknown>;
    mockGet.mockImplementation((url: string) =>
      url.includes("/availability") ? fresh : baseGet(url),
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);

    renderPage();
    await waitForRoster();
    fillDetails();
    expect(button("Continue")).toBeDisabled();
    rejectFresh(new Error("availability offline"));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Attendance availability could not be loaded",
    );
    expect(alert).toHaveTextContent("Try again before continuing.");
    expect(button("Continue")).toBeDisabled();

    // Try again re-checks availability for the same date.
    mockGet.mockImplementation(baseGet);
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(button("Continue")).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });

  it("defaults to Everyone and offers only option fields", async () => {
    renderPage();
    await waitForRoster();
    expect(expectedText()).toBe("Expected members: 8 of 8");
    expect(screen.getByText("Everyone is expected")).toBeInTheDocument();
    ["Part", "Gender", "Status", "Probationstatus"].forEach((label) =>
      expect(screen.getByLabelText(`${label} eligibility`)).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Name eligibility")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Profession eligibility"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear eligibility" }),
    ).not.toBeInTheDocument();
  });

  it("previews OR within a field and AND across fields, then clears back to Everyone", async () => {
    renderPage();
    await waitForRoster();

    await pickEligibility("Part", "Soprano");
    expect(expectedText()).toBe("Expected members: 2 of 8");
    await pickEligibility("Part", "Alto");
    expect(expectedText()).toBe("Expected members: 4 of 8");
    await pickEligibility("Status", "Active");
    expect(expectedText()).toBe("Expected members: 2 of 8");
    expect(
      screen.getByText("Part: Soprano, Alto · Status: Active"),
    ).toBeInTheDocument();

    fireEvent.click(button("Clear eligibility"));
    expect(expectedText()).toBe("Expected members: 8 of 8");
    expect(screen.getByText("Everyone is expected")).toBeInTheDocument();
  });

  it("disables Continue when no members match", async () => {
    renderPage();
    await waitForRoster();
    fillDetails();
    await pickEligibility("Part", "Bass");
    await pickEligibility("Gender", "Female");
    expect(expectedText()).toBe("Expected members: 0 of 8");
    expect(
      screen.getByText("No members match these eligibility rules."),
    ).toBeInTheDocument();
    expect(button("Continue")).toBeDisabled();
  });

  it("keeps raw eligibility counts when eligible members are unavailable", async () => {
    const baseGet = mockGet.getMockImplementation() as (
      url: string,
    ) => Promise<unknown>;
    mockGet.mockImplementation((url: string) =>
      url.includes("/availability")
        ? Promise.resolve({
            data: {
              data: [
                {
                  memberId: "m1",
                  startDate: "2026-10-01",
                  endDate: "2026-10-01",
                },
                {
                  memberId: "m2",
                  startDate: "2026-10-01",
                  endDate: "2026-10-01",
                },
              ],
            },
          })
        : baseGet(url),
    );
    renderPage();
    await waitForRoster();
    fillDetails();
    await pickEligibility("Part", "Soprano");
    expect(expectedText()).toBe("Expected members: 2 of 8");
    await screen.findByText("2 members are unavailable on this date.");
    expect(
      screen.getByText("Final expected roster: 0 members."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No members match these eligibility rules."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("No members are available for this attendance."),
    ).toBeInTheDocument();
    // Someone unavailable may still physically attend and be added manually.
    expect(
      screen.getByText(
        "You can still continue and add a member who physically attended.",
      ),
    ).toBeInTheDocument();
    expect(button("Continue")).toBeEnabled();
  });

  it("stores normalised rules with the unchanged details on Continue, without member ids", async () => {
    renderPage();
    await waitForRoster();
    await waitFor(() =>
      expect(categorySelect().options.length).toBeGreaterThan(1),
    );
    fillDetails();
    type(categorySelect(), "c1");
    await pickEligibility("Part", "Soprano");
    await pickEligibility("Status", "Active");

    await waitFor(() => expect(button("Continue")).toBeEnabled());
    await waitForContinue();
    fireEvent.click(button("Continue"));

    await screen.findByText("marking");
    expect(useGlobalStore.getState().currentAttendance).toEqual({
      name: "Rehearsal",
      date: "2026-10-01",
      categoryId: "c1",
      eligibilityRules: [
        { field: "part", values: ["soprano"] },
        { field: "status", values: ["active"] },
      ],
    });
  });

  it("resets organisation A's rules on switching to B and uses B's roster", async () => {
    renderPage();
    await waitForRoster();
    await pickEligibility("Part", "Soprano");
    expect(expectedText()).toBe("Expected members: 2 of 8");

    act(() => selectOrg("orgB", { eligibility: true }));

    await screen.findByText("Expected members: 3 of 3");
    expect(screen.getByText("Everyone is expected")).toBeInTheDocument();
  });

  it("explains when member fields fail to load and blocks applying templates", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    templatesByOrg.orgA = [template({})];
    const serve = mockGet.getMockImplementation()!;
    mockGet.mockImplementation((url: string) =>
      url.endsWith("/model")
        ? Promise.reject(new Error("offline"))
        : serve(url),
    );
    renderPage();
    expect(
      await screen.findByText(/Member fields could not be loaded/),
    ).toBeInTheDocument();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(templateSelect(), "t1");
    expect(button("Apply")).toBeDisabled();
    expect(nameInput().value).toBe("");
    expect(
      await screen.findByText(
        /can't be applied until categories and member fields load/,
      ),
    ).toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });

  describe("templates", () => {
    const sopranoTemplate = template({
      id: "t-sop",
      name: "Soprano Rehearsal",
      eligibilityRules: [{ field: "part", values: ["soprano"] }],
    });

    it("treats a template without rules as Everyone", async () => {
      const { eligibilityRules, ...legacy } = template({
        id: "t-old",
        name: "Legacy",
      });
      templatesByOrg.orgA = [legacy];
      renderPage();
      await waitForRoster();
      await screen.findByRole("option", { name: "Rehearsal" });
      await pickEligibility("Part", "Alto");
      type(templateSelect(), "t-old");
      expect(expectedText()).toBe("Expected members: 8 of 8");
    });

    it("applies rules and details but never the date", async () => {
      templatesByOrg.orgA = [sopranoTemplate];
      renderPage();
      await waitForRoster();
      await screen.findByRole("option", { name: "Rehearsal" });
      type(dateInput(), "2026-10-01");

      type(templateSelect(), "t-sop");

      expect(nameInput().value).toBe("Soprano Rehearsal");
      expect(expectedText()).toBe("Expected members: 2 of 8");
      expect(dateInput().value).toBe("Oct 1, 2026");
    });

    it("saves the current rules with the template", async () => {
      renderPage();
      await waitForRoster();
      type(nameInput(), "Soprano Rehearsal");
      await pickEligibility("Part", "Soprano");
      fireEvent.click(button("Save as template"));
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      expect(mockPost.mock.calls[0][1]).toEqual({
        name: "Soprano Rehearsal",
        categoryId: null,
        subCategoryId: null,
        eligibilityRules: [{ field: "part", values: ["soprano"] }],
      });
    });

    it("sends an explicit [] when updating a template to Everyone", async () => {
      templatesByOrg.orgA = [sopranoTemplate];
      renderPage();
      await waitForRoster();
      await screen.findByRole("option", { name: "Rehearsal" });
      type(templateSelect(), "t-sop");
      fireEvent.click(button("Clear eligibility"));
      fireEvent.click(button("Update template"));
      await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
      expect(mockPut.mock.calls[0][1]).toEqual({
        name: "Soprano Rehearsal",
        categoryId: "c1",
        subCategoryId: "s1",
        eligibilityRules: [],
      });
    });

    describe("with stale eligibility", () => {
      beforeEach(() => {
        templatesByOrg.orgA = [
          template({
            id: "t-mezzo",
            name: "Mezzo Sectional",
            eligibilityRules: [{ field: "part", values: ["mezzo"] }],
          }),
        ];
      });

      const selectStale = async () => {
        renderPage();
        await waitForRoster();
        await screen.findByRole("option", { name: "Rehearsal" });
        await screen.findByRole("option", {
          name: "Mezzo Sectional (Needs update)",
        });
        type(templateSelect(), "t-mezzo");
      };

      it("needs an update, explains why and cannot be applied", async () => {
        await selectStale();
        expect(screen.getByText("Needs update")).toBeInTheDocument();
        expect(
          screen.getByText(/Part: Mezzo is no longer an option\./),
        ).toBeInTheDocument();
        expect(button("Apply")).toBeDisabled();
        expect(nameInput().value).toBe("");
        expect(expectedText()).toBe("Expected members: 8 of 8");
      });

      it("can be repaired with the current rules", async () => {
        await selectStale();
        type(nameInput(), "Mezzo Sectional");
        await pickEligibility("Part", "Alto");
        fireEvent.click(button("Update template"));
        await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
        expect(mockPut.mock.calls[0][1].eligibilityRules).toEqual([
          { field: "part", values: ["alto"] },
        ]);
      });

      it("can be deleted", async () => {
        await selectStale();
        fireEvent.click(button("Delete template"));
        await confirmDialog();
        await waitFor(() =>
          expect(mockDelete.mock.calls[0][0]).toBe(
            "/attendance/orgA/templates/t-mezzo",
          ),
        );
      });

      it("explains when both category and eligibility are stale", async () => {
        templatesByOrg.orgA = [
          template({
            id: "t-mezzo",
            name: "Mezzo Sectional",
            categoryId: "archived",
            subCategoryId: null,
            eligibilityRules: [{ field: "part", values: ["mezzo"] }],
          }),
        ];
        await selectStale();
        expect(
          screen.getByText(
            /no longer exists\. Part: Mezzo is no longer an option\./,
          ),
        ).toBeInTheDocument();
      });
    });
  });
});

describe("<CreateAttendance> with relabelled member fields", () => {
  const RELABELLED = MEMBER_MODEL.map((field) =>
    field.name === "part"
      ? { ...field, _id: "f-part", label: "Voice Part" }
      : field,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.getState().clearCurrentAttendance();
    selectOrg("orgA", { eligibility: true });
    templatesByOrg = {
      orgA: [
        template({
          id: "t-sop",
          name: "Soprano Rehearsal",
          eligibilityRules: [{ field: "part", values: ["soprano"] }],
        }),
      ],
      orgB: [],
    };
    rosterByOrg = { orgA: ROSTER, orgB: [] };
    modelByOrg = { orgA: RELABELLED, orgB: MEMBER_MODEL };
    mockApi();
  });

  it("shows the label but keys rules, Continue and template saves by the storage key", async () => {
    renderPage();
    await waitForRoster();
    expect(screen.queryByLabelText("Part eligibility")).not.toBeInTheDocument();
    await pickEligibility("Voice Part", "Soprano");
    expect(screen.getByText("Voice Part: Soprano")).toBeInTheDocument();
    expect(expectedText()).toBe("Expected members: 2 of 8");

    type(nameInput(), "Sopranos only");
    fireEvent.click(button("Save as template"));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].eligibilityRules).toEqual([
      { field: "part", values: ["soprano"] },
    ]);

    type(dateInput(), "2026-10-01");
    await waitForContinue();
    fireEvent.click(button("Continue"));
    await screen.findByText("marking");
    expect(
      useGlobalStore.getState().currentAttendance.eligibilityRules,
    ).toEqual([{ field: "part", values: ["soprano"] }]);
  });

  it("names a genuinely stale rule by its current label", async () => {
    templatesByOrg.orgA = [
      template({
        id: "t-mezzo",
        name: "Mezzo Sectional",
        eligibilityRules: [{ field: "part", values: ["mezzo"] }],
      }),
    ];
    renderPage();
    await waitForRoster();
    await screen.findByRole("option", { name: "Rehearsal" });
    await screen.findByRole("option", {
      name: "Mezzo Sectional (Needs update)",
    });
    type(templateSelect(), "t-mezzo");
    expect(
      screen.getByText(/Voice Part: Mezzo is no longer an option\./),
    ).toBeInTheDocument();
    expect(button("Apply")).toBeDisabled();
  });

  it("does not mark a part-keyed template stale after a label-only rename", async () => {
    renderPage();
    await waitForRoster();
    await screen.findByRole("option", { name: "Rehearsal" });
    expect(
      await screen.findByRole("option", { name: "Soprano Rehearsal" }),
    ).toBeInTheDocument();
    type(templateSelect(), "t-sop");
    expect(screen.queryByText("Needs update")).not.toBeInTheDocument();
    expect(button("Apply")).toBeEnabled();
    expect(expectedText()).toBe("Expected members: 2 of 8");
  });
});

describe("<CreateAttendance> under custom organisation terminology", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.getState().clearCurrentAttendance();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "orgA",
        permissions: [],
        attendanceEligibilityEnabled: true,
        terminology: {
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
        },
      },
    });
    templatesByOrg = { orgA: [], orgB: [] };
    rosterByOrg = { orgA: ROSTER, orgB: [] };
    modelByOrg = { orgA: MEMBER_MODEL, orgB: MEMBER_MODEL };
    mockApi();
  });

  it("shows the organisation's words but stores category ids and storage-keyed rules", async () => {
    renderPage();
    await screen.findByText(/^Expected students: \d+ of/);
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Activity") as HTMLSelectElement).options.length,
      ).toBeGreaterThan(1),
    );
    type(nameInput(), "Rehearsal");
    type(dateInput(), "2026-10-01");
    type(screen.getByLabelText("Activity"), "c1");
    await pickEligibility("Part", "Soprano");

    await waitForContinue();
    fireEvent.click(button("Continue"));

    await screen.findByText("marking");
    expect(useGlobalStore.getState().currentAttendance).toEqual({
      name: "Rehearsal",
      date: "2026-10-01",
      categoryId: "c1",
      eligibilityRules: [{ field: "part", values: ["soprano"] }],
    });
    expect(mockGet).toHaveBeenCalledWith("/organisations/orgA/members");
  });
});

describe("<CreateAttendance> with attendance eligibility off", () => {
  const sopranoTemplate = template({
    id: "t-sop",
    name: "Soprano Rehearsal",
    eligibilityRules: [{ field: "part", values: ["soprano"] }],
  });
  const memberModelRequested = () =>
    mockGet.mock.calls.some(([url]) => url === "/organisations/orgA/model");

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.getState().clearCurrentAttendance();
    selectOrg("orgA");
    templatesByOrg = { orgA: [template({}), sopranoTemplate], orgB: [] };
    rosterByOrg = { orgA: ROSTER, orgB: [] };
    modelByOrg = { orgA: MEMBER_MODEL, orgB: MEMBER_MODEL };
    mockApi();
  });

  it("treats a cached organisation without the setting as off", async () => {
    const { attendanceEligibilityEnabled, ...legacy } =
      useGlobalStore.getState().organisation;
    useGlobalStore.setState({ organisation: legacy });
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    expect(screen.queryByText(/^Expected members:/)).not.toBeInTheDocument();
  });

  it("shows no eligibility editor or expected count and creates an Everyone session", async () => {
    templatesByOrg.orgA = [];
    renderPage();
    await screen.findByText(/No templates yet/);
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/organisations/orgA/members"),
    );

    expect(screen.queryByLabelText("Part eligibility")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Expected members:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Everyone/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /clear/i }),
    ).not.toBeInTheDocument();
    expect(memberModelRequested()).toBe(false);

    type(nameInput(), "Ad-hoc meeting");
    type(dateInput(), "2026-10-01");
    await waitForContinue();
    fireEvent.click(button("Continue"));

    expect(await screen.findByText("marking")).toBeInTheDocument();
    expect(useGlobalStore.getState().currentAttendance).toEqual({
      name: "Ad-hoc meeting",
      date: "2026-10-01",
      eligibilityRules: [],
    });
  });

  it("blocks Continue with an empty final roster", async () => {
    rosterByOrg.orgA = [];
    renderPage();
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/organisations/orgA/members"),
    );
    type(dateInput(), "2026-10-01");
    await waitFor(() => expect(button("Continue")).toBeDisabled());
    await waitFor(() =>
      expect(
        screen.queryByText("Checking attendance availability..."),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText("No members are available for this attendance."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/You can still continue/),
    ).not.toBeInTheDocument();
    expect(button("Continue")).toBeDisabled();
  });

  it("never shows the member-field load error", async () => {
    mockGet.mockImplementation((url: string) =>
      url.endsWith("/model")
        ? Promise.reject(new Error("boom"))
        : url.endsWith("/category")
        ? Promise.resolve({ data: { data: CATEGORIES } })
        : url.includes("/availability")
        ? Promise.resolve({ data: { data: [] } })
        : Promise.resolve({
            data: {
              data: url.endsWith("/templates") ? [template({})] : ROSTER,
            },
          }),
    );
    renderPage();
    await screen.findByRole("option", { name: "Rehearsal" });
    expect(
      screen.queryByText(/fields could not be loaded/),
    ).not.toBeInTheDocument();

    // Unrestricted templates do not depend on member fields while off.
    type(templateSelect(), "t1");
    expect(nameInput().value).toBe("Thursday Rehearsal");
    expect(button("Apply")).toBeEnabled();
  });

  it("applies a template without rules", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Rehearsal" });
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(templateSelect(), "t1");
    expect(nameInput().value).toBe("Thursday Rehearsal");
    expect(categorySelect().value).toBe("c1");
  });

  it("lists a restricted template as unavailable, fills nothing and never widens it", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Rehearsal" });
    expect(
      await screen.findByRole("option", {
        name: "Soprano Rehearsal (Requires eligibility)",
      }),
    ).toBeInTheDocument();

    type(templateSelect(), "t-sop");

    expect(nameInput().value).toBe("");
    expect(
      screen.getByText(
        /Uses attendance eligibility\. Enable eligibility in Organisation Settings to use this template\./,
      ),
    ).toBeInTheDocument();
    expect(button("Apply")).toBeDisabled();
    expect(button("Update template")).toBeDisabled();
    fireEvent.click(button("Update template"));
    expect(mockPut).not.toHaveBeenCalled();

    // Deleting stays allowed.
    expect(button("Delete template")).toBeEnabled();
    fireEvent.click(button("Delete template"));
    await confirmDialog();
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0][0]).toBe(
      "/attendance/orgA/templates/t-sop",
    );
  });

  it("treats a template with unreadable rules as restricted", async () => {
    templatesByOrg.orgA = [
      template({ id: "t-bad", name: "Odd", eligibilityRules: "nope" as never }),
    ];
    renderPage();
    expect(
      await screen.findByRole("option", { name: "Odd (Requires eligibility)" }),
    ).toBeInTheDocument();
  });

  it("saves new templates as Everyone", async () => {
    templatesByOrg.orgA = [];
    renderPage();
    await screen.findByText(/No templates yet/);
    type(nameInput(), "Friday Vigil");
    fireEvent.click(button("Save as template"));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1]).toEqual({
      name: "Friday Vigil",
      categoryId: null,
      subCategoryId: null,
      eligibilityRules: [],
    });
  });

  it("never carries rules into an Everyone session after the setting is switched off", async () => {
    selectOrg("orgA", { eligibility: true });
    renderPage();
    await waitForRoster();
    await pickEligibility("Part", "Soprano");

    act(() =>
      useGlobalStore.setState((state) => ({
        organisation: {
          ...state.organisation,
          attendanceEligibilityEnabled: false,
        },
      })),
    );

    expect(screen.queryByText(/^Expected members:/)).not.toBeInTheDocument();
    type(nameInput(), "Full rehearsal");
    type(dateInput(), "2026-10-03");
    await waitForContinue();
    fireEvent.click(button("Continue"));
    await screen.findByText("marking");
    expect(
      useGlobalStore.getState().currentAttendance.eligibilityRules,
    ).toEqual([]);
  });

  it("restores a restricted template when eligibility is switched back on, with its rules intact", async () => {
    selectOrg("orgA", { eligibility: true });
    const first = renderPage();
    await waitForRoster();
    await screen.findByRole("option", { name: "Rehearsal" });
    type(templateSelect(), "t-sop");
    expect(expectedText()).toBe("Expected members: 2 of 8");
    first.unmount();

    // Off: the editor is gone, the template is unavailable, Everyone still works.
    selectOrg("orgA");
    const off = renderPage();
    await screen.findByRole("option", {
      name: "Soprano Rehearsal (Requires eligibility)",
    });
    expect(screen.queryByLabelText("Part eligibility")).not.toBeInTheDocument();
    type(templateSelect(), "t-sop");
    expect(button("Apply")).toBeDisabled();
    type(nameInput(), "Everyone rehearsal");
    type(dateInput(), "2026-10-04");
    await waitForContinue();
    fireEvent.click(button("Continue"));
    await screen.findByText("marking");
    expect(
      useGlobalStore.getState().currentAttendance.eligibilityRules,
    ).toEqual([]);
    off.unmount();
    expect(mockPut).not.toHaveBeenCalled();
    // Continue started a resumable draft; step past it as if it had been
    // discarded, since this test is about the setting, not drafts.
    localStorage.clear();

    // On again: the same stored template applies its rules.
    selectOrg("orgA", { eligibility: true });
    renderPage();
    await waitForRoster();
    await screen.findByRole("option", { name: "Rehearsal" });
    expect(
      screen.getByRole("option", { name: "Soprano Rehearsal" }),
    ).toBeInTheDocument();
    type(templateSelect(), "t-sop");
    expect(nameInput().value).toBe("Soprano Rehearsal");
    expect(expectedText()).toBe("Expected members: 2 of 8");
  });

  it("does not bleed the setting between organisations", async () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "orgB",
        permissions: [],
        attendanceEligibilityEnabled: true,
      },
    });
    rosterByOrg.orgB = ROSTER;
    renderPage();
    await screen.findByText(/^Expected members: 8 of 8/);

    act(() => selectOrg("orgA"));
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    expect(screen.queryByText(/^Expected members:/)).not.toBeInTheDocument();

    act(() =>
      useGlobalStore.setState({
        organisation: {
          ...EMPTY_ORG,
          id: "orgB",
          permissions: [],
          attendanceEligibilityEnabled: true,
        },
      }),
    );
    expect(
      await screen.findByText(/^Expected members: 8 of 8/),
    ).toBeInTheDocument();
  });
});

describe("<CreateAttendance> unfinished attendance resume", () => {
  // Keys are asserted as literals on purpose: resume and discard across pages
  // must keep deriving exactly these (the roster pages build them too).
  const META_KEY = "attendance-new-draft-orgA";
  const IDENTITY = "2026-10-01-Sunday Mass";
  const ROSTER_KEY = `attendance-draft-orgA-${IDENTITY}`;
  const MANUAL_KEY = `attendance-manual-draft-orgA-${IDENTITY}`;
  const draftMeta = (over: Record<string, unknown> = {}) => ({
    version: 1,
    organisationId: "orgA",
    name: "Sunday Mass",
    date: "2026-10-01",
    categoryId: null,
    subCategoryId: null,
    eligibilityRules: [],
    ...over,
  });
  const seedDraft = (over: Record<string, unknown> = {}) => {
    localStorage.setItem(META_KEY, JSON.stringify(draftMeta(over)));
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify([{ id: "m1", name: "Ada", attendanceStatus: "late" }]),
    );
    localStorage.setItem(
      MANUAL_KEY,
      JSON.stringify([{ id: "m9", name: "Ife", attendanceStatus: "present" }]),
    );
  };
  const card = () => screen.queryByText("Unfinished attendance");

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.getState().clearCurrentAttendance();
    selectOrg("orgA");
    templatesByOrg = { orgA: [], orgB: [] };
    rosterByOrg = { orgA: ROSTER, orgB: ROSTER.slice(0, 3) };
    modelByOrg = { orgA: MEMBER_MODEL, orgB: MEMBER_MODEL };
    mockApi();
  });

  it("writes the draft metadata only after a valid Continue", async () => {
    renderPage();
    await screen.findByText(/No templates yet/);
    expect(localStorage.getItem(META_KEY)).toBeNull();

    type(nameInput(), "Ad-hoc meeting");
    type(dateInput(), "2026-10-01");
    // Typing alone never starts a draft.
    expect(localStorage.getItem(META_KEY)).toBeNull();

    await waitForContinue();
    fireEvent.click(button("Continue"));
    await screen.findByText("marking");

    // Continue also made the session the working state it navigates with.
    expect(useGlobalStore.getState().currentAttendance).toEqual({
      name: "Ad-hoc meeting",
      date: "2026-10-01",
      eligibilityRules: [],
    });
    expect(JSON.parse(localStorage.getItem(META_KEY) as string)).toEqual({
      version: 1,
      organisationId: "orgA",
      name: "Ad-hoc meeting",
      date: "2026-10-01",
      categoryId: null,
      subCategoryId: null,
      eligibilityRules: [],
    });
  });

  it("shows the unfinished draft instead of the create form", async () => {
    seedDraft();
    renderPage();

    expect(
      await screen.findByText("Unfinished attendance"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sunday Mass")).toBeInTheDocument();
    expect(screen.getByText("Thu 01 Oct 26")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You started marking this attendance but haven't submitted it yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue marking" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Discard and create new" }),
    ).toBeInTheDocument();
    // The normal form is not offered while the draft exists.
    expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue" }),
    ).not.toBeInTheDocument();
  });

  it("gives the resume card actions 44px tap targets", async () => {
    seedDraft();
    renderPage();
    await screen.findByText("Unfinished attendance");

    for (const name of ["Continue marking", "Discard and create new"]) {
      expect(
        generatedCss(screen.getByRole("button", { name })),
      ).toMatch(/min-height:\s*44px/);
    }
  });

  it("restores the draft into the working state and resumes marking without touching the saved roster", async () => {
    seedDraft();
    const rosterDraft = localStorage.getItem(ROSTER_KEY);

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Continue marking" }),
    );

    expect(await screen.findByText("marking")).toBeInTheDocument();
    expect(useGlobalStore.getState().currentAttendance).toEqual({
      name: "Sunday Mass",
      date: "2026-10-01",
      eligibilityRules: [],
    });
    // Mark Attendance reconciles these itself; Create Attendance must not
    // rebuild or discard the officer's saved marks.
    expect(localStorage.getItem(ROSTER_KEY)).toBe(rosterDraft);
    expect(localStorage.getItem(MANUAL_KEY)).not.toBeNull();
  });

  it("keeps the draft when Discard is cancelled", async () => {
    seedDraft();
    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Discard and create new" }),
    );

    const dialog = await confirmInDialog("Cancel");
    expect(dialog).toHaveTextContent("Discard unfinished attendance?");
    expect(dialog).toHaveTextContent("Sunday Mass");

    expect(card()).toBeInTheDocument();
    expect(localStorage.getItem(META_KEY)).not.toBeNull();
    expect(localStorage.getItem(ROSTER_KEY)).not.toBeNull();
  });

  it("removes the draft, both roster drafts and the working state on Discard", async () => {
    seedDraft();
    useGlobalStore.setState({
      currentAttendance: {
        name: "Sunday Mass",
        date: "2026-10-01",
        eligibilityRules: [],
      },
    });
    // Another organisation's unfinished draft must survive the discard.
    localStorage.setItem(
      "attendance-new-draft-orgB",
      JSON.stringify(draftMeta({ organisationId: "orgB", name: "B Vigil" })),
    );

    renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Discard and create new" }),
    );
    await confirmInDialog("Discard");

    // The form is revealed only once the discard has fully settled.
    expect(await screen.findByLabelText(/Name/)).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
    expect(localStorage.getItem(META_KEY)).toBeNull();
    expect(localStorage.getItem(ROSTER_KEY)).toBeNull();
    expect(localStorage.getItem(MANUAL_KEY)).toBeNull();
    expect(useGlobalStore.getState().currentAttendance).toEqual(
      EMPTY_CURRENT_ATTENDANCE,
    );
    expect(localStorage.getItem("attendance-new-draft-orgB")).not.toBeNull();
  });

  it("shows the draft only for its own organisation and keeps it through a switch", async () => {
    seedDraft();
    renderPage();
    expect(
      await screen.findByText("Unfinished attendance"),
    ).toBeInTheDocument();

    act(() => selectOrg("orgB"));
    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
    expect(screen.queryByText("Sunday Mass")).not.toBeInTheDocument();

    act(() => selectOrg("orgA"));
    expect(
      await screen.findByText("Unfinished attendance"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sunday Mass")).toBeInTheDocument();
    expect(localStorage.getItem(META_KEY)).not.toBeNull();
  });

  it("ignores a malformed metadata record", async () => {
    localStorage.setItem(META_KEY, "{ nope");
    renderPage();
    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });

  it("does not treat a persisted working attendance as a resumable draft", async () => {
    useGlobalStore.setState({
      currentAttendance: {
        name: "Old Mass",
        date: "2026-01-01",
        eligibilityRules: [],
      },
    });
    renderPage();
    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    expect(card()).not.toBeInTheDocument();
  });
});

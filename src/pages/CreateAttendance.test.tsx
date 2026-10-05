import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import theme from "styles/theme";
import { confirmAlert } from "react-confirm-alert";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import CreateAttendance from "pages/CreateAttendance";
import { PROTECTED_PATHS } from "routes/pagePath";
import { AttendanceTemplate } from "helpers/attendanceTemplates";
import { CategoryType } from "hooks/useCategories";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("react-confirm-alert", () => ({ confirmAlert: jest.fn() }));
// Keep the real endpoint constants; only the axios instance is faked.
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPost: jest.Mock = mockedAxios.post;
const mockPut: jest.Mock = mockedAxios.put;
const mockDelete: jest.Mock = mockedAxios.delete;
const mockConfirm = confirmAlert as jest.Mock;

const CATEGORIES: CategoryType[] = [
  {
    id: "c1",
    name: "Rehearsal",
    status: "active",
    subCategories: [{ id: "s1", name: "Choir", status: "active", parentCategoryId: "c1" }],
  },
  { id: "c2", name: "Service", status: "active", subCategories: [] },
];

const template = (over: Partial<AttendanceTemplate>): AttendanceTemplate => ({
  id: "t1",
  organisationId: "orgA",
  name: "Thursday Rehearsal",
  categoryId: "c1",
  subCategoryId: "s1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

let templatesByOrg: Record<string, AttendanceTemplate[]>;

const selectOrg = (id: string) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id, permissions: [] } });

const renderPage = () =>
  render(
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/create"]}>
          <Routes>
            <Route path="/create" element={<CreateAttendance />} />
            <Route path={PROTECTED_PATHS.MARK_ATTENANCE} element={<div>marking</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );

const nameInput = () => screen.getByLabelText(/Name/) as HTMLInputElement;
const dateInput = () => screen.getByLabelText(/Date/) as HTMLInputElement;
const categorySelect = () => screen.getByLabelText("Category") as HTMLSelectElement;
const subCategorySelect = () => screen.getByLabelText("Sub Category") as HTMLSelectElement;
const templateSelect = () => screen.getByLabelText("Template") as HTMLSelectElement;
const button = (name: string) => screen.getByRole("button", { name });

const type = (input: HTMLElement, value: string) =>
  fireEvent.change(input, { target: { value } });

const confirmDialog = () => {
  const options = mockConfirm.mock.calls[mockConfirm.mock.calls.length - 1][0];
  act(() => options.buttons[0].onClick());
};

describe("<CreateAttendance> session templates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    selectOrg("orgA");
    templatesByOrg = { orgA: [template({})], orgB: [] };
    mockGet.mockImplementation((url: string) => {
      const templates = url.match(/^\/attendance\/(\w+)\/templates$/);
      if (templates) {
        return Promise.resolve({ data: { data: templatesByOrg[templates[1]] ?? [] } });
      }
      if (url.endsWith("/category")) return Promise.resolve({ data: { data: CATEGORIES } });
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation((_url: string, body: object) =>
      Promise.resolve({ data: { data: template({ id: "t-new", ...body }) } })
    );
    mockPut.mockImplementation((url: string, body: object) =>
      Promise.resolve({ data: { data: template({ id: url.split("/").pop(), ...body }) } })
    );
    mockDelete.mockImplementation(() => Promise.resolve({ data: { data: "deleted" } }));
  });

  it("lists the current organisation's templates", async () => {
    renderPage();
    expect(await screen.findByRole("option", { name: "Thursday Rehearsal" })).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/attendance/orgA/templates");
  });

  it("keeps the normal create flow when there are no templates", async () => {
    templatesByOrg.orgA = [];
    renderPage();
    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    type(nameInput(), "Ad-hoc meeting");
    type(dateInput(), "2026-10-01");
    fireEvent.click(button("Continue"));
    expect(await screen.findByText("marking")).toBeInTheDocument();
    expect(useGlobalStore.getState().currentAttendance).toEqual({
      name: "Ad-hoc meeting",
      date: "2026-10-01",
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
    expect(dateInput().value).toBe("2026-10-01");
  });

  it("saves the current details as a new, selected template without date, status or member data", async () => {
    templatesByOrg.orgA = [];
    renderPage();
    await screen.findByText(/No templates yet/);
    await waitFor(() => expect(categorySelect().options.length).toBeGreaterThan(1));
    type(nameInput(), "Friday Vigil");
    type(categorySelect(), "c2");
    type(dateInput(), "2026-10-02");
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    templatesByOrg.orgA = [template({ id: "t-new", name: "Friday Vigil", categoryId: "c2", subCategoryId: null })];
    fireEvent.click(button("Save as template"));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost).toHaveBeenCalledWith("/attendance/orgA/templates", {
      name: "Friday Vigil",
      categoryId: "c2",
      subCategoryId: null,
    });
    await waitFor(() => expect(templateSelect().value).toBe("t-new"));
    expect(toast.success).toHaveBeenCalledWith('Saved "Friday Vigil" as a template');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.attendanceTemplates("orgA") });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.attendanceTemplates("orgB") });
    // Saving does not navigate or clear what was typed.
    expect(dateInput().value).toBe("2026-10-02");
    invalidate.mockRestore();
  });

  it("blocks an obvious duplicate name client-side", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(nameInput(), "thursday rehearsal");
    fireEvent.click(button("Save as template"));
    expect(toast.error).toHaveBeenCalledWith('A template named "thursday rehearsal" already exists');
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("requires a name before saving a template", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    fireEvent.click(button("Save as template"));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Enter an attendance name/));
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

    fireEvent.click(button("Update template"));

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut).toHaveBeenCalledWith("/attendance/orgA/templates/t1", {
      name: "Thursday Practice",
      categoryId: "c2",
      subCategoryId: null,
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
    confirmDialog();

    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
    expect(mockDelete.mock.calls[0][0]).toBe("/attendance/orgA/templates/t1");
    await screen.findByText(/No templates yet/);
    expect(nameInput().value).toBe("Thursday Rehearsal");
    expect(categorySelect().value).toBe("c1");
    expect(subCategorySelect().value).toBe("s1");
    expect(dateInput().value).toBe("2026-10-01");
  });

  it("resets the selected template and details on organisation switch and never shows A's templates in B", async () => {
    renderPage();
    await screen.findByRole("option", { name: "Rehearsal" });
    await screen.findByRole("option", { name: "Thursday Rehearsal" });
    type(templateSelect(), "t1");
    expect(nameInput().value).toBe("Thursday Rehearsal");

    act(() => selectOrg("orgB"));

    expect(await screen.findByText(/No templates yet/)).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Thursday Rehearsal" })).not.toBeInTheDocument();
    expect(nameInput().value).toBe("");
    expect(screen.queryByRole("button", { name: "Update template" })).not.toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/attendance/orgB/templates");
  });

  describe("stale templates", () => {
    beforeEach(() => {
      templatesByOrg.orgA = [template({ id: "t-stale", name: "Old Vigil", categoryId: "archived", subCategoryId: null })];
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
      expect(mockPut).toHaveBeenCalledWith("/attendance/orgA/templates/t-stale", {
        name: "Old Vigil",
        categoryId: "c2",
        subCategoryId: null,
      });
    });

    it("can be deleted", async () => {
      await selectStale();
      fireEvent.click(button("Delete template"));
      confirmDialog();
      await waitFor(() =>
        expect(mockDelete.mock.calls[0][0]).toBe("/attendance/orgA/templates/t-stale")
      );
    });
  });
});

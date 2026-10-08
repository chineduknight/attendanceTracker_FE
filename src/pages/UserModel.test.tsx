import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { system } from "styles/theme";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import UserModel from "pages/UserModel";
import { PROTECTED_PATHS } from "routes/pagePath";
import { MemberModelField } from "helpers/memberFields";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPost: jest.Mock = mockedAxios.post;

const ORG_A: MemberModelField[] = [
  { _id: "a-name", name: "name", label: "Name", type: "text", required: true },
  // An older backend response: no label.
  { _id: "a-part", name: "part", type: "option", options: ["Soprano", "Alto"], required: true },
];
const ORG_B: MemberModelField[] = [
  { _id: "b-name", name: "name", label: "Name", type: "text", required: true },
  { _id: "b-part", name: "part", label: "Section", type: "option", options: ["Strings"], required: false },
];
const models: Record<string, MemberModelField[]> = { orgA: ORG_A, orgB: ORG_B };

const selectOrg = (id: string) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id, permissions: [] } });

const renderPage = () =>
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/user-model"]}>
          <Routes>
            <Route path="/user-model" element={<UserModel />} />
            <Route path={PROTECTED_PATHS.ADD_MEMBER} element={<div>add member page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );

const card = (title: string) =>
  screen.getAllByText(title, { selector: "p" })[0].closest(".chakra-stack") as HTMLElement;
const labelInput = (scope: HTMLElement) => within(scope).getByLabelText(/Display label/) as HTMLInputElement;
const keyInput = (scope: HTMLElement) => within(scope).getByLabelText(/Internal field key/) as HTMLInputElement;
const posted = () => mockPost.mock.calls[0][1].fields;

describe("<UserModel>", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    selectOrg("orgA");
    mockGet.mockImplementation((url: string) => {
      const org = url.split("/")[2];
      return Promise.resolve({ data: { data: { fields: models[org] ?? [] } } });
    });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: "ok" } }));
  });

  it("locks a saved field's key and type, blocks removal and shows a fallback label", async () => {
    renderPage();
    const part = await waitFor(() => card("Part"));
    expect(labelInput(part).value).toBe("Part");
    expect(keyInput(part)).toHaveAttribute("readonly");
    expect(within(part).getByLabelText("Field type")).toBeDisabled();
    expect(within(part).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(part).getByText("Saved fields can't be removed yet")).toBeInTheDocument();
    expect(within(part).getByText(/cannot be renamed after saving/)).toBeInTheDocument();
    // Controlled checkbox reflects the persisted `required: true`.
    expect(within(part).getByRole("checkbox", { name: "Required" })).toBeChecked();
  });

  it("sends existing _ids unchanged and only the label changes on a cosmetic rename", async () => {
    renderPage();
    const part = await waitFor(() => card("Part"));
    fireEvent.change(labelInput(part), { target: { value: "Voice Part" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe("/organisations/orgA/model");
    expect(posted()).toEqual([
      { _id: "a-name", name: "name", label: "Name", type: "text", required: true },
      { _id: "a-part", name: "part", label: "Voice Part", type: "option", required: true, options: ["Soprano", "Alto"] },
    ]);
    await screen.findByText("add member page");
  });

  it("adds a new field with a client-only draft id and no fabricated _id", async () => {
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const draft = card("New field");
    expect(within(draft).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    fireEvent.change(labelInput(draft), { target: { value: "Voice Range" } });
    expect(keyInput(draft).value).toBe("voice_range");
    fireEvent.change(within(draft).getByLabelText("Field type"), { target: { value: "option" } });
    fireEvent.change(within(draft).getByLabelText(/Options/), { target: { value: "High, Low" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const added = posted()[2];
    expect(added).toEqual({ name: "voice_range", label: "Voice Range", type: "option", required: false, options: ["High", "Low"] });
    expect(JSON.stringify(posted())).not.toMatch(/draft|field-\d/);
  });

  it("flags a duplicate new key locally without posting", async () => {
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const draft = card("New field");
    fireEvent.change(labelInput(draft), { target: { value: "Part" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findAllByText(/Another field already uses the key "part"/)).not.toHaveLength(0);
    expect(mockPost).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Fix the highlighted fields before saving.");
  });

  it("shows a backend 422 and stays on the page", async () => {
    mockPost.mockImplementation(() =>
      Promise.reject({ response: { status: 422, data: { error: 'Field "part" cannot change type.' } } }),
    );
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByText('Field "part" cannot change type.')).toBeInTheDocument();
    expect(screen.queryByText("add member page")).not.toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });

  it("invalidates only this organisation's model and members after saving", async () => {
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await screen.findByText("add member page");
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: queryKeys.memberModel("orgA") });
    expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: queryKeys.members("orgA") });
    invalidate.mockRestore();
  });

  it("starts a brand-new model with a pinned name field and posts it without an id", async () => {
    models.orgC = [];
    selectOrg("orgC");
    renderPage();
    const name = await waitFor(() => card("Name"));
    expect(keyInput(name)).toHaveAttribute("readonly");
    expect(within(name).getByRole("checkbox", { name: "Required" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(posted()).toEqual([{ name: "name", label: "Name", type: "text", required: true }]);
  });

  it("shows each organisation's own fields and drops unsaved drafts on switching", async () => {
    renderPage();
    const part = await waitFor(() => card("Part"));
    fireEvent.change(labelInput(part), { target: { value: "Unsaved A label" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));

    act(() => selectOrg("orgB"));

    const section = await waitFor(() => card("Section"));
    expect(keyInput(section).value).toBe("part");
    expect(screen.queryByText("New field")).not.toBeInTheDocument();
    expect(screen.queryAllByText("New", { selector: "span" })).toHaveLength(0);
    expect(screen.queryByDisplayValue("Unsaved A label")).not.toBeInTheDocument();

    act(() => selectOrg("orgA"));
    const partAgain = await waitFor(() => card("Part"));
    expect(labelInput(partAgain).value).toBe("Part");
  });

  it("round-trips a new field: after save and reload it carries the backend _id", async () => {
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(labelInput(card("New field")), { target: { value: "Shift" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(posted()[2]).not.toHaveProperty("_id");
    await screen.findByText("add member page");

    // The backend minted an id; the next visit loads and re-sends it.
    models.orgA = [...ORG_A, { _id: "a-shift", name: "shift", label: "Shift", type: "text", required: false }];
    cleanup();
    queryClient.clear();
    mockPost.mockClear();
    renderPage();
    const shift = await waitFor(() => card("Shift"));
    expect(keyInput(shift)).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(posted()[2]).toEqual({ _id: "a-shift", name: "shift", label: "Shift", type: "text", required: false });
    models.orgA = ORG_A;
  });

  it("keeps a legacy field without _id locked and posts it by name only", async () => {
    models.orgL = [
      { _id: "l-name", name: "name", type: "text", required: true },
      { name: "part", type: "text", required: false },
    ];
    selectOrg("orgL");
    renderPage();
    const part = await waitFor(() => card("Part"));
    expect(keyInput(part)).toHaveAttribute("readonly");
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(posted()[1]).toEqual({ name: "part", label: "Part", type: "text", required: false });
  });

  it("keeps unsaved edits when a background refetch of the model fails", async () => {
    renderPage();
    const part = await waitFor(() => card("Part"));
    fireEvent.change(labelInput(part), { target: { value: "Voice Part" } });
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockGet.mockImplementation(() => Promise.reject(new Error("offline")));

    await act(() => queryClient.refetchQueries({ queryKey: queryKeys.memberModel("orgA") }));

    expect(screen.queryByText(/could not be loaded/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Voice Part")).toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });

  it("keeps a legacy select field's id, key, type and options when only its label changes", async () => {
    const select = { _id: "s-part", name: "part", label: "Part", type: "select", options: ["Soprano", "Alto"], required: false };
    models.orgS = [{ _id: "s-name", name: "name", label: "Name", type: "text", required: true }, select];
    selectOrg("orgS");
    renderPage();
    const part = await waitFor(() => card("Part"));
    fireEvent.change(labelInput(part), { target: { value: "Voice Part" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(posted()[1]).toEqual({ ...select, label: "Voice Part" });
  });

  it.each([
    [undefined, "Member Model updated successfully", "The member model could not be saved. Please try again."],
    ["Student", "Student Model updated successfully", "The student model could not be saved. Please try again."],
  ])("names the model in its save messages with the member term (%s)", async (memberSingular, success, failure) => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "orgA",
        permissions: [],
        ...(memberSingular && {
          terminology: { ...DEFAULT_TERMINOLOGY, memberSingular, memberPlural: `${memberSingular}s` },
        }),
      },
    });
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(success));

    cleanup();
    queryClient.clear();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockPost.mockImplementation(() => Promise.reject({ response: { status: 500, data: {} } }));
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByText(failure)).toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });
});


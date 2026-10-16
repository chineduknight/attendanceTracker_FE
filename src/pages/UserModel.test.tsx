import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { system } from "styles/theme";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import UserModel from "pages/UserModel";
import { PROTECTED_PATHS } from "routes/pagePath";
import { MemberModelField } from "helpers/memberFields";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";
import { generatedCss, toggle, chooseOption, confirmInDialog } from "test-utils/render";
import userEvent from "@testing-library/user-event";
import {
  ELSEWHERE,
  LeaveLink,
  askToLogOut,
  browserWouldAsk,
  deferred,
  expectEveryControlLocked,
  expectNothingLockedFor,
  leave,
  openAt,
} from "test-utils/leaveGuard";

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

  it("offers a retry when the model fails to load", async () => {
    mockGet.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: { error: "Model service down" } } }),
    );
    renderPage();
    expect(await screen.findByText("Couldn't load the member model")).toBeInTheDocument();
    expect(screen.getByText("Model service down")).toBeInTheDocument();

    mockGet.mockImplementation(() => Promise.resolve({ data: { data: { fields: ORG_A } } }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByLabelText(/Display label/)).toHaveLength(2);
  });

  it("gives an unsaved field's Remove a 44px tap target", async () => {
    renderPage();
    await screen.findAllByLabelText(/Display label/);
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(generatedCss(screen.getByRole("button", { name: "Remove" }))).toMatch(
      /min-height:\s*44px/,
    );
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

  it("toggles Required on an editable field and saves the new value", async () => {
    selectOrg("orgB");
    renderPage();
    const section = await waitFor(() => card("Section"));
    const required = within(section).getByRole("checkbox", { name: "Required" });
    expect(required).not.toBeChecked();

    await toggle(required);
    expect(required).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Update" }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][0]).toBe("/organisations/orgB/model");
    expect(posted()[1]).toEqual({
      _id: "b-part", name: "part", label: "Section", type: "option", required: true, options: ["Strings"],
    });
  });

  it("adds a new field with a client-only draft id and no fabricated _id", async () => {
    renderPage();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const draft = card("New field");
    expect(within(draft).getByRole("button", { name: "Remove" })).toBeInTheDocument();
    fireEvent.change(labelInput(draft), { target: { value: "Voice Range" } });
    expect(keyInput(draft).value).toBe("voice_range");
    await chooseOption(within(draft).getByLabelText("Field type"), "option");
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

describe("<UserModel> leaving with unsaved changes", () => {
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

  // Opened from another screen, so Cancel (Back) has somewhere to go.
  const routes = (
    <Routes>
      <Route
        path="/user-model"
        element={
          <>
            <LeaveLink />
            <UserModel />
          </>
        }
      />
      <Route path={ELSEWHERE} element={<div>elsewhere</div>} />
      <Route path={PROTECTED_PATHS.ADD_MEMBER} element={<div>add member page</div>} />
    </Routes>
  );
  const renderWithExit = () =>
    render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[ELSEWHERE, "/user-model"]} initialIndex={1}>
            {routes}
          </MemoryRouter>
        </QueryClientProvider>
      </ChakraProvider>,
    );
  const cancel = () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const leftWithoutAsking = async () => {
    expect(await screen.findByText("elsewhere")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  };

  it("leaves from Cancel and logs out without asking while untouched", async () => {
    renderWithExit();
    await waitFor(() => card("Part"));
    await expect(askToLogOut()).resolves.toBe(true);
    cancel();
    await leftWithoutAsking();
  });

  it("does not count a brand-new model's pinned name field as a change", async () => {
    models.orgC = [];
    selectOrg("orgC");
    renderWithExit();
    await waitFor(() => card("Name"));
    leave();
    await leftWithoutAsking();
  });

  it("asks on Cancel after a relabel, keeps it on Keep editing, then discards", async () => {
    renderWithExit();
    fireEvent.change(labelInput(await waitFor(() => card("Part"))), {
      target: { value: "Voice Part" },
    });
    cancel();
    const dialog = await confirmInDialog("Keep editing");
    expect(dialog).toHaveTextContent(
      "Your changes to the member model haven't been saved. Leave without saving them?",
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByDisplayValue("Voice Part")).toBeInTheDocument();

    cancel();
    await confirmInDialog("Discard changes");
    expect(await screen.findByText("elsewhere")).toBeInTheDocument();
  });

  it("keeps a new field's label, key, type and options on Keep editing", async () => {
    renderWithExit();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    const draft = card("New field");
    fireEvent.change(labelInput(draft), { target: { value: "Voice Range" } });
    fireEvent.change(keyInput(draft), { target: { value: "range" } });
    await chooseOption(within(draft).getByLabelText("Field type"), "option");
    fireEvent.change(within(draft).getByLabelText(/Options/), { target: { value: "High, Low" } });

    leave();
    await confirmInDialog("Keep editing");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const kept = card("Voice Range");
    expect(labelInput(kept).value).toBe("Voice Range");
    expect(keyInput(kept).value).toBe("range");
    expect(within(kept).getByLabelText(/Options/)).toHaveValue("High, Low");
  });

  it.each([
    ["adding a field", async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    }],
    ["a saved field's options", async () => {
      fireEvent.change(within(card("Part")).getByLabelText(/Options/), {
        target: { value: "Soprano, Alto, Tenor" },
      });
    }],
    ["Required", async () => {
      await toggle(within(card("Part")).getByRole("checkbox", { name: "Required" }));
    }],
  ])("counts %s as a change", async (_what, change) => {
    renderWithExit();
    await waitFor(() => card("Part"));
    await change();
    leave();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Discard your changes?");
  });

  it("is clean again after adding a field and removing it, or restoring a label", async () => {
    renderWithExit();
    const part = await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(labelInput(card("New field")), { target: { value: "Shift" } });
    fireEvent.click(within(card("Shift")).getByRole("button", { name: "Remove" }));
    fireEvent.change(labelInput(part), { target: { value: "Voice Part" } });
    fireEvent.change(labelInput(part), { target: { value: "Part" } });
    leave();
    await leftWithoutAsking();
  });

  it("asks before Logout; Keep editing keeps the edit", async () => {
    renderWithExit();
    fireEvent.change(labelInput(await waitFor(() => card("Part"))), {
      target: { value: "Voice Part" },
    });
    let answer = askToLogOut();
    const dialog = await confirmInDialog("Keep editing");
    expect(dialog).toHaveTextContent("Log out without saving them?");
    await expect(answer).resolves.toBe(false);
    expect(screen.getByDisplayValue("Voice Part")).toBeInTheDocument();

    answer = askToLogOut();
    await confirmInDialog("Discard and log out");
    await expect(answer).resolves.toBe(true);
  });

  it("protects reloading the tab only while there are changes", async () => {
    openAt("/user-model");
    render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>{routes}</BrowserRouter>
        </QueryClientProvider>
      </ChakraProvider>,
    );
    const part = await waitFor(() => card("Part"));
    expect(browserWouldAsk()).toBe(false);
    fireEvent.change(labelInput(part), { target: { value: "Voice Part" } });
    expect(browserWouldAsk()).toBe(true);
    fireEvent.change(labelInput(part), { target: { value: "Part" } });
    expect(browserWouldAsk()).toBe(false);
  });

  it("moves on to Add Member after a successful save without asking", async () => {
    renderWithExit();
    fireEvent.change(labelInput(await waitFor(() => card("Part"))), {
      target: { value: "Voice Part" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByText("add member page")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it.each([
    ["the backend rejects it", "Shift", () =>
      mockPost.mockImplementation(() =>
        Promise.reject({ response: { status: 422, data: { error: "No" } } }),
      )],
    // A new field without a label fails local validation and never posts.
    ["local validation blocks it", "", () => undefined],
  ])("keeps asking when Save fails because %s", async (_why, label, arrange) => {
    arrange();
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    renderWithExit();
    await waitFor(() => card("Part"));
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    fireEvent.change(labelInput(card("New field")), { target: { value: label } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    leave();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Discard your changes?");
    (console.error as jest.Mock).mockRestore();
  });

  describe("while Save is in flight", () => {
    // A relabel and a new option field, so saved and unsaved cards (label,
    // key, type, options, Required, Remove) are all on screen.
    const startSave = async () => {
      const post = deferred();
      mockPost.mockImplementation(() => post.promise);
      renderWithExit();
      fireEvent.change(labelInput(await waitFor(() => card("Part"))), {
        target: { value: "Voice Part" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Add field" }));
      const draft = card("New field");
      fireEvent.change(labelInput(draft), { target: { value: "Range" } });
      await chooseOption(within(draft).getByLabelText("Field type"), "option");
      fireEvent.change(within(draft).getByLabelText(/Options/), { target: { value: "High, Low" } });
      fireEvent.click(screen.getByRole("button", { name: "Update" }));
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      return post;
    };

    it("locks every field, Add field, Remove and Cancel, so no edit can be lost", async () => {
      await startSave();
      await waitFor(() => expect(labelInput(card("Voice Part"))).toHaveAttribute("readonly"));
      expect(expectEveryControlLocked()).toBeGreaterThan(10);

      userEvent.type(labelInput(card("Voice Part")), "s");
      expect(labelInput(card("Voice Part")).value).toBe("Voice Part");
      fireEvent.click(screen.getByRole("button", { name: "Add field" }));
      expect(screen.queryByText("New field")).not.toBeInTheDocument();
    });

    it("moves on to Add Member after success without asking", async () => {
      const post = await startSave();
      await act(async () => post.resolve({ data: { data: "ok" } }));
      expect(await screen.findByText("add member page")).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("unlocks after a failure with every edit intact, and still asks", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const post = await startSave();
      await act(async () =>
        post.reject({ response: { status: 422, data: { error: "No" } } }),
      );
      const range = await waitFor(() => card("Range"));
      expectNothingLockedFor(labelInput(range), labelInput(card("Voice Part")));
      expect(within(range).getByLabelText(/Options/)).toHaveValue("High, Low");
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(await screen.findByRole("alertdialog")).toHaveTextContent("Discard your changes?");
      (console.error as jest.Mock).mockRestore();
    });
  });

  it("keeps asking, with the edit intact, after a background refetch", async () => {
    renderWithExit();
    fireEvent.change(labelInput(await waitFor(() => card("Part"))), {
      target: { value: "Voice Part" },
    });
    models.orgA = [...ORG_A, { _id: "a-new", name: "new", label: "Added elsewhere", type: "text", required: false }];
    await act(() => queryClient.refetchQueries({ queryKey: queryKeys.memberModel("orgA") }));
    models.orgA = ORG_A;
    expect(screen.getByDisplayValue("Voice Part")).toBeInTheDocument();
    leave();
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("drops organisation A's unsaved changes when switching to B", async () => {
    renderWithExit();
    fireEvent.change(labelInput(await waitFor(() => card("Part"))), {
      target: { value: "Unsaved A label" },
    });
    act(() => selectOrg("orgB"));
    await waitFor(() => card("Section"));
    leave();
    await leftWithoutAsking();
  });

  it("names the model with the organisation's member term", async () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "orgA",
        permissions: [],
        terminology: { ...DEFAULT_TERMINOLOGY, memberSingular: "Student", memberPlural: "Students" },
      },
    });
    renderWithExit();
    fireEvent.change(labelInput(await waitFor(() => card("Part"))), {
      target: { value: "Voice Part" },
    });
    leave();
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Your changes to the student model haven't been saved.",
    );
  });
});

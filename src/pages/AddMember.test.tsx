import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "react-toastify";
import { system } from "styles/theme";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import AddMember from "pages/AddMember";
import { PROTECTED_PATHS } from "routes/pagePath";
import { queryKeys } from "services/api/queryKeys";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";
import { toggle, confirmInDialog, shownValue, chooseOption } from "test-utils/render";
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
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPost: jest.Mock = mockedAxios.post;

// `part` was relabelled to "Voice Part"; its key and options are unchanged.
const MODEL = {
  fields: [
    { _id: "f-name", name: "name", label: "Full Name", type: "text", required: true },
    { _id: "f-part", name: "part", label: "Voice Part", type: "option", options: ["Soprano", "Alto"], required: false },
  ],
};
const ADA = { id: "m1", name: "Ada", part: "Alto" };

const renderAt = (path: string) =>
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={PROTECTED_PATHS.ADD_MEMBER} element={<AddMember />} />
            <Route path={PROTECTED_PATHS.UPDATE_MEMBER} element={<AddMember />} />
            <Route path={PROTECTED_PATHS.VIEW_MEMBER} element={<div>members list</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );

const confirmSubmit = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^(Submit|Update)$/ }));
  await confirmInDialog(/^(Submit|Update)$/);
  await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
  return mockPost.mock.calls[0];
};

describe("<AddMember> with display labels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", permissions: [] } });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? MODEL : ADA } }),
    );
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("shows labels but submits values under the storage keys only", async () => {
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    expect(await screen.findByLabelText(/Full Name/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Bola" } });
    fireEvent.change(screen.getByLabelText("Voice Part"), { target: { value: "Soprano" } });

    const [url, body] = await confirmSubmit();

    expect(url).toBe("/organisations/org1/members");
    expect(body).toEqual({ name: "Bola", part: "Soprano" });
  });

  it("prefills an existing member's saved value after a label-only rename", async () => {
    renderAt("/member/update/m1");
    const part = await screen.findByLabelText("Voice Part");
    await waitFor(() => expect(shownValue(part)).toBe("Alto"));

    const [, body] = await confirmSubmit();

    expect(body).toMatchObject({ name: "Ada", part: "Alto", memberId: "m1" });
    expect(body).not.toHaveProperty("label");
    expect(body).not.toHaveProperty("_id");
    expect(body).not.toHaveProperty("Voice Part");
  });
});

// Student / Students / Session / Sessions / Coordinator / Coordinators
const SCHOOL_TERMS = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  attendanceSingular: "Session",
  attendancePlural: "Sessions",
  officerSingular: "Coordinator",
  officerPlural: "Coordinators",
};

describe("<AddMember> with custom terminology", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        isOwner: true,
        terminology: SCHOOL_TERMS,
      },
    });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? MODEL : ADA } }),
    );
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("uses the member term in add success copy", async () => {
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    await screen.findByLabelText(/Full Name/);
    fireEvent.change(screen.getByLabelText(/Full Name/), {
      target: { value: "Bola" },
    });

    await confirmSubmit();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Student added successfully"));
  });

  it("uses the member term in update success copy", async () => {
    renderAt("/member/update/m1");
    await screen.findByLabelText("Voice Part");
    await waitFor(() =>
      expect(shownValue(screen.getByLabelText("Voice Part"))).toBe("Alto"),
    );

    await confirmSubmit();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Student updated successfully"));
  });

  it("uses the member term in the delete confirm and success copy", async () => {
    renderAt("/member/update/m1");
    await screen.findByLabelText("Voice Part");
    fireEvent.click(screen.getByRole("button", { name: /Delete Student/ }));
    const dialog = await confirmInDialog("Delete");
    expect(within(dialog).getByText("Delete Student")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("delete this student?");

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Student deleted successfully"),
    );
  });
});

describe("<AddMember> member-model copy", () => {
  const STUDENT = { ...DEFAULT_TERMINOLOGY, memberSingular: "Student", memberPlural: "Students" };
  const owner = (terminology = DEFAULT_TERMINOLOGY) =>
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", isOwner: true, permissions: [], terminology },
    });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it.each([
    [DEFAULT_TERMINOLOGY, "Update Member Model"],
    [STUDENT, "Update Student Model"],
  ])("labels the update button with the member term", async (terminology, label) => {
    owner(terminology);
    mockGet.mockImplementation(() => Promise.resolve({ data: { data: MODEL } }));
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
  });

  it.each([
    [DEFAULT_TERMINOLOGY, "You don't have a member model yet", "Create Member Model"],
    [STUDENT, "You don't have a student model yet", "Create Student Model"],
  ])("explains a missing model in the member term", async (terminology, heading, button) => {
    owner(terminology);
    mockGet.mockImplementation(() => Promise.resolve({ data: { data: { fields: [] } } }));
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    expect(await screen.findByText(heading)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  });
});


// A checkbox member field: v3's checkbox is controlled through react-hook-form,
// so the async reset(currentMember) on update must reach the visible box.
describe("<AddMember> checkbox fields", () => {
  const CHECKBOX_MODEL = {
    fields: [
      { _id: "f-name", name: "name", label: "Full Name", type: "text", required: true },
      { _id: "f-bap", name: "baptised", label: "Baptised", type: "checkbox", required: false },
    ],
  };
  const withMember = (member: Record<string, unknown>) =>
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? CHECKBOX_MODEL : member } }),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", permissions: [] } });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("create: starts unticked, toggles on and submits true", async () => {
    withMember({});
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    const box = await screen.findByRole("checkbox", { name: "Baptised" });
    expect(box).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Bola" } });

    await toggle(box);
    expect(box).toBeChecked();

    const [, body] = await confirmSubmit();
    expect(body).toEqual({ name: "Bola", baptised: true });
  });

  it("create: an untouched box submits a real false", async () => {
    withMember({});
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    await screen.findByRole("checkbox", { name: "Baptised" });
    fireEvent.change(screen.getByLabelText(/Full Name/), { target: { value: "Bola" } });

    const [, body] = await confirmSubmit();
    expect(body).toEqual({ name: "Bola", baptised: false });
  });

  it("update: a stored true renders checked after the member loads", async () => {
    withMember({ id: "m1", name: "Ada", baptised: true });
    renderAt("/member/update/m1");
    const box = await screen.findByRole("checkbox", { name: "Baptised" });
    await waitFor(() => expect(box).toBeChecked());
  });

  it("update: a stored false stays unchecked", async () => {
    withMember({ id: "m1", name: "Ada", baptised: false });
    renderAt("/member/update/m1");
    const name = (await screen.findByLabelText(/Full Name/)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe("Ada"));
    expect(screen.getByRole("checkbox", { name: "Baptised" })).not.toBeChecked();
  });

  it("update: true -> false submits false", async () => {
    withMember({ id: "m1", name: "Ada", baptised: true });
    renderAt("/member/update/m1");
    const box = await screen.findByRole("checkbox", { name: "Baptised" });
    await waitFor(() => expect(box).toBeChecked());

    await toggle(box);
    expect(box).not.toBeChecked();

    const [, body] = await confirmSubmit();
    expect(body).toMatchObject({ name: "Ada", baptised: false, memberId: "m1" });
  });

  it("update: false -> true submits true", async () => {
    withMember({ id: "m1", name: "Ada", baptised: false });
    renderAt("/member/update/m1");
    const name = (await screen.findByLabelText(/Full Name/)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe("Ada"));
    const box = screen.getByRole("checkbox", { name: "Baptised" });

    await toggle(box);

    const [, body] = await confirmSubmit();
    expect(body).toMatchObject({ name: "Ada", baptised: true, memberId: "m1" });
  });
});

describe("<AddMember> loading, dates and errors", () => {
  const DATED_MODEL = {
    fields: [
      ...MODEL.fields,
      { _id: "f-dob", name: "dob", label: "Date of Birth", type: "date", required: false },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", permissions: [] } });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("keeps the form and unsaved edits on screen while the model refetches", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? MODEL : ADA } }),
    );
    renderAt("/member/update/m1");
    const name = (await screen.findByLabelText(/Full Name/)) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe("Ada"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    fireEvent.change(name, { target: { value: "Ada Lovelace" } });

    // e.g. the officer switched apps and came back; hold the response open.
    const pending: Array<() => void> = [];
    mockGet.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          pending.push(() => resolve({ data: { data: url.endsWith("/model") ? MODEL : ADA } }));
        }),
    );
    const refetching = queryClient.refetchQueries();
    await waitFor(() => expect(queryClient.isFetching()).toBeGreaterThan(0));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    // The same input stays mounted: no loader swap, keyboard and scroll kept.
    expect(screen.getByLabelText(/Full Name/)).toBe(name);
    expect(name).toHaveValue("Ada Lovelace");
    pending.forEach((respond) => respond());
    await refetching;
    expect(screen.getByLabelText(/Full Name/)).toHaveValue("Ada Lovelace");
  });

  it("seeds from the fresh member response, not a stale cached copy", async () => {
    queryClient.setQueryData(queryKeys.memberModel("org1"), { data: MODEL });
    queryClient.setQueryData(queryKeys.member("org1", "m1"), {
      data: { id: "m1", name: "Old Ada", part: "Alto" },
    });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url.endsWith("/model") ? MODEL : { id: "m1", name: "Fresh Ada", part: "Soprano" },
        },
      }),
    );
    renderAt("/member/update/m1");

    await waitFor(() => expect(screen.getByLabelText(/Full Name/)).toHaveValue("Fresh Ada"));
    expect(shownValue(screen.getByLabelText("Voice Part"))).toBe("Soprano");
    const [, body] = await confirmSubmit();
    expect(body).toMatchObject({ name: "Fresh Ada", part: "Soprano" });
  });

  it("won't edit a cached copy when the fresh request fails; Try again seeds the fresh one", async () => {
    queryClient.setQueryData(queryKeys.memberModel("org1"), { data: MODEL });
    queryClient.setQueryData(queryKeys.member("org1", "m1"), {
      data: { id: "m1", name: "Old Ada", part: "Alto" },
    });
    mockGet.mockImplementation((url: string) =>
      url.endsWith("/model")
        ? Promise.resolve({ data: { data: MODEL } })
        : Promise.reject({ response: { status: 500, data: { error: "Member service down" } } }),
    );
    renderAt("/member/update/m1");

    expect(await screen.findByText("Couldn't load this member")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Old Ada")).not.toBeInTheDocument();

    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url.endsWith("/model") ? MODEL : { id: "m1", name: "Fresh Ada", part: "Soprano" },
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByLabelText(/Full Name/)).toHaveValue("Fresh Ada"));
  });

  it("refreshes the member's own cache after an update", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? MODEL : ADA } }),
    );
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    renderAt("/member/update/m1");
    await waitFor(() => expect(screen.getByLabelText(/Full Name/)).toHaveValue("Ada"));
    await confirmSubmit();
    await screen.findByText("members list");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.member("org1", "m1") });
    invalidate.mockRestore();
  });

  it("shows a stored date in the date picker and submits it as YYYY-MM-DD", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url.endsWith("/model")
            ? DATED_MODEL
            : { ...ADA, dob: "1990-03-04T00:00:00.000Z" },
        },
      }),
    );
    renderAt("/member/update/m1");
    await waitFor(() => expect(screen.getByLabelText("Date of Birth")).toHaveValue("Mar 4, 1990"));

    const [, body] = await confirmSubmit();
    expect(body.dob).toBe("1990-03-04");
  });

  it("offers a retry when the member model fails to load", async () => {
    mockGet.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: { error: "Model service down" } } }),
    );
    renderAt(PROTECTED_PATHS.ADD_MEMBER);
    expect(await screen.findByText("Couldn't load the member model")).toBeInTheDocument();
    expect(screen.getByText("Model service down")).toBeInTheDocument();

    mockGet.mockImplementation(() => Promise.resolve({ data: { data: MODEL } }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByLabelText(/Full Name/)).toBeInTheDocument();
  });
});

describe("<AddMember> leaving with unsaved changes", () => {
  // Every kind of input the member model can generate.
  const FULL_MODEL = {
    fields: [
      ...MODEL.fields,
      { _id: "f-bap", name: "baptised", label: "Baptised", type: "checkbox", required: false },
      { _id: "f-dob", name: "dob", label: "Date of Birth", type: "date", required: false },
      { _id: "f-phone", name: "phone", label: "Phone", type: "tel", required: false },
    ],
  };
  const ADA_FULL = {
    id: "m1", name: "Ada", part: "Alto", baptised: true, dob: "1990-03-04T00:00:00.000Z", phone: "0801",
  };
  const mockDelete: jest.Mock = mockedAxios.delete;
  const serve = (member: Record<string, unknown> = ADA_FULL, model = FULL_MODEL) =>
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? model : member } }),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", isOwner: true, permissions: [] },
    });
    serve();
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
    mockDelete.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  const routes = (
    <Routes>
      {[PROTECTED_PATHS.ADD_MEMBER, PROTECTED_PATHS.UPDATE_MEMBER].map((path) => (
        <Route
          key={path}
          path={path}
          element={
            <>
              <LeaveLink />
              <AddMember />
            </>
          }
        />
      ))}
      <Route path={ELSEWHERE} element={<div>elsewhere</div>} />
      <Route path={PROTECTED_PATHS.VIEW_MEMBER} element={<div>members list</div>} />
    </Routes>
  );
  // Opened from another screen, so Cancel (Back) has somewhere to go.
  const renderWithExit = (path: string) =>
    render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[ELSEWHERE, path]} initialIndex={1}>
            {routes}
          </MemoryRouter>
        </QueryClientProvider>
      </ChakraProvider>,
    );
  const nameInput = () => screen.getByLabelText(/Full Name/) as HTMLInputElement;
  const loadedAda = async () => {
    renderWithExit("/member/update/m1");
    await waitFor(() => expect(nameInput().value).toBe("Ada"));
    await waitFor(() => expect(shownValue(screen.getByLabelText("Voice Part"))).toBe("Alto"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  };
  const cancel = () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const leftWithoutAsking = async (where = "elsewhere") => {
    expect(await screen.findByText(where)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  };
  const asks = async () =>
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Discard your changes?");

  it("leaves a new, untouched form without asking", async () => {
    renderWithExit(PROTECTED_PATHS.ADD_MEMBER);
    await screen.findByLabelText(/Full Name/);
    await expect(askToLogOut()).resolves.toBe(true);
    cancel();
    await leftWithoutAsking();
  });

  it("does not count loading an existing member as a change", async () => {
    await loadedAda();
    expect(screen.getByRole("checkbox", { name: "Baptised" })).toBeChecked();
    cancel();
    await leftWithoutAsking();
  });

  it("asks before leaving a new member, naming it with the member term", async () => {
    useGlobalStore.setState({
      organisation: { ...useGlobalStore.getState().organisation, terminology: SCHOOL_TERMS },
    });
    renderWithExit(PROTECTED_PATHS.ADD_MEMBER);
    fireEvent.change(await screen.findByLabelText(/Full Name/), { target: { value: "Bola" } });
    leave();
    const dialog = await confirmInDialog("Keep editing");
    expect(dialog).toHaveTextContent(
      "Your changes to this new student haven't been saved. Leave without saving them?",
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(nameInput().value).toBe("Bola");
  });

  it.each([
    ["text", () => fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } })],
    ["a custom field", () =>
      fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0802" } })],
    ["a date", () =>
      fireEvent.change(screen.getByLabelText("Date of Birth"), { target: { value: "1991-03-04" } })],
    ["a checkbox", () => toggle(screen.getByRole("checkbox", { name: "Baptised" }))],
    ["a dropdown", () => chooseOption(screen.getByLabelText("Voice Part"), "Soprano")],
  ])("asks after a change to %s", async (_what, change) => {
    await loadedAda();
    await change();
    cancel();
    await asks();
  });

  it("keeps every edit on Keep editing, then leaves on Discard changes", async () => {
    await loadedAda();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0802" } });
    await toggle(screen.getByRole("checkbox", { name: "Baptised" }));
    await chooseOption(screen.getByLabelText("Voice Part"), "Soprano");

    cancel();
    const dialog = await confirmInDialog("Keep editing");
    expect(dialog).toHaveTextContent("Your changes to this member haven't been saved.");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(nameInput().value).toBe("Ada Lovelace");
    expect(screen.getByLabelText("Phone")).toHaveValue("0802");
    expect(screen.getByRole("checkbox", { name: "Baptised" })).not.toBeChecked();
    expect(shownValue(screen.getByLabelText("Voice Part"))).toBe("Soprano");

    cancel();
    await confirmInDialog("Discard changes");
    expect(await screen.findByText("elsewhere")).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("stops asking once every change is put back", async () => {
    await loadedAda();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    await toggle(screen.getByRole("checkbox", { name: "Baptised" }));
    await chooseOption(screen.getByLabelText("Voice Part"), "Soprano");
    fireEvent.change(nameInput(), { target: { value: "Ada" } });
    await toggle(screen.getByRole("checkbox", { name: "Baptised" }));
    await chooseOption(screen.getByLabelText("Voice Part"), "Alto");
    cancel();
    await leftWithoutAsking();
  });

  it("asks before Logout; Keep editing keeps the edit", async () => {
    await loadedAda();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    let answer = askToLogOut();
    const dialog = await confirmInDialog("Keep editing");
    expect(dialog).toHaveTextContent("Log out without saving them?");
    await expect(answer).resolves.toBe(false);
    expect(nameInput().value).toBe("Ada Lovelace");

    answer = askToLogOut();
    await confirmInDialog("Discard and log out");
    await expect(answer).resolves.toBe(true);
  });

  it("protects reloading the tab only while there are changes", async () => {
    openAt("/member/update/m1");
    render(
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>{routes}</BrowserRouter>
        </QueryClientProvider>
      </ChakraProvider>,
    );
    await waitFor(() => expect(nameInput().value).toBe("Ada"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(browserWouldAsk()).toBe(false);
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    expect(browserWouldAsk()).toBe(true);
  });

  it("keeps the form and its question when the submit confirmation is cancelled", async () => {
    await loadedAda();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    await confirmInDialog("Cancel");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mockPost).not.toHaveBeenCalled();
    expect(nameInput().value).toBe("Ada Lovelace");
    cancel();
    await asks();
  });

  it("goes to the list after a successful save without asking", async () => {
    await loadedAda();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    const [, body] = await confirmSubmit();
    expect(body).toMatchObject({ name: "Ada Lovelace", memberId: "m1" });
    await leftWithoutAsking("members list");
  });

  it("keeps the edits and keeps asking when the save fails", async () => {
    mockPost.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: { error: "Server down" } } }),
    );
    await loadedAda();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    await confirmSubmit();
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.queryByText("members list")).not.toBeInTheDocument();
    expect(nameInput().value).toBe("Ada Lovelace");
    cancel();
    await asks();
  });

  it("keeps the edits and keeps asking across a background refetch", async () => {
    await loadedAda();
    fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    serve({ ...ADA_FULL, name: "Renamed elsewhere" });
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: queryKeys.member("org1", "m1") });
      await queryClient.refetchQueries({ queryKey: queryKeys.memberModel("org1") });
    });
    expect(nameInput().value).toBe("Ada Lovelace");
    cancel();
    await asks();
  });

  describe("while a save or delete is in flight", () => {
    const editAda = async () => {
      await loadedAda();
      fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
      fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "0802" } });
    };
    const startSave = async () => {
      const post = deferred();
      mockPost.mockImplementation(() => post.promise);
      await editAda();
      await confirmSubmit();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      return post;
    };
    const startDelete = async () => {
      const del = deferred();
      mockDelete.mockImplementation(() => del.promise);
      await editAda();
      fireEvent.click(screen.getByRole("button", { name: "Delete Member" }));
      await confirmInDialog("Delete");
      await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      return del;
    };
    const lockedEverywhere = async () => {
      await waitFor(() => expect(nameInput()).toHaveAttribute("readonly"));
      // Text, custom, date, checkbox and dropdown fields, plus Cancel,
      // Delete, Update and Update Member Model.
      expect(expectEveryControlLocked()).toBeGreaterThan(8);
      userEvent.type(nameInput(), " Byron");
      expect(nameInput().value).toBe("Ada Lovelace");
    };

    it("locks every member field during a save", async () => {
      await startSave();
      await lockedEverywhere();
      fireEvent.submit(nameInput());
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it("goes to the list after the save succeeds, without asking", async () => {
      const post = await startSave();
      await act(async () => post.resolve({ data: { data: {} } }));
      expect(await screen.findByText("members list")).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("unlocks after a failed save with the edits intact, and still asks", async () => {
      const post = await startSave();
      await act(async () =>
        post.reject({ response: { status: 500, data: { error: "Server down" } } }),
      );
      await waitFor(() => expectNothingLockedFor(nameInput(), screen.getByLabelText("Phone")));
      expect(nameInput().value).toBe("Ada Lovelace");
      expect(screen.getByLabelText("Phone")).toHaveValue("0802");
      cancel();
      await asks();
    });

    it("locks every member field during a delete, and unlocks if it fails", async () => {
      const del = await startDelete();
      await lockedEverywhere();
      await act(async () =>
        del.reject({ response: { status: 500, data: { error: "Cannot delete" } } }),
      );
      await waitFor(() => expectNothingLockedFor(nameInput()));
      expect(nameInput().value).toBe("Ada Lovelace");
      cancel();
      await asks();
    });
  });

  describe("a request still in flight after the officer left", () => {
    // Each page offers a way to Add Member, as the drawer does.
    const renderWithAddLink = () =>
      render(
        <ChakraProvider value={system}>
          <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/member/update/m1"]}>
              <Routes>
                {[PROTECTED_PATHS.ADD_MEMBER, PROTECTED_PATHS.UPDATE_MEMBER].map((path) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <>
                        <LeaveLink />
                        <Link to={PROTECTED_PATHS.ADD_MEMBER}>Open Add Member</Link>
                        <AddMember />
                      </>
                    }
                  />
                ))}
                <Route path={ELSEWHERE} element={<div>elsewhere</div>} />
                <Route path={PROTECTED_PATHS.VIEW_MEMBER} element={<div>members list</div>} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>
        </ChakraProvider>,
      );
    // Discards the in-flight form, then starts another new member.
    const moveOnToAnotherDirtyForm = async () => {
      fireEvent.click(screen.getByText("Open Add Member"));
      await confirmInDialog("Discard changes");
      await waitFor(() => expect(nameInput().value).toBe(""));
      fireEvent.change(nameInput(), { target: { value: "Someone new" } });
    };
    const newFormStillProtected = async () => {
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      // No stray navigation, so no surprise question from the new form either.
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.queryByText("members list")).not.toBeInTheDocument();
      expect(nameInput().value).toBe("Someone new");

      const answer = askToLogOut();
      const dialog = await confirmInDialog("Keep editing");
      expect(dialog).toHaveTextContent("this new member");
      await expect(answer).resolves.toBe(false);

      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      leave();
      await asks();
      expect(screen.queryByText("elsewhere")).not.toBeInTheDocument();
    };
    const openAda = async () => {
      renderWithAddLink();
      await waitFor(() => expect(nameInput().value).toBe("Ada"));
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
    };

    it("a late save success neither navigates nor unguards the new form, but still refreshes the cache", async () => {
      const post = deferred();
      mockPost.mockImplementation(() => post.promise);
      const invalidate = jest.spyOn(queryClient, "invalidateQueries");
      await openAda();
      await confirmSubmit();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      await moveOnToAnotherDirtyForm();

      await act(async () => post.resolve({ data: { data: {} } }));
      expect(toast.success).toHaveBeenCalledWith("Member updated successfully");
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members("org1") });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.member("org1", "m1") });
      invalidate.mockRestore();
      await newFormStillProtected();
    });

    it("a late delete success neither navigates nor unguards the new form", async () => {
      const del = deferred();
      mockDelete.mockImplementation(() => del.promise);
      await openAda();
      fireEvent.click(screen.getByRole("button", { name: "Delete Member" }));
      await confirmInDialog("Delete");
      await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      await moveOnToAnotherDirtyForm();

      await act(async () => del.resolve({ data: { data: {} } }));
      expect(toast.success).toHaveBeenCalledWith("Member deleted successfully");
      await newFormStillProtected();
    });
  });

  describe("switching organisation while the form is open", () => {
    // Same member id and field keys in both organisations, different data.
    const serveByOrg = () =>
      mockGet.mockImplementation((url: string) => {
        const org2 = url.includes("/org2/");
        if (url.endsWith("/model")) return Promise.resolve({ data: { data: FULL_MODEL } });
        return Promise.resolve({
          data: { data: org2 ? { ...ADA_FULL, name: "Bea Other", phone: "0999" } : ADA_FULL },
        });
      });
    const switchToOrg2 = () =>
      act(() =>
        useGlobalStore.setState({
          organisation: { ...EMPTY_ORG, id: "org2", isOwner: true, permissions: [] },
        }),
      );

    it("never carries a new member's entries from one organisation into another", async () => {
      serveByOrg();
      renderWithExit(PROTECTED_PATHS.ADD_MEMBER);
      fireEvent.change(await screen.findByLabelText(/Full Name/), { target: { value: "Typed in org1" } });
      switchToOrg2();
      await waitFor(() => expect(nameInput().value).toBe(""));
      expect(screen.getByLabelText("Phone")).toHaveValue("");
      leave();
      expect(await screen.findByText("elsewhere")).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("loads the other organisation's member afresh, without org1's edits or baseline", async () => {
      serveByOrg();
      await loadedAda();
      fireEvent.change(nameInput(), { target: { value: "Ada edited in org1" } });
      switchToOrg2();
      await waitFor(() => expect(nameInput().value).toBe("Bea Other"));
      expect(screen.getByLabelText("Phone")).toHaveValue("0999");
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
      cancel();
      expect(await screen.findByText("elsewhere")).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });

    it("saves to the organisation now selected, with only its own values", async () => {
      serveByOrg();
      await loadedAda();
      fireEvent.change(nameInput(), { target: { value: "Ada edited in org1" } });
      switchToOrg2();
      await waitFor(() => expect(nameInput().value).toBe("Bea Other"));
      const [url, body] = await confirmSubmit();
      expect(url).toBe("/organisations/org2/members");
      expect(body).toMatchObject({ name: "Bea Other", phone: "0999", memberId: "m1" });
    });
  });

  describe("Delete", () => {
    const deleteMember = async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete Member" }));
      await confirmInDialog("Delete");
    };

    it("leaves for the list after a successful delete with no second question", async () => {
      await loadedAda();
      fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
      await deleteMember();
      await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
      await leftWithoutAsking("members list");
    });

    it("keeps the form and its question when the delete fails", async () => {
      mockDelete.mockImplementation(() =>
        Promise.reject({ response: { status: 500, data: { error: "Cannot delete" } } }),
      );
      await loadedAda();
      fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
      await deleteMember();
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Cannot delete"));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(nameInput().value).toBe("Ada Lovelace");
      cancel();
      await asks();
    });

    it("keeps the form and its question when the delete is cancelled", async () => {
      await loadedAda();
      fireEvent.change(nameInput(), { target: { value: "Ada Lovelace" } });
      fireEvent.click(screen.getByRole("button", { name: "Delete Member" }));
      await confirmInDialog("Cancel");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(mockDelete).not.toHaveBeenCalled();
      cancel();
      await asks();
    });
  });
});

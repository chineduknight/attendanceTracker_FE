import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "react-toastify";
import { system } from "styles/theme";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import AddMember from "pages/AddMember";
import { PROTECTED_PATHS } from "routes/pagePath";
import { queryKeys } from "services/api/queryKeys";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";
import { toggle, confirmInDialog } from "test-utils/render";

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
    const part = (await screen.findByLabelText("Voice Part")) as HTMLSelectElement;
    await waitFor(() => expect(part.value).toBe("Alto"));

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
      expect((screen.getByLabelText("Voice Part") as HTMLSelectElement).value).toBe("Alto"),
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
    expect(screen.getByLabelText("Voice Part")).toHaveValue("Soprano");
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

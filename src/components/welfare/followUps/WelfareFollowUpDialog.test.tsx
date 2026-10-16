import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { BrowserRouter, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { toast } from "react-toastify";
import { system } from "styles/theme";
import { toggle, chooseOption, openOption, confirmInDialog } from "test-utils/render";
import {
  askToLogOut,
  browserWouldAsk,
  expectEveryControlLocked,
  openAt,
} from "test-utils/leaveGuard";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";
import WelfareFollowUpDialog, {
  WelfareFollowUpDialogRequest,
} from "components/welfare/followUps/WelfareFollowUpDialog";
import { WelfareFollowUp } from "components/welfare/followUps/types";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    put: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;

const TODAY = format(new Date(), "yyyy-MM-dd");

const MEMBERS = {
  data: [
    { id: "m1", name: "Ada Okafor" },
    { id: "m2", name: "Chika Obi" },
  ],
};

const OFFICERS = {
  data: [
    {
      userId: "owner-1",
      username: "Chairman",
      email: "chairman@example.com",
      roleId: "r1",
      roleName: "Chairman",
      permissions: [],
    },
    {
      userId: "user-2",
      username: "Welfare II",
      email: "welfare@example.com",
      roleId: "r2",
      roleName: "Welfare",
      permissions: ["welfare.view", "welfare.manage"],
    },
    {
      userId: "user-3",
      username: "Treasurer",
      email: "treasurer@example.com",
      roleId: "r3",
      roleName: "Treasurer",
      permissions: ["finance.view"],
    },
  ],
};

const OPEN_RECORD: WelfareFollowUp = {
  id: "f1",
  organisationId: "org1",
  memberId: "m1",
  member: { id: "m1", name: "Ada Okafor" },
  recordDate: "2026-10-05",
  sourceType: "manual",
  sourceSignals: [],
  sourceAsOf: null,
  reason: "Bereavement",
  note: "Called the family.",
  workflowStatus: "open",
  nextFollowUpDate: "2026-10-12",
  assignedTo: { id: "user-2", name: "Welfare II" },
  createdBy: { id: "user-1", name: "Knight" },
  updatedBy: null,
  closedAt: null,
  revision: 3,
  createdAt: "2026-10-05T10:00:00.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
};

const MANUAL_REQUEST: WelfareFollowUpDialogRequest = {
  mode: "create",
  organisationId: "org1",
  manual: true,
};

const ATTENTION_REQUEST: WelfareFollowUpDialogRequest = {
  mode: "create",
  organisationId: "org1",
  manual: false,
  source: "attention",
  memberId: "m1",
  memberName: "Ada Okafor",
  sourceSignals: ["consecutive_absence"],
  sourceAsOf: TODAY,
  reason: "2 consecutive unexplained absences",
};

const EDIT_REQUEST: WelfareFollowUpDialogRequest = {
  mode: "edit",
  organisationId: "org1",
  record: OPEN_RECORD,
};

/** Searches the react-select member picker and picks the named member. */
const pickMember = async (name: string) => {
  const input = screen.getByLabelText(/^Member/);
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(await screen.findByRole("option", { name }));
};

interface RenderOverrides {
  request?: WelfareFollowUpDialogRequest;
  canManageAssignedOfficers?: boolean;
  onClose?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  archive?: jest.Mock;
  isSaving?: boolean;
}

const renderDialog = (over: RenderOverrides = {}) => {
  const props = {
    request: over.request ?? MANUAL_REQUEST,
    asOf: TODAY,
    canManageAssignedOfficers: over.canManageAssignedOfficers ?? false,
    onClose: over.onClose ?? jest.fn(),
    create: over.create ?? jest.fn(),
    update: over.update ?? jest.fn(),
    archive: over.archive ?? jest.fn(),
    isSaving: over.isSaving ?? false,
  };
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        {/* The dialog's leave guard reads the router's history. */}
        <MemoryRouter>
          <WelfareFollowUpDialog {...props} />
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );
  return props;
};

const saveButton = () => screen.getByRole("button", { name: "Save follow-up" });

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id: "org1", owner: "owner-1" },
    user: { ...EMPTY_USER, id: "user-me", username: "Me" },
  });
  mockGet.mockImplementation((url: string) => {
    const value = String(url);
    if (value.includes("/members")) return Promise.resolve({ data: MEMBERS });
    if (value.includes("/officers")) return Promise.resolve({ data: OFFICERS });
    return Promise.resolve({ data: { data: {} } });
  });
});

describe("WelfareFollowUpDialog — manual create", () => {
  it("defaults to the local today, keep-open OFF and shows the privacy helper", () => {
    const { create } = renderDialog();
    expect(screen.getByLabelText(/^Date/)).toHaveValue(
      format(parseISO(TODAY), "MMM d, yyyy"),
    );
    expect(screen.getByLabelText("Keep open for follow-up")).not.toBeChecked();
    expect(
      screen.getByText(/Keep notes brief and relevant\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Next follow-up date"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assignment")).not.toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("associates the privacy helper with the note field", () => {
    renderDialog();
    const note = screen.getByLabelText("Note");
    const helper = screen.getByText(/Keep notes brief and relevant\./);
    expect(note.getAttribute("aria-describedby")).toBe(helper.id);
  });

  it("requires a member and a reason before anything is created", () => {
    const { create } = renderDialog();
    fireEvent.click(saveButton());
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText("Select a member.")).toBeInTheDocument();
    expect(screen.getByText("Reason is required.")).toBeInTheDocument();
  });

  it("submits a closed one-off with no note as the exact manual payload", async () => {
    const create = jest.fn();
    const onClose = jest.fn();
    renderDialog({ create, onClose });

    await pickMember("Ada Okafor");
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Bereavement" },
    });
    // The mock resolves synchronously: the dialog closes on success.
    create.mockImplementation((_payload, callbacks) =>
      callbacks?.onSuccess?.(),
    );
    fireEvent.click(saveButton());

    expect(create).toHaveBeenCalledWith(
      {
        memberId: "m1",
        recordDate: TODAY,
        sourceType: "manual",
        sourceSignals: [],
        sourceAsOf: null,
        reason: "Bereavement",
        note: null,
        workflowStatus: "closed",
        nextFollowUpDate: null,
        assignedToUserId: null,
      },
      expect.anything(),
    );
    expect(toast.success).toHaveBeenCalledWith("Follow-up saved");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps an open follow-up without a next date", async () => {
    const create = jest.fn();
    renderDialog({ create });

    await pickMember("Ada Okafor");
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Family situation" },
    });
    await toggle(screen.getByLabelText("Keep open for follow-up"));
    expect(screen.getByLabelText("Next follow-up date")).toBeInTheDocument();
    fireEvent.click(saveButton());

    expect(create.mock.calls[0][0]).toMatchObject({
      workflowStatus: "open",
      nextFollowUpDate: null,
    });
  });

  it("sends an optional next date when one is chosen", async () => {
    const create = jest.fn();
    renderDialog({ create });
    // The next date cannot precede the record date, which defaults to today,
    // so a fixed date would start failing once it is in the past.
    const nextDate = format(addDays(new Date(), 7), "yyyy-MM-dd");

    await pickMember("Ada Okafor");
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Travelling" },
    });
    await toggle(screen.getByLabelText("Keep open for follow-up"));
    fireEvent.change(screen.getByLabelText("Next follow-up date"), {
      target: { value: nextDate },
    });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "  Reach out after the trip.  " },
    });
    fireEvent.click(saveButton());

    expect(create.mock.calls[0][0]).toMatchObject({
      workflowStatus: "open",
      nextFollowUpDate: nextDate,
      note: "Reach out after the trip.",
    });
  });
});

describe("WelfareFollowUpDialog — insight create", () => {
  it("preselects and locks the member with the prefilled reason, creating nothing yet", () => {
    const { create } = renderDialog({ request: ATTENTION_REQUEST });
    const member = screen.getByLabelText(/^Member/);
    expect(member).toHaveValue("Ada Okafor");
    expect(member).toBeDisabled();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Reason/)).toHaveValue(
      "2 consecutive unexplained absences",
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("carries the insight provenance into the create payload", () => {
    const create = jest.fn();
    renderDialog({ request: ATTENTION_REQUEST, create });

    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Missed three rehearsals" },
    });
    fireEvent.click(saveButton());

    expect(create.mock.calls[0][0]).toEqual({
      memberId: "m1",
      recordDate: TODAY,
      sourceType: "attention",
      sourceSignals: ["consecutive_absence"],
      sourceAsOf: TODAY,
      reason: "Missed three rehearsals",
      note: null,
      workflowStatus: "closed",
      nextFollowUpDate: null,
      assignedToUserId: null,
    });
  });

  it.each([
    ["communicated", "presence_drop_communicated"],
    ["encouragement", "presence_improving"],
  ])("sends the %s source with its exact signal", (source, signal) => {
    const create = jest.fn();
    renderDialog({
      request: {
        mode: "create",
        organisationId: "org1",
        manual: false,
        source: source as "communicated" | "encouragement",
        memberId: "m2",
        memberName: "Chika Obi",
        sourceSignals: [signal],
        sourceAsOf: TODAY,
        reason: "Prefilled",
      },
      create,
    });
    fireEvent.click(saveButton());
    expect(create.mock.calls[0][0]).toMatchObject({
      memberId: "m2",
      sourceType: source,
      sourceSignals: [signal],
      sourceAsOf: TODAY,
    });
  });
});

describe("WelfareFollowUpDialog — edit", () => {
  it("seeds editable fields from the record and sends the loaded revision", () => {
    const update = jest.fn();
    renderDialog({ request: EDIT_REQUEST, update });

    expect(screen.getByLabelText(/^Date/)).toHaveValue("Oct 5, 2026");
    expect(screen.getByLabelText(/^Reason/)).toHaveValue("Bereavement");
    expect(screen.getByLabelText("Note")).toHaveValue("Called the family.");
    expect(screen.getByLabelText("Keep open for follow-up")).toBeChecked();
    expect(screen.getByLabelText("Next follow-up date")).toHaveValue(
      "Oct 12, 2026",
    );
    expect(screen.getByText("Assigned to: Welfare II")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Bereavement — follow-up call" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const [id, payload] = update.mock.calls[0];
    expect(id).toBe("f1");
    expect(payload).toEqual({
      expectedRevision: 3,
      recordDate: "2026-10-05",
      reason: "Bereavement — follow-up call",
      note: "Called the family.",
      workflowStatus: "open",
      assignedToUserId: "user-2",
      nextFollowUpDate: "2026-10-12",
    });
    // Immutable provenance is never part of an update payload.
    expect(payload).not.toHaveProperty("memberId");
    expect(payload).not.toHaveProperty("sourceType");
    expect(payload).not.toHaveProperty("sourceSignals");
    expect(payload).not.toHaveProperty("sourceAsOf");
  });

  it("closes the editor on a 409 so the refreshed list becomes the source of truth", () => {
    const update = jest.fn((_id, _payload, callbacks) =>
      callbacks?.onError?.({ response: { status: 409 } }),
    );
    const onClose = jest.fn();
    renderDialog({ request: EDIT_REQUEST, update, onClose });

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("does not clear the next date when the record is closed through edit", async () => {
    const update = jest.fn();
    renderDialog({ request: EDIT_REQUEST, update });

    await toggle(screen.getByLabelText("Keep open for follow-up"));
    expect(
      screen.queryByLabelText("Next follow-up date"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const payload = update.mock.calls[0][1];
    expect(payload.workflowStatus).toBe("closed");
    expect(payload).not.toHaveProperty("nextFollowUpDate");
  });

  it("archives only after an explicit confirmation, sending the revision", async () => {
    const archive = jest.fn();
    renderDialog({ request: EDIT_REQUEST, archive });

    fireEvent.click(screen.getByRole("button", { name: "Archive record" }));
    // The confirmation is its own dialog, named by its title.
    const confirm = await screen.findByRole("alertdialog", { name: "Archive record" });
    archive.mockImplementation((_id, _revision, callbacks) =>
      callbacks?.onSuccess?.(),
    );
    fireEvent.click(within(confirm).getByRole("button", { name: "Yes, archive" }));

    expect(archive).toHaveBeenCalledWith("f1", 3, expect.anything());
    expect(toast.success).toHaveBeenCalledWith("Follow-up archived");
  });

  it("never offers archive while creating", () => {
    renderDialog({ request: MANUAL_REQUEST });
    expect(
      screen.queryByRole("button", { name: "Archive record" }),
    ).not.toBeInTheDocument();
  });
});

describe("WelfareFollowUpDialog — assignment", () => {
  it("offers only Welfare-capable officers when officers.view is present", async () => {
    renderDialog({
      request: EDIT_REQUEST,
      canManageAssignedOfficers: true,
    });
    await openOption(screen.getByLabelText("Assignment"), "Chairman");
    expect(screen.getByRole("option", { name: "Welfare II" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Treasurer" }),
    ).not.toBeInTheDocument();
  });

  it("never calls the officer list without officers.view and offers Assign to me", () => {
    const update = jest.fn();
    renderDialog({ request: EDIT_REQUEST, update });

    expect(
      mockGet.mock.calls.some(([url]) => String(url).includes("/officers")),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Assign to me" }));
    // The selection is reflected even without the officer picker…
    expect(screen.getByText("Assigned to: Me")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(update.mock.calls[0][1].assignedToUserId).toBe("user-me");
  });

  it("submits an assignment chosen from the officer list", async () => {
    const update = jest.fn();
    renderDialog({
      request: EDIT_REQUEST,
      canManageAssignedOfficers: true,
      update,
    });
    await chooseOption(screen.getByLabelText("Assignment"), "Chairman");
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(update.mock.calls[0][1].assignedToUserId).toBe("owner-1");
  });
});

describe("WelfareFollowUpDialog — in-flight state", () => {
  it("disables the footer actions while saving", () => {
    renderDialog({ request: EDIT_REQUEST, isSaving: true });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    // v3 hides a loading button's label with visibility:hidden; App.css keeps
    // it named in browsers, but jsdom never loads App.css, so find the
    // saving button by its loading state instead of its name.
    const saving = screen
      .getAllByRole("button", { hidden: true })
      .find((button) => button.hasAttribute("data-loading"));
    expect(saving).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Archive record" }),
    ).toBeDisabled();
  });
});

describe("WelfareFollowUpDialog — terminology", () => {
  it("labels the member picker with the organisation's own term", () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        owner: "owner-1",
        terminology: { ...DEFAULT_TERMINOLOGY, memberSingular: "Chorister", memberPlural: "Choristers" },
      },
    });
    renderDialog();
    expect(screen.getByLabelText(/^Chorister/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Member$/)).not.toBeInTheDocument();
  });
});

describe("WelfareFollowUpDialog — unsaved changes", () => {
  const QUESTION =
    "Your changes to this welfare follow-up haven't been saved. Close without saving them?";

  const editRequest = (
    over: Partial<WelfareFollowUp> = {},
  ): WelfareFollowUpDialogRequest => ({
    mode: "edit",
    organisationId: "org1",
    record: { ...OPEN_RECORD, ...over },
  });

  /**
   * Renders the dialog on a route reached from another one, so Back has
   * somewhere to go, with a Back control like the browser's.
   */
  const renderOnRoute = (over: RenderOverrides = {}) => {
    const props = {
      request: over.request ?? MANUAL_REQUEST,
      asOf: TODAY,
      canManageAssignedOfficers: over.canManageAssignedOfficers ?? false,
      onClose: over.onClose ?? jest.fn(),
      create: over.create ?? jest.fn(),
      update: over.update ?? jest.fn(),
      archive: over.archive ?? jest.fn(),
      isSaving: over.isSaving ?? false,
    };
    const Back = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>Browser back</button>;
    };
    const ui = (isSaving: boolean) => (
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/before", "/welfare"]} initialIndex={1}>
            <Routes>
              <Route
                path="/welfare"
                element={
                  <>
                    <Back />
                    <WelfareFollowUpDialog {...props} isSaving={isSaving} />
                  </>
                }
              />
              <Route path="/before" element={<div>previous page</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ChakraProvider>
    );
    const view = render(ui(props.isSaving));
    return { ...props, setSaving: (saving: boolean) => view.rerender(ui(saving)) };
  };

  const reasonInput = () => screen.getByLabelText(/^Reason/) as HTMLInputElement;
  const noteInput = () => screen.getByLabelText(/^Note/) as HTMLTextAreaElement;
  const cancel = () => fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const formDialog = () => screen.getByRole("dialog", { name: /welfare follow-up/ });
  // The dialog's own X (a date field's clear button is also named Close).
  const closeX = () =>
    within(formDialog())
      .getAllByRole("button", { name: "Close" })
      .find((button) => button.getAttribute("data-part") === "close-trigger") as HTMLElement;
  // Ark registers a dialog's Escape layer just after it opens.
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));
  /** The discard question, which must be the only one on screen. */
  const question = async () => {
    const asked = await screen.findByRole("alertdialog", { name: "Discard your changes?" });
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(asked).toHaveTextContent(QUESTION);
    return asked;
  };
  const closesWithoutAsking = async (onClose: jest.Mock) => {
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("alertdialog", { name: "Discard your changes?" }),
    ).not.toBeInTheDocument();
  };
  const asksBeforeClosing = async (onClose: jest.Mock) => {
    cancel();
    await question();
    expect(onClose).not.toHaveBeenCalled();
  };

  describe("pristine forms close at once", () => {
    it.each([
      ["a manual create", MANUAL_REQUEST],
      ["an insight create with its prefilled reason", ATTENTION_REQUEST],
      ["an edit", EDIT_REQUEST],
    ])("%s", async (_what, request) => {
      const { onClose } = renderOnRoute({ request, canManageAssignedOfficers: true });
      // Loaded members and officers are not changes.
      await waitFor(() => expect(mockGet).toHaveBeenCalled());
      await settle();
      expect(browserWouldAsk()).toBe(false);
      await expect(askToLogOut()).resolves.toBe(true);
      cancel();
      await closesWithoutAsking(onClose);
    });

    it.each([
      ["Escape", () => fireEvent.keyDown(formDialog(), { key: "Escape" })],
      ["the X", () => fireEvent.click(closeX())],
    ])("closes on %s", async (_how, dismiss) => {
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST });
      await settle();
      dismiss();
      await closesWithoutAsking(onClose);
    });

    it("lets Back leave the page", async () => {
      renderOnRoute({ request: EDIT_REQUEST });
      fireEvent.click(screen.getByText("Browser back"));
      expect(await screen.findByText("previous page")).toBeInTheDocument();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  describe("every editable field counts, and putting it back clears it", () => {
    it("the member, but not searching or filtering the picker", async () => {
      const { onClose } = renderOnRoute({ request: MANUAL_REQUEST });
      const input = screen.getByLabelText(/^Member/);
      await waitFor(() => expect(input).not.toBeDisabled());
      // Typing a search, and leaving it, is not a change.
      fireEvent.change(input, { target: { value: "Chi" } });
      fireEvent.change(input, { target: { value: "" } });
      expect(browserWouldAsk()).toBe(false);

      await pickMember("Chika Obi");
      await asksBeforeClosing(onClose);
      await confirmInDialog("Keep editing");
      expect(screen.getByText("Chika Obi")).toBeInTheDocument();
    });

    it.each([
      ["the date", () => fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: "2026-10-01" } }),
        () => fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: "2026-10-05" } })],
      ["the reason", () => fireEvent.change(reasonInput(), { target: { value: "Hospital visit" } }),
        () => fireEvent.change(reasonInput(), { target: { value: "Bereavement" } })],
      ["the note", () => fireEvent.change(noteInput(), { target: { value: "Visited." } }),
        () => fireEvent.change(noteInput(), { target: { value: "Called the family." } })],
      ["keep open", () => toggle(screen.getByLabelText("Keep open for follow-up")),
        () => toggle(screen.getByLabelText("Keep open for follow-up"))],
      ["the next date", () => fireEvent.change(screen.getByLabelText(/^Next follow-up date/), { target: { value: "2026-10-20" } }),
        () => fireEvent.change(screen.getByLabelText(/^Next follow-up date/), { target: { value: "2026-10-12" } })],
    ])("%s of an edit", async (_field, change, restore) => {
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST });
      await change();
      await asksBeforeClosing(onClose);
      await confirmInDialog("Keep editing");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      await restore();
      cancel();
      await closesWithoutAsking(onClose);
    });

    it("the assignment, from the officer list or Assign to me", async () => {
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST, canManageAssignedOfficers: true });
      await chooseOption(screen.getByLabelText("Assignment"), "Chairman");
      await asksBeforeClosing(onClose);
      await confirmInDialog("Keep editing");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      await chooseOption(screen.getByLabelText("Assignment"), "Welfare II");
      cancel();
      await closesWithoutAsking(onClose);
    });

    it("Assign to me without the officer list", async () => {
      const { onClose } = renderOnRoute({ request: editRequest({ assignedTo: null }) });
      fireEvent.click(screen.getByRole("button", { name: "Assign to me" }));
      await asksBeforeClosing(onClose);
    });

    it("an insight's prefilled reason is the starting point", async () => {
      const { onClose } = renderOnRoute({ request: ATTENTION_REQUEST });
      expect(reasonInput()).toHaveValue("2 consecutive unexplained absences");
      fireEvent.change(reasonInput(), { target: { value: "Called, all well" } });
      await asksBeforeClosing(onClose);
      await confirmInDialog("Keep editing");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      fireEvent.change(reasonInput(), { target: { value: "2 consecutive unexplained absences" } });
      cancel();
      await closesWithoutAsking(onClose);
    });

    it("a next date set while open and then hidden by closing is not a change", async () => {
      const { onClose } = renderOnRoute({ request: MANUAL_REQUEST });
      await toggle(screen.getByLabelText("Keep open for follow-up"));
      fireEvent.change(screen.getByLabelText(/^Next follow-up date/), { target: { value: "2026-12-01" } });
      await toggle(screen.getByLabelText("Keep open for follow-up"));
      cancel();
      await closesWithoutAsking(onClose);
    });

    it("whitespace the save would trim is not a change", async () => {
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST });
      fireEvent.change(noteInput(), { target: { value: "Called the family.  " } });
      cancel();
      await closesWithoutAsking(onClose);
    });
  });

  describe("every way of closing asks once, and the answer is kept", () => {
    const dirtyEdit = () => {
      const view = renderOnRoute({ request: EDIT_REQUEST });
      fireEvent.change(noteInput(), { target: { value: "Visited at home." } });
      fireEvent.change(reasonInput(), { target: { value: "Hospital visit" } });
      return view;
    };

    it.each([
      ["Cancel", () => cancel()],
      ["the X", () => fireEvent.click(closeX())],
      ["Escape", () => fireEvent.keyDown(formDialog(), { key: "Escape" })],
    ])("%s: Keep editing keeps every value, Discard changes closes without saving", async (_how, dismiss) => {
      const { onClose, update } = dirtyEdit();
      await settle();
      dismiss();
      const asked = await question();
      expect(within(asked).getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
      fireEvent.click(within(asked).getByRole("button", { name: "Keep editing" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(formDialog()).toBeInTheDocument();
      expect(noteInput()).toHaveValue("Visited at home.");
      expect(reasonInput()).toHaveValue("Hospital visit");
      expect(onClose).not.toHaveBeenCalled();

      dismiss();
      await confirmInDialog("Discard changes");
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(update).not.toHaveBeenCalled();
    });

    it("a second close request while asking never opens a second question", async () => {
      const { onClose } = dirtyEdit();
      cancel();
      await question();
      // Another way out while the question is open gets the same question.
      fireEvent.click(closeX());
      fireEvent.click(screen.getByText("Browser back"));
      await question();
      await confirmInDialog("Keep editing");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(formDialog()).toBeInTheDocument();
      expect(screen.queryByText("previous page")).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("Back asks; Keep editing stays, Discard changes leaves", async () => {
      dirtyEdit();
      fireEvent.click(screen.getByText("Browser back"));
      await question();
      await confirmInDialog("Keep editing");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(screen.queryByText("previous page")).not.toBeInTheDocument();
      expect(noteInput()).toHaveValue("Visited at home.");

      fireEvent.click(screen.getByText("Browser back"));
      await confirmInDialog("Discard changes");
      expect(await screen.findByText("previous page")).toBeInTheDocument();
    });

    it("Logout asks, and Keep editing keeps the edits", async () => {
      dirtyEdit();
      let answer = askToLogOut();
      const asked = await screen.findByRole("alertdialog", { name: "Discard your changes?" });
      expect(asked).toHaveTextContent("Log out without saving them?");
      fireEvent.click(within(asked).getByRole("button", { name: "Keep editing" }));
      await expect(answer).resolves.toBe(false);
      expect(noteInput()).toHaveValue("Visited at home.");

      answer = askToLogOut();
      await confirmInDialog("Discard and log out");
      await expect(answer).resolves.toBe(true);
    });

    it("the browser asks before a reload only while there are changes", () => {
      // Only browser history adds the reload prompt.
      openAt("/welfare");
      render(
        <ChakraProvider value={system}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <WelfareFollowUpDialog
                request={EDIT_REQUEST}
                asOf={TODAY}
                canManageAssignedOfficers={false}
                onClose={jest.fn()}
                create={jest.fn()}
                update={jest.fn()}
                archive={jest.fn()}
                isSaving={false}
              />
            </BrowserRouter>
          </QueryClientProvider>
        </ChakraProvider>,
      );
      expect(browserWouldAsk()).toBe(false);
      fireEvent.change(noteInput(), { target: { value: "Visited at home." } });
      expect(browserWouldAsk()).toBe(true);
      fireEvent.change(noteInput(), { target: { value: "Called the family." } });
      expect(browserWouldAsk()).toBe(false);
    });

    it("a tap on the backdrop asks too", async () => {
      const { onClose } = dirtyEdit();
      await settle();
      // eslint-disable-next-line testing-library/no-node-access
      const backdrop = document.querySelector('[data-part="backdrop"]') as HTMLElement;
      fireEvent.pointerDown(backdrop);
      fireEvent.pointerUp(backdrop);
      fireEvent.click(backdrop);
      await question();
      expect(onClose).not.toHaveBeenCalled();

      // Focus returning outside the dialog as the question closes is not a
      // second request to close.
      await confirmInDialog("Keep editing");
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      fireEvent.focusIn(document.body);
      await settle();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(noteInput()).toHaveValue("Visited at home.");
    });

    it("never puts the note in the question or in browser storage", async () => {
      const setItem = jest.spyOn(Storage.prototype, "setItem");
      dirtyEdit();
      cancel();
      const asked = await question();
      expect(asked).not.toHaveTextContent("Visited at home.");
      expect(
        setItem.mock.calls.some(([, value]) => String(value).includes("Visited at home.")),
      ).toBe(false);
      setItem.mockRestore();
    });
  });

  describe("saving", () => {
    it("asks again after failed validation, with the entries kept", async () => {
      const { onClose, create } = renderOnRoute({ request: MANUAL_REQUEST });
      fireEvent.change(noteInput(), { target: { value: "No reason yet." } });
      fireEvent.click(saveButton());
      expect(create).not.toHaveBeenCalled();
      expect(screen.getByText("Reason is required.")).toBeInTheDocument();
      await asksBeforeClosing(onClose);
    });

    it("keeps the form and the question after a failed save", async () => {
      const update = jest.fn((_id, _payload, callbacks) =>
        callbacks?.onError?.({ response: { status: 500 } }),
      );
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST, update });
      fireEvent.change(noteInput(), { target: { value: "Visited." } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(update).toHaveBeenCalledTimes(1);
      expect(noteInput()).toHaveValue("Visited.");
      await asksBeforeClosing(onClose);
    });

    it.each([
      ["create", MANUAL_REQUEST],
      ["update", EDIT_REQUEST],
    ])("closes after a successful %s without asking", async (kind, request) => {
      const succeed = jest.fn((...args: unknown[]) =>
        (args[args.length - 1] as { onSuccess?: () => void })?.onSuccess?.(),
      );
      const { onClose } = renderOnRoute({ request, create: succeed, update: succeed });
      if (kind === "create") await pickMember("Ada Okafor");
      fireEvent.change(reasonInput(), { target: { value: "Hospital visit" } });
      fireEvent.click(screen.getByRole("button", { name: kind === "create" ? "Save follow-up" : "Save changes" }));
      await closesWithoutAsking(onClose);
    });

    it.each([409, 404])("a stale %i closes with no discard question", async (status) => {
      const update = jest.fn((_id, _payload, callbacks) =>
        callbacks?.onError?.({ response: { status } }),
      );
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST, update });
      fireEvent.change(noteInput(), { target: { value: "Visited." } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      await closesWithoutAsking(onClose);
    });
  });

  describe("archive", () => {
    const openArchive = async () => {
      fireEvent.click(screen.getByRole("button", { name: "Archive record" }));
      return screen.findByRole("alertdialog", { name: "Archive record" });
    };

    it("says archiving won't save unsaved edits, and Cancel keeps them", async () => {
      const { onClose, archive } = renderOnRoute({ request: EDIT_REQUEST });
      fireEvent.change(noteInput(), { target: { value: "Visited." } });
      const confirm = await openArchive();
      expect(confirm).toHaveTextContent("Your unsaved changes to this follow-up will not be saved.");
      fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(archive).not.toHaveBeenCalled();
      expect(noteInput()).toHaveValue("Visited.");
      await asksBeforeClosing(onClose);
    });

    it("doesn't mention edits when there are none", async () => {
      renderOnRoute({ request: EDIT_REQUEST });
      expect(await openArchive()).not.toHaveTextContent("unsaved");
    });

    it("closes after a confirmed archive with no discard question", async () => {
      const archive = jest.fn((_id, _rev, callbacks) => callbacks?.onSuccess?.());
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST, archive });
      fireEvent.change(noteInput(), { target: { value: "Visited." } });
      fireEvent.click(within(await openArchive()).getByRole("button", { name: "Yes, archive" }));
      await closesWithoutAsking(onClose);
      expect(toast.success).toHaveBeenCalledWith("Follow-up archived");
    });

    it("keeps the form and its edits when an archive fails", async () => {
      const archive = jest.fn((_id, _rev, callbacks) =>
        callbacks?.onError?.({ response: { status: 500 } }),
      );
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST, archive });
      fireEvent.change(noteInput(), { target: { value: "Visited." } });
      const confirm = await openArchive();
      fireEvent.click(within(confirm).getByRole("button", { name: "Yes, archive" }));
      expect(archive).toHaveBeenCalledTimes(1);
      fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(onClose).not.toHaveBeenCalled();
      expect(noteInput()).toHaveValue("Visited.");
    });

    it("a stale archive closes with no discard question", async () => {
      const archive = jest.fn((_id, _rev, callbacks) =>
        callbacks?.onError?.({ response: { status: 404 } }),
      );
      const { onClose } = renderOnRoute({ request: EDIT_REQUEST, archive });
      fireEvent.change(noteInput(), { target: { value: "Visited." } });
      fireEvent.click(within(await openArchive()).getByRole("button", { name: "Yes, archive" }));
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("alertdialog", { name: "Discard your changes?" })).not.toBeInTheDocument();
    });
  });

  describe("while a save or archive is in flight", () => {
    it("locks every control and ignores Escape, X and a second save", async () => {
      const update = jest.fn();
      const { onClose, setSaving } = renderOnRoute({ request: EDIT_REQUEST, update, canManageAssignedOfficers: true });
      fireEvent.change(noteInput(), { target: { value: "Visited." } });
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
      expect(update).toHaveBeenCalledTimes(1);
      setSaving(true);

      expect(expectEveryControlLocked(formDialog())).toBeGreaterThan(8);
      await settle();
      fireEvent.keyDown(formDialog(), { key: "Escape" });
      fireEvent.click(closeX());
      await settle();
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(noteInput()).toHaveValue("Visited.");
    });

    it("keeps the archive confirmation open while the archive runs", async () => {
      const archive = jest.fn();
      const { setSaving } = renderOnRoute({ request: EDIT_REQUEST, archive });
      fireEvent.click(screen.getByRole("button", { name: "Archive record" }));
      const confirm = await screen.findByRole("alertdialog", { name: "Archive record" });
      fireEvent.click(within(confirm).getByRole("button", { name: "Yes, archive" }));
      setSaving(true);
      expect(within(confirm).getByRole("button", { name: "Cancel" })).toBeDisabled();
      fireEvent.click(within(confirm).getByRole("button", { name: "Close" }));
      await settle();
      // Still open, not merely still animating closed.
      expect(confirm).toHaveAttribute("data-state", "open");
      expect(screen.queryByRole("alertdialog", { name: "Discard your changes?" })).not.toBeInTheDocument();
    });
  });

  it("names the member with the organisation's term and still asks", async () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        owner: "owner-1",
        terminology: { ...DEFAULT_TERMINOLOGY, memberSingular: "Chorister", memberPlural: "Choristers" },
      },
    });
    const { onClose } = renderOnRoute({ request: MANUAL_REQUEST });
    const input = screen.getByLabelText(/^Chorister/);
    await waitFor(() => expect(input).not.toBeDisabled());
    fireEvent.change(input, { target: { value: "Ada" } });
    fireEvent.click(await screen.findByRole("option", { name: "Ada Okafor" }));
    await asksBeforeClosing(onClose);
  });
});

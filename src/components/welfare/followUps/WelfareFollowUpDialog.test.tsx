import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "react-toastify";
import { system } from "styles/theme";
import { toggle } from "test-utils/render";
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
        <WelfareFollowUpDialog {...props} />
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
    expect(screen.getByLabelText(/^Date/)).toHaveValue(TODAY);
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

    await pickMember("Ada Okafor");
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Travelling" },
    });
    await toggle(screen.getByLabelText("Keep open for follow-up"));
    fireEvent.change(screen.getByLabelText("Next follow-up date"), {
      target: { value: "2026-10-14" },
    });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "  Reach out after the trip.  " },
    });
    fireEvent.click(saveButton());

    expect(create.mock.calls[0][0]).toMatchObject({
      workflowStatus: "open",
      nextFollowUpDate: "2026-10-14",
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

    expect(screen.getByLabelText(/^Date/)).toHaveValue("2026-10-05");
    expect(screen.getByLabelText(/^Reason/)).toHaveValue("Bereavement");
    expect(screen.getByLabelText("Note")).toHaveValue("Called the family.");
    expect(screen.getByLabelText("Keep open for follow-up")).toBeChecked();
    expect(screen.getByLabelText("Next follow-up date")).toHaveValue(
      "2026-10-12",
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
    const confirm = await screen.findByRole("dialog", { name: "Archive record" });
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
    await screen.findByRole("option", { name: "Chairman" });
    const select = screen.getByLabelText("Assignment");
    expect(
      within(select).getByRole("option", { name: "Welfare II" }),
    ).toBeInTheDocument();
    expect(
      within(select).queryByRole("option", { name: "Treasurer" }),
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
    await screen.findByRole("option", { name: "Chairman" });
    fireEvent.change(screen.getByLabelText("Assignment"), {
      target: { value: "owner-1" },
    });
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

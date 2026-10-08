import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "react-toastify";
import theme from "styles/theme";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Welfare from "pages/Welfare";
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
const mockPost: jest.Mock = mockedAxios.post;
const mockPatch: jest.Mock = mockedAxios.patch;
const mockDelete: jest.Mock = mockedAxios.delete;
const mockPut: jest.Mock = mockedAxios.put;

const TODAY = format(new Date(), "yyyy-MM-dd");
const dayOffset = (offset: number) =>
  format(addDays(new Date(), offset), "yyyy-MM-dd");

const period = () => ({
  expected: 6,
  present: 3,
  excused: 1,
  absent: 2,
  presenceRate: 50,
  attendanceRate: 66.7,
});

const OVERVIEW = {
  asOf: TODAY,
  settings: {
    reviewWindowDays: 14,
    presenceChangeThresholdPoints: 25,
    consecutiveAbsenceThreshold: 2,
    returningSoonDays: 7,
  },
  periods: {
    recent: { fromDate: "2025-09-24", toDate: "2025-10-07" },
    previous: { fromDate: "2025-09-10", toDate: "2025-09-23" },
  },
  summary: {
    attention: 1,
    communicated: 0,
    encouragement: 0,
    currentlyAway: 0,
    returningSoon: 0,
  },
  attention: [
    {
      memberId: "m1",
      name: "Ada Okafor",
      signals: ["consecutive_absence"],
      recent: period(),
      previous: period(),
      presenceChangePoints: -50,
      consecutiveAbsent: 2,
      lastPresentDate: "2025-09-28",
    },
  ],
  communicated: [],
  encouragement: [],
  currentlyAway: [],
  returningSoon: [],
};

const EMPTY_OVERVIEW = {
  ...OVERVIEW,
  summary: {
    attention: 0,
    communicated: 0,
    encouragement: 0,
    currentlyAway: 0,
    returningSoon: 0,
  },
  attention: [],
};

const baseRecord = {
  organisationId: "org1",
  memberId: "m1",
  member: { id: "m1", name: "Ada Okafor" },
  sourceType: "manual" as const,
  sourceSignals: [],
  sourceAsOf: null,
  note: null,
  assignedTo: null,
  createdBy: { id: "user-1", name: "Knight" },
  updatedBy: null,
  closedAt: null,
  revision: 1,
  createdAt: "2026-10-05T10:00:00.000Z",
  updatedAt: "2026-10-05T10:00:00.000Z",
};

const openRecord = (over: Partial<WelfareFollowUp> = {}): WelfareFollowUp => ({
  ...baseRecord,
  id: "f1",
  recordDate: TODAY,
  reason: "Bereavement",
  workflowStatus: "open",
  nextFollowUpDate: null,
  ...over,
});

const closedRecord = (over: Partial<WelfareFollowUp> = {}): WelfareFollowUp =>
  openRecord({
    id: "f-closed",
    workflowStatus: "closed",
    nextFollowUpDate: null,
    recordDate: dayOffset(-2),
    reason: "Encouragement after recent improvement",
    memberId: "m3",
    member: { id: "m3", name: "Grace Eze" },
    ...over,
  });

const summaryFor = (records: WelfareFollowUp[]) => ({
  open: records.filter((r) => r.workflowStatus === "open").length,
  dueToday: records.filter(
    (r) => r.workflowStatus === "open" && r.nextFollowUpDate === TODAY,
  ).length,
  overdue: records.filter(
    (r) =>
      r.workflowStatus === "open" &&
      Boolean(r.nextFollowUpDate) &&
      String(r.nextFollowUpDate) < TODAY,
  ).length,
});

const listFor = (records: WelfareFollowUp[]) => ({
  summary: summaryFor(records),
  followUps: records,
});

const EMPTY_LIST = {
  summary: { open: 0, dueToday: 0, overdue: 0 },
  followUps: [],
};

interface ServeOptions {
  list?: unknown;
  org2List?: unknown;
  failList?: boolean;
}

const serve = (over: ServeOptions = {}) => {
  mockGet.mockImplementation((url: string) => {
    const value = String(url);
    if (value.includes("/follow-ups")) {
      if (over.failList) return Promise.reject(new Error("follow-ups down"));
      if (value.includes("/org2/")) {
        return Promise.resolve({ data: { data: over.org2List ?? EMPTY_LIST } });
      }
      return Promise.resolve({ data: { data: over.list ?? EMPTY_LIST } });
    }
    if (value.startsWith("/welfare/")) {
      const org = value.includes("/org2/") ? "org2" : "org1";
      return Promise.resolve({
        data: { data: org === "org2" ? EMPTY_OVERVIEW : OVERVIEW },
      });
    }
    if (value.includes("/members")) {
      return Promise.resolve({
        data: {
          data: [
            { id: "m1", name: "Ada Okafor" },
            { id: "m2", name: "Chika Obi" },
          ],
        },
      });
    }
    return Promise.resolve({ data: { data: {} } });
  });
};

const renderPage = () =>
  render(
    <ChakraProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/welfare"]}>
          <Routes>
            <Route path="/welfare" element={<Welfare />} />
            <Route
              path="/analytics/member/:memberId"
              element={<div>member analytics</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>,
  );

const setOrg = (over: Partial<typeof EMPTY_ORG> = {}) =>
  useGlobalStore.setState({
    organisation: {
      ...EMPTY_ORG,
      id: "org1",
      permissions: ["attendance.view", "welfare.view"],
      ...over,
    },
  });

/** Searches the react-select member picker and picks the named member. */
const pickMember = async (name: string) => {
  const input = screen.getByLabelText(/^Member/);
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: name } });
  fireEvent.click(await screen.findByRole("option", { name }));
};

/** The record list starts collapsed under the summary counts. */
const openFollowUpList = async () => {
  fireEvent.click(
    await screen.findByRole("button", { name: "Show follow-ups" }),
  );
};

const callsTo = (part: string) =>
  mockGet.mock.calls.filter(([url]) => String(url).includes(part));

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  setOrg();
  serve();
});

describe("<Welfare> follow-ups — access & privacy", () => {
  it("opens for an attendance viewer but never requests follow-ups without welfare.view", async () => {
    setOrg({ permissions: ["attendance.view"] });
    renderPage();
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Follow-ups" }),
    ).not.toBeInTheDocument();
    expect(callsTo("/follow-ups")).toHaveLength(0);
  });

  it("never renders private note text for a user without welfare.view", async () => {
    setOrg({ permissions: ["attendance.view"] });
    serve({
      list: listFor([openRecord({ note: "Private detail about the family." })]),
    });
    renderPage();
    await screen.findByText("Ada Okafor");
    expect(
      screen.queryByText(/Private detail about the family\./),
    ).not.toBeInTheDocument();
  });

  it("renders records, summary and history for welfare.view", async () => {
    const records = [
      openRecord({
        id: "f-open",
        note: "Called the family.",
        assignedTo: { id: "user-2", name: "Welfare II" },
        nextFollowUpDate: dayOffset(1),
      }),
      closedRecord(),
    ];
    serve({ list: listFor(records) });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Follow-ups" }),
    ).toBeInTheDocument();
    await openFollowUpList();
    expect(screen.getByText("Bereavement")).toBeInTheDocument();
    expect(screen.getByText("Called the family.")).toBeInTheDocument();
    expect(screen.getByText("Assigned to: Welfare II")).toBeInTheDocument();
    expect(
      screen.getByText("Encouragement after recent improvement"),
    ).toBeInTheDocument();
    expect(screen.getByText("Logged by Knight")).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Open" })).getByText("1"),
    ).toBeInTheDocument();
  });

  it("gives view-only officers read access without write actions", async () => {
    serve({ list: listFor([openRecord({ id: "f-open" }), closedRecord()]) });
    renderPage();
    await openFollowUpList();

    expect(
      screen.queryByRole("button", { name: "Add welfare follow-up" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add follow-up" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Close follow-up" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reopen follow-up" }),
    ).not.toBeInTheDocument();
    // Read-only history stays reachable.
    expect(
      screen.getByRole("button", { name: "Member history" }),
    ).toBeInTheDocument();
  });

  it("gives view+manage officers the write actions", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    serve({ list: listFor([openRecord({ id: "f-open" }), closedRecord()]) });
    renderPage();
    await openFollowUpList();

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close follow-up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reopen follow-up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add follow-up" }),
    ).toBeInTheDocument();
    // The general manual add needs the member list (members.view), which this
    // officer does not hold — only the insight-based add is offered.
    expect(
      screen.queryByRole("button", { name: "Add welfare follow-up" }),
    ).not.toBeInTheDocument();
  });

  it("works for a Welfare manager without members.view and never calls the member list", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    serve({ list: listFor([openRecord({ id: "f-open" }), closedRecord()]) });
    mockPatch.mockResolvedValue({
      data: { data: openRecord({ id: "f-open", workflowStatus: "closed" }) },
    });
    renderPage();
    await openFollowUpList();

    // Manage actions on existing records keep working.
    fireEvent.click(screen.getByRole("button", { name: "Close follow-up" }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups/f-open",
        { expectedRevision: 1, workflowStatus: "closed" },
      ),
    );
    expect(
      screen.getByRole("button", { name: "Reopen follow-up" }),
    ).toBeInTheDocument();

    // Insight-based add stays available: the insight already knows its member.
    fireEvent.click(screen.getByRole("button", { name: "Add follow-up" }));
    const member = screen.getByLabelText(/^Member/);
    expect(member).toHaveValue("Ada Okafor");
    expect(member).toBeDisabled();
    expect(
      screen.getByText("2 consecutive unexplained absences"),
    ).toBeInTheDocument();

    // The general manual add is not offered and the member list is untouched.
    expect(
      screen.queryByRole("button", { name: "Add welfare follow-up" }),
    ).not.toBeInTheDocument();
    expect(callsTo("/organisations/org1/members")).toHaveLength(0);
  }, 15000);

  it("offers the manual add and fetches the member list when members.view is present", async () => {
    setOrg({
      permissions: [
        "attendance.view",
        "welfare.view",
        "welfare.manage",
        "members.view",
      ],
    });
    serve({ list: listFor([]) });
    mockPost.mockResolvedValue({ data: { data: openRecord() } });
    renderPage();
    await screen.findByRole("heading", { name: "Follow-ups" });

    fireEvent.click(
      screen.getByRole("button", { name: "Add welfare follow-up" }),
    );
    await pickMember("Ada Okafor");
    expect(callsTo("/organisations/org1/members").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Bereavement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups",
        expect.objectContaining({
          memberId: "m1",
          sourceType: "manual",
          reason: "Bereavement",
        }),
      ),
    );
  }, 15000);
});

describe("<Welfare> follow-ups — summary & list", () => {
  it("shows backend counts and the correct due labels", async () => {
    const records = [
      openRecord({
        id: "f-over",
        reason: "Overdue reason",
        nextFollowUpDate: dayOffset(-1),
      }),
      openRecord({
        id: "f-due",
        reason: "Due reason",
        nextFollowUpDate: TODAY,
      }),
      openRecord({
        id: "f-future",
        reason: "Future reason",
        nextFollowUpDate: dayOffset(5),
      }),
      openRecord({
        id: "f-nodate",
        reason: "Dateless reason",
        nextFollowUpDate: null,
      }),
      closedRecord(),
    ];
    serve({ list: listFor(records) });
    renderPage();
    await openFollowUpList();

    expect(
      within(screen.getByRole("group", { name: "Open" })).getByText("4"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Due Today" })).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: "Overdue" })).getByText("1"),
    ).toBeInTheDocument();

    // Due-state labels live on the cards, not only in the summary stats.
    const dueLabelInCard = (reason: string, label: string) => {
      const card = screen.getByRole("group", { name: reason });
      expect(within(card).getByText(label)).toBeInTheDocument();
    };
    dueLabelInCard("Overdue reason", "Overdue");
    dueLabelInCard("Due reason", "Due today");
    dueLabelInCard(
      "Future reason",
      `Follow up ${format(addDays(new Date(), 5), "d MMM")}`,
    );
    dueLabelInCard("Dateless reason", "Open — no date set");
  });

  it("starts with only the counts and reveals the records on request", async () => {
    serve({
      list: listFor([
        openRecord({ id: "f-open", note: "Called the family." }),
        closedRecord(),
      ]),
    });
    renderPage();
    await screen.findByRole("heading", { name: "Follow-ups" });

    // Progress is visible without expanding; the records are not.
    expect(
      within(screen.getByRole("group", { name: "Open" })).getByText("1"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Called the family.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Recent follow-up history" }),
    ).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show follow-ups" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    expect(screen.getByText("Called the family.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Recent follow-up history" }),
    ).toBeInTheDocument();
    const hide = screen.getByRole("button", { name: "Hide follow-ups" });
    expect(hide).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(hide);
    expect(screen.queryByText("Called the family.")).not.toBeInTheDocument();
  });

  it("shows an error instead of zero counts when the follow-up API fails", async () => {
    serve({ failList: true });
    renderPage();
    expect(
      await screen.findByText("Follow-up data could not be loaded right now."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Open" }),
    ).not.toBeInTheDocument();
    // The rest of Welfare still renders.
    expect(screen.getByText("Ada Okafor")).toBeInTheDocument();
  });

  it("lists closed records under recent history, not with open follow-ups", async () => {
    serve({
      list: listFor([
        openRecord({ id: "f-open", reason: "Open reason" }),
        closedRecord(),
      ]),
    });
    renderPage();
    await openFollowUpList();

    expect(
      screen.getByRole("heading", { name: "Recent follow-up history" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Encouragement after recent improvement"),
    ).toBeInTheDocument();
  });

  it("opens the member history drawer filtered by memberId", async () => {
    serve({ list: listFor([openRecord({ id: "f-open" })]) });
    renderPage();
    await openFollowUpList();

    fireEvent.click(screen.getByRole("button", { name: "Member history" }));
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Follow-up history")).toBeInTheDocument();
    expect(within(drawer).getByText("Ada Okafor")).toBeInTheDocument();
    expect(
      mockGet.mock.calls.some(([url]) => String(url).includes("memberId=m1")),
    ).toBe(true);
  });
});

describe("<Welfare> follow-ups — insight integration", () => {
  it("badges insight cards with open follow-up counts without hiding the insight", async () => {
    serve({
      list: listFor([
        openRecord({
          id: "f-1",
          memberId: "m1",
          member: { id: "m1", name: "Ada Okafor" },
        }),
        openRecord({
          id: "f-2",
          memberId: "m1",
          member: { id: "m1", name: "Ada Okafor" },
        }),
      ]),
    });
    renderPage();
    expect(await screen.findByText("2 open follow-ups")).toBeInTheDocument();
    expect(
      screen.getByText("2 consecutive unexplained absences"),
    ).toBeInTheDocument();
  });

  it("creates from an insight only after an explicit save, with full provenance", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    serve({ list: listFor([]) });
    mockPost.mockResolvedValue({ data: { data: openRecord() } });
    renderPage();
    await screen.findByText("Ada Okafor");

    fireEvent.click(screen.getByRole("button", { name: "Add follow-up" }));
    const member = screen.getByLabelText(/^Member/);
    expect(member).toHaveValue("Ada Okafor");
    expect(member).toBeDisabled();
    expect(screen.getByLabelText(/^Reason/)).toHaveValue(
      "2 consecutive unexplained absences",
    );
    expect(mockPost).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/welfare/org1/follow-ups", {
        memberId: "m1",
        recordDate: TODAY,
        sourceType: "attention",
        sourceSignals: ["consecutive_absence"],
        sourceAsOf: TODAY,
        reason: "2 consecutive unexplained absences",
        note: null,
        workflowStatus: "closed",
        nextFollowUpDate: null,
        assignedToUserId: null,
      }),
    );
  }, 15000);
});

describe("<Welfare> follow-ups — workflow", () => {
  it("closes an open follow-up with the loaded revision and refetches the list", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    serve({ list: listFor([openRecord({ id: "f-open" })]) });
    mockPatch.mockResolvedValue({
      data: { data: openRecord({ id: "f-open", workflowStatus: "closed" }) },
    });
    renderPage();
    await openFollowUpList();
    const listCallsBefore = callsTo("/follow-ups").length;

    fireEvent.click(screen.getByRole("button", { name: "Close follow-up" }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups/f-open",
        {
          expectedRevision: 1,
          workflowStatus: "closed",
        },
      ),
    );
    await waitFor(() =>
      expect(callsTo("/follow-ups").length).toBeGreaterThan(listCallsBefore),
    );
    expect(toast.success).toHaveBeenCalledWith("Follow-up closed");
  });

  it("reopens a closed follow-up from history", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    serve({ list: listFor([closedRecord({ id: "f-closed" })]) });
    mockPatch.mockResolvedValue({
      data: { data: openRecord({ id: "f-closed" }) },
    });
    renderPage();
    await openFollowUpList();
    await screen.findByRole("heading", { name: "Recent follow-up history" });

    fireEvent.click(screen.getByRole("button", { name: "Reopen follow-up" }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups/f-closed",
        { expectedRevision: 1, workflowStatus: "open" },
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Follow-up reopened");
  });

  it("surfaces the backend 409 message and refetches instead of succeeding silently", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    serve({ list: listFor([openRecord({ id: "f-open" })]) });
    mockPatch.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error:
            "This welfare follow-up was changed by someone else. Refresh and try again.",
        },
      },
    });
    renderPage();
    await openFollowUpList();
    const listCallsBefore = callsTo("/follow-ups").length;

    fireEvent.click(screen.getByRole("button", { name: "Close follow-up" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This welfare follow-up was changed by someone else. Refresh and try again.",
      ),
    );
    await waitFor(() =>
      expect(callsTo("/follow-ups").length).toBeGreaterThan(listCallsBefore),
    );
    expect(toast.success).not.toHaveBeenCalledWith("Follow-up closed");
  });
});

describe("<Welfare> follow-ups — tenancy", () => {
  it("removes the previous organisation's note text immediately on switch", async () => {
    serve({
      list: listFor([
        openRecord({ id: "f-open", note: "Org A private note." }),
      ]),
      org2List: EMPTY_LIST,
    });
    renderPage();
    await openFollowUpList();
    await screen.findByText("Org A private note.");

    act(() => setOrg({ id: "org2" }));
    await waitFor(() =>
      expect(screen.queryByText("Org A private note.")).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        mockGet.mock.calls.some(([url]) =>
          String(url).includes("/welfare/org2/follow-ups"),
        ),
      ).toBe(true),
    );
  });

  it("cannot submit an Org A dialog after switching to Org B", async () => {
    setOrg({
      permissions: [
        "attendance.view",
        "welfare.view",
        "welfare.manage",
        "members.view",
      ],
    });
    serve({ list: listFor([]), org2List: EMPTY_LIST });
    renderPage();
    await screen.findByRole("heading", { name: "Follow-ups" });

    fireEvent.click(
      screen.getByRole("button", { name: "Add welfare follow-up" }),
    );
    await pickMember("Ada Okafor");
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Org A draft" },
    });

    act(() => setOrg({ id: "org2" }));
    await waitFor(() =>
      expect(screen.queryByLabelText(/^Member/)).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("Org A draft")).not.toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  }, 15000);

  it("starts Org B's dialog with no carried member or reason", async () => {
    setOrg({
      permissions: [
        "attendance.view",
        "welfare.view",
        "welfare.manage",
        "members.view",
      ],
    });
    serve({ list: listFor([]), org2List: EMPTY_LIST });
    renderPage();
    await screen.findByRole("heading", { name: "Follow-ups" });

    fireEvent.click(
      screen.getByRole("button", { name: "Add welfare follow-up" }),
    );
    await pickMember("Ada Okafor");
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Org A draft" },
    });
    act(() =>
      setOrg({
        id: "org2",
        permissions: [
          "attendance.view",
          "welfare.view",
          "welfare.manage",
          "members.view",
        ],
      }),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText(/^Member/)).not.toBeInTheDocument(),
    );

    await screen.findByRole("button", { name: "Add welfare follow-up" });
    fireEvent.click(
      screen.getByRole("button", { name: "Add welfare follow-up" }),
    );
    expect(await screen.findByLabelText(/^Member/)).toHaveValue("");
    expect(screen.getByLabelText(/^Reason/)).toHaveValue("");
  }, 15000);
});

describe("<Welfare> follow-ups — no side effects", () => {
  it("creating a follow-up refetches only the follow-up list", async () => {
    setOrg({
      permissions: [
        "attendance.view",
        "welfare.view",
        "welfare.manage",
        "members.view",
      ],
    });
    serve({ list: listFor([]) });
    mockPost.mockResolvedValue({ data: { data: openRecord() } });
    renderPage();
    await screen.findByRole("heading", { name: "Follow-ups" });
    const followUpCallsBefore = callsTo("/follow-ups").length;
    const overviewCallsBefore = callsTo("/overview").length;

    fireEvent.click(
      screen.getByRole("button", { name: "Add welfare follow-up" }),
    );
    await pickMember("Ada Okafor");
    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Bereavement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));

    await waitFor(() =>
      expect(callsTo("/follow-ups").length).toBeGreaterThan(
        followUpCallsBefore,
      ),
    );
    expect(callsTo("/overview").length).toBe(overviewCallsBefore);
    expect(callsTo("/analytics")).toHaveLength(0);
    expect(mockPut).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  }, 15000);
});

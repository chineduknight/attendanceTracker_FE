import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { system } from "styles/theme";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Welfare from "pages/Welfare";
import { WelfareFollowUp } from "components/welfare/followUps/types";
import { PermissionKey } from "rbac/permissions";

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

const TODAY = format(new Date(), "yyyy-MM-dd");
const PAST_REVIEW = "2026-09-30";

const period = {
  expected: 4,
  present: 1,
  excused: 0,
  absent: 3,
  presenceRate: 25,
  attendanceRate: 25,
};

const insight = (memberId: string, name: string) => ({
  memberId,
  name,
  signals: ["consecutive_absence"],
  recent: period,
  previous: { ...period, present: 4, absent: 0, presenceRate: 100 },
  presenceChangePoints: -75,
  consecutiveAbsent: 3,
  lastPresentDate: null,
});

const ELEVEN = Array.from({ length: 11 }, (_, i) =>
  insight(`m${i + 1}`, `Signal Member ${i + 1}`)
);

const overviewFor = (asOf: string, attention = ELEVEN) => ({
  asOf,
  settings: {
    reviewWindowDays: 14,
    presenceChangeThresholdPoints: 25,
    consecutiveAbsenceThreshold: 2,
    returningSoonDays: 7,
  },
  periods: {
    recent: { fromDate: "2026-09-25", toDate: asOf },
    previous: { fromDate: "2026-09-11", toDate: "2026-09-24" },
  },
  summary: {
    attention: attention.length,
    communicated: 0,
    encouragement: 0,
    currentlyAway: 0,
    returningSoon: 0,
  },
  attention,
  communicated: [],
  encouragement: [],
  currentlyAway: [],
  returningSoon: [],
});

const followUp = (over: Partial<WelfareFollowUp> = {}): WelfareFollowUp => ({
  id: "f1",
  organisationId: "org1",
  memberId: "m1",
  member: { id: "m1", name: "Signal Member 1" },
  recordDate: TODAY,
  sourceType: "attention",
  sourceSignals: ["consecutive_absence"],
  sourceAsOf: TODAY,
  reason: "Check-in call",
  note: null,
  workflowStatus: "closed",
  nextFollowUpDate: null,
  assignedTo: null,
  createdBy: { id: "user-1", name: "Knight" },
  updatedBy: null,
  closedAt: null,
  revision: 1,
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  ...over,
});

const listOf = (records: WelfareFollowUp[]) => ({
  summary: {
    open: records.filter((r) => r.workflowStatus === "open").length,
    dueToday: 0,
    overdue: 0,
  },
  followUps: records,
});

const statusModel = (options: string[] | null, type = "option") => ({
  data: {
    fields: [
      { name: "name", type: "text" },
      ...(options ? [{ name: "status", type, options }] : []),
    ],
  },
});

const MANY_MEMBERS = [
  ...Array.from({ length: 60 }, (_, i) => ({
    id: `x${i}`,
    name: `Roster Person ${String(i).padStart(2, "0")}`,
    status: "Active",
  })),
  { id: "z1", name: "Zainab Bello", status: "Active" },
  { id: "z2", name: "Zion Inactive", status: "Inactive" },
];

interface Org {
  model?: unknown;
  attention?: ReturnType<typeof insight>[];
  followUps?: WelfareFollowUp[];
  members?: unknown[];
  /** Birthday rows keyed by the requested startDate. */
  birthdays?: Record<string, { name: string; occurrenceDate: string }[]>;
}

let orgs: Record<string, Org>;

const serve = () =>
  mockGet.mockImplementation((url: string) => {
    const value = String(url);
    const orgId = value.includes("/org2/") ? "org2" : "org1";
    const org = orgs[orgId] ?? {};
    if (value.includes("/follow-ups")) {
      return Promise.resolve({ data: { data: listOf(org.followUps ?? []) } });
    }
    if (value.includes("/overview")) {
      const asOf = new URL(value, "http://x").searchParams.get("asOf") ?? "";
      return Promise.resolve({
        data: { data: overviewFor(asOf, org.attention ?? ELEVEN) },
      });
    }
    if (value.includes("/model")) {
      return Promise.resolve({ data: org.model ?? statusModel(null) });
    }
    if (value.includes("/members/birthday")) {
      const from =
        new URL(value, "http://x").searchParams.get("startDate") ?? "";
      const rows = org.birthdays?.[from] ?? [];
      return Promise.resolve({
        data: {
          data: {
            count: rows.length,
            members: rows.map(({ name, occurrenceDate }) => ({
              name,
              birthdayOccurrence: { month: 0, day: 0, occurrenceDate },
            })),
          },
        },
      });
    }
    if (value.includes("/members")) {
      return Promise.resolve({ data: { data: org.members ?? MANY_MEMBERS } });
    }
    return Promise.resolve({ data: { data: {} } });
  });

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
};

const renderPage = (path = "/welfare") =>
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/welfare"
              element={
                <>
                  <Welfare />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ChakraProvider>
  );

const ALL_PERMS: PermissionKey[] = [
  "attendance.view",
  "members.view",
  "welfare.view",
  "welfare.manage",
];

const setOrg = (over: Partial<typeof EMPTY_ORG> = {}) =>
  useGlobalStore.setState({
    organisation: {
      ...EMPTY_ORG,
      id: "org1",
      permissions: ALL_PERMS,
      ...over,
    },
  });

const overviewCalls = () =>
  mockGet.mock.calls
    .map(([url]) => String(url))
    .filter((url) => url.includes("/overview"));

const callsTo = (part: string) =>
  mockGet.mock.calls.filter(([url]) => String(url).includes(part));

/** Progress counts live on the Needs Check-in tabs ("All" = flagged). */
const progressTab = (label: string, count: number) =>
  screen.getByRole("tab", { name: `${label} ${count}` });

const summaryTile = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}`) });

const attentionRegion = () =>
  within(screen.getByRole("region", { name: "Needs Check-in" }));

const waitForProgress = () =>
  screen.findByRole("tab", { name: /^Pending \d+$/ });

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  orgs = { org1: {}, org2: {} };
  setOrg();
  serve();
});

describe("<Welfare> review as-of date", () => {
  it("defaults to local today when the URL has no asOf, and writes it back", async () => {
    renderPage();
    await waitForProgress();
    expect(screen.getByLabelText("Review as of")).toHaveValue(TODAY);
    expect(screen.getByTestId("location")).toHaveTextContent(`asOf=${TODAY}`);
    expect(overviewCalls()[0]).toBe(`/welfare/org1/overview?asOf=${TODAY}`);
  });

  it("respects a valid asOf from the URL (refresh-compatible)", async () => {
    renderPage(`/welfare?asOf=${PAST_REVIEW}`);
    await waitForProgress();
    expect(screen.getByLabelText("Review as of")).toHaveValue(PAST_REVIEW);
    expect(overviewCalls()).toEqual([
      `/welfare/org1/overview?asOf=${PAST_REVIEW}`,
    ]);
    expect(
      queryClient.getQueryData(["welfare", "org1", "overview", PAST_REVIEW, ""])
    ).toBeDefined();
    // The follow-up list is evaluated for the same review date.
    expect(callsTo(`/follow-ups?asOf=${PAST_REVIEW}`).length).toBeGreaterThan(
      0
    );
  });

  it("replaces an invalid asOf with today and never sends it", async () => {
    renderPage("/welfare?asOf=2026-02-30");
    await waitForProgress();
    expect(overviewCalls().some((u) => u.includes("2026-02-30"))).toBe(false);
    expect(screen.getByTestId("location")).toHaveTextContent(`asOf=${TODAY}`);
  });

  it("replaces a future asOf with today and never sends it", async () => {
    const future = format(addDays(new Date(), 1), "yyyy-MM-dd");
    renderPage(`/welfare?asOf=${future}`);
    await waitForProgress();
    expect(overviewCalls().some((u) => u.includes(future))).toBe(false);
    expect(screen.getByTestId("location")).toHaveTextContent(`asOf=${TODAY}`);
  });

  it("caps the date picker at today and ignores a typed future date", async () => {
    renderPage(`/welfare?asOf=${PAST_REVIEW}`);
    await waitForProgress();
    const input = screen.getByLabelText("Review as of");
    expect(input).toHaveAttribute("max", TODAY);

    const future = format(addDays(new Date(), 3), "yyyy-MM-dd");
    fireEvent.change(input, { target: { value: future } });
    expect(screen.getByTestId("location")).toHaveTextContent(
      `asOf=${PAST_REVIEW}`
    );
    expect(overviewCalls().some((u) => u.includes(future))).toBe(false);
  });

  it("reloads the overview when another date is chosen, and Today resets it", async () => {
    renderPage();
    await waitForProgress();

    fireEvent.change(screen.getByLabelText("Review as of"), {
      target: { value: PAST_REVIEW },
    });
    await waitFor(() =>
      expect(overviewCalls()).toContain(
        `/welfare/org1/overview?asOf=${PAST_REVIEW}`
      )
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      `asOf=${PAST_REVIEW}`
    );

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Review as of")).toHaveValue(TODAY)
    );
    expect(screen.getByTestId("location")).toHaveTextContent(`asOf=${TODAY}`);
    expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
  });

  it("links insight-created follow-ups to the selected review date", async () => {
    mockPost.mockResolvedValue({ data: { data: followUp() } });
    renderPage(`/welfare?asOf=${PAST_REVIEW}`);
    await waitForProgress();

    fireEvent.click(
      attentionRegion().getAllByRole("button", { name: "Add follow-up" })[0]
    );
    fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups",
        expect.objectContaining({
          memberId: "m1",
          sourceType: "attention",
          sourceAsOf: PAST_REVIEW,
          // The record date is when Welfare acted, not the review date.
          recordDate: TODAY,
        })
      )
    );
  }, 15000);
});

describe("<Welfare> member-status scope", () => {
  it("defaults to the configured Active and sends its exact spelling", async () => {
    orgs.org1.model = statusModel(["ACTIVE", "Inactive", "Alumni"]);
    renderPage();
    await waitForProgress();
    expect(screen.getByLabelText("Member status")).toHaveValue("ACTIVE");
    // One request only: the scope resolves before the first overview fetch.
    expect(overviewCalls()).toEqual([
      `/welfare/org1/overview?asOf=${TODAY}&statuses=ACTIVE`,
    ]);
  });

  it("defaults to All with no statuses param when Active is not configured", async () => {
    orgs.org1.model = statusModel(["Member", "Alumni"]);
    renderPage();
    await waitForProgress();
    expect(screen.getByLabelText("Member status")).toHaveValue("__all__");
    expect(overviewCalls()).toEqual([`/welfare/org1/overview?asOf=${TODAY}`]);
  });

  it("hides the filter and sends no statuses without an option status field", async () => {
    orgs.org1.model = statusModel(["Active"], "text");
    renderPage();
    await waitForProgress();
    expect(screen.queryByLabelText("Member status")).not.toBeInTheDocument();
    expect(overviewCalls()).toEqual([`/welfare/org1/overview?asOf=${TODAY}`]);
  });

  it("never reads the member model without members.view and covers all statuses", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    orgs.org1.model = statusModel(["Active"]);
    renderPage();
    await waitForProgress();
    expect(callsTo("/model")).toHaveLength(0);
    expect(overviewCalls()).toEqual([`/welfare/org1/overview?asOf=${TODAY}`]);
  });

  it("sends another chosen status and omits statuses for All", async () => {
    orgs.org1.model = statusModel(["Active", "Inactive"]);
    renderPage();
    await waitForProgress();

    fireEvent.change(screen.getByLabelText("Member status"), {
      target: { value: "Inactive" },
    });
    await waitFor(() =>
      expect(overviewCalls()).toContain(
        `/welfare/org1/overview?asOf=${TODAY}&statuses=Inactive`
      )
    );

    fireEvent.change(screen.getByLabelText("Member status"), {
      target: { value: "__all__" },
    });
    await waitFor(() =>
      expect(overviewCalls()).toContain(`/welfare/org1/overview?asOf=${TODAY}`)
    );
  });

  it("reconciles a stale selection to the new organisation's default on switch", async () => {
    orgs.org1.model = statusModel(["Active", "Alumni"]);
    orgs.org2.model = statusModel(["active", "Left"]);
    renderPage();
    await waitForProgress();
    fireEvent.change(screen.getByLabelText("Member status"), {
      target: { value: "Alumni" },
    });
    await waitFor(() =>
      expect(overviewCalls()).toContain(
        `/welfare/org1/overview?asOf=${TODAY}&statuses=Alumni`
      )
    );

    act(() => setOrg({ id: "org2" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Member status")).toHaveValue("active")
    );
    const org2Calls = overviewCalls().filter((u) => u.includes("/org2/"));
    expect(org2Calls).toEqual([
      `/welfare/org2/overview?asOf=${TODAY}&statuses=active`,
    ]);
  });
});

describe("<Welfare> Needs Check-in progress", () => {
  it("shows 11 flagged / 0 followed up / 11 pending with no linked follow-ups", async () => {
    renderPage();
    await waitForProgress();
    expect(progressTab("All", 11)).toBeInTheDocument();
    expect(progressTab("Followed Up", 0)).toBeInTheDocument();
    expect(progressTab("Pending", 11)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pending 11" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  it("partitions by unique signal-linked members, ignoring manual and other-date records", async () => {
    orgs.org1.followUps = [
      followUp({ id: "a", memberId: "m1", workflowStatus: "closed" }),
      followUp({ id: "b", memberId: "m1", workflowStatus: "open" }),
      followUp({ id: "c", memberId: "m2", workflowStatus: "open" }),
      followUp({ id: "d", memberId: "m3" }),
      followUp({
        id: "e",
        memberId: "m4",
        sourceType: "manual",
        sourceAsOf: null,
      }),
      followUp({ id: "f", memberId: "m5", sourceAsOf: "2026-09-01" }),
    ];
    renderPage();
    await waitForProgress();

    expect(progressTab("All", 11)).toBeInTheDocument();
    expect(progressTab("Followed Up", 3)).toBeInTheDocument();
    expect(progressTab("Pending", 8)).toBeInTheDocument();
    expect(
      attentionRegion().getByText("3 of 11 followed up"),
    ).toBeInTheDocument();
    // The raw backend summary card is never faked down.
    expect(
      within(summaryTile("Needs Check-in")).getByText(
        "11"
      )
    ).toBeInTheDocument();

    // Default Pending view: unhandled members only (manual/other-date included).
    expect(attentionRegion().queryByText("Signal Member 1")).toBeNull();
    expect(attentionRegion().getByText("Signal Member 4")).toBeInTheDocument();
    expect(attentionRegion().getByText("Signal Member 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Followed Up 3" }));
    expect(attentionRegion().getByText("Signal Member 1")).toBeInTheDocument();
    expect(attentionRegion().getByText("Signal Member 2")).toBeInTheDocument();
    expect(attentionRegion().getByText("Signal Member 3")).toBeInTheDocument();
    expect(attentionRegion().queryByText("Signal Member 4")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "All 11" }));
    expect(
      attentionRegion().getAllByRole("heading", { name: /^Signal Member/ })
    ).toHaveLength(11);
  });

  it("presents pending and handled cards differently, keeping the signal", async () => {
    orgs.org1.followUps = [
      followUp({ id: "a", memberId: "m1", workflowStatus: "open" }),
      followUp({ id: "b", memberId: "m2", workflowStatus: "closed" }),
    ];
    renderPage();
    await waitForProgress();

    const cardOf = (name: string) =>
      within(attentionRegion().getByRole("group", { name }));

    // Pending card.
    expect(
      cardOf("Signal Member 3").getByText("Needs check-in")
    ).toBeInTheDocument();
    expect(
      cardOf("Signal Member 3").getByRole("button", { name: "Add follow-up" })
    ).toBeInTheDocument();
    expect(
      cardOf("Signal Member 3").queryByText("Follow-up logged")
    ).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Followed Up 2" }));
    expect(
      cardOf("Signal Member 1").getByText("Needs check-in")
    ).toBeInTheDocument();
    expect(
      cardOf("Signal Member 1").getByText("Follow-up logged")
    ).toBeInTheDocument();
    expect(
      cardOf("Signal Member 1").getByText("Open follow-up")
    ).toBeInTheDocument();
    expect(
      cardOf("Signal Member 1").getByRole("button", {
        name: "Add another follow-up",
      })
    ).toBeInTheDocument();

    expect(
      cardOf("Signal Member 2").getByText("Follow-up logged")
    ).toBeInTheDocument();
    expect(cardOf("Signal Member 2").queryByText("Open follow-up")).toBeNull();
  });

  it("shows the positive empty state once nothing is pending", async () => {
    orgs.org1.attention = [insight("m1", "Signal Member 1")];
    orgs.org1.followUps = [followUp()];
    renderPage();
    expect(
      await screen.findByText(
        "All Needs Check-in members for this review have been followed up."
      )
    ).toBeInTheDocument();
  });

  it.each(["closed", "open"] as const)(
    "moves a member Pending -> Followed Up after a successful %s create",
    async (workflowStatus) => {
      orgs.org1.attention = [
        insight("m1", "Signal Member 1"),
        insight("m2", "Signal Member 2"),
      ];
      mockPost.mockImplementation((_url: string, body: any) => {
        orgs.org1.followUps = [
          followUp({ ...body, id: "new", sourceAsOf: body.sourceAsOf }),
        ];
        return Promise.resolve({ data: { data: orgs.org1.followUps[0] } });
      });
      renderPage();
      await waitForProgress();
      expect(progressTab("Pending", 2)).toBeInTheDocument();

      fireEvent.click(
        attentionRegion().getAllByRole("button", { name: "Add follow-up" })[0]
      );
      if (workflowStatus === "open") {
        fireEvent.click(screen.getByLabelText("Keep open for follow-up"));
      }
      fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));

      await waitFor(() =>
        expect(progressTab("Followed Up", 1)).toBeInTheDocument()
      );
      expect(progressTab("Pending", 1)).toBeInTheDocument();
      expect(mockPost).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups",
        expect.objectContaining({ workflowStatus, sourceAsOf: TODAY })
      );
      // Attendance truth untouched: one overview request, raw summary intact.
      expect(overviewCalls()).toHaveLength(1);
      expect(
        within(summaryTile("Needs Check-in")).getByText(
          "2"
        )
      ).toBeInTheDocument();
    },
    15000
  );

  it("shows no progress without welfare.view", async () => {
    setOrg({ permissions: ["attendance.view"] });
    renderPage();
    expect(
      await screen.findByRole("heading", { name: "Signal Member 1" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("tab")).toBeNull();
    expect(callsTo("/follow-ups")).toHaveLength(0);
  });
});

describe("<Welfare> searchable manual member picker", () => {
  const openManual = async () => {
    await waitForProgress();
    fireEvent.click(
      screen.getByRole("button", { name: "Add welfare follow-up" })
    );
    const input = within(await screen.findByRole("dialog")).getByLabelText(
      /^Member/
    );
    await waitFor(() => expect(input).not.toBeDisabled());
    return input;
  };

  it("narrows a large list by typing and submits the picked member", async () => {
    mockPost.mockResolvedValue({ data: { data: followUp() } });
    renderPage();
    const input = await openManual();

    fireEvent.change(input, { target: { value: "Zain" } });
    const options = await screen.findAllByRole("option");
    expect(options).toHaveLength(1);
    fireEvent.click(screen.getByRole("option", { name: "Zainab Bello" }));

    fireEvent.change(screen.getByLabelText(/^Reason/), {
      target: { value: "Bereavement" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups",
        expect.objectContaining({
          memberId: "z1",
          sourceType: "manual",
          sourceAsOf: null,
        })
      )
    );
  }, 15000);

  it("defaults to the Welfare status scope but can widen to All", async () => {
    orgs.org1.model = statusModel(["Active", "Inactive"]);
    renderPage();
    const input = await openManual();
    const scope = screen.getByLabelText("Filter members by status");
    expect(scope).toHaveValue("Active");

    fireEvent.change(input, { target: { value: "Zi" } });
    expect(
      screen.queryByRole("option", { name: "Zion Inactive" })
    ).not.toBeInTheDocument();

    fireEvent.change(scope, { target: { value: "__all__" } });
    fireEvent.change(input, { target: { value: "Zio" } });
    expect(
      await screen.findByRole("option", { name: "Zion Inactive" })
    ).toBeInTheDocument();
  }, 15000);

  it("offers no manual picker and calls no member API without members.view", async () => {
    setOrg({
      permissions: ["attendance.view", "welfare.view", "welfare.manage"],
    });
    mockPost.mockResolvedValue({ data: { data: followUp() } });
    renderPage();
    await waitForProgress();
    expect(
      screen.queryByRole("button", { name: "Add welfare follow-up" })
    ).not.toBeInTheDocument();

    // Insight create still works: the member is already known.
    fireEvent.click(
      attentionRegion().getAllByRole("button", { name: "Add follow-up" })[0]
    );
    fireEvent.click(screen.getByRole("button", { name: "Save follow-up" }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups",
        expect.objectContaining({ memberId: "m1", sourceType: "attention" })
      )
    );
    expect(callsTo("/members")).toHaveLength(0);
    expect(callsTo("/model")).toHaveLength(0);
  }, 15000);
});

describe("<Welfare> review tenancy", () => {
  it("clears the previous organisation's progress on switch", async () => {
    orgs.org1.followUps = [followUp({ memberId: "m1" })];
    orgs.org2.attention = [insight("b1", "Org B Person")];
    renderPage();
    await screen.findByRole("tab", { name: "Followed Up 1" });

    act(() => setOrg({ id: "org2" }));
    await screen.findByRole("heading", { name: "Org B Person" });
    await screen.findByRole("tab", { name: "Pending 1" });
    expect(screen.queryByRole("tab", { name: "Followed Up 1" })).toBeNull();
    expect(screen.queryByText("Signal Member 1")).toBeNull();
    expect(screen.queryByText("Check-in call")).toBeNull();
  });

  it("cannot submit an Org A insight dialog after switching to Org B", async () => {
    renderPage();
    await waitForProgress();
    fireEvent.click(
      attentionRegion().getAllByRole("button", { name: "Add follow-up" })[0]
    );
    expect(screen.getByLabelText(/^Member/)).toHaveValue("Signal Member 1");

    act(() => setOrg({ id: "org2" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save follow-up" })
      ).not.toBeInTheDocument()
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("<Welfare> birthday snapshot follows the review date", () => {
  const DOB_MODEL = {
    data: {
      fields: [
        { name: "name", type: "text" },
        { name: "dob", type: "date" },
      ],
    },
  };
  const UPCOMING = "Upcoming Birthdays";
  const REVIEW_RANGE = "Birthdays in Review Range";
  const shift = (value: string, days: number) =>
    format(addDays(parseISO(value), days), "yyyy-MM-dd");
  // Starts before real today but its +7 range runs past it.
  const STRADDLE = shift(TODAY, -3);
  const EMPTY_REVIEW = "2026-09-01";
  const birthdayRanges = () =>
    callsTo("/members/birthday").map(([url]) => {
      const params = new URL(String(url), "http://x").searchParams;
      return `${params.get("startDate")}→${params.get("endDate")}`;
    });
  const birthdayRegion = (label: string) =>
    within(screen.getByRole("region", { name: label }));
  const expectNoRelativeLabels = (label: string) => {
    expect(birthdayRegion(label).queryByText("Today")).toBeNull();
    expect(birthdayRegion(label).queryByText("Tomorrow")).toBeNull();
    expect(birthdayRegion(label).queryByText(/^In \d+ days$/)).toBeNull();
  };

  beforeEach(() => {
    orgs.org1.model = DOB_MODEL;
    orgs.org2.model = DOB_MODEL;
    orgs.org1.birthdays = {
      [TODAY]: [
        { name: "Today Person", occurrenceDate: TODAY },
        { name: "Later Person", occurrenceDate: shift(TODAY, 4) },
      ],
      [PAST_REVIEW]: [
        { name: "Past One", occurrenceDate: "2026-10-01" },
        { name: "Past Two", occurrenceDate: "2026-10-03" },
      ],
      [STRADDLE]: [
        { name: "Before Today", occurrenceDate: shift(TODAY, -1) },
        { name: "On Today", occurrenceDate: TODAY },
        { name: "After Today", occurrenceDate: shift(TODAY, 2) },
      ],
    };
  });

  it("calls a today review upcoming, with relative labels, on the tile and section alike", async () => {
    renderPage();
    expect(await screen.findByText("Today Person")).toBeInTheDocument();
    expect(birthdayRanges()).toEqual([`${TODAY}→${shift(TODAY, 7)}`]);
    expect(within(summaryTile(UPCOMING)).getByText("2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: UPCOMING })).toBeInTheDocument();
    expect(birthdayRegion(UPCOMING).getByText("Today")).toBeInTheDocument();
    expect(birthdayRegion(UPCOMING).getByText("In 4 days")).toBeInTheDocument();
    expect(screen.queryByText(REVIEW_RANGE)).toBeNull();
  });

  it("keeps an entirely past pinned review, labelled as a review range without relative wording", async () => {
    renderPage(`/welfare?asOf=${PAST_REVIEW}`);
    expect(await screen.findByText("Past One")).toBeInTheDocument();
    expect(birthdayRanges()).toEqual(["2026-09-30→2026-10-07"]);
    expect(
      screen.getByRole("heading", { name: REVIEW_RANGE })
    ).toBeInTheDocument();
    expect(
      birthdayRegion(REVIEW_RANGE).getByText("30 Sep – 7 Oct")
    ).toBeInTheDocument();
    // The historical count is retained, under the same label as the section.
    expect(
      within(summaryTile(REVIEW_RANGE)).getByText("2")
    ).toBeInTheDocument();
    expect(screen.getByText("Past Two")).toBeInTheDocument();
    expect(screen.getByText("Thu, 1 Oct")).toBeInTheDocument();
    expect(screen.queryByText(UPCOMING)).toBeNull();
    expectNoRelativeLabels(REVIEW_RANGE);
  });

  it("treats a review that straddles today as a review range and suppresses relative labels", async () => {
    renderPage(`/welfare?asOf=${STRADDLE}`);
    expect(await screen.findByText("After Today")).toBeInTheDocument();
    expect(birthdayRanges()).toEqual([`${STRADDLE}→${shift(STRADDLE, 7)}`]);
    expect(
      screen.getByRole("heading", { name: REVIEW_RANGE })
    ).toBeInTheDocument();
    expect(
      within(summaryTile(REVIEW_RANGE)).getByText("3")
    ).toBeInTheDocument();
    expect(
      birthdayRegion(REVIEW_RANGE).getByText(
        `${format(parseISO(STRADDLE), "d MMM")} – ${format(
          parseISO(shift(STRADDLE, 7)),
          "d MMM"
        )}`
      )
    ).toBeInTheDocument();
    // Dates still render; only the relative wording is dropped.
    expect(
      birthdayRegion(REVIEW_RANGE).getByText(
        format(parseISO(TODAY), "EEE, d MMM")
      )
    ).toBeInTheDocument();
    expectNoRelativeLabels(REVIEW_RANGE);
  });

  it("shows the shared empty state for an empty past review without hiding the section", async () => {
    renderPage(`/welfare?asOf=${EMPTY_REVIEW}`);
    expect(
      await screen.findByText("No birthdays in this review range.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: REVIEW_RANGE })
    ).toBeInTheDocument();
    expect(
      within(summaryTile(REVIEW_RANGE)).getByText("0")
    ).toBeInTheDocument();
  });

  it("requests the new range when the review date changes, and Today restores it", async () => {
    renderPage();
    expect(await screen.findByText("Today Person")).toBeInTheDocument();
    expect(within(summaryTile(UPCOMING)).getByText("2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Review as of"), {
      target: { value: PAST_REVIEW },
    });
    expect(await screen.findByText("Past Two")).toBeInTheDocument();
    expect(screen.queryByText("Today Person")).toBeNull();
    expect(
      within(summaryTile(REVIEW_RANGE)).getByText("2")
    ).toBeInTheDocument();
    expect(birthdayRanges()).toContain("2026-09-30→2026-10-07");

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByText("Today Person")).toBeInTheDocument();
    expect(screen.queryByText("Past Two")).toBeNull();
    expect(within(summaryTile(UPCOMING)).getByText("2")).toBeInTheDocument();
    expect(birthdayRanges()[0]).toBe(`${TODAY}→${shift(TODAY, 7)}`);
  });

  it("never shows another organisation's birthdays after a switch", async () => {
    orgs.org2.birthdays = {
      [TODAY]: [{ name: "Org B Birthday", occurrenceDate: TODAY }],
    };
    renderPage();
    expect(await screen.findByText("Today Person")).toBeInTheDocument();

    act(() => setOrg({ id: "org2" }));
    expect(await screen.findByText("Org B Birthday")).toBeInTheDocument();
    expect(screen.queryByText("Today Person")).toBeNull();
    expect(
      callsTo("/organisations/org2/members/birthday").length
    ).toBeGreaterThan(0);
  });
});

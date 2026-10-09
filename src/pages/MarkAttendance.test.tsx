import {
  act,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { render, confirmInDialog } from "test-utils/render";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore, { EMPTY_CURRENT_ATTENDANCE, EMPTY_ORG } from "zStore";
import MarkAttendance from "pages/MarkAttendance";
import { statusDefinition } from "test-utils/attendanceStatusFixtures";
import { ROSTER as ELIGIBILITY_ROSTER } from "test-utils/eligibilityFixtures";
import { toast } from "react-toastify";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
// Keep the real endpoint constants; only the axios instance is faked.
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPost: jest.Mock = mockedAxios.post;
const mockPut: jest.Mock = mockedAxios.put;

// Configured order is the tap-cycle order.
const STATUSES = [
  statusDefinition({
    key: "no_show",
    label: "No Show",
    shortLabel: "NS",
    color: "red",
    behavior: "absent",
    isDefault: true,
  }),
  statusDefinition({
    key: "present",
    label: "Present",
    shortLabel: "P",
    color: "green",
  }),
  statusDefinition({
    key: "late",
    label: "Late",
    shortLabel: "L",
    color: "yellow",
  }),
  statusDefinition({
    key: "excused",
    label: "Excused",
    shortLabel: "EX",
    color: "orange",
    behavior: "excused",
  }),
  statusDefinition({
    key: "remote",
    label: "Remote",
    shortLabel: "R",
    active: false,
  }),
];

const ROSTER = [
  { id: "m1", name: "Ada" },
  { id: "m2", name: "Bola" },
];

const HISTORICAL = {
  name: "Sunday Mass",
  date: "2026-09-01T00:00:00.000Z",
  organisationId: "org1",
  attendance: [
    { memberId: "m1", member: { name: "Ada" }, attendanceStatus: "remote" },
    { memberId: "m2", member: { name: "Bola" }, attendanceStatus: "late" },
  ],
};

const renderAt = (path: string) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/mark" element={<MarkAttendance />} />
          <Route path="/mark/:attendanceId" element={<MarkAttendance />} />
          <Route path="/all-attendance" element={<div>all attendance</div>} />
          <Route
            path="/create-attendance"
            element={<div>create attendance</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const rowOf = (name: string) =>
  screen.getByText(name).closest("button") as HTMLElement;
const statusOf = (name: string) =>
  within(rowOf(name)).getAllByText(/.+/).pop()?.textContent;
const tap = (name: string, times = 1) => {
  for (let i = 0; i < times; i += 1) fireEvent.click(rowOf(name));
};
const countText = (label: string) => screen.getByText(`${label}:`).textContent;

// Submit, then confirm the "Please verify count" dialog; returns its message.
const submitAndConfirm = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^(Submit|Update)$/ }));
  const dialog = await confirmInDialog(/^(Submit|Update)$/);
  return (
    within(dialog).getByText(/Are you sure you want to submit\?/).textContent ??
    ""
  );
};

describe("<MarkAttendance> with configured statuses", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: STATUSES },
      currentAttendance: { name: "Rehearsal", date: "2026-10-01", members: [] },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/members"))
        return Promise.resolve({ data: { data: ROSTER } });
      if (url.startsWith("/attendance/org1/att1")) {
        return Promise.resolve({ data: { data: HISTORICAL } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("starts every member at the configured default", async () => {
    renderAt("/mark");
    await screen.findByText("Ada");
    expect(statusOf("Ada")).toBe("No Show");
    expect(statusOf("Bola")).toBe("No Show");
    expect(countText("No Show")).toBe("No Show: 2");
    expect(countText("Present")).toBe("Present: 0");
  });

  it("steps the Submit bar aside while searching so the keyboard leaves room for results", async () => {
    renderAt("/mark");
    await screen.findByText("Ada");
    const search = screen.getByPlaceholderText("Search member");
    expect(screen.getByRole("button", { name: "Submit" })).toBeVisible();

    fireEvent.focus(search);
    expect(
      screen.queryByRole("button", { name: "Submit" }),
    ).not.toBeInTheDocument();

    fireEvent.blur(search);
    expect(screen.getByRole("button", { name: "Submit" })).toBeVisible();
  });

  it("cycles through active statuses in configured order", async () => {
    renderAt("/mark");
    await screen.findByText("Ada");
    const seen = [1, 2, 3, 4].map(() => {
      tap("Ada");
      return statusOf("Ada");
    });
    expect(seen).toEqual(["Present", "Late", "Excused", "No Show"]);
  });

  it("shows dynamic counts as members are marked", async () => {
    renderAt("/mark");
    await screen.findByText("Ada");
    tap("Ada", 2); // Late
    tap("Bola", 3); // Excused
    expect(countText("Late")).toBe("Late: 1");
    expect(countText("Excused")).toBe("Excused: 1");
    expect(countText("No Show")).toBe("No Show: 0");
  });

  it("submits memberStatuses only, with counts in the confirmation", async () => {
    renderAt("/mark");
    await screen.findByText("Ada");
    tap("Ada", 2); // Late

    const message = await submitAndConfirm();
    expect(message).toContain("Late: 1");
    expect(message).toContain("No Show: 1");

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe("/attendance");
    expect(body.memberStatuses).toEqual([
      { memberId: "m1", status: "late" },
      { memberId: "m2", status: "no_show" },
    ]);
    expect(body).toMatchObject({
      name: "Rehearsal",
      date: "2026-10-01",
      organisationId: "org1",
    });
    expect(body).not.toHaveProperty("members");
    expect(body).not.toHaveProperty("presentMembers");
    expect(body).not.toHaveProperty("apologisedMembers");
  });

  it("can submit a session with no present-behavior members", async () => {
    renderAt("/mark");
    await screen.findByText("Ada");
    tap("Ada", 3); // Excused; Bola stays No Show

    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeEnabled();
    await submitAndConfirm();
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1].memberStatuses).toEqual([
      { memberId: "m1", status: "excused" },
      { memberId: "m2", status: "no_show" },
    ]);
  });

  it("renders an inactive historical status on edit and re-enters the cycle on tap", async () => {
    renderAt("/mark/att1");
    await screen.findByText("Ada");
    expect(statusOf("Ada")).toBe("Remote");
    expect(statusOf("Bola")).toBe("Late");
    expect(countText("Remote")).toBe("Remote: 1");

    tap("Ada");
    expect(statusOf("Ada")).toBe("No Show");
    expect(screen.queryByText("Remote:")).not.toBeInTheDocument();
  });
});

describe("<MarkAttendance> quick marking", () => {
  // Present, Late, Apology, Absent (default) plus an inactive historical status.
  const QUICK_STATUSES = [
    statusDefinition({
      key: "present",
      label: "Present",
      shortLabel: "P",
      color: "green",
    }),
    statusDefinition({
      key: "late",
      label: "Late",
      shortLabel: "L",
      color: "yellow",
    }),
    statusDefinition({
      key: "apology",
      label: "Apology",
      shortLabel: "AP",
      color: "orange",
      behavior: "excused",
    }),
    statusDefinition({
      key: "absent",
      label: "Absent",
      shortLabel: "A",
      color: "red",
      behavior: "absent",
      isDefault: true,
    }),
    statusDefinition({
      key: "remote",
      label: "Remote",
      shortLabel: "R",
      active: false,
    }),
  ];
  const FIVE = [
    // Already in the roster's alphabetical display order.
    { id: "m1", name: "Ada Eze" },
    { id: "m2", name: "Ada Obi" },
    { id: "m3", name: "Bola" },
    { id: "m4", name: "Chidi" },
    { id: "m5", name: "Emeka" },
  ];
  const DRAFT_KEY = "attendance-draft-org1-2026-10-01-Rehearsal";

  const modes = () => screen.getByRole("group", { name: "Tap a member to" });
  const chooseMode = (label: string) =>
    fireEvent.click(within(modes()).getByRole("button", { name: label }));
  const search = (query: string) =>
    fireEvent.change(screen.getByPlaceholderText("Search member"), {
      target: { value: query },
    });
  const allStatuses = () => FIVE.map((m) => statusOf(m.name));
  const draftStatuses = () =>
    JSON.parse(localStorage.getItem(DRAFT_KEY) as string).map(
      (m: { id: string; attendanceStatus: string }) => [
        m.id,
        m.attendanceStatus,
      ],
    );
  const displayedStatuses = () =>
    FIVE.map((m) => [
      m.id,
      QUICK_STATUSES.find((s) => s.label === statusOf(m.name))!.key,
    ]);
  const undoButton = () =>
    screen.queryByRole("button", { name: "Undo bulk change" });

  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    mockPost.mockClear();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: QUICK_STATUSES,
      },
      currentAttendance: { name: "Rehearsal", date: "2026-10-01", members: [] },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/members"))
        return Promise.resolve({ data: { data: FIVE } });
      if (/^\/attendance\/org1\/att\d$/.test(url)) {
        return Promise.resolve({
          data: {
            data: {
              ...HISTORICAL,
              attendance: FIVE.map((m, i) => ({
                memberId: m.id,
                member: { name: m.name },
                attendanceStatus: i === 0 ? "remote" : "late",
              })),
            },
          },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  const start = async (path = "/mark") => {
    renderAt(path);
    await screen.findByText("Bola");
  };

  describe("modes", () => {
    it("defaults to Cycle", async () => {
      await start();
      expect(
        within(modes()).getByRole("button", { name: "Cycle" }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        within(modes()).getByRole("button", { name: "Present" }),
      ).toHaveAttribute("aria-pressed", "false");
    });

    it("keeps the existing next-status behavior in Cycle mode", async () => {
      await start();
      const seen = [1, 2, 3, 4].map(() => {
        tap("Bola");
        return statusOf("Bola");
      });
      expect(seen).toEqual(["Present", "Late", "Apology", "Absent"]);
    });

    it("assigns Present directly in Present mode", async () => {
      await start();
      chooseMode("Present");
      tap("Bola", 2);
      tap("Chidi");
      expect(statusOf("Bola")).toBe("Present");
      expect(statusOf("Chidi")).toBe("Present");
    });

    it("assigns Late directly in Late mode", async () => {
      await start();
      chooseMode("Late");
      tap("Bola", 3);
      expect(statusOf("Bola")).toBe("Late");
      expect(countText("Late")).toBe("Late: 1");
    });

    it("never offers an inactive status as a mode", async () => {
      await start();
      const labels = within(modes())
        .getAllByRole("button")
        .map((b) => b.textContent);
      expect(labels).toEqual(["Cycle", "Present", "Late", "Apology", "Absent"]);
    });
  });

  describe("bulk visible", () => {
    it("applies the selected status only to the searched members and persists the same roster", async () => {
      await start();
      expect(
        screen.queryByRole("button", { name: /^Apply/ }),
      ).not.toBeInTheDocument();
      chooseMode("Present");
      search("Ada");

      fireEvent.click(
        screen.getByRole("button", { name: "Apply Present to 2 visible" }),
      );

      expect(statusOf("Ada Eze")).toBe("Present");
      expect(statusOf("Ada Obi")).toBe("Present");
      expect(countText("Present")).toBe("Present: 2");
      expect(countText("Absent")).toBe("Absent: 3");

      search("");
      expect(allStatuses()).toEqual([
        "Present",
        "Present",
        "Absent",
        "Absent",
        "Absent",
      ]);
      expect(draftStatuses()).toEqual(displayedStatuses());
    });

    it("resets only the visible members to the default", async () => {
      await start();
      chooseMode("Late");
      FIVE.forEach((m) => tap(m.name));
      search("Ada");

      fireEvent.click(
        screen.getByRole("button", { name: "Reset 2 visible to Absent" }),
      );
      search("");

      expect(allStatuses()).toEqual([
        "Absent",
        "Absent",
        "Late",
        "Late",
        "Late",
      ]);
      expect(draftStatuses()).toEqual(displayedStatuses());
    });

    it("resets in Cycle mode too", async () => {
      await start();
      tap("Bola");
      fireEvent.click(
        screen.getByRole("button", { name: "Reset 5 visible to Absent" }),
      );
      expect(statusOf("Bola")).toBe("Absent");
    });
  });

  describe("undo", () => {
    it("restores the captured statuses and the draft, then disappears", async () => {
      await start();
      tap("Ada Eze", 2); // Late
      expect(undoButton()).not.toBeInTheDocument();
      chooseMode("Present");
      search("Ada");
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Present to 2 visible" }),
      );

      fireEvent.click(undoButton() as HTMLElement);
      search("");

      expect(allStatuses()).toEqual([
        "Late",
        "Absent",
        "Absent",
        "Absent",
        "Absent",
      ]);
      expect(draftStatuses()).toEqual(displayedStatuses());
      expect(undoButton()).not.toBeInTheDocument();
    });

    it("only undoes the most recent bulk change", async () => {
      await start();
      chooseMode("Present");
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Present to 5 visible" }),
      );
      chooseMode("Late");
      search("Ada");
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Late to 2 visible" }),
      );

      fireEvent.click(undoButton() as HTMLElement);
      search("");

      expect(allStatuses()).toEqual([
        "Present",
        "Present",
        "Present",
        "Present",
        "Present",
      ]);
    });

    it("is cleared by a manual single tap", async () => {
      await start();
      fireEvent.click(
        screen.getByRole("button", { name: "Reset 5 visible to Absent" }),
      );
      expect(undoButton()).toBeInTheDocument();
      tap("Bola");
      expect(undoButton()).not.toBeInTheDocument();
    });

    it("survives a roster refetch (e.g. the app regaining focus)", async () => {
      await start();
      chooseMode("Present");
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Present to 5 visible" }),
      );

      await act(() =>
        queryClient.refetchQueries({ queryKey: queryKeys.members("org1") }),
      );

      fireEvent.click(undoButton() as HTMLElement);
      expect(allStatuses()).toEqual([
        "Absent",
        "Absent",
        "Absent",
        "Absent",
        "Absent",
      ]);
    });

    it("is cleared when a different session is opened", async () => {
      const OpenOtherSession = () => {
        const navigate = useNavigate();
        return (
          <button onClick={() => navigate("/mark/att2")}>open other</button>
        );
      };
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/mark/att1"]}>
            <OpenOtherSession />
            <Routes>
              <Route path="/mark/:attendanceId" element={<MarkAttendance />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await screen.findByText("Bola");
      fireEvent.click(
        screen.getByRole("button", { name: "Reset 5 visible to Absent" }),
      );
      expect(undoButton()).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "open other" }));

      await waitFor(() =>
        expect(mockGet).toHaveBeenCalledWith("/attendance/org1/att2"),
      );
      expect(undoButton()).not.toBeInTheDocument();
    });

    it("and the quick-mark mode are reset by an organisation switch", async () => {
      await start();
      chooseMode("Present");
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Present to 5 visible" }),
      );
      expect(undoButton()).toBeInTheDocument();

      act(() => {
        useGlobalStore.setState({
          organisation: {
            ...EMPTY_ORG,
            id: "org2",
            attendanceStatuses: QUICK_STATUSES,
          },
        });
      });
      await screen.findByText("Bola");

      expect(undoButton()).not.toBeInTheDocument();
      expect(
        within(modes()).getByRole("button", { name: "Cycle" }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("historical inactive statuses", () => {
    it("renders unchanged on open and can be replaced intentionally by quick-mark", async () => {
      await start("/mark/att1");
      expect(statusOf("Ada Eze")).toBe("Remote");
      chooseMode("Present");
      tap("Ada Eze");
      expect(statusOf("Ada Eze")).toBe("Present");
    });

    it("is restored by Undo after a bulk replace", async () => {
      await start("/mark/att1");
      fireEvent.click(
        screen.getByRole("button", { name: "Reset 5 visible to Absent" }),
      );
      expect(statusOf("Ada Eze")).toBe("Absent");

      fireEvent.click(undoButton() as HTMLElement);

      expect(statusOf("Ada Eze")).toBe("Remote");
      expect(countText("Remote")).toBe("Remote: 1");
      // An edit keeps its roster in memory: it has no persisted draft.
      expect(localStorage.getItem("attendance-draft-org1-att1")).toBeNull();
    });
  });

  it("submits exactly the allowlisted payload after bulk marking", async () => {
    await start();
    chooseMode("Present");
    search("Ada");
    fireEvent.click(
      screen.getByRole("button", { name: "Apply Present to 2 visible" }),
    );
    search("");

    const message = await submitAndConfirm();
    expect(message).toContain("Present: 2");
    expect(message).toContain("Absent: 3");

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    expect(mockPost.mock.calls[0][1]).toEqual({
      name: "Rehearsal",
      date: "2026-10-01",
      organisationId: "org1",
      eligibilityRules: [],
      memberStatuses: [
        { memberId: "m1", status: "present" },
        { memberId: "m2", status: "present" },
        { memberId: "m3", status: "absent" },
        { memberId: "m4", status: "absent" },
        { memberId: "m5", status: "absent" },
      ],
    });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});

describe("<MarkAttendance> eligibility", () => {
  const STATUSES_5 = [
    statusDefinition({
      key: "present",
      label: "Present",
      shortLabel: "P",
      color: "green",
    }),
    statusDefinition({
      key: "late",
      label: "Late",
      shortLabel: "L",
      color: "yellow",
    }),
    statusDefinition({
      key: "absent",
      label: "Absent",
      shortLabel: "A",
      color: "red",
      behavior: "absent",
      isDefault: true,
    }),
    statusDefinition({
      key: "remote",
      label: "Remote",
      shortLabel: "R",
      active: false,
    }),
  ];
  const SOP_ALTO_ACTIVE = [
    { field: "part", values: ["soprano", "alto"] },
    { field: "status", values: ["active"] },
  ];
  const DRAFT_KEY = "attendance-draft-org1-2026-10-01-Sectional";
  let roster: Array<Record<string, string | undefined>>;

  const draftIds = () =>
    JSON.parse(localStorage.getItem(DRAFT_KEY) as string).map(
      (m: { id: string }) => m.id,
    );
  const rowNames = () =>
    ELIGIBILITY_ROSTER.map((m) => m.name).filter((name) =>
      screen.queryByText(name),
    );
  const refetchRoster = () =>
    act(() =>
      queryClient.refetchQueries({ queryKey: queryKeys.members("org1") }),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    roster = ELIGIBILITY_ROSTER.map((m) => ({ ...m }));
    useGlobalStore.setState({
      // Stored rosters stay authoritative even after the organisation turns
      // eligibility off; the setting only shapes Create Attendance.
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: STATUSES_5,
        attendanceEligibilityEnabled: false,
      },
      currentAttendance: {
        name: "Sectional",
        date: "2026-10-01",
        eligibilityRules: SOP_ALTO_ACTIVE,
      },
    });
    mockGet.mockImplementation((url: string) => {
      // A fresh copy per request, as the API would return.
      if (url.includes("/members")) {
        return Promise.resolve({
          data: { data: roster.map((m) => ({ ...m })) },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  describe("new session", () => {
    const start = async () => {
      renderAt("/mark");
      await screen.findByText("Ada");
    };

    it("renders only the expected members and summarises the rules", async () => {
      await start();
      expect(rowNames()).toEqual(["Ada", "Chioma"]);
      expect(
        screen.getByText("Expected roster: 2 members"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Part: Soprano, Alto · Status: Active"),
      ).toBeInTheDocument();
      expect(draftIds()).toEqual(["m1", "m3"]);
    });

    it("filters unavailable members and submits only the available roster", async () => {
      roster = [
        { id: "m1", name: "Ada" },
        { id: "m2", name: "Bea" },
      ];
      useGlobalStore.setState({
        currentAttendance: {
          name: "Sectional",
          date: "2026-10-01",
          eligibilityRules: [],
        },
      });
      mockGet.mockImplementation((url: string) => {
        if (url.includes("/members")) {
          return Promise.resolve({ data: { data: roster } });
        }
        return Promise.resolve({
          data: {
            data: [
              {
                memberId: "m1",
                startDate: "2026-10-01",
                endDate: "2026-10-01",
              },
            ],
          },
        });
      });

      renderAt("/mark");
      await screen.findByText("Bea");
      expect(screen.queryByText("Ada")).not.toBeInTheDocument();
      tap("Bea");
      await submitAndConfirm();
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      expect(mockPost.mock.calls[0][1].memberStatuses).toEqual([
        { memberId: "m2", status: "present" },
      ]);
    });

    it("does not expose a stale roster during refresh and reconciles fresh availability", async () => {
      roster = [
        { id: "m1", name: "Ada" },
        { id: "m2", name: "Bea" },
      ];
      useGlobalStore.setState({
        currentAttendance: {
          name: "Sectional",
          date: "2026-10-01",
          eligibilityRules: [],
        },
      });
      let refreshPending = false;
      let resolveRefresh!: (value: unknown) => void;
      const refreshAvailability = new Promise((resolve) => {
        resolveRefresh = resolve;
      });
      mockGet.mockImplementation((url: string) => {
        if (url.includes("/members"))
          return Promise.resolve({ data: { data: roster } });
        return refreshPending
          ? refreshAvailability
          : Promise.resolve({ data: { data: [] } });
      });

      renderAt("/mark");
      await screen.findByText("Ada");
      tap("Bea");
      refreshPending = true;
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await screen.findByText(/Checking attendance availability/);
      expect(screen.queryByText("Ada")).not.toBeInTheDocument();
      expect(screen.queryByText("Bea")).not.toBeInTheDocument();

      resolveRefresh({
        data: {
          data: [
            {
              memberId: "m1",
              startDate: "2026-10-01",
              endDate: "2026-10-01",
            },
          ],
        },
      });
      await screen.findByText("Bea");
      expect(screen.queryByText("Ada")).not.toBeInTheDocument();
      expect(statusOf("Bea")).toBe("Present");
      await submitAndConfirm();
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      expect(mockPost.mock.calls[0][1].memberStatuses).toEqual([
        { memberId: "m2", status: "present" },
      ]);
    });

    it("keeps the roster unavailable when availability refresh fails", async () => {
      roster = [
        { id: "m1", name: "Ada" },
        { id: "m2", name: "Bea" },
      ];
      useGlobalStore.setState({
        currentAttendance: {
          name: "Sectional",
          date: "2026-10-01",
          eligibilityRules: [],
        },
      });
      let refreshPending = false;
      let rejectRefresh!: (error: Error) => void;
      const refreshAvailability = new Promise((_, reject) => {
        rejectRefresh = reject;
      });
      refreshAvailability.catch(() => undefined);
      mockGet.mockImplementation((url: string) => {
        if (url.includes("/members"))
          return Promise.resolve({ data: { data: roster } });
        return refreshPending
          ? refreshAvailability
          : Promise.resolve({ data: { data: [] } });
      });
      jest.spyOn(console, "error").mockImplementation(() => undefined);

      renderAt("/mark");
      await screen.findByText("Ada");
      refreshPending = true;
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await screen.findByText(/Checking attendance availability/);
      rejectRefresh(new Error("availability offline"));
      await screen.findByText(/Attendance availability could not be loaded/);
      expect(screen.queryByText("Ada")).not.toBeInTheDocument();
      expect(screen.queryByText("Bea")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Submit" }),
      ).not.toBeInTheDocument();
      (console.error as jest.Mock).mockRestore();
    });

    it("limits bulk actions to the expected roster", async () => {
      await start();
      fireEvent.click(
        within(
          screen.getByRole("group", { name: "Tap a member to" }),
        ).getByRole("button", {
          name: "Present",
        }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Present to 2 visible" }),
      );
      expect(statusOf("Ada")).toBe("Present");
      expect(statusOf("Chioma")).toBe("Present");
      expect(countText("Present")).toBe("Present: 2");
      expect(countText("Absent")).toBe("Absent: 0");
    });

    it("adds a newly matching member at the default and keeps existing marks after a refetch", async () => {
      await start();
      tap("Ada"); // Present
      roster.push({ id: "m9", name: "Ife", part: "alto", status: "active" });

      await refetchRoster();

      await screen.findByText("Ife");
      expect(statusOf("Ife")).toBe("Absent");
      expect(statusOf("Ada")).toBe("Present");
      expect(draftIds()).toEqual(["m1", "m3", "m9"]);
    });

    it("drops a member who stops matching before submit", async () => {
      await start();
      roster.find((m) => m.id === "m3")!.status = "inactive";

      await refetchRoster();

      await waitFor(() =>
        expect(screen.queryByText("Chioma")).not.toBeInTheDocument(),
      );
      expect(draftIds()).toEqual(["m1"]);
    });

    it("creates with the rules and only the expected members' statuses", async () => {
      await start();
      tap("Chioma"); // Present
      await submitAndConfirm();

      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      expect(mockPost.mock.calls[0]).toEqual([
        "/attendance",
        {
          name: "Sectional",
          date: "2026-10-01",
          organisationId: "org1",
          eligibilityRules: SOP_ALTO_ACTIVE,
          memberStatuses: [
            { memberId: "m1", status: "absent" },
            { memberId: "m3", status: "present" },
          ],
        },
      ]);
    });

    it("drops a member outside the rules from an existing draft on first load", async () => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify([
          { id: "m1", name: "Ada", attendanceStatus: "late" },
          { id: "m5", name: "Emeka", attendanceStatus: "present" },
        ]),
      );
      await start();
      expect(rowNames()).toEqual(["Ada", "Chioma"]);
      expect(statusOf("Ada")).toBe("Late");
      expect(draftIds()).toEqual(["m1", "m3"]);
    });

    it("shows an error instead of an empty roster when members fail to load", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      mockGet.mockImplementation(() => Promise.reject(new Error("offline")));
      renderAt("/mark");
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(
        "Attendance availability could not be loaded",
      );
      expect(screen.queryByText(/Expected roster/)).not.toBeInTheDocument();
      (console.error as jest.Mock).mockRestore();
    });

    it("retries a failed roster load in place and keeps the new session", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const working = mockGet.getMockImplementation();
      mockGet.mockImplementation(() => Promise.reject(new Error("offline")));
      renderAt("/mark");
      const alert = await screen.findByRole("alert");

      mockGet.mockImplementation(working as (url: string) => Promise<unknown>);
      fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Ada")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      (console.error as jest.Mock).mockRestore();
    });

    it("keeps the draft and shows the backend error when the roster changed", async () => {
      // React Query logs the rejected mutation; the rejection is the scenario.
      const silence = jest
        .spyOn(console, "error")
        .mockImplementation(() => undefined);
      mockPost.mockImplementation(() =>
        Promise.reject({
          response: {
            status: 422,
            data: {
              error: "The expected roster has changed. Refresh to reload it.",
            },
          },
        }),
      );
      await start();
      tap("Ada");
      await submitAndConfirm();

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "The expected roster has changed. Refresh to reload it.",
        ),
      );
      expect(draftIds()).toEqual(["m1", "m3"]);
      expect(statusOf("Ada")).toBe("Present");

      // Refresh reloads the roster but keeps the marks already made.
      roster.find((m) => m.id === "m3")!.status = "inactive";
      roster.push({ id: "m9", name: "Ife", part: "soprano", status: "active" });
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

      await screen.findByText("Ife");
      expect(rowNames()).toEqual(["Ada"]);
      expect(statusOf("Ada")).toBe("Present");
      expect(statusOf("Ife")).toBe("Absent");
      expect(draftIds()).toEqual(["m1", "m9"]);
      silence.mockRestore();
    });
  });

  describe("existing session", () => {
    // Stored roster: Ada (now inactive in her profile), Bisi (never matched),
    // and Dayo with an inactive historical status. Chioma now matches but was
    // not on the roster; a brand-new matching member exists too.
    const RECORD = {
      name: "Old Sectional",
      date: "2026-09-01T00:00:00.000Z",
      organisationId: "org1",
      eligibilityRules: SOP_ALTO_ACTIVE,
      attendance: [
        {
          memberId: "m1",
          member: { name: "Ada" },
          attendanceStatus: "present",
        },
        {
          memberId: "m2",
          member: { name: "Bisi" },
          attendanceStatus: "absent",
        },
        {
          memberId: "m4",
          member: { name: "Dayo" },
          attendanceStatus: "remote",
        },
      ],
    };

    beforeEach(() => {
      roster.find((m) => m.id === "m1")!.status = "inactive";
      roster.push({ id: "m9", name: "Ife", part: "alto", status: "active" });
      mockGet.mockImplementation((url: string) => {
        if (url === "/attendance/org1/att9")
          return Promise.resolve({ data: { data: RECORD } });
        // A fresh copy per request, as the API would return.
        if (url.includes("/members")) {
          return Promise.resolve({
            data: { data: roster.map((m) => ({ ...m })) },
          });
        }
        return Promise.resolve({ data: { data: [] } });
      });
      mockPut.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
    });

    const open = async () => {
      renderAt("/mark/att9");
      await screen.findByText("Ada");
    };

    it("explains a stored session that failed to load and retries without touching the draft", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const working = mockGet.getMockImplementation() as (
        url: string,
      ) => Promise<unknown>;
      mockGet.mockImplementation((url: string) =>
        url === "/attendance/org1/att9"
          ? Promise.reject({
              response: { status: 500, data: { error: "Server busy" } },
            })
          : working(url),
      );
      renderAt("/mark/att9");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Couldn't load this attendance");
      // No empty roster and no Update button while nothing is loaded.
      expect(screen.queryByText(/Expected roster/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Update" }),
      ).not.toBeInTheDocument();

      mockGet.mockImplementation(working);
      fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Ada")).toBeInTheDocument();
      expect(rowNames()).toEqual(["Ada", "Bisi", "Dayo"]);
      (console.error as jest.Mock).mockRestore();
    });

    it("titles the page with the session name and its date, without a member prefix", async () => {
      await open();
      expect(
        screen.getByRole("heading", { name: "Old Sectional" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Tue 01 Sep 26")).toBeInTheDocument();
    });

    it("loads the stored roster unchanged, never re-filtering or adding members", async () => {
      await open();
      expect(rowNames()).toEqual(["Ada", "Bisi", "Dayo"]);
      expect(screen.queryByText("Ife")).not.toBeInTheDocument();
      expect(
        screen.getByText("Expected roster: 3 members"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Part: Soprano, Alto · Status: Active"),
      ).toBeInTheDocument();
      expect(mockGet.mock.calls.some(([url]) => url.includes("/members"))).toBe(
        false,
      );
    });

    it("keeps inactive statuses and bulk Undo working on the stored roster", async () => {
      await open();
      expect(statusOf("Dayo")).toBe("Remote");
      fireEvent.click(
        screen.getByRole("button", { name: "Reset 3 visible to Absent" }),
      );
      expect(statusOf("Dayo")).toBe("Absent");
      fireEvent.click(screen.getByRole("button", { name: "Undo bulk change" }));
      expect(statusOf("Dayo")).toBe("Remote");
    });

    it("updates without eligibility rules", async () => {
      await open();
      await submitAndConfirm();
      await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
      expect(mockPut.mock.calls[0]).toEqual([
        "/attendance/att9",
        {
          name: "Old Sectional",
          date: "2026-09-01T00:00:00.000Z",
          organisationId: "org1",
          memberStatuses: [
            { memberId: "m1", status: "present" },
            { memberId: "m2", status: "absent" },
            { memberId: "m4", status: "remote" },
          ],
        },
      ]);
    });
  });
});

describe("<MarkAttendance> editing a roster with an unresolvable member", () => {
  const STATUSES_3 = [
    statusDefinition({
      key: "present",
      label: "Present",
      shortLabel: "P",
      color: "green",
    }),
    statusDefinition({
      key: "late",
      label: "Late",
      shortLabel: "L",
      color: "yellow",
    }),
    statusDefinition({
      key: "absent",
      label: "Absent",
      shortLabel: "A",
      color: "red",
      behavior: "absent",
      isDefault: true,
    }),
  ];
  const RECORD = {
    name: "Small Sectional",
    date: "2026-09-01T00:00:00.000Z",
    organisationId: "org1",
    eligibilityRules: [],
    attendance: [
      { memberId: "m1", member: { name: "Ada" }, attendanceStatus: "absent" },
      { memberId: "m2", member: null, attendanceStatus: "late" },
      {
        memberId: "m3",
        member: { name: "Chioma" },
        attendanceStatus: "absent",
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: STATUSES_3,
      },
      currentAttendance: { name: "", date: "" },
    });
    mockGet.mockImplementation((url: string) => {
      if (url === "/attendance/org1/att3")
        return Promise.resolve({ data: { data: RECORD } });
      // A newly joined member exists in the current roster.
      return Promise.resolve({
        data: { data: [{ id: "m9", name: "Newbie" }] },
      });
    });
    mockPut.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("keeps the deleted member on the roster read-only and submits only resolvable members", async () => {
    renderAt("/mark/att3");
    await screen.findByText("Ada");

    expect(screen.getByText("Expected roster: 3 members")).toBeInTheDocument();
    const placeholder = screen.getByText("Former member (profile unavailable)");
    expect(placeholder.closest("button")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Reset 2 visible to Absent" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Newbie")).not.toBeInTheDocument();

    tap("Chioma"); // Absent -> Present
    await submitAndConfirm();

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    expect(mockPut.mock.calls[0][1].memberStatuses).toEqual([
      { memberId: "m1", status: "absent" },
      { memberId: "m3", status: "present" },
    ]);
    expect(mockGet.mock.calls.some(([url]) => url.includes("/members"))).toBe(
      false,
    );
  });
});

const SCHOOL_TERMS = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  attendanceSingular: "Session",
  attendancePlural: "Sessions",
};

describe("<MarkAttendance> with custom terminology", () => {
  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: STATUSES,
        terminology: SCHOOL_TERMS,
      },
      currentAttendance: { name: "Rehearsal", date: "2026-10-01", members: [] },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/members"))
        return Promise.resolve({ data: { data: ROSTER } });
      if (url.startsWith("/attendance/org1/att1")) {
        return Promise.resolve({ data: { data: HISTORICAL } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
    mockPut.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("names the member term while the roster loads", async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    renderAt("/mark");
    expect(
      await screen.findByText("Checking session availability..."),
    ).toBeInTheDocument();
  });

  it("names the member term when the roster could not be loaded", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockGet.mockImplementation(() => Promise.reject(new Error("offline")));
    renderAt("/mark");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Session availability could not be loaded",
    );
    (console.error as jest.Mock).mockRestore();
  });

  it("uses the session term in created success copy", async () => {
    renderAt("/mark");
    await screen.findByText("Ada");
    await submitAndConfirm();
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Session Created successfully",
      ),
    );
  });

  it("uses the session term in updated success copy", async () => {
    renderAt("/mark/att1");
    await screen.findByText("Ada");
    await submitAndConfirm();
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Session Updated"),
    );
  });
});

describe("<MarkAttendance> manual per-session additions", () => {
  // no_show (default, absent), present, late, excused, remote (inactive).
  const MEMBERS = [
    { id: "m1", name: "Ada", part: "soprano" },
    { id: "m2", name: "Bola", part: "soprano" },
    { id: "m3", name: "Chidi", part: "tenor" },
    { id: "m4", name: "Dayo", part: "soprano" },
  ];
  const SOPRANOS = [{ field: "part", values: ["soprano"] }];
  const DRAFT_KEY = "attendance-draft-org1-2026-10-01-Rehearsal";
  const MANUAL_KEY = "attendance-manual-draft-org1-2026-10-01-Rehearsal";
  let unavailable: string[];

  const leave = (memberId: string) => ({
    memberId,
    startDate: "2026-09-25",
    endDate: "2026-10-05",
  });
  const dialog = () => within(screen.getByRole("dialog"));
  // A manual row is rendered as a non-tappable div while a non-present
  // quick-mark mode is selected, so rows are found by class, not by role.
  const rowEl = (name: string) =>
    screen.getByText(name).closest(".chakra-button") as HTMLElement;
  const tapRow = (name: string) => fireEvent.click(rowEl(name));
  const manualBadgeOn = (name: string) =>
    within(rowEl(name)).queryByText("Added manually");
  const statusOfRow = (name: string) =>
    within(rowEl(name)).getAllByText(/.+/)[1].textContent;
  const addManually = async (name: string, status: string, reason = "") => {
    fireEvent.click(
      screen.getByRole("button", { name: "Add member to this attendance" }),
    );
    await screen.findByRole("dialog");
    fireEvent.change(dialog().getByLabelText(/^Member/), {
      target: { value: name.slice(0, 3) },
    });
    fireEvent.click(await screen.findByText(name));
    fireEvent.change(dialog().getByLabelText(/^Attendance status/), {
      target: { value: status },
    });
    if (reason) {
      fireEvent.change(dialog().getByLabelText("Reason (optional)"), {
        target: { value: reason },
      });
    }
    fireEvent.click(dialog().getByRole("button", { name: "Add member" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    unavailable = ["m4"];
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: STATUSES },
      currentAttendance: {
        name: "Rehearsal",
        date: "2026-10-01",
        eligibilityRules: SOPRANOS,
      },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/availability")) {
        return Promise.resolve({ data: { data: unavailable.map(leave) } });
      }
      if (url.includes("/members")) {
        return Promise.resolve({
          data: { data: MEMBERS.map((m) => ({ ...m })) },
        });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
    mockPut.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  describe("new session", () => {
    const start = async () => {
      renderAt("/mark");
      await screen.findByText("Ada");
    };

    it("adds an unavailable or non-eligible member to the draft, counted apart from the expected roster", async () => {
      await start();
      expect(screen.queryByText("Dayo")).not.toBeInTheDocument();
      expect(
        screen.getByText("Expected roster: 2 members"),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Added manually/)).not.toBeInTheDocument();

      await addManually("Dayo", "late"); // on leave
      await addManually("Chidi", "present"); // fails the session's rules

      expect(manualBadgeOn("Dayo")).toBeInTheDocument();
      expect(manualBadgeOn("Chidi")).toBeInTheDocument();
      expect(manualBadgeOn("Ada")).toBeNull();
      expect(statusOfRow("Dayo")).toBe("Late");
      expect(
        screen.getByText("Expected roster: 2 members"),
      ).toBeInTheDocument();
      expect(screen.getByText("Added manually: 2")).toBeInTheDocument();
      expect(screen.getByText("Session roster: 4")).toBeInTheDocument();
    });

    it("offers only off-roster candidates and present-behavior statuses", async () => {
      await start();
      fireEvent.click(
        screen.getByRole("button", { name: "Add member to this attendance" }),
      );
      await screen.findByRole("dialog");
      expect(
        within(dialog().getByLabelText(/^Attendance status/))
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["Choose a status", "Present", "Late"]);
      fireEvent.keyDown(dialog().getByLabelText(/^Member/), {
        key: "ArrowDown",
      });
      await screen.findByText("Dayo");
      const menu = document.querySelector(
        ".manual-member__menu",
      ) as HTMLElement;
      expect(within(menu).queryByText("Ada")).toBeNull();
      expect(within(menu).getByText("Chidi")).toBeInTheDocument();
    });

    it("submits manual additions separately from memberStatuses", async () => {
      await start();
      await addManually("Dayo", "late", "  Came despite leave  ");
      await submitAndConfirm();

      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      const body = mockPost.mock.calls[0][1];
      expect(body.memberStatuses).toEqual([
        { memberId: "m1", status: "no_show" },
        { memberId: "m2", status: "no_show" },
      ]);
      expect(body.manualAdditions).toEqual([
        { memberId: "m4", status: "late", reason: "Came despite leave" },
      ]);
      expect(Object.keys(body.manualAdditions[0]).sort()).toEqual([
        "memberId",
        "reason",
        "status",
      ]);
    });

    it("omits manualAdditions when none were added", async () => {
      await start();
      await submitAndConfirm();
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      expect(mockPost.mock.calls[0][1]).not.toHaveProperty("manualAdditions");
    });

    it("cycles a manual row through present statuses only", async () => {
      await start();
      await addManually("Dayo", "present");
      tapRow("Dayo");
      expect(statusOfRow("Dayo")).toBe("Late");
      tapRow("Dayo");
      expect(statusOfRow("Dayo")).toBe("Present");
      // An ordinary row still cycles through every active status.
      tapRow("Ada");
      expect(statusOfRow("Ada")).toBe("Present");
    });

    it("never lets a non-present quick mark or Reset touch a manual row", async () => {
      await start();
      await addManually("Dayo", "late");
      fireEvent.click(screen.getByRole("button", { name: "Excused" }));
      expect(rowEl("Dayo").tagName).toBe("DIV");
      tapRow("Dayo");
      expect(statusOfRow("Dayo")).toBe("Late");
      expect(
        screen.getByText(
          "Members added manually can only be marked with a present status, so tapping them does nothing in this mode. Bulk actions to other statuses skip them.",
        ),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Apply Excused to 2 visible" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "Reset 2 visible to No Show" }),
      );
      expect(statusOfRow("Dayo")).toBe("Late");

      // A present-behavior bulk status does reach the manual row.
      fireEvent.click(screen.getByRole("button", { name: "Present" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Present to 3 visible" }),
      );
      expect(statusOfRow("Dayo")).toBe("Present");
      fireEvent.click(screen.getByRole("button", { name: "Undo bulk change" }));
      expect(statusOfRow("Dayo")).toBe("Late");
    });

    it("removes a manual addition from the draft", async () => {
      await start();
      await addManually("Dayo", "late");
      fireEvent.click(
        screen.getByRole("button", {
          name: "Remove Dayo from this attendance",
        }),
      );
      expect(screen.queryByText("Dayo")).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem(MANUAL_KEY) as string)).toEqual(
        [],
      );
      expect(
        screen.queryByRole("button", { name: /Remove (Ada|Bola)/ }),
      ).not.toBeInTheDocument();
    });

    it("persists manual additions in their own draft and restores them", async () => {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify([
          { id: "m1", name: "Ada", attendanceStatus: "present" },
        ]),
      );
      const { unmount } = renderAt("/mark");
      await screen.findByText("Ada");
      await addManually("Dayo", "late", "Leave ended early");
      expect(JSON.parse(localStorage.getItem(MANUAL_KEY) as string)).toEqual([
        {
          id: "m4",
          name: "Dayo",
          attendanceStatus: "late",
          reason: "Leave ended early",
        },
      ]);
      // The expected draft never gains the manual member.
      expect(
        JSON.parse(localStorage.getItem(DRAFT_KEY) as string).map(
          (m: { id: string }) => m.id,
        ),
      ).toEqual(["m1", "m2"]);
      unmount();

      renderAt("/mark");
      await screen.findByText("Dayo");
      expect(manualBadgeOn("Dayo")).toBeInTheDocument();
      expect(statusOfRow("Dayo")).toBe("Late");
      expect(statusOfRow("Ada")).toBe("Present");
      expect(
        screen.getByText("Expected roster: 2 members"),
      ).toBeInTheDocument();
    });

    it("moves a manual member who becomes expected onto the expected roster, keeping their status", async () => {
      await start();
      await addManually("Dayo", "late");
      unavailable = [];
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      expect(
        await screen.findByText("Expected roster: 3 members"),
      ).toBeInTheDocument();
      expect(manualBadgeOn("Dayo")).toBeNull();
      expect(statusOfRow("Dayo")).toBe("Late");
      expect(screen.queryByText(/Added manually/)).not.toBeInTheDocument();

      await submitAndConfirm();
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      const body = mockPost.mock.calls[0][1];
      expect(body.memberStatuses).toContainEqual({
        memberId: "m4",
        status: "late",
      });
      expect(body).not.toHaveProperty("manualAdditions");
    });

    it("allows 0 expected + 1 manual, but never an empty session", async () => {
      unavailable = ["m1", "m2", "m4"];
      renderAt("/mark");
      await screen.findByText("Expected roster: 0 members");
      expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

      await addManually("Ada", "present");
      expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
      await submitAndConfirm();
      await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
      expect(mockPost.mock.calls[0][1]).toMatchObject({
        memberStatuses: [],
        manualAdditions: [{ memberId: "m1", status: "present" }],
      });
    });

    it("clears the metadata, both drafts and the working state after a successful create", async () => {
      // An unfinished draft for this same session, as Create Attendance saves.
      localStorage.setItem(
        "attendance-new-draft-org1",
        JSON.stringify({
          version: 1,
          organisationId: "org1",
          name: "Rehearsal",
          date: "2026-10-01",
          categoryId: null,
          subCategoryId: null,
          eligibilityRules: SOPRANOS,
        }),
      );
      await start();
      await addManually("Dayo", "late");
      await submitAndConfirm();
      await screen.findByText("all attendance");
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
      expect(localStorage.getItem(MANUAL_KEY)).toBeNull();
      expect(localStorage.getItem("attendance-new-draft-org1")).toBeNull();
      expect(useGlobalStore.getState().currentAttendance).toEqual(
        EMPTY_CURRENT_ATTENDANCE,
      );
    });
  });

  describe("editing a stored session", () => {
    const RECORD = {
      name: "Rehearsal",
      date: "2026-09-01T00:00:00.000Z",
      organisationId: "org1",
      eligibilityRules: SOPRANOS,
      attendance: [
        {
          memberId: "m1",
          member: { name: "Ada" },
          attendanceStatus: "no_show",
          manuallyAdded: false,
        },
        {
          memberId: "m2",
          member: { name: "Bola" },
          attendanceStatus: "present",
        },
        {
          memberId: "m3",
          member: { name: "Chidi" },
          attendanceStatus: "late",
          manuallyAdded: true,
          manualAdditionReason: "Sang with the sopranos",
          manuallyAddedAt: "2026-09-01T10:00:00.000Z",
          manuallyAddedBy: "user-1",
        },
      ],
    };

    const start = async () => {
      mockGet.mockImplementation((url: string) =>
        Promise.resolve({
          data: { data: url === "/attendance/org1/att5" ? RECORD : [] },
        }),
      );
      renderAt("/mark/att5");
      await screen.findByText("Chidi");
    };

    it("keeps manual provenance and counts on load, without re-running rules", async () => {
      await start();
      expect(manualBadgeOn("Chidi")).toBeInTheDocument();
      expect(manualBadgeOn("Ada")).toBeNull();
      expect(
        screen.getByText("Expected roster: 2 members"),
      ).toBeInTheDocument();
      expect(screen.getByText("Added manually: 1")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Add member/ }),
      ).not.toBeInTheDocument();
      expect(mockGet.mock.calls.some(([url]) => url.includes("/members"))).toBe(
        false,
      );
    });

    it("moves a manual row between present statuses but never to Excused or No Show", async () => {
      await start();
      tapRow("Chidi");
      expect(statusOfRow("Chidi")).toBe("Present");
      tapRow("Chidi");
      expect(statusOfRow("Chidi")).toBe("Late");

      fireEvent.click(screen.getByRole("button", { name: "Excused" }));
      tapRow("Chidi");
      expect(statusOfRow("Chidi")).toBe("Late");
      fireEvent.click(screen.getByRole("button", { name: "No Show" }));
      tapRow("Chidi");
      expect(statusOfRow("Chidi")).toBe("Late");
      // Ordinary rows keep quick-mark behaviour.
      tapRow("Bola");
      expect(statusOfRow("Bola")).toBe("No Show");
    });

    it("skips manual rows in Reset and non-present bulk actions", async () => {
      await start();
      fireEvent.click(
        screen.getByRole("button", { name: "Reset 2 visible to No Show" }),
      );
      expect(statusOfRow("Chidi")).toBe("Late");
      expect(statusOfRow("Bola")).toBe("No Show");
      fireEvent.click(screen.getByRole("button", { name: "Excused" }));
      fireEvent.click(
        screen.getByRole("button", { name: "Apply Excused to 2 visible" }),
      );
      expect(statusOfRow("Chidi")).toBe("Late");
    });

    it("updates with statuses only, never manual metadata", async () => {
      await start();
      tapRow("Chidi"); // Late -> Present
      await submitAndConfirm();
      await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));
      const body = mockPut.mock.calls[0][1];
      expect(body.memberStatuses).toEqual([
        { memberId: "m1", status: "no_show" },
        { memberId: "m2", status: "present" },
        { memberId: "m3", status: "present" },
      ]);
      expect(JSON.stringify(body)).not.toMatch(
        /manuallyAdded|manualAdditionReason|manualAdditions|editCount|eligibilityRules/,
      );
    });
  });
});

describe("<MarkAttendance> resuming an unfinished new-session draft", () => {
  // Configured cycle order: Present -> Late -> Absent (default).
  const STATUSES_3 = [
    statusDefinition({
      key: "present",
      label: "Present",
      shortLabel: "P",
      color: "green",
    }),
    statusDefinition({
      key: "late",
      label: "Late",
      shortLabel: "L",
      color: "yellow",
    }),
    statusDefinition({
      key: "absent",
      label: "Absent",
      shortLabel: "A",
      color: "red",
      behavior: "absent",
      isDefault: true,
    }),
  ];
  const MEMBERS = [
    { id: "m1", name: "Ada" },
    { id: "m2", name: "Bola" },
    { id: "m3", name: "Chidi" },
  ];
  const OLD_RECORD = {
    name: "Last Sunday",
    date: "2026-09-01T00:00:00.000Z",
    organisationId: "org1",
    attendance: [
      { memberId: "m1", member: { name: "Ada" }, attendanceStatus: "late" },
      { memberId: "m2", member: { name: "Bola" }, attendanceStatus: "present" },
    ],
  };
  // Keys are asserted as literals on purpose: Create Attendance and Mark
  // Attendance must keep deriving exactly these for the same session.
  const META_KEY = "attendance-new-draft-org1";
  const ROSTER_KEY = "attendance-draft-org1-2026-10-01-Rehearsal";
  const MANUAL_KEY = "attendance-manual-draft-org1-2026-10-01-Rehearsal";
  const draftMeta = (over: Record<string, unknown> = {}) => ({
    version: 1,
    organisationId: "org1",
    name: "Rehearsal",
    date: "2026-10-01",
    categoryId: null,
    subCategoryId: null,
    eligibilityRules: [],
    ...over,
  });
  let unavailable: string[];
  const leave = (memberId: string) => ({
    memberId,
    startDate: "2026-09-25",
    endDate: "2026-10-05",
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    unavailable = [];
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: STATUSES_3,
      },
      currentAttendance: { ...EMPTY_CURRENT_ATTENDANCE },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/availability")) {
        return Promise.resolve({ data: { data: unavailable.map(leave) } });
      }
      if (url.includes("/members")) {
        return Promise.resolve({
          data: { data: MEMBERS.map((m) => ({ ...m })) },
        });
      }
      if (url === "/attendance/org1/att1") {
        return Promise.resolve({ data: { data: OLD_RECORD } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
    mockPost.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
    mockPut.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
  });

  it("resumes the saved session from the metadata when the working store is empty", async () => {
    localStorage.setItem(META_KEY, JSON.stringify(draftMeta()));
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify([{ id: "m1", name: "Ada", attendanceStatus: "late" }]),
    );

    renderAt("/mark");
    await screen.findByText("Ada");

    expect(
      screen.getByRole("heading", { name: "Rehearsal" }),
    ).toBeInTheDocument();
    expect(statusOf("Ada")).toBe("Late");
    expect(statusOf("Bola")).toBe("Absent");
    // The resumed session becomes the working state for Submit and Create.
    await waitFor(() =>
      expect(useGlobalStore.getState().currentAttendance).toMatchObject({
        name: "Rehearsal",
        date: "2026-10-01",
      }),
    );
    // Nothing is cleared before the backend stores the session.
    expect(localStorage.getItem(META_KEY)).not.toBeNull();
    expect(localStorage.getItem(ROSTER_KEY)).not.toBeNull();
  });

  it("restores manual additions saved with the draft", async () => {
    localStorage.setItem(META_KEY, JSON.stringify(draftMeta()));
    localStorage.setItem(
      MANUAL_KEY,
      JSON.stringify([
        {
          id: "m3",
          name: "Chidi",
          attendanceStatus: "late",
          reason: "Came anyway",
        },
      ]),
    );
    unavailable = ["m3"];

    renderAt("/mark");
    await screen.findByText("Ada");

    expect(screen.getByText("Chidi")).toBeInTheDocument();
    expect(screen.getByText("Added manually")).toBeInTheDocument();
    expect(screen.getByText("Late:").textContent).toBe("Late: 1");
    expect(screen.getByText("Expected roster: 2 members")).toBeInTheDocument();
    expect(screen.getByText("Added manually: 1")).toBeInTheDocument();
  });

  it("survives a remount: marks saved before a reload are restored from the draft", async () => {
    localStorage.setItem(META_KEY, JSON.stringify(draftMeta()));

    const { unmount } = renderAt("/mark");
    await screen.findByText("Ada");
    tap("Ada"); // Absent -> Present
    expect(statusOf("Ada")).toBe("Present");
    await waitFor(() =>
      expect(
        JSON.parse(localStorage.getItem(ROSTER_KEY) as string),
      ).toContainEqual({
        id: "m1",
        name: "Ada",
        attendanceStatus: "present",
      }),
    );
    unmount();

    // A fresh page load: the working store no longer holds the session; the
    // metadata plus the roster draft bring it back.
    useGlobalStore.getState().clearCurrentAttendance();
    renderAt("/mark");
    await screen.findByText("Ada");

    expect(
      screen.getByRole("heading", { name: "Rehearsal" }),
    ).toBeInTheDocument();
    expect(statusOf("Ada")).toBe("Present");
    expect(statusOf("Bola")).toBe("Absent");
  });

  it("offers a way to create one when there is no draft and no working session", async () => {
    renderAt("/mark");

    expect(
      await screen.findByText("No attendance in progress"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Submit" }),
    ).not.toBeInTheDocument();
    // No bogus empty roster is fetched or marked.
    expect(
      mockGet.mock.calls.some(([url]) => String(url).includes("/members")),
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Create attendance" }));
    expect(await screen.findByText("create attendance")).toBeInTheDocument();
  });

  it("keeps an edit in memory: no draft key is written or restored", async () => {
    const { unmount } = renderAt("/mark/att1");
    await screen.findByText("Ada");
    expect(statusOf("Ada")).toBe("Late");

    tap("Ada"); // Late -> Absent
    expect(statusOf("Ada")).toBe("Absent");
    expect(localStorage.getItem("attendance-draft-org1-att1")).toBeNull();
    expect(
      localStorage.getItem("attendance-manual-draft-org1-att1"),
    ).toBeNull();

    // Reopening restores the stored record, never the abandoned edit.
    unmount();
    renderAt("/mark/att1");
    await screen.findByText("Ada");
    expect(statusOf("Ada")).toBe("Late");
  });

  it("keeps an unfinished new draft intact through an update of an old attendance", async () => {
    localStorage.setItem(META_KEY, JSON.stringify(draftMeta()));
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify([{ id: "m1", name: "Ada", attendanceStatus: "present" }]),
    );
    localStorage.setItem(MANUAL_KEY, JSON.stringify([]));
    const metadataBefore = localStorage.getItem(META_KEY);

    renderAt("/mark/att1");
    await screen.findByText("Ada");
    tap("Bola"); // Present -> Late
    await submitAndConfirm();
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1));

    // The officer's unfinished new session survives the old attendance's save.
    expect(localStorage.getItem(META_KEY)).toBe(metadataBefore);
    expect(JSON.parse(localStorage.getItem(ROSTER_KEY) as string)).toEqual([
      { id: "m1", name: "Ada", attendanceStatus: "present" },
    ]);
    expect(localStorage.getItem(MANUAL_KEY)).toBe("[]");
    // Only the transient edited session is cleared from the working state.
    expect(useGlobalStore.getState().currentAttendance).toEqual(
      EMPTY_CURRENT_ATTENDANCE,
    );
  });

  it("keeps the resumed draft recoverable when the create fails", async () => {
    // React Query logs the rejected mutation; the rejection is the scenario.
    const silence = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    localStorage.setItem(META_KEY, JSON.stringify(draftMeta()));
    localStorage.setItem(
      ROSTER_KEY,
      JSON.stringify([{ id: "m1", name: "Ada", attendanceStatus: "present" }]),
    );
    mockPost.mockImplementation(() =>
      Promise.reject({
        response: {
          status: 422,
          data: {
            error: "The expected roster has changed. Refresh to reload it.",
          },
        },
      }),
    );

    renderAt("/mark");
    await screen.findByText("Ada");
    await submitAndConfirm();

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The expected roster has changed. Refresh to reload it.",
      ),
    );
    expect(localStorage.getItem(META_KEY)).not.toBeNull();
    expect(localStorage.getItem(ROSTER_KEY)).not.toBeNull();
    expect(statusOf("Ada")).toBe("Present");
    expect(useGlobalStore.getState().currentAttendance).toMatchObject({
      name: "Rehearsal",
      date: "2026-10-01",
    });
    silence.mockRestore();
  });
});

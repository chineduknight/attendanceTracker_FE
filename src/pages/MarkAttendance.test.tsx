import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { confirmAlert } from "react-confirm-alert";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import MarkAttendance from "pages/MarkAttendance";
import { statusDefinition } from "test-utils/attendanceStatusFixtures";
import { ROSTER as ELIGIBILITY_ROSTER } from "test-utils/eligibilityFixtures";
import { toast } from "react-toastify";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("react-confirm-alert", () => ({ confirmAlert: jest.fn() }));
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
const mockConfirm = confirmAlert as jest.Mock;

// Configured order is the tap-cycle order.
const STATUSES = [
  statusDefinition({ key: "no_show", label: "No Show", shortLabel: "NS", color: "red", behavior: "absent", isDefault: true }),
  statusDefinition({ key: "present", label: "Present", shortLabel: "P", color: "green" }),
  statusDefinition({ key: "late", label: "Late", shortLabel: "L", color: "yellow" }),
  statusDefinition({ key: "excused", label: "Excused", shortLabel: "EX", color: "orange", behavior: "excused" }),
  statusDefinition({ key: "remote", label: "Remote", shortLabel: "R", active: false }),
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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const rowOf = (name: string) => screen.getByText(name).closest("button") as HTMLElement;
const statusOf = (name: string) => within(rowOf(name)).getAllByText(/.+/).pop()?.textContent;
const tap = (name: string, times = 1) => {
  for (let i = 0; i < times; i += 1) fireEvent.click(rowOf(name));
};
const countText = (label: string) => screen.getByText(`${label}:`).textContent;

const submitAndConfirm = () => {
  fireEvent.click(screen.getByRole("button", { name: /Submit|Update/ }));
  const options = mockConfirm.mock.calls[0][0];
  options.buttons[0].onClick();
  return options.message as string;
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
      if (url.includes("/members")) return Promise.resolve({ data: { data: ROSTER } });
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

    const message = submitAndConfirm();
    expect(message).toContain("Late: 1");
    expect(message).toContain("No Show: 1");

    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1));
    const [url, body] = mockPost.mock.calls[0];
    expect(url).toBe("/attendance");
    expect(body.memberStatuses).toEqual([
      { memberId: "m1", status: "late" },
      { memberId: "m2", status: "no_show" },
    ]);
    expect(body).toMatchObject({ name: "Rehearsal", date: "2026-10-01", organisationId: "org1" });
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
    submitAndConfirm();
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
    statusDefinition({ key: "present", label: "Present", shortLabel: "P", color: "green" }),
    statusDefinition({ key: "late", label: "Late", shortLabel: "L", color: "yellow" }),
    statusDefinition({ key: "apology", label: "Apology", shortLabel: "AP", color: "orange", behavior: "excused" }),
    statusDefinition({ key: "absent", label: "Absent", shortLabel: "A", color: "red", behavior: "absent", isDefault: true }),
    statusDefinition({ key: "remote", label: "Remote", shortLabel: "R", active: false }),
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
    fireEvent.change(screen.getByPlaceholderText("Search member"), { target: { value: query } });
  const allStatuses = () => FIVE.map((m) => statusOf(m.name));
  const draftStatuses = () =>
    JSON.parse(localStorage.getItem(DRAFT_KEY) as string).map(
      (m: { id: string; attendanceStatus: string }) => [m.id, m.attendanceStatus]
    );
  const displayedStatuses = () =>
    FIVE.map((m) => [m.id, QUICK_STATUSES.find((s) => s.label === statusOf(m.name))!.key]);
  const undoButton = () => screen.queryByRole("button", { name: "Undo bulk change" });

  beforeEach(() => {
    queryClient.clear();
    localStorage.clear();
    mockConfirm.mockClear();
    mockPost.mockClear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: QUICK_STATUSES },
      currentAttendance: { name: "Rehearsal", date: "2026-10-01", members: [] },
    });
    mockGet.mockImplementation((url: string) => {
      if (url.includes("/members")) return Promise.resolve({ data: { data: FIVE } });
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
      expect(within(modes()).getByRole("button", { name: "Cycle" })).toHaveAttribute("aria-pressed", "true");
      expect(within(modes()).getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "false");
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
      const labels = within(modes()).getAllByRole("button").map((b) => b.textContent);
      expect(labels).toEqual(["Cycle", "Present", "Late", "Apology", "Absent"]);
    });
  });

  describe("bulk visible", () => {
    it("applies the selected status only to the searched members and persists the same roster", async () => {
      await start();
      expect(screen.queryByRole("button", { name: /^Apply/ })).not.toBeInTheDocument();
      chooseMode("Present");
      search("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Apply Present to 2 visible" }));

      expect(statusOf("Ada Eze")).toBe("Present");
      expect(statusOf("Ada Obi")).toBe("Present");
      expect(countText("Present")).toBe("Present: 2");
      expect(countText("Absent")).toBe("Absent: 3");

      search("");
      expect(allStatuses()).toEqual(["Present", "Present", "Absent", "Absent", "Absent"]);
      expect(draftStatuses()).toEqual(displayedStatuses());
    });

    it("resets only the visible members to the default", async () => {
      await start();
      chooseMode("Late");
      FIVE.forEach((m) => tap(m.name));
      search("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Reset 2 visible to Absent" }));
      search("");

      expect(allStatuses()).toEqual(["Absent", "Absent", "Late", "Late", "Late"]);
      expect(draftStatuses()).toEqual(displayedStatuses());
    });

    it("resets in Cycle mode too", async () => {
      await start();
      tap("Bola");
      fireEvent.click(screen.getByRole("button", { name: "Reset 5 visible to Absent" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Apply Present to 2 visible" }));

      fireEvent.click(undoButton() as HTMLElement);
      search("");

      expect(allStatuses()).toEqual(["Late", "Absent", "Absent", "Absent", "Absent"]);
      expect(draftStatuses()).toEqual(displayedStatuses());
      expect(undoButton()).not.toBeInTheDocument();
    });

    it("only undoes the most recent bulk change", async () => {
      await start();
      chooseMode("Present");
      fireEvent.click(screen.getByRole("button", { name: "Apply Present to 5 visible" }));
      chooseMode("Late");
      search("Ada");
      fireEvent.click(screen.getByRole("button", { name: "Apply Late to 2 visible" }));

      fireEvent.click(undoButton() as HTMLElement);
      search("");

      expect(allStatuses()).toEqual(["Present", "Present", "Present", "Present", "Present"]);
    });

    it("is cleared by a manual single tap", async () => {
      await start();
      fireEvent.click(screen.getByRole("button", { name: "Reset 5 visible to Absent" }));
      expect(undoButton()).toBeInTheDocument();
      tap("Bola");
      expect(undoButton()).not.toBeInTheDocument();
    });

    it("survives a roster refetch (e.g. the app regaining focus)", async () => {
      await start();
      chooseMode("Present");
      fireEvent.click(screen.getByRole("button", { name: "Apply Present to 5 visible" }));

      await act(() => queryClient.refetchQueries({ queryKey: queryKeys.members("org1") }));

      fireEvent.click(undoButton() as HTMLElement);
      expect(allStatuses()).toEqual(["Absent", "Absent", "Absent", "Absent", "Absent"]);
    });

    it("is cleared when a different session is opened", async () => {
      const OpenOtherSession = () => {
        const navigate = useNavigate();
        return <button onClick={() => navigate("/mark/att2")}>open other</button>;
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
      fireEvent.click(screen.getByRole("button", { name: "Reset 5 visible to Absent" }));
      expect(undoButton()).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "open other" }));

      await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/attendance/org1/att2"));
      expect(undoButton()).not.toBeInTheDocument();
    });

    it("and the quick-mark mode are reset by an organisation switch", async () => {
      await start();
      chooseMode("Present");
      fireEvent.click(screen.getByRole("button", { name: "Apply Present to 5 visible" }));
      expect(undoButton()).toBeInTheDocument();

      act(() => {
        useGlobalStore.setState({
          organisation: { ...EMPTY_ORG, id: "org2", attendanceStatuses: QUICK_STATUSES },
        });
      });
      await screen.findByText("Bola");

      expect(undoButton()).not.toBeInTheDocument();
      expect(within(modes()).getByRole("button", { name: "Cycle" })).toHaveAttribute("aria-pressed", "true");
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
      fireEvent.click(screen.getByRole("button", { name: "Reset 5 visible to Absent" }));
      expect(statusOf("Ada Eze")).toBe("Absent");

      fireEvent.click(undoButton() as HTMLElement);

      expect(statusOf("Ada Eze")).toBe("Remote");
      expect(countText("Remote")).toBe("Remote: 1");
      expect(JSON.parse(localStorage.getItem("attendance-draft-org1-att1") as string)[0]).toMatchObject({
        id: "m1",
        attendanceStatus: "remote",
      });
    });
  });

  it("submits exactly the allowlisted payload after bulk marking", async () => {
    await start();
    chooseMode("Present");
    search("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Apply Present to 2 visible" }));
    search("");

    const message = submitAndConfirm();
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
    statusDefinition({ key: "present", label: "Present", shortLabel: "P", color: "green" }),
    statusDefinition({ key: "late", label: "Late", shortLabel: "L", color: "yellow" }),
    statusDefinition({ key: "absent", label: "Absent", shortLabel: "A", color: "red", behavior: "absent", isDefault: true }),
    statusDefinition({ key: "remote", label: "Remote", shortLabel: "R", active: false }),
  ];
  const SOP_ALTO_ACTIVE = [
    { field: "part", values: ["soprano", "alto"] },
    { field: "status", values: ["active"] },
  ];
  const DRAFT_KEY = "attendance-draft-org1-2026-10-01-Sectional";
  let roster: Array<Record<string, string | undefined>>;

  const draftIds = () =>
    JSON.parse(localStorage.getItem(DRAFT_KEY) as string).map((m: { id: string }) => m.id);
  const rowNames = () =>
    ELIGIBILITY_ROSTER.map((m) => m.name).filter((name) => screen.queryByText(name));
  const refetchRoster = () =>
    act(() => queryClient.refetchQueries({ queryKey: queryKeys.members("org1") }));

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    localStorage.clear();
    roster = ELIGIBILITY_ROSTER.map((m) => ({ ...m }));
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: STATUSES_5 },
      currentAttendance: {
        name: "Sectional",
        date: "2026-10-01",
        eligibilityRules: SOP_ALTO_ACTIVE,
      },
    });
    mockGet.mockImplementation((url: string) => {
      // A fresh copy per request, as the API would return.
      if (url.includes("/members")) {
        return Promise.resolve({ data: { data: roster.map((m) => ({ ...m })) } });
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
      expect(screen.getByText("Expected roster: 2 members")).toBeInTheDocument();
      expect(screen.getByText("Part: Soprano, Alto · Status: Active")).toBeInTheDocument();
      expect(draftIds()).toEqual(["m1", "m3"]);
    });

    it("limits bulk actions to the expected roster", async () => {
      await start();
      fireEvent.click(
        within(screen.getByRole("group", { name: "Tap a member to" })).getByRole("button", {
          name: "Present",
        })
      );
      fireEvent.click(screen.getByRole("button", { name: "Apply Present to 2 visible" }));
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

      await waitFor(() => expect(screen.queryByText("Chioma")).not.toBeInTheDocument());
      expect(draftIds()).toEqual(["m1"]);
    });

    it("creates with the rules and only the expected members' statuses", async () => {
      await start();
      tap("Chioma"); // Present
      submitAndConfirm();

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
        ])
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
      expect(await screen.findByText(/Members could not be loaded/)).toBeInTheDocument();
      expect(screen.queryByText(/Expected roster/)).not.toBeInTheDocument();
      (console.error as jest.Mock).mockRestore();
    });

    it("keeps the draft and shows the backend error when the roster changed", async () => {
      // React Query logs the rejected mutation; the rejection is the scenario.
      const silence = jest.spyOn(console, "error").mockImplementation(() => undefined);
      mockPost.mockImplementation(() =>
        Promise.reject({ response: { status: 422, data: { error: "The expected roster has changed. Refresh to reload it." } } })
      );
      await start();
      tap("Ada");
      submitAndConfirm();

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("The expected roster has changed. Refresh to reload it.")
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
        { memberId: "m1", member: { name: "Ada" }, attendanceStatus: "present" },
        { memberId: "m2", member: { name: "Bisi" }, attendanceStatus: "absent" },
        { memberId: "m4", member: { name: "Dayo" }, attendanceStatus: "remote" },
      ],
    };

    beforeEach(() => {
      roster.find((m) => m.id === "m1")!.status = "inactive";
      roster.push({ id: "m9", name: "Ife", part: "alto", status: "active" });
      mockGet.mockImplementation((url: string) => {
        if (url === "/attendance/org1/att9") return Promise.resolve({ data: { data: RECORD } });
        // A fresh copy per request, as the API would return.
      if (url.includes("/members")) {
        return Promise.resolve({ data: { data: roster.map((m) => ({ ...m })) } });
      }
        return Promise.resolve({ data: { data: [] } });
      });
      mockPut.mockImplementation(() => Promise.resolve({ data: { data: {} } }));
    });

    const open = async () => {
      renderAt("/mark/att9");
      await screen.findByText("Ada");
    };

    it("loads the stored roster unchanged, never re-filtering or adding members", async () => {
      await open();
      expect(rowNames()).toEqual(["Ada", "Bisi", "Dayo"]);
      expect(screen.queryByText("Ife")).not.toBeInTheDocument();
      expect(screen.getByText("Expected roster: 3 members")).toBeInTheDocument();
      expect(screen.getByText("Part: Soprano, Alto · Status: Active")).toBeInTheDocument();
      expect(mockGet.mock.calls.some(([url]) => url.includes("/members"))).toBe(false);
    });

    it("keeps inactive statuses and bulk Undo working on the stored roster", async () => {
      await open();
      expect(statusOf("Dayo")).toBe("Remote");
      fireEvent.click(screen.getByRole("button", { name: "Reset 3 visible to Absent" }));
      expect(statusOf("Dayo")).toBe("Absent");
      fireEvent.click(screen.getByRole("button", { name: "Undo bulk change" }));
      expect(statusOf("Dayo")).toBe("Remote");
    });

    it("updates without eligibility rules", async () => {
      await open();
      submitAndConfirm();
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

import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { confirmAlert } from "react-confirm-alert";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import MarkAttendance from "pages/MarkAttendance";
import { statusDefinition } from "test-utils/attendanceStatusFixtures";

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

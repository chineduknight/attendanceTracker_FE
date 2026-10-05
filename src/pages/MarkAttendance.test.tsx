import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { confirmAlert } from "react-confirm-alert";
import { queryClient } from "services/api/apiHelper";
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

import { screen } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import MemberAnalytics from "pages/MemberAnalytics";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { renderRoute } from "test-utils/renderWithProviders";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

const ANALYTICS = {
  member: { memberId: "m1", name: "Ada Obi", fields: {} },
  range: { fromDate: "2026-01-01", toDate: "2026-06-30" },
  summary: {
    totalSessions: 4,
    behaviorCounts: { present: 2, excused: 1, absent: 1 },
    attendanceRate: 75,
    currentStreak: 1,
    longestStreak: 2,
  },
  verdicts: [
    { date: "2026-06-07", status: "late" },
    { date: "2026-06-14", status: "remote" },
    { date: "2026-06-21", status: "mystery" },
    { date: "2026-06-28", status: "excused" },
  ],
  records: [
    { attendanceId: "a1", date: "2026-06-07", status: "late", sessionName: "S1", hasBeenUpdated: false },
    { attendanceId: "a2", date: "2026-06-14", status: "remote", sessionName: "S2", hasBeenUpdated: false },
  ],
};

const renderPage = () =>
  renderRoute(
    <MemberAnalytics />,
    "/analytics/member/:memberId",
    "/analytics/member/m1?fromDate=2026-01-01&toDate=2026-06-30",
  );

describe("<MemberAnalytics>", () => {
  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: CUSTOM_STATUSES },
    });
    mockGet.mockImplementation(() => Promise.resolve({ data: { data: ANALYTICS } }));
  });

  it("renders the export buttons and date controls", () => {
    renderPage();
    expect(screen.getByRole("button", { name: /Export Excel/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export PDF/ })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("From date")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("To date")).toBeInTheDocument();
  });

  it("shows behavior tiles and configured, inactive and unknown history", async () => {
    renderPage();
    await screen.findByText("Ada Obi");
    expect(screen.getByText("Total Sessions")).toBeInTheDocument();
    expect(screen.getAllByText("Excused").length).toBeGreaterThan(0);
    // Timeline legend + record badges resolve via configuration.
    expect(screen.getAllByText("Late").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Remote").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("Apology")).not.toBeInTheDocument();
  });
});

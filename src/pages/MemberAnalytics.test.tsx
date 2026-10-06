import { screen } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import MemberAnalytics from "pages/MemberAnalytics";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { renderRoute } from "test-utils/renderWithProviders";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

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
    { date: "2026-06-07", status: "late", behavior: "present" },
    { date: "2026-06-14", status: "remote", behavior: "present" },
    { date: "2026-06-21", status: "mystery", behavior: "absent" },
    { date: "2026-06-28", status: "excused", behavior: "excused" },
  ],
  records: [
    { attendanceId: "a1", date: "2026-06-07", status: "late", behavior: "present", sessionName: "S1", hasBeenUpdated: false },
    { attendanceId: "a2", date: "2026-06-14", status: "remote", behavior: "present", sessionName: "S2", hasBeenUpdated: false },
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
    expect(screen.getByText("Total Attendance")).toBeInTheDocument();
    expect(screen.getAllByText("Excused").length).toBeGreaterThan(0);
    // Timeline legend + record badges resolve via configuration.
    expect(screen.getAllByText("Late").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Remote").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText("Apology")).not.toBeInTheDocument();
  });

  it("shows the backend's expected-session total without client denominator math", async () => {
    // The org held 3 sessions in range; the member was expected at only 2.
    mockGet.mockImplementation(() =>
      Promise.resolve({
        data: {
          data: {
            ...ANALYTICS,
            summary: {
              ...ANALYTICS.summary,
              totalSessions: 2,
              behaviorCounts: { present: 1, excused: 0, absent: 1 },
              attendanceRate: 50,
            },
            verdicts: ANALYTICS.verdicts.slice(0, 2),
          },
        },
      }),
    );
    renderPage();
    await screen.findByText("Ada Obi");
    const tile = screen.getByText("Total Attendance").parentElement as HTMLElement;
    expect(tile).toHaveTextContent("Total Attendance2");
  });
});

const SCHOOL_TERMS = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  attendanceSingular: "Session",
  attendancePlural: "Sessions",
};

describe("<MemberAnalytics> with custom terminology", () => {
  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
        terminology: SCHOOL_TERMS,
      },
    });
  });

  it("names the member term when they are not found", async () => {
    mockGet.mockImplementation(() =>
      Promise.reject({ response: { status: 404 } }),
    );
    renderPage();
    expect(
      await screen.findByText("Student not found in this organisation."),
    ).toBeInTheDocument();
  });

  it("names the member term in analytics load errors", async () => {
    mockGet.mockImplementation(() =>
      Promise.reject({ response: { status: 500 } }),
    );
    renderPage();
    expect(
      await screen.findByText("Error loading student analytics."),
    ).toBeInTheDocument();
  });

  it("names the session term in the empty-records message", async () => {
    mockGet.mockImplementation(() =>
      Promise.resolve({
        data: {
          data: {
            ...ANALYTICS,
            summary: {
              ...ANALYTICS.summary,
              totalSessions: 0,
              behaviorCounts: { present: 0, excused: 0, absent: 0 },
            },
            verdicts: [],
            records: [],
          },
        },
      }),
    );
    renderPage();
    expect(
      await screen.findByText("No session records for this range."),
    ).toBeInTheDocument();
  });
});

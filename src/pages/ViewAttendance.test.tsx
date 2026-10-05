import { screen, within } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import ViewAttendance from "pages/ViewAttendance";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { renderRoute } from "test-utils/renderWithProviders";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

const entry = (memberId: string, name: string, attendanceStatus: string) => ({
  _id: `${memberId}-row`,
  memberId,
  attendanceStatus,
  member: { name, status: "active" },
});

const SESSION = {
  name: "Rehearsal",
  date: "2026-09-01T00:00:00.000Z",
  attendance: [
    entry("m1", "Zara", "no_show"),
    entry("m2", "Yemi", "mystery"),
    entry("m3", "Xavi", "remote"),
    entry("m4", "Wale", "late"),
    entry("m5", "Vera", "present"),
    entry("m6", "Uche", "excused"),
  ],
};

describe("<ViewAttendance> with configured statuses", () => {
  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: CUSTOM_STATUSES },
    });
    mockGet.mockImplementation(() => Promise.resolve({ data: { data: SESSION } }));
  });

  const renderPage = () =>
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");

  const memberOrder = () =>
    screen
      .getAllByText(/^(Zara|Yemi|Xavi|Wale|Vera|Uche)$/)
      .map((node) => node.textContent);

  it("sorts by configured status order with unknown statuses last", async () => {
    renderPage();
    await screen.findByText("Zara");
    // present, late, excused, no_show, inactive remote, unknown
    expect(memberOrder()).toEqual(["Vera", "Wale", "Uche", "Zara", "Xavi", "Yemi"]);
  });

  it("renders configured badges, inactive history and the unknown fallback", async () => {
    renderPage();
    await screen.findByText("Zara");
    const badgeOf = (name: string) =>
      within(screen.getByText(name).parentElement as HTMLElement).getByTitle(/.+/)
        .textContent;
    expect(badgeOf("Wale")).toBe("Late");
    expect(badgeOf("Xavi")).toBe("Remote");
    expect(badgeOf("Yemi")).toBe("Unknown");
  });

  it("shows dynamic counts including inactive and unknown statuses", async () => {
    renderPage();
    await screen.findByText("Zara");
    ["Present", "Late", "Excused", "No Show", "Remote", "Unknown"].forEach((label) =>
      expect(screen.getByText(`${label}:`).textContent).toBe(`${label}: 1`),
    );
    expect(screen.queryByText(/Apology/)).not.toBeInTheDocument();
  });

  it("offers an attendance-status filter built from configured statuses", async () => {
    renderPage();
    await screen.findByText("Zara");
    expect(screen.getByLabelText("Filter by attendance status")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by member status")).toBeInTheDocument();
  });
});

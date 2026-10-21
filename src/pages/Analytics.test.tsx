import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useLocation } from "react-router-dom";
import { format, endOfMonth, startOfMonth } from "date-fns";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Analytics, { sessionColumnsByDate } from "pages/Analytics";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { renderRoute } from "test-utils/renderWithProviders";
import { chooseMenuItem } from "test-utils/render";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn() },
}));

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

// jsdom has no layout, so no scrollIntoView.
const scrollIntoView = jest.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
});
beforeEach(() => scrollIntoView.mockClear());

const D1 = "Rehearsal 2026-09-01";
const D2 = "Rehearsal 2026-09-08";

const ANALYTICS = {
  keys: ["name", D1, D2],
  analytics: [
    {
      memberId: "m1",
      name: "Ada",
      attendanceBehaviorCounts: { present: 1, excused: 0, absent: 1 },
      [D1]: "late",
      [D2]: "no_show",
    },
    {
      memberId: "m2",
      name: "Bola",
      attendanceBehaviorCounts: { present: 1, excused: 1, absent: 0 },
      [D1]: "remote",
      [D2]: "excused",
    },
    {
      // Not on the D2 roster: no cell value, and no absence in the totals.
      memberId: "m3",
      name: "Chi",
      attendanceBehaviorCounts: { present: 1, excused: 0, absent: 0 },
      [D1]: "present",
    },
  ],
};

// The response's own config wins over the selected org's copy.
const RESPONSE_STATUSES = CUSTOM_STATUSES.map((status) =>
  status.key === "late"
    ? { ...status, label: "Tardy", shortLabel: "T" }
    : status
);

describe("<Analytics> with configured statuses", () => {
  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
      },
    });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes("/analytics?")
          ? { data: { ...ANALYTICS, attendanceStatuses: RESPONSE_STATUSES } }
          : { data: {} },
      })
    );
  });

  const search = async () => {
    renderRoute(<Analytics />, "/analytics", "/analytics");
    // "This month"-style presets fill both dates; fall back to typing them.
    fireEvent.change(screen.getByPlaceholderText("From date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByPlaceholderText("To date"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Ada");
  };

  // Phones (and jsdom, which matches no breakpoint) open on the list.
  const searchGrid = async () => {
    await search();
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    await screen.findByRole("table");
  };

  it("opens on a ranked list with the backend's behavior totals", async () => {
    await search();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    const rows = screen.getAllByRole("button", { name: /View member analytics/ });
    // Backend order, never re-ranked here.
    expect(rows.map((row) => row.getAttribute("aria-label"))).toEqual([
      "Ada: Present 1, Excused 0, Absent 1. View member analytics",
      "Bola: Present 1, Excused 1, Absent 0. View member analytics",
      "Chi: Present 1, Excused 0, Absent 0. View member analytics",
    ]);
  });

  it("finds a member by name and keeps their backend rank", async () => {
    await search();
    fireEvent.change(screen.getByLabelText("Search member"), {
      target: { value: "  CHI " },
    });
    const rows = screen.getAllByRole("button", { name: /View member analytics/ });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAccessibleName(/^Chi:/);
    // Chi is third in the backend's ranking, not first of the matches.
    expect(within(rows[0]).getByText("3")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 3 members");
  });

  it("keeps the backend rank in the grid while searching", async () => {
    await searchGrid();
    fireEvent.change(screen.getByLabelText("Search member"), {
      target: { value: "bola" },
    });
    // Body rows are buttons (they open member analytics); headers are not.
    const rows = within(screen.getByRole("table")).getAllByRole("button");
    expect(rows).toHaveLength(1);
    // Bola is second in the backend's ranking, not first of the matches.
    expect(rows[0]).toHaveTextContent(/^2Bola/);
    // The legend still describes the whole report.
    expect(screen.getAllByText("Tardy").length).toBeGreaterThan(0);
  });

  it("says when no member matches and clears the search", async () => {
    await search();
    fireEvent.change(screen.getByLabelText("Search member"), {
      target: { value: "zed" },
    });
    expect(screen.getByText("No member found")).toBeInTheDocument();
    expect(screen.getByText('Nothing matches "zed".')).toBeInTheDocument();
    // The empty state's button; the bar's own clear button is an icon.
    fireEvent.click(screen.getByText("Clear search"));
    expect(
      screen.getAllByRole("button", { name: /View member analytics/ })
    ).toHaveLength(3);
  });

  it("opens member analytics for the same range from a list row", async () => {
    await search();
    fireEvent.click(screen.getByRole("button", { name: /^Bola:/ }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/\/m2\?fromDate=2026-09-01&toDate=2026-09-30$/),
    );
  });

  it("shows behavior totals from attendanceBehaviorCounts as semantic columns", async () => {
    await searchGrid();
    ["Present", "Excused", "Absent"].forEach((label) =>
      expect(
        screen.getByRole("columnheader", { name: label })
      ).toBeInTheDocument()
    );
    // The row is a button (opens member analytics), so cells lose their role.
    const adaCells = Array.from(
      (screen.getByText("Ada").closest("tr") as HTMLElement).querySelectorAll(
        "td"
      )
    ).map((cell) => cell.textContent);
    expect(adaCells).toEqual(["1", "Ada", "1", "0", "1", "T", "NS"]);
  });

  it("shows session columns oldest first whatever order the backend sends", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes("/analytics?")
          ? { data: { ...ANALYTICS, keys: ["name", D2, D1], attendanceStatuses: RESPONSE_STATUSES } }
          : { data: {} },
      })
    );
    await searchGrid();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.slice(-2)).toEqual(["Tue 1, Sep", "Tue 8, Sep"]);
  });

  it("renders exact status keys in date cells and a dynamic legend", async () => {
    await searchGrid();
    expect(screen.getByTitle("Tardy")).toHaveTextContent("T");
    expect(screen.getByTitle("Remote")).toHaveTextContent("R");
    // Legend: every active status plus inactive Remote seen in results.
    ["Present", "Tardy", "No Show", "Remote"].forEach((label) =>
      expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    );
    expect(screen.queryByText("Apology")).not.toBeInTheDocument();
  });

  it("shows N/A for a session the member was not expected at", async () => {
    await searchGrid();
    const chiCells = Array.from(
      (screen.getByText("Chi").closest("tr") as HTMLElement).querySelectorAll(
        "td"
      )
    );
    const missing = chiCells[chiCells.length - 1];
    const cell = within(missing).getByRole("img", {
      name: "Not applicable: not on this attendance roster",
    });
    expect(cell).toHaveAttribute(
      "title",
      "Not applicable: not on this attendance roster"
    );
    // Neither the configured absent status (No Show / NS) nor a behavior label.
    ["No Show", "NS", "Absent"].forEach((text) =>
      expect(missing).not.toHaveTextContent(text)
    );
    expect(missing).toHaveTextContent("N/A");
    // Totals come straight from the backend: Present 1, Excused 0, Absent 0.
    expect(chiCells.slice(2, 5).map((cell) => cell.textContent)).toEqual([
      "1",
      "0",
      "0",
    ]);
  });
});

describe("<Analytics> session summary", () => {
  // R2 (2026-09-08) is excluded: the backend omits its column and its totals.
  const EXCLUDED_RANGE = {
    keys: ["name", D1],
    analytics: [
      {
        memberId: "m1",
        name: "Ada",
        attendanceBehaviorCounts: { present: 1, excused: 0, absent: 0 },
        [D1]: "late",
      },
      {
        // Off the included D1 roster: still N/A.
        memberId: "m3",
        name: "Chi",
        attendanceBehaviorCounts: { present: 0, excused: 0, absent: 0 },
      },
    ],
    attendanceStatuses: CUSTOM_STATUSES,
    sessionSummary: { recorded: 3, included: 2, excluded: 1 },
  };

  const search = async (terminology = DEFAULT_TERMINOLOGY) => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
        terminology,
      },
    });
    renderRoute(<Analytics />, "/analytics", "/analytics");
    fireEvent.change(screen.getByPlaceholderText("From date"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByPlaceholderText("To date"), {
      target: { value: "2026-09-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Ada");
  };

  const searchGrid = async () => {
    await search();
    fireEvent.click(screen.getByRole("button", { name: "Grid" }));
    await screen.findByRole("table");
  };

  beforeEach(() => {
    queryClient.clear();
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes("/analytics?")
          ? { data: EXCLUDED_RANGE }
          : { data: {} },
      })
    );
  });

  it("discloses recorded, included and excluded counts from the backend", async () => {
    await search();
    expect(screen.getByText("Attendance recorded: 3")).toBeInTheDocument();
    expect(screen.getByText("Included in analytics: 2")).toBeInTheDocument();
    expect(screen.getByText("Excluded: 1")).toBeInTheDocument();
  });

  it("uses the organisation's attendance term", async () => {
    await search({
      ...DEFAULT_TERMINOLOGY,
      attendanceSingular: "Rehearsal",
      attendancePlural: "Rehearsals",
    });
    expect(screen.getByText("Rehearsals recorded: 3")).toBeInTheDocument();
  });

  it("renders no column, cell or legend entry for an excluded session", async () => {
    await searchGrid();
    const headers = screen
      .getAllByRole("columnheader")
      .map((header) => header.textContent);
    expect(headers).toEqual(["SN", "Name", "Present", "Excused", "Absent", "Tue 1, Sep"]);
    expect(screen.queryByText(/Excluded from analytics/)).not.toBeInTheDocument();
    const adaCells = Array.from(
      (screen.getByText("Ada").closest("tr") as HTMLElement).querySelectorAll("td")
    );
    expect(adaCells).toHaveLength(6);
  });

  it("says a member on no included roster is not on any roster in the list", async () => {
    await search();
    expect(screen.getByRole("button", { name: /^Chi:/ })).toHaveAccessibleName(
      "Chi: not on any attendance roster. View member analytics"
    );
    expect(screen.getByText("Not on any attendance roster")).toBeInTheDocument();
  });

  it("keeps N/A for an off-roster member on an included session", async () => {
    await searchGrid();
    const chiCells = Array.from(
      (screen.getByText("Chi").closest("tr") as HTMLElement).querySelectorAll("td")
    );
    expect(chiCells).toHaveLength(6);
    expect(chiCells[5]).toHaveTextContent("N/A");
  });
});

describe("sessionColumnsByDate", () => {
  it("orders session columns by date, keeping same-day order and dropping non-session keys", () => {
    expect(
      sessionColumnsByDate([
        "name",
        "Rehearsal 2026-07-30",
        "Mass 2026-02-21",
        "Vigil 2026-04-22",
        "Second Mass 2026-02-21",
        "Mass 2026-04-22",
      ])
    ).toEqual([
      "Mass 2026-02-21",
      "Second Mass 2026-02-21",
      "Vigil 2026-04-22",
      "Mass 2026-04-22",
      "Rehearsal 2026-07-30",
    ]);
  });
});

describe("<Analytics> keeps its report in the address", () => {
  const SEPT = "/analytics?fromDate=2026-09-01&toDate=2026-09-30";

  // Shows the address the page wrote, as Back would find it.
  const LocationProbe = () => {
    const location = useLocation();
    return <output data-testid="location">{location.search}</output>;
  };
  const shownSearch = () =>
    new URLSearchParams(screen.getByTestId("location").textContent ?? "");

  const renderAt = (path: string) =>
    renderRoute(
      <>
        <Analytics />
        <LocationProbe />
      </>,
      "/analytics",
      path
    );

  const analyticsCalls = () =>
    mockGet.mock.calls
      .map(([url]) => url as string)
      .filter((url) => url.includes("/analytics?"));

  const setOrg = (id: string) =>
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id, attendanceStatuses: CUSTOM_STATUSES },
    });

  beforeEach(() => {
    queryClient.clear();
    mockGet.mockReset();
    mockNavigate.mockReset();
    setOrg("org1");
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes("/analytics")
          ? { data: { ...ANALYTICS, attendanceStatuses: RESPONSE_STATUSES } }
          : { data: {} },
      })
    );
  });

  it("opens on this month's report without a Search tap", async () => {
    renderAt("/analytics");
    await screen.findByText("Ada");
    const today = new Date();
    const from = format(startOfMonth(today), "yyyy-MM-dd");
    const to = format(endOfMonth(today), "yyyy-MM-dd");
    expect(analyticsCalls()).toEqual([
      expect.stringContaining(`fromDate=${from}&toDate=${to}&sort=ranking`),
    ]);
    expect(screen.getByRole("button", { name: "This Month" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("restores the report, view and name search from the address", async () => {
    renderAt(`${SEPT}&status=active&view=grid&q=bo`);
    const table = await screen.findByRole("table");
    expect(analyticsCalls()).toEqual([
      expect.stringContaining("fromDate=2026-09-01&toDate=2026-09-30&sort=ranking&status=active"),
    ]);
    expect(screen.getByPlaceholderText("From date")).toHaveValue("Sep 1, 2026");
    expect(screen.getByPlaceholderText("To date")).toHaveValue("Sep 30, 2026");
    expect(screen.getByLabelText("Search member")).toHaveValue("bo");
    const rows = within(table).getAllByRole("button");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(/Bola/);
  });

  it("falls back to this month for a malformed range", async () => {
    renderAt("/analytics?fromDate=2026-09-30&toDate=2026-09-01");
    await screen.findByText("Ada");
    expect(analyticsCalls()[0]).not.toContain("2026-09-");
  });

  it("shows a cached report at once on return and refreshes it quietly", async () => {
    const { unmount } = renderAt(SEPT);
    await screen.findByText("Ada");
    unmount();

    // The refresh never answers: what shows is the cache.
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderAt(SEPT);
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByLabelText("Refreshing")).toBeInTheDocument();
  });

  it("remembers the opened member, then marks and scrolls to them on return", async () => {
    const { unmount } = renderAt(SEPT);
    await screen.findByText("Bola");
    fireEvent.click(screen.getByRole("button", { name: /^Bola:/ }));
    await waitFor(() => expect(shownSearch().get("member")).toBe("m2"));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringMatching(/\/m2\?fromDate=2026-09-01&toDate=2026-09-30$/)
    );
    const returnTo = `/analytics${screen.getByTestId("location").textContent}`;
    unmount();
    scrollIntoView.mockClear();

    renderAt(returnTo);
    const bola = await screen.findByRole("button", { name: /^Bola:/ });
    expect(bola).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /^Ada:/ })).not.toHaveAttribute("aria-current");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(bola);
  });

  it("hides an edited report until Search, then writes the new one and forgets the opened member", async () => {
    renderAt(`${SEPT}&member=m2`);
    await screen.findByText("Ada");
    fireEvent.change(screen.getByPlaceholderText("From date"), {
      target: { value: "2026-08-01" },
    });
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Choose a date range")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Ada");
    expect(shownSearch().get("fromDate")).toBe("2026-08-01");
    expect(shownSearch().get("member")).toBeNull();
    expect(analyticsCalls().at(-1)).toContain("fromDate=2026-08-01&toDate=2026-09-30");
  });

  it("exports the report on screen", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes("/export/")
          ? { data: {} }
          : url.includes("/analytics")
            ? { data: { ...ANALYTICS, attendanceStatuses: RESPONSE_STATUSES } }
            : { data: {} },
      })
    );
    renderAt(`${SEPT}&status=active`);
    await screen.findByText("Ada");
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await chooseMenuItem(await screen.findByRole("menuitem", { name: "Export Excel" }));
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        "/attendance/org1/analytics/export/excel?fromDate=2026-09-01&toDate=2026-09-30&sort=ranking&status=active"
      )
    );
  });

  it("never shows one organisation's cached report under another", async () => {
    const { unmount } = renderAt(SEPT);
    await screen.findByText("Ada");
    unmount();

    setOrg("org2");
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderAt(SEPT);
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(analyticsCalls().at(-1)).toContain("/attendance/org2/analytics?");
  });
});

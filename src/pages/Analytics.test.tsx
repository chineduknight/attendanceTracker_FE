import { fireEvent, screen, within } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Analytics, { sessionColumnsByDate } from "pages/Analytics";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { renderRoute } from "test-utils/renderWithProviders";
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

import { fireEvent, screen, within } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Analytics from "pages/Analytics";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { renderRoute } from "test-utils/renderWithProviders";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn() },
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
  status.key === "late" ? { ...status, label: "Tardy", shortLabel: "T" } : status,
);

describe("<Analytics> with configured statuses", () => {
  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: CUSTOM_STATUSES },
    });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.includes("/analytics?")
          ? { data: { ...ANALYTICS, attendanceStatuses: RESPONSE_STATUSES } }
          : { data: {} },
      }),
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

  it("shows behavior totals from attendanceBehaviorCounts as semantic columns", async () => {
    await search();
    ["Present", "Excused", "Absent"].forEach((label) =>
      expect(screen.getByRole("columnheader", { name: label })).toBeInTheDocument(),
    );
    // The row is a button (opens member analytics), so cells lose their role.
    const adaCells = Array.from(
      (screen.getByText("Ada").closest("tr") as HTMLElement).querySelectorAll("td"),
    ).map((cell) => cell.textContent);
    expect(adaCells).toEqual(["1", "Ada", "1", "0", "1", "T", "NS"]);
  });

  it("renders exact status keys in date cells and a dynamic legend", async () => {
    await search();
    expect(screen.getByTitle("Tardy")).toHaveTextContent("T");
    expect(screen.getByTitle("Remote")).toHaveTextContent("R");
    // Legend: every active status plus inactive Remote seen in results.
    ["Present", "Tardy", "No Show", "Remote"].forEach((label) =>
      expect(screen.getAllByText(label).length).toBeGreaterThan(0),
    );
    expect(screen.queryByText("Apology")).not.toBeInTheDocument();
  });

  it("shows a neutral not-on-roster cell, not an absence, for a session the member was not expected at", async () => {
    await search();
    const chiCells = Array.from(
      (screen.getByText("Chi").closest("tr") as HTMLElement).querySelectorAll("td"),
    );
    const missing = chiCells[chiCells.length - 1];
    const cell = within(missing).getByRole("img", { name: "Not on this session roster" });
    expect(cell).toHaveAttribute("title", "Not on this session roster");
    // Neither the configured absent status (No Show / NS) nor a behavior label.
    ["No Show", "NS", "Absent"].forEach((text) =>
      expect(missing).not.toHaveTextContent(text),
    );
    // Totals come straight from the backend: Present 1, Excused 0, Absent 0.
    expect(chiCells.slice(2, 5).map((cell) => cell.textContent)).toEqual(["1", "0", "0"]);
  });
});

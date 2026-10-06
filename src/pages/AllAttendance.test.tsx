import { fireEvent, screen, within } from "@testing-library/react";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import AllAttendance from "pages/AllAttendance";
import { renderRoute } from "test-utils/renderWithProviders";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

const record = (id: string, name: string, day: number, extra: object = {}) => ({
  id,
  name,
  date: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`,
  dateFormated: day,
  createdAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  updatedAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`,
  hasBeenUpdated: false,
  ...extra,
});

const RECORDS = [
  // Legacy record: no analytics fields at all.
  record("r1", "Week one", 1, { editCount: 0, editsRemaining: 2 }),
  record("r2", "Week two", 8, {
    analyticsIncluded: false,
    analyticsExclusionReason: "Incomplete marking",
    editCount: 1,
    editsRemaining: 1,
  }),
  record("r3", "Week three", 15, {
    analyticsIncluded: false,
    editCount: 3,
    editsRemaining: 0,
  }),
];

// The outermost element holding this record and no other.
const rowOf = (name: string) => {
  let row = screen.getByText(name);
  while (
    row.parentElement &&
    (row.parentElement.textContent?.match(/Week (one|two|three)/g) ?? [])
      .length === 1
  ) {
    row = row.parentElement;
  }
  return row;
};

const names = () =>
  screen
    .queryAllByText(/^Week (one|two|three)$/)
    .map((node) => node.textContent);

const renderPage = async (terminology = DEFAULT_TERMINOLOGY) => {
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id: "org1", terminology },
  });
  renderRoute(<AllAttendance />, "/attendance", "/attendance");
  await screen.findByText("Week one");
};

describe("<AllAttendance> analytics inclusion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    mockGet.mockResolvedValue({ data: { data: RECORDS } });
  });

  it("badges only excluded records and keeps them listed", async () => {
    await renderPage();
    expect(names()).toEqual(["Week three", "Week two", "Week one"]);
    expect(screen.getAllByText("Excluded from analytics")).toHaveLength(
      // two row badges plus the filter option
      3
    );
    expect(
      within(rowOf("Week one")).queryByText("Excluded from analytics")
    ).not.toBeInTheDocument();
    expect(
      within(rowOf("Week two")).getByText("Excluded from analytics")
    ).toBeInTheDocument();
  });

  it("keeps an excluded record viewable", async () => {
    await renderPage();
    fireEvent.click(screen.getByText("Week two"));
    expect(mockNavigate).toHaveBeenCalledWith("/attendance/r2", expect.anything());
  });

  it("filters the loaded list by inclusion without refetching", async () => {
    await renderPage();
    const filter = screen.getByLabelText("Filter by analytics inclusion");
    const calls = mockGet.mock.calls.length;

    fireEvent.change(filter, { target: { value: "excluded" } });
    expect(names()).toEqual(["Week three", "Week two"]);

    fireEvent.change(filter, { target: { value: "included" } });
    expect(names()).toEqual(["Week one"]);

    fireEvent.change(filter, { target: { value: "all" } });
    expect(names()).toHaveLength(3);
    expect(mockGet.mock.calls.length).toBe(calls);
  });

  it("leaves edit availability to the existing edit rules", async () => {
    await renderPage();
    // Excluded with an edit left: still editable.
    expect(within(rowOf("Week two")).getByText("1 left")).toBeInTheDocument();
    // Excluded and out of edits: no edit button.
    expect(within(rowOf("Week three")).queryByText(/left$/)).toBeNull();
    expect(within(rowOf("Week three")).queryByRole("button")).toBeNull();
  });

  it("names a custom attendance term when the filter matches nothing", async () => {
    mockGet.mockResolvedValue({ data: { data: [RECORDS[0]] } });
    await renderPage({
      ...DEFAULT_TERMINOLOGY,
      attendanceSingular: "Rehearsal",
      attendancePlural: "Rehearsals",
    });
    fireEvent.change(screen.getByLabelText("Filter by analytics inclusion"), {
      target: { value: "excluded" },
    });
    expect(
      screen.getByText("No rehearsal matches this filter.")
    ).toBeInTheDocument();
  });
});

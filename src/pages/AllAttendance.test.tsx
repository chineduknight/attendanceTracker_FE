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
    expect(within(rowOf("Week three")).queryByRole("button", { name: /^Edit/ })).toBeNull();
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

describe("<AllAttendance> rows, empty and error states", () => {
  beforeEach(() => {
    queryClient.clear();
    mockNavigate.mockClear();
    mockGet.mockReset();
  });

  const renderWith = (permissions: string[] = []) => {
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", permissions: permissions as never },
    });
    renderRoute(<AllAttendance />, "/attendance", "/attendance");
  };

  it("makes each row a button and labels its edit action", async () => {
    mockGet.mockResolvedValue({ data: { data: RECORDS } });
    renderWith();
    const open = await screen.findByRole("button", { name: /^Week one/ });
    fireEvent.click(open);
    expect(mockNavigate).toHaveBeenCalledWith("/attendance/r1", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Edit Week two" }));
    expect(mockNavigate).toHaveBeenLastCalledWith("/mark-attendance/r2");
  });

  it("shows the stored session day, not a timezone-shifted one", async () => {
    mockGet.mockResolvedValue({ data: { data: [RECORDS[0]] } });
    renderWith();
    expect(await screen.findByText(/Thu 01 Oct 26/)).toBeInTheDocument();
  });

  it("offers to create the first record only to officers who can", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWith(["attendance.manage"]);
    expect(await screen.findByText("No attendance yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create attendance" }));
    expect(mockNavigate).toHaveBeenCalledWith("/create-attendance");
  });

  it("does not offer create to view-only officers", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWith(["attendance.view"]);
    expect(await screen.findByText("No attendance yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create attendance" })).not.toBeInTheDocument();
  });

  it("explains a failed load and retries, instead of claiming there is nothing", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockGet.mockRejectedValueOnce({ response: { status: 500, data: { error: "Server busy" } } });
    renderWith();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load attendance");
    expect(alert).toHaveTextContent("Server busy");
    expect(screen.queryByText("No attendance yet")).not.toBeInTheDocument();

    mockGet.mockResolvedValue({ data: { data: RECORDS } });
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Week one")).toBeInTheDocument();
    (console.error as jest.Mock).mockRestore();
  });
});


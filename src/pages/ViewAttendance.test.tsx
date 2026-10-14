import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useNavigate } from "react-router-dom";
import { chooseOption, confirmInDialog, optionLabels } from "test-utils/render";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import ViewAttendance from "pages/ViewAttendance";
import { CUSTOM_STATUSES } from "test-utils/attendanceStatusFixtures";
import { renderRoute } from "test-utils/renderWithProviders";
import { MEMBER_MODEL } from "test-utils/eligibilityFixtures";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";
import { PermissionKey } from "rbac/permissions";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), delete: jest.fn(), patch: jest.fn(), post: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockDelete: jest.Mock = require("services/api").default.delete;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockPatch: jest.Mock = require("services/api").default.patch;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockPost: jest.Mock = require("services/api").default.post;

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

  it("labels both filters with the organisation's terms", async () => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
        terminology: { ...DEFAULT_TERMINOLOGY, memberSingular: "Chorister" },
      },
    });
    renderPage();
    await screen.findByText("Zara");
    // Both read "All" until used, so each carries a visible caption that
    // also stays part of its accessible name.
    expect(screen.getByText("Attendance status", { selector: "label" })).toHaveAttribute(
      "for",
      screen.getByLabelText("Filter by attendance status").id,
    );
    expect(screen.getByText("Chorister status", { selector: "label" })).toHaveAttribute(
      "for",
      screen.getByLabelText("Filter by chorister status").id,
    );
  });

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

describe("<ViewAttendance> load failure", () => {
  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: CUSTOM_STATUSES },
    });
  });

  it("explains a failed load with the backend's reason and retries in place", async () => {
    mockGet.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: { error: "Server busy" } } }),
    );
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load this attendance");
    expect(alert).toHaveTextContent("Server busy");

    mockGet.mockImplementation(() => Promise.resolve({ data: { data: SESSION } }));
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Zara")).toBeInTheDocument();
  });

  it("offers to clear a search that matches no one", async () => {
    mockGet.mockImplementation(() => Promise.resolve({ data: { data: SESSION } }));
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
    // The stored calendar day (UTC midnight), not a timezone-shifted one.
    expect(screen.getByText("Tue 01 Sep 26")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "nobody" } });
    expect(screen.getByText("No member found")).toBeInTheDocument();
    expect(screen.getByText('Nothing matches "nobody".')).toBeInTheDocument();

    const clears = screen.getAllByRole("button", { name: "Clear search" });
    fireEvent.click(clears[clears.length - 1]);
    expect(screen.getByText("Zara")).toBeInTheDocument();
  });
});

describe("<ViewAttendance> expected roster", () => {
  const OUTDATED_NOTICE = /Eligibility rule has changed since this session was created/;

  const serve = (session: object, fields = MEMBER_MODEL) =>
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: { data: url.endsWith("/model") ? { fields } : session },
      }),
    );

  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      // Historical rosters and rules stay visible with eligibility now off.
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
        attendanceEligibilityEnabled: false,
      },
    });
  });

  const renderPage = async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
  };

  it("shows the stored roster size for a session without rules", async () => {
    serve(SESSION);
    await renderPage();
    expect(screen.getByText("Expected members: 6")).toBeInTheDocument();
    expect(screen.queryByText(OUTDATED_NOTICE)).not.toBeInTheDocument();
  });

  it("summarises stored rules read-only", async () => {
    serve({ ...SESSION, eligibilityRules: [{ field: "part", values: ["soprano"] }] });
    await renderPage();
    expect(screen.getByText("Part: Soprano")).toBeInTheDocument();
    expect(screen.queryByText(OUTDATED_NOTICE)).not.toBeInTheDocument();
  });

  it("summarises stored rules with the current label without changing the roster", async () => {
    serve(
      { ...SESSION, eligibilityRules: [{ field: "part", values: ["soprano"] }] },
      MEMBER_MODEL.map((f) => (f.name === "part" ? { ...f, label: "Voice Part" } : f)),
    );
    await renderPage();
    expect(await screen.findByText("Voice Part: Soprano")).toBeInTheDocument();
    expect(screen.getByText("Expected members: 6")).toBeInTheDocument();
    expect(screen.queryByText(OUTDATED_NOTICE)).not.toBeInTheDocument();
  });

  it("flags a rule the current model no longer understands without changing the roster", async () => {
    serve(
      { ...SESSION, eligibilityRules: [{ field: "part", values: ["mezzo"] }] },
      MEMBER_MODEL,
    );
    await renderPage();
    expect(await screen.findByText(OUTDATED_NOTICE)).toBeInTheDocument();
    expect(screen.getByText("Expected members: 6")).toBeInTheDocument();
    ["Zara", "Yemi", "Xavi", "Wale", "Vera", "Uche"].forEach((name) =>
      expect(screen.getByText(name)).toBeInTheDocument(),
    );
  });
});

describe("<ViewAttendance> with an unresolvable roster member", () => {
  const THREE = {
    name: "Small Sectional",
    date: "2026-09-01T00:00:00.000Z",
    attendance: [
      entry("m1", "Zara", "present"),
      { _id: "m2-row", memberId: "m2", attendanceStatus: "late", member: null },
      entry("m3", "Xavi", "no_show"),
    ],
  };

  beforeEach(() => {
    queryClient.clear();
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: CUSTOM_STATUSES },
    });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? { fields: [] } : THREE } }),
    );
  });

  it("still counts the deleted member as expected and shows a read-only placeholder", async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
    expect(screen.getByText("Expected members: 3")).toBeInTheDocument();
    expect(screen.getByText(/1 member on this roster no longer has a profile/)).toBeInTheDocument();
    const placeholder = screen.getByText("Former member (profile unavailable)");
    expect(within(placeholder.parentElement as HTMLElement).getByTitle("Late")).toBeInTheDocument();
    expect(placeholder.closest("button")).toBeNull();
    expect(screen.getByText("Xavi")).toBeInTheDocument();
  });

  it("adds the unresolved entries to the unfiltered status totals", async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
    // Present: Zara. Late: the unresolved entry. No Show: Xavi. The tally
    // adds up to the whole stored roster (3), not just the resolvable rows.
    expect(screen.getByText("Present:").textContent).toBe("Present: 1");
    expect(screen.getByText("Late:").textContent).toBe("Late: 1");
    expect(screen.getByText("Excused:").textContent).toBe("Excused: 0");
    expect(screen.getByText("No Show:").textContent).toBe("No Show: 1");
  });

  it("keeps filtered totals describing only the rows that matched", async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Xavi" },
    });
    expect(screen.getByText("Present:").textContent).toBe("Present: 0");
    expect(screen.getByText("Late:").textContent).toBe("Late: 0");
    expect(screen.getByText("No Show:").textContent).toBe("No Show: 1");
  });
});

const SCHOOL_TERMS = {
  ...DEFAULT_TERMINOLOGY,
  memberSingular: "Student",
  memberPlural: "Students",
  attendanceSingular: "Session",
  attendancePlural: "Sessions",
};

describe("<ViewAttendance> with custom terminology", () => {
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
    mockGet.mockImplementation(() => Promise.resolve({ data: { data: SESSION } }));
  });

  it("names the session term while the record loads", async () => {
    mockGet.mockImplementation(() => new Promise(() => undefined));
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    expect(await screen.findByText("Loading sessions...")).toBeInTheDocument();
  });

  it("names the session and student terms in the filter labels", async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
    expect(screen.getByLabelText("Filter by session status")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by student status")).toBeInTheDocument();
  });

  it("names the session term in the delete confirm and failure copy", async () => {
    useGlobalStore.setState({
      organisation: {
        ...useGlobalStore.getState().organisation,
        permissions: ["attendance.view", "attendance.manage"],
      },
    });
    mockDelete.mockImplementation(() =>
      Promise.reject({ response: { data: { error: undefined } } }),
    );
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");

    fireEvent.click(screen.getByRole("button", { name: /Delete Session/ }));
    const dialog = await confirmInDialog("Delete");
    expect(within(dialog).getByText("Delete Session")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("delete this session record?");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to delete session."),
    );
  });

  it("names the student term on the unresolved-roster placeholder", async () => {
    const THREE = {
      name: "Small Sectional",
      date: "2026-09-01T00:00:00.000Z",
      attendance: [
        entry("m1", "Zara", "present"),
        { _id: "m2-row", memberId: "m2", attendanceStatus: "late", member: null },
      ],
    };
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith("/model") ? { fields: [] } : THREE } }),
    );
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
    expect(screen.getByText("Former student (profile unavailable)")).toBeInTheDocument();
    expect(
      screen.getByText(/1 student on this roster no longer has a profile/),
    ).toBeInTheDocument();
  });
});

describe("<ViewAttendance> analytics inclusion", () => {
  const EXCLUDED = {
    ...SESSION,
    analyticsIncluded: false,
    analyticsExclusionReason: "Incomplete marking",
    analyticsExcludedAt: "2026-10-15T09:00:00.000Z",
    analyticsExcludedBy: "user-1",
  };
  const REHEARSAL_TERMS = {
    ...DEFAULT_TERMINOLOGY,
    memberSingular: "Student",
    memberPlural: "Students",
    attendanceSingular: "Rehearsal",
    attendancePlural: "Rehearsals",
  };

  let session: object;
  const setup = (permissions: PermissionKey[], terminology = DEFAULT_TERMINOLOGY) => {
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
        permissions,
        terminology,
      },
    });
  };
  const renderPage = async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
  };
  // v3 dialogs open a tick after the click, so wait for one to appear.
  const dialog = async () => within(await screen.findByRole("alertdialog"));

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    session = SESSION;
    mockGet.mockImplementation(() =>
      Promise.resolve({ data: { data: session } })
    );
  });

  it("shows a legacy record as included to a view-only user without controls", async () => {
    setup(["attendance.view"]);
    await renderPage();
    expect(screen.getByText("Included in analytics")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Exclude from analytics" })
    ).not.toBeInTheDocument();
  });

  it("shows the excluded state, reason and date read-only", async () => {
    session = EXCLUDED;
    setup(["attendance.view"]);
    await renderPage();
    expect(screen.getByText("Excluded from analytics")).toBeInTheDocument();
    expect(screen.getByText("Reason: Incomplete marking")).toBeInTheDocument();
    expect(screen.getByText("Excluded date: 15 Oct 2026")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Restore to analytics" })
    ).not.toBeInTheDocument();
  });

  it("offers exclusion to a manager even when marking edits are locked", async () => {
    session = { ...SESSION, editsLocked: true, editsRemaining: 0, editCount: 3 };
    setup(["attendance.view", "attendance.manage"]);
    await renderPage();
    expect(
      screen.getByRole("button", { name: "Exclude from analytics" })
    ).toBeInTheDocument();
  });

  it("excludes after a deliberate confirmation with a reason", async () => {
    setup(["attendance.view", "attendance.manage"]);
    mockPatch.mockImplementation(() => {
      session = EXCLUDED;
      return Promise.resolve({ data: { data: {} } });
    });
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Exclude from analytics" }));
    expect(mockPatch).not.toHaveBeenCalled();
    expect(
      (await dialog()).getByText(
        "This attendance will remain available in attendance history, but it will not count toward organisation or member analytics."
      )
    ).toBeInTheDocument();
    const reason = (await dialog()).getByLabelText("Reason (optional)");
    expect(reason).toHaveAttribute("maxLength", "200");
    fireEvent.change(reason, { target: { value: " Incomplete marking " } });
    expect((await dialog()).getByText("20/200 characters")).toBeInTheDocument();
    fireEvent.click(
      (await dialog()).getByRole("button", { name: "Exclude from analytics" })
    );

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/attendance/org1/att1/analytics-inclusion",
        { analyticsIncluded: false, reason: "Incomplete marking" }
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Attendance excluded from analytics."
      )
    );
    expect(await screen.findByText("Excluded from analytics")).toBeInTheDocument();
    expect(screen.getByText("Reason: Incomplete marking")).toBeInTheDocument();
  });

  it("cancelling the confirmation sends nothing", async () => {
    setup(["attendance.view", "attendance.manage"]);
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Exclude from analytics" }));
    fireEvent.click((await dialog()).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
    );
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("keeps a failed restore visibly excluded and shows the backend error", async () => {
    session = EXCLUDED;
    setup(["attendance.view", "attendance.manage"]);
    mockPatch.mockRejectedValue({
      response: { status: 422, data: { error: "Restore not allowed" } },
    });
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Restore to analytics" }));
    fireEvent.click((await dialog()).getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Restore not allowed")
    );
    expect(screen.getByText("Excluded from analytics")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("uses organisation terms in the confirmation and toast copy", async () => {
    session = EXCLUDED;
    setup(["attendance.view", "attendance.manage"], REHEARSAL_TERMS);
    mockPatch.mockResolvedValue({ data: { data: {} } });
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Restore to analytics" }));
    expect(
      (await dialog()).getByText("Restore this rehearsal to analytics?")
    ).toBeInTheDocument();
    expect(
      (await dialog()).getByText(
        "Its stored attendance will count again in organisation and student analytics."
      )
    ).toBeInTheDocument();
    fireEvent.click((await dialog()).getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/attendance/org1/att1/analytics-inclusion",
        { analyticsIncluded: true }
      )
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Rehearsal restored to analytics."
      )
    );
  });

  it("names the rehearsal term in the exclusion confirmation", async () => {
    setup(["attendance.view", "attendance.manage"], REHEARSAL_TERMS);
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Exclude from analytics" }));
    expect(
      (await dialog()).getByText("Exclude this rehearsal from analytics?")
    ).toBeInTheDocument();
    expect(
      (await dialog()).getByText(
        "This rehearsal will remain available in rehearsal history, but it will not count toward organisation or student analytics."
      )
    ).toBeInTheDocument();
  });
});

describe("<ViewAttendance> manual per-session attendance", () => {
  const MANUAL = {
    ...entry("m7", "Tolu", "late"),
    manuallyAdded: true,
    manualAdditionReason: "Joined the sectional",
    manuallyAddedAt: "2026-09-01T10:00:00.000Z",
    manuallyAddedBy: "user-1",
  };
  const WITH_MANUAL = {
    ...SESSION,
    eligibilityRules: [{ field: "part", values: ["soprano"] }],
    attendance: [
      ...SESSION.attendance.map((e) => ({ ...e, manuallyAdded: false })),
      MANUAL,
    ],
  };
  // Current members: the roster plus two who are not on it — one who fails the
  // session's rules and one on leave. Neither is hidden from the candidates.
  const MEMBERS = [
    ...SESSION.attendance.map((e) => ({ id: e.memberId, name: e.member.name })),
    { id: "m7", name: "Tolu" },
    { id: "m9", name: "Tunde", part: "tenor" },
    { id: "m10", name: "Ngozi", part: "soprano" },
  ];
  const REHEARSAL_TERMS = {
    ...DEFAULT_TERMINOLOGY,
    memberSingular: "Student",
    memberPlural: "Students",
    attendanceSingular: "Rehearsal",
    attendancePlural: "Rehearsals",
  };
  const MANAGER: PermissionKey[] = ["attendance.view", "attendance.manage"];

  let session: Record<string, unknown>;
  const setup = (permissions: PermissionKey[], terminology = DEFAULT_TERMINOLOGY) =>
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
        permissions,
        terminology,
      },
    });
  const renderPage = async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
  };
  // v3 dialogs open a tick after the click, so wait for one to appear.
  const dialog = async () => within(await screen.findByRole("dialog"));
  // Removal asks through the shared ConfirmDialog (role="alertdialog").
  const confirmation = async () => within(await screen.findByRole("alertdialog"));
  const rowContainer = (name: string) =>
    screen.getByText(name).closest("div.chakra-button")
      ?.parentElement as HTMLElement;
  const addButton = (name = "Add member to this attendance") =>
    screen.getByRole("button", { name });
  const openAddDialog = async (name?: string) => {
    fireEvent.click(addButton(name));
    await screen.findByRole("dialog");
  };
  const chooseMember = async (name: string) => {
    const input = (await dialog()).getByLabelText(/^(Member|Student)/);
    fireEvent.change(input, { target: { value: name.slice(0, 3) } });
    fireEvent.click(await screen.findByText(name));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    session = WITH_MANUAL;
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url.includes("/members")
            ? MEMBERS
            : url.endsWith("/model")
            ? { fields: MEMBER_MODEL }
            : session,
        },
      })
    );
  });

  it("badges only manual entries and counts them apart from the expected roster", async () => {
    setup(["attendance.view"]);
    await renderPage();
    expect(within(rowContainer("Tolu")).getByText("Added manually")).toBeInTheDocument();
    expect(within(rowContainer("Tolu")).getByTitle("Late")).toBeInTheDocument();
    expect(within(rowContainer("Zara")).queryByText("Added manually")).toBeNull();
    expect(screen.getAllByText("Added manually")).toHaveLength(1);
    expect(screen.getByText("Expected members: 6")).toBeInTheDocument();
    expect(screen.getByText("Added manually: 1")).toBeInTheDocument();
    expect(screen.getByText("Session roster: 7")).toBeInTheDocument();
  });

  it("keeps the simple display when nothing was added manually", async () => {
    session = SESSION;
    setup(["attendance.view"]);
    await renderPage();
    expect(screen.getByText("Expected members: 6")).toBeInTheDocument();
    expect(screen.queryByText(/Added manually/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Session roster/)).not.toBeInTheDocument();
  });

  it("shows provenance to a view-only user without add or remove controls", async () => {
    setup(["attendance.view"]);
    await renderPage();
    expect(
      screen.getByText("Reason: Joined the sectional · Added 01 Sep 2026")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add member/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /from this attendance$/ })
    ).not.toBeInTheDocument();
  });

  it("keeps manual rows in filters and status counts, and the manual count when filtered out", async () => {
    setup(["attendance.view"]);
    await renderPage();
    expect(screen.getByText("Late:").textContent).toBe("Late: 2");
    fireEvent.change(screen.getByPlaceholderText("Search member"), {
      target: { value: "Zara" },
    });
    expect(screen.queryByText("Tolu")).not.toBeInTheDocument();
    expect(screen.getByText("Added manually: 1")).toBeInTheDocument();
  });

  it("clears the search with one tap and brings the full roster back", async () => {
    setup(["attendance.view"]);
    await renderPage();
    const search = screen.getByPlaceholderText("Search member");
    fireEvent.change(search, { target: { value: "Zara" } });
    expect(screen.queryByText("Tolu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(search).toHaveValue("");
    expect(screen.getByText("Tolu")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clear search" })
    ).not.toBeInTheDocument();
  });

  it("explains the one-session semantics and lists only off-roster candidates", async () => {
    setup(MANAGER);
    await renderPage();
    await openAddDialog();
    expect((await dialog()).getByText("Add member to this attendance")).toBeInTheDocument();
    expect(
      (await dialog()).getByText(
        "Use this only when the member was not expected for this attendance but physically attended."
      )
    ).toBeInTheDocument();
    expect(
      (await dialog()).getByText(
        "This changes this attendance only. It does not change eligibility, leave, or future attendance."
      )
    ).toBeInTheDocument();

    fireEvent.keyDown((await dialog()).getByLabelText(/^Member/), { key: "ArrowDown" });
    await screen.findByText("Tunde");
    const menu = document.querySelector(".manual-member__menu") as HTMLElement;
    // The tenor fails the session's rules and is still offered; members
    // already on the roster (expected or manual) never are.
    expect(
      within(menu)
        .getAllByText(/.+/)
        .filter((node) => node.children.length === 0)
        .map((node) => node.textContent)
    ).toEqual(["Ngozi", "Tunde"]);
  });

  it("offers only active present-behavior statuses and a 200-character reason", async () => {
    setup(MANAGER);
    await renderPage();
    await openAddDialog();
    const statusSelect = (await dialog()).getByLabelText(/^Attendance status/);
    expect(await optionLabels(statusSelect)).toEqual(["Present", "Late"]);
    const reason = (await dialog()).getByLabelText("Reason (optional)");
    expect(reason).toHaveAttribute("maxLength", "200");
    fireEvent.change(reason, { target: { value: "Leave ended" } });
    expect((await dialog()).getByText("11/200 characters")).toBeInTheDocument();
  });

  it("posts the chosen member, status and reason, then refreshes the session", async () => {
    setup(MANAGER);
    mockPost.mockImplementation(() => {
      session = {
        ...WITH_MANUAL,
        attendance: [
          ...WITH_MANUAL.attendance,
          { ...entry("m9", "Tunde", "present"), manuallyAdded: true },
        ],
      };
      return Promise.resolve({ data: { data: {} } });
    });
    await renderPage();
    await openAddDialog();
    const add = (await dialog()).getByRole("button", { name: "Add member" });
    expect(add).toBeDisabled();
    await chooseMember("Tunde");
    await chooseOption((await dialog()).getByLabelText(/^Attendance status/), "Present");
    fireEvent.change((await dialog()).getByLabelText("Reason (optional)"), {
      target: { value: "  On leave but came  " },
    });
    fireEvent.click(add);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/attendance/org1/att1/manual-members", {
        memberId: "m9",
        status: "present",
        reason: "On leave but came",
      })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Member added to this attendance.")
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(await screen.findByText("Tunde")).toBeInTheDocument();
    expect(screen.getByText("Added manually: 2")).toBeInTheDocument();
    expect(screen.getByText("Expected members: 6")).toBeInTheDocument();
  });

  it("keeps the dialog and the screen unchanged when the backend refuses an add", async () => {
    setup(MANAGER);
    mockPost.mockRejectedValue({
      response: { status: 422, data: { error: "Member is already on this session's roster." } },
    });
    await renderPage();
    await openAddDialog();
    await chooseMember("Tunde");
    await chooseOption((await dialog()).getByLabelText(/^Attendance status/), "Late");
    fireEvent.click((await dialog()).getByRole("button", { name: "Add member" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Member is already on this session's roster."
      )
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("Tunde", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByText("Added manually: 1")).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("offers removal only on manual rows, behind an explicit confirmation", async () => {
    setup(MANAGER);
    await renderPage();
    const removes = screen.getAllByRole("button", { name: /^Remove .* from this attendance$/ });
    expect(removes).toHaveLength(1);
    expect(removes[0]).toHaveAccessibleName("Remove Tolu from this attendance");

    fireEvent.click(removes[0]);
    expect((await confirmation()).getByText("Remove Tolu from this attendance?")).toBeInTheDocument();
    expect(
      (await confirmation()).getByText(
        "Tolu was manually added to this attendance. Removing them deletes this historical attendance entry from this attendance only."
      )
    ).toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes on the manual-member route and refreshes after confirmation", async () => {
    setup(MANAGER);
    mockDelete.mockImplementation(() => {
      session = SESSION;
      return Promise.resolve({ data: { data: {} } });
    });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Remove Tolu from this attendance" }));
    fireEvent.click((await confirmation()).getByRole("button", { name: "Remove from this attendance" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(
        "/attendance/org1/att1/manual-members/m7",
        { data: undefined }
      )
    );
    await waitFor(() => expect(screen.queryByText("Tolu")).not.toBeInTheDocument());
    expect(screen.queryByText(/Added manually/)).not.toBeInTheDocument();
  });

  it("keeps the row visible when the backend refuses a removal", async () => {
    setup(MANAGER);
    mockDelete.mockRejectedValue({
      response: { status: 422, data: { error: "Attendance edits are locked." } },
    });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Remove Tolu from this attendance" }));
    fireEvent.click((await confirmation()).getByRole("button", { name: "Remove from this attendance" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Attendance edits are locked.")
    );
    expect(screen.getByText("Tolu")).toBeInTheDocument();
    expect(screen.getByText("Added manually: 1")).toBeInTheDocument();
  });

  it("disables add and remove once no edits remain", async () => {
    session = { ...WITH_MANUAL, editsRemaining: 0, editCount: 3 };
    setup(MANAGER);
    await renderPage();
    expect(addButton()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove Tolu from this attendance" })
    ).toBeDisabled();
    expect(screen.getByText("No edits remain for this attendance.")).toBeInTheDocument();
  });

  it("disables add and remove while edits are locked", async () => {
    session = { ...WITH_MANUAL, editsLocked: true, editsRemaining: 2 };
    setup(MANAGER);
    await renderPage();
    expect(addButton()).toBeDisabled();
  });

  it("keeps an unresolvable manual entry identified as manual", async () => {
    session = {
      ...SESSION,
      attendance: [
        ...SESSION.attendance,
        { _id: "gone", memberId: "gone", member: null, attendanceStatus: "late", manuallyAdded: true },
      ],
    };
    setup(["attendance.view"]);
    await renderPage();
    const placeholder = screen.getByText("Former member (profile unavailable)");
    expect(
      within(placeholder.parentElement as HTMLElement).getByText("Added manually")
    ).toBeInTheDocument();
    expect(screen.getByText("Expected members: 6")).toBeInTheDocument();
    expect(screen.getByText("Added manually: 1")).toBeInTheDocument();
  });

  it("still shows manual rows on a session excluded from analytics", async () => {
    session = { ...WITH_MANUAL, analyticsIncluded: false };
    setup(["attendance.view"]);
    await renderPage();
    expect(screen.getByText("Excluded from analytics")).toBeInTheDocument();
    expect(within(rowContainer("Tolu")).getByText("Added manually")).toBeInTheDocument();
  });

  it("introduces no synthetic manual attendance status", async () => {
    setup(["attendance.view"]);
    await renderPage();
    expect(screen.queryByText("Added manually:", { selector: "span" })).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Filter by attendance status"), {
      key: "ArrowDown",
    });
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options.some((text) => /manual/i.test(text ?? ""))).toBe(false);
  });

  it("uses organisation terms throughout", async () => {
    setup(MANAGER, REHEARSAL_TERMS);
    await renderPage();
    await openAddDialog("Add student to this rehearsal");
    expect((await dialog()).getByText("Add student to this rehearsal")).toBeInTheDocument();
    expect(
      (await dialog()).getByText(
        "This changes this rehearsal only. It does not change eligibility, leave, or future rehearsals."
      )
    ).toBeInTheDocument();
    fireEvent.click((await dialog()).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Tolu from this rehearsal" }));
    expect(
      (await confirmation()).getByRole("button", { name: "Remove from this rehearsal" })
    ).toBeInTheDocument();
  });
});

describe("<ViewAttendance> sharing the session report", () => {
  const rosterEntry = (
    memberId: string,
    name: string,
    attendanceStatus: string,
    memberStatus = "active"
  ) => ({
    _id: `${memberId}-row`,
    memberId,
    attendanceStatus,
    member: { name, status: memberStatus, gender: "male", part: "tenor" },
  });
  const unresolvedEntry = (
    memberId: string,
    attendanceStatus: string,
    extra: Record<string, unknown> = {}
  ) => ({
    _id: `${memberId}-row`,
    memberId,
    attendanceStatus,
    member: null,
    ...extra,
  });
  // Ada (active), Bayo (associate) and the manual addition Efe are present;
  // Chidi is excused; Dayo (probationary) is absent — then three entries whose
  // profile no longer resolves: two expected (present, excused) and one manual
  // addition, which the backend only ever records with a present-behaviour
  // status.
  const SHARE_SESSION = {
    name: "Rehearsal",
    date: "2026-09-01T00:00:00.000Z",
    attendance: [
      rosterEntry("s1", "Ada", "present"),
      rosterEntry("s2", "Bayo", "late", "associate"),
      rosterEntry("s3", "Chidi", "excused"),
      rosterEntry("s4", "Dayo", "no_show", "probationary"),
      {
        ...rosterEntry("s5", "Efe", "present"),
        manuallyAdded: true,
        manualAdditionReason: "Joined the sectional",
      },
      unresolvedEntry("s6", "present"),
      unresolvedEntry("s7", "excused"),
      unresolvedEntry("s8", "late", {
        manuallyAdded: true,
        manualAdditionReason: "Came late",
      }),
    ],
  };

  /** Another session of the same organisation, with a different roster. */
  const OTHER_SESSION = {
    name: "Sunday Service",
    date: "2026-09-06T00:00:00.000Z",
    attendance: [rosterEntry("t1", "Tolu", "present")],
  };

  const sharedText = (open: jest.SpyInstance, call = 0): string => {
    const url = String(open.mock.calls[call][0]);
    return decodeURIComponent(url.replace("https://wa.me/?text=", ""));
  };

  // Availability periods recorded for the session date, as the API returns
  // them (reason and audit fields included — the message must ignore them).
  let availability: Record<string, unknown>[] = [];
  const awayPeriod = (memberId: string, name: string, endDate: string) => ({
    id: `${memberId}-period`,
    organisationId: "org1",
    memberId,
    member: { id: memberId, name },
    startDate: "2026-08-20",
    endDate,
    reason: "Hospital stay",
    createdBy: "officer-1",
    updatedBy: null,
    createdAt: "2026-08-19T10:00:00.000Z",
    updatedAt: "2026-08-19T10:00:00.000Z",
  });
  const isAvailability = (url: string) => url.includes("/availability?");
  const availabilityCalls = () =>
    mockGet.mock.calls.filter(([url]) => isAvailability(url));

  // Share prepares the message (fetching who is away); Share now sends it.
  const shareReport = async () => {
    // A previous preview finishes closing first.
    await waitFor(() =>
      expect(screen.queryByTestId("share-preview")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(await screen.findByRole("button", { name: "Share now" }));
  };

  const WithSessionSwitcher = () => {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate("/attendance/att2")}>
          open other session
        </button>
        <ViewAttendance />
      </>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    availability = [];
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
      },
    });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url.endsWith("/model")
            ? { fields: [] }
            : isAvailability(url)
            ? availability
            : SHARE_SESSION,
        },
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shares the complete stored roster even while page filters are applied", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Ada");

    // The officer narrows the screen to one member; the report must not follow.
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Ada" },
    });
    expect(screen.queryByText("Bayo")).not.toBeInTheDocument();
    await shareReport();

    const text = sharedText(open);
    // Present-behavior: Ada + late Bayo + manual Efe + the unresolved present
    // and manual Late entries; excused: Chidi + unresolved; absent: Dayo.
    // Membership statuses never remove anyone from the figures.
    expect(text).toContain("✅ Present: 3  |  ✅ Late: 2  |  🟡 Excused: 2");
    expect(text).toContain("*Tenor — 3*\nBro Ada\nBro Bayo\nBro Efe");
    expect(text).toContain(
      "*Other — 2*\nFormer member (profile unavailable)\nFormer member (profile unavailable)",
    );
    expect(text).toContain("*EXCUSED — 2*\nBro Chidi — Tenor\nFormer member (profile unavailable)");
    expect(text).not.toContain("— Other");
    expect(text).toContain("*Absent Members: 1*");
    // The neutral placeholder is never titled and no member id is exposed.
    expect(text).not.toMatch(/Bro Former|Sis Former/);
    expect(text).not.toMatch(/\bs[1-8]\b/);
  });

  it("shares with the generic template when the organisation uses it", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        name: "Lakeside Tennis Club",
        attendanceStatuses: CUSTOM_STATUSES,
        attendanceShareTemplate: "generic",
      },
    });
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Ada");

    await shareReport();
    const text = sharedText(open);
    expect(text.startsWith("*LAKESIDE TENNIS CLUB ATTENDANCE*")).toBe(true);
    // Same Stage 1 figures, plain names, no grouping or titles.
    expect(text).toContain("✅ Present: 3  |  ✅ Late: 2  |  🟡 Excused: 2");
    expect(text).toContain(
      "*PRESENT MEMBERS — 5*\n\nAda\nBayo\nEfe\nFormer member (profile unavailable)\nFormer member (profile unavailable)",
    );
    expect(text).toContain("*EXCUSED — 2*\nChidi\nFormer member (profile unavailable)");
    expect(text).toContain("*Absent Members: 1*");
    expect(text).not.toMatch(/🎶|\bBro\b|\bSis\b|Tenor|\bOther\b|choir/i);
  });

  it("uses a newly saved template for the next share without reloading the session", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Ada");
    const sessionLoads = mockGet.mock.calls.filter(([url]) => url.includes("/att1")).length;

    await shareReport();
    expect(sharedText(open)).toContain("Bro Ada");

    // Organisation Settings saved Generic for this organisation.
    act(() => {
      useGlobalStore.setState({
        organisation: {
          ...useGlobalStore.getState().organisation,
          attendanceShareTemplate: "generic",
        },
      });
    });
    open.mockClear();
    await shareReport();
    const text = sharedText(open);
    expect(text).toContain("*PRESENT MEMBERS — 5*\n\nAda\nBayo\nEfe");
    expect(text).not.toContain("Bro ");
    expect(
      mockGet.mock.calls.filter(([url]) => url.includes("/att1")).length,
    ).toBe(sessionLoads);
  });

  it("never shows or shares a previous session's roster after switching sessions", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    let failSecond: ((error: unknown) => void) | undefined;
    mockGet.mockImplementation((url: string) => {
      if (url.endsWith("/model")) {
        return Promise.resolve({ data: { data: { fields: [] } } });
      }
      if (url.includes("/att2")) {
        return new Promise((_resolve, reject) => {
          failSecond = reject;
        });
      }
      if (isAvailability(url)) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: SHARE_SESSION } });
    });
    renderRoute(<WithSessionSwitcher />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Ada");

    fireEvent.click(screen.getByRole("button", { name: "open other session" }));

    // While the new session loads, the previous roster is already gone —
    // nothing stale on screen and nothing to share.
    await waitFor(() =>
      expect(screen.queryByText("Ada")).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "Share" })
    ).not.toBeInTheDocument();

    await waitFor(() => expect(failSecond).toBeDefined());
    await act(async () => {
      failSecond?.({ response: { status: 500, data: { error: "Server busy" } } });
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load this attendance");
    expect(alert).toHaveTextContent("Server busy");
    expect(
      screen.queryByRole("button", { name: "Share" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  it("shares the roster of the session that is actually open", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url.endsWith("/model")
            ? { fields: [] }
            : url.includes("/att2")
            ? OTHER_SESSION
            : SHARE_SESSION,
        },
      })
    );
    renderRoute(<WithSessionSwitcher />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Ada");

    fireEvent.click(screen.getByRole("button", { name: "open other session" }));
    await screen.findByText("Tolu");
    expect(screen.queryByText("Ada")).not.toBeInTheDocument();

    await shareReport();
    const text = sharedText(open);
    expect(text).toContain("Bro Tolu");
    expect(text).toContain("*Absent Members: 0*");
    expect(text).not.toContain("Bro Ada");
    expect(text).not.toContain("Former member");
  });

  it("never shares a previous organisation's roster when the organisation changes", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    mockGet.mockImplementation((url: string) => {
      if (url.endsWith("/model")) {
        return Promise.resolve({ data: { data: { fields: [] } } });
      }
      if (url.includes("/org2/")) return new Promise(() => undefined);
      if (isAvailability(url)) return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: { data: SHARE_SESSION } });
    });
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Ada");

    act(() => {
      useGlobalStore.setState({
        organisation: {
          ...EMPTY_ORG,
          id: "org2",
          attendanceStatuses: CUSTOM_STATUSES,
        },
      });
    });

    await waitFor(() =>
      expect(screen.queryByText("Ada")).not.toBeInTheDocument()
    );
    expect(
      screen.queryByRole("button", { name: "Share" })
    ).not.toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
  });

  describe("AWAY members", () => {
    // Resolves availability requests one at a time, in the test's order.
    const deferAvailability = () => {
      const pending: {
        url: string;
        resolve: (periods: unknown[]) => void;
        reject: (error: unknown) => void;
      }[] = [];
      mockGet.mockImplementation((url: string) => {
        if (isAvailability(url)) {
          return new Promise((resolve, reject) => {
            pending.push({
              url,
              resolve: (periods) => resolve({ data: { data: periods } }),
              reject,
            });
          });
        }
        return Promise.resolve({
          data: {
            data: url.endsWith("/model")
              ? { fields: [] }
              : url.includes("/att2")
              ? OTHER_SESSION
              : SHARE_SESSION,
          },
        });
      });
      return pending;
    };

    it("fetches the session date's availability and lists AWAY in the shared message", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      availability = [
        awayPeriod("a2", "Chidi Bello", "2026-09-30"),
        awayPeriod("a1", "Ada Okafor", "2026-09-14"),
        // Efe was manually added and marked present: never also AWAY.
        awayPeriod("s5", "Efe", "2026-09-10"),
        // Chidi (excused) and an unresolved roster entry are on the roster too.
        awayPeriod("s3", "Chidi", "2026-09-10"),
        awayPeriod("s7", "Former Someone", "2026-09-10"),
      ];
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      expect(
        await screen.findByRole("button", { name: /preparing message/i }),
      ).toBeDisabled();
      const preview = await screen.findByTestId("share-preview");
      expect(availabilityCalls().map(([url]) => url)).toEqual([
        "/attendance/org1/availability?date=2026-09-01",
      ]);
      expect(open).not.toHaveBeenCalled();
      expect(preview).toHaveTextContent("AWAY — 2");

      fireEvent.click(screen.getByRole("button", { name: "Share now" }));
      const text = sharedText(open);
      expect(text).toContain(
        "*EXCUSED — 2*\nBro Chidi — Tenor\nFormer member (profile unavailable)\n\n" +
          "*AWAY — 2*\nAda Okafor — Until 14 Sep 2026\nChidi Bello — Until 30 Sep 2026\n\n" +
          "🔴 *Absent Members: 1*",
      );
      // The same Stage 1 figures; nothing about the periods but name and end.
      expect(text).toContain("✅ Present: 3  |  ✅ Late: 2  |  🟡 Excused: 2");
      expect(text).not.toMatch(/Hospital|20 Aug|2026-08-20|officer-1|\ba[12]\b|Bro Ada Okafor|Efe — Until/);
      // Shared once, then the preview closes.
      await waitFor(() =>
        expect(screen.queryByTestId("share-preview")).not.toBeInTheDocument(),
      );
      expect(open).toHaveBeenCalledTimes(1);
    });

    it("keeps AWAY and the figures the same while page filters are applied", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      availability = [awayPeriod("a1", "Ada Okafor", "2026-09-14")];
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      await shareReport();
      const unfiltered = sharedText(open);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
      await shareReport();
      expect(sharedText(open, 1)).toBe(unfiltered);
      expect(unfiltered).toContain("*AWAY — 1*\nAda Okafor — Until 14 Sep 2026");
    });

    it("lists AWAY with the generic template too", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      useGlobalStore.setState({
        organisation: {
          ...EMPTY_ORG,
          id: "org1",
          name: "Lakeside Tennis Club",
          attendanceStatuses: CUSTOM_STATUSES,
          attendanceShareTemplate: "generic",
        },
      });
      availability = [awayPeriod("a1", "Ada Okafor", "2026-09-14")];
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      await shareReport();
      expect(sharedText(open)).toContain(
        "*EXCUSED — 2*\nChidi\nFormer member (profile unavailable)\n\n" +
          "*AWAY — 1*\nAda Okafor — Until 14 Sep 2026\n\n🔴 *Absent Members: 1*",
      );
    });

    it("reads availability afresh for every share", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      availability = [awayPeriod("a1", "Ada Okafor", "2026-09-14")];
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      await shareReport();
      expect(sharedText(open, 0)).toContain("Ada Okafor — Until 14 Sep 2026");

      // The period is extended…
      availability = [awayPeriod("a1", "Ada Okafor", "2026-10-02")];
      await shareReport();
      expect(sharedText(open, 1)).toContain("*AWAY — 1*\nAda Okafor — Until 02 Oct 2026");

      // …then archived: the section disappears.
      availability = [];
      await shareReport();
      expect(sharedText(open, 2)).not.toContain("AWAY");
      expect(availabilityCalls()).toHaveLength(3);
    });

    it("never shares when availability fails, and retries on request", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      const pending = deferAvailability();
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(pending).toHaveLength(1));
      await act(async () => {
        pending[0].reject({ response: { status: 500, data: { error: "Server busy" } } });
      });

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Couldn't prepare the report. Nothing was shared.");
      expect(alert).toHaveTextContent("Server busy");
      expect(screen.queryByRole("button", { name: "Share now" })).not.toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();

      fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(pending).toHaveLength(2));
      await act(async () => {
        pending[1].resolve([awayPeriod("a1", "Ada Okafor", "2026-09-14")]);
      });
      fireEvent.click(await screen.findByRole("button", { name: "Share now" }));
      expect(sharedText(open)).toContain("*AWAY — 1*");
      expect(screen.queryByText(/Nothing was shared/)).not.toBeInTheDocument();
    });

    it("lets the officer cancel a failed share without changing anything", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      const pending = deferAvailability();
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(pending).toHaveLength(1));
      await act(async () => pending[0].reject(new Error("offline")));
      fireEvent.click(
        within(await screen.findByRole("alert")).getByRole("button", { name: "Cancel" }),
      );

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockPatch).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    it("sends one request per preparation and ignores an older response", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      const pending = deferAvailability();
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      const preparing = await screen.findByRole("button", { name: /preparing message/i });
      fireEvent.click(preparing);
      fireEvent.click(preparing);
      await waitFor(() => expect(pending).toHaveLength(1));

      // Fails, is retried, and the retry answers first.
      await act(async () => pending[0].reject(new Error("offline")));
      fireEvent.click(
        within(await screen.findByRole("alert")).getByRole("button", { name: "Retry" }),
      );
      await waitFor(() => expect(pending).toHaveLength(2));
      await act(async () => {
        pending[1].resolve([awayPeriod("a1", "Newest Answer", "2026-09-14")]);
      });
      expect(await screen.findByTestId("share-preview")).toHaveTextContent("Newest Answer");
      expect(availabilityCalls()).toHaveLength(2);
      expect(open).not.toHaveBeenCalled();
    });

    it("discards a pending report when the session changes", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      const pending = deferAvailability();
      renderRoute(<WithSessionSwitcher />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(pending).toHaveLength(1));
      fireEvent.click(screen.getByRole("button", { name: "open other session" }));
      await screen.findByText("Tolu");

      await act(async () => {
        pending[0].resolve([awayPeriod("a1", "Ada Okafor", "2026-09-14")]);
      });
      expect(screen.queryByTestId("share-preview")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Share now" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Share" })).toBeEnabled();
      expect(open).not.toHaveBeenCalled();
    });

    it("discards a prepared report when the organisation changes", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      const pending = deferAvailability();
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(pending).toHaveLength(1));
      await act(async () => {
        pending[0].resolve([awayPeriod("a1", "Ada Okafor", "2026-09-14")]);
      });
      const shareNow = await screen.findByRole("button", { name: "Share now" });

      act(() => {
        useGlobalStore.setState({
          organisation: { ...EMPTY_ORG, id: "org2", attendanceStatuses: CUSTOM_STATUSES },
        });
      });
      // Even a tap that lands on the closing preview sends nothing.
      fireEvent.click(shareNow);
      await waitFor(() =>
        expect(screen.queryByTestId("share-preview")).not.toBeInTheDocument(),
      );
      expect(open).not.toHaveBeenCalled();
    });

    it("discards a pending report when the organisation changes", async () => {
      const open = jest.spyOn(window, "open").mockImplementation(() => null);
      const pending = deferAvailability();
      renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
      await screen.findByText("Ada");

      fireEvent.click(screen.getByRole("button", { name: "Share" }));
      await waitFor(() => expect(pending).toHaveLength(1));
      act(() => {
        useGlobalStore.setState({
          organisation: { ...EMPTY_ORG, id: "org2", attendanceStatuses: CUSTOM_STATUSES },
        });
      });
      await act(async () => {
        pending[0].resolve([awayPeriod("a1", "Ada Okafor", "2026-09-14")]);
      });

      expect(screen.queryByTestId("share-preview")).not.toBeInTheDocument();
      expect(open).not.toHaveBeenCalled();
    });

    describe("with the device share sheet", () => {
      const nativeShare = jest.fn();
      beforeEach(() => {
        nativeShare.mockReset();
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: nativeShare,
        });
      });
      afterEach(() => {
        delete (navigator as { share?: unknown }).share;
      });

      it("hands the prepared message to navigator.share in the Share now tap", async () => {
        const open = jest.spyOn(window, "open").mockImplementation(() => null);
        nativeShare.mockResolvedValue(undefined);
        availability = [awayPeriod("a1", "Ada Okafor", "2026-09-14")];
        renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
        await screen.findByText("Ada");

        fireEvent.click(screen.getByRole("button", { name: "Share" }));
        const shareNow = await screen.findByRole("button", { name: "Share now" });
        expect(nativeShare).not.toHaveBeenCalled();
        fireEvent.click(shareNow);

        // Called synchronously by the click itself.
        expect(nativeShare).toHaveBeenCalledTimes(1);
        expect(nativeShare.mock.calls[0][0].text).toContain(
          "*AWAY — 1*\nAda Okafor — Until 14 Sep 2026",
        );
        expect(open).not.toHaveBeenCalled();
        await waitFor(() =>
          expect(screen.queryByTestId("share-preview")).not.toBeInTheDocument(),
        );
      });

      it("opens the share sheet once for a double tap", async () => {
        let finish: () => void = () => undefined;
        nativeShare.mockImplementation(
          () => new Promise<void>((resolve) => (finish = resolve)),
        );
        renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
        await screen.findByText("Ada");

        await shareReport();
        fireEvent.click(screen.getByRole("button", { name: "Share now" }));
        expect(nativeShare).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/couldn't open its share options/)).not.toBeInTheDocument();
        await act(async () => finish());
        await waitFor(() =>
          expect(screen.queryByTestId("share-preview")).not.toBeInTheDocument(),
        );
      });

      it("keeps the preview open when the officer dismisses the share sheet", async () => {
        nativeShare.mockRejectedValue(Object.assign(new Error("cancelled"), { name: "AbortError" }));
        renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
        await screen.findByText("Ada");

        await shareReport();
        await act(async () => undefined);
        expect(screen.getByRole("button", { name: "Share now" })).toBeInTheDocument();
        expect(screen.queryByText(/couldn't open its share options/)).not.toBeInTheDocument();
      });

      it("offers WhatsApp from a fresh tap when the share sheet fails", async () => {
        const open = jest.spyOn(window, "open").mockImplementation(() => null);
        nativeShare.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
        renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
        await screen.findByText("Ada");

        await shareReport();
        expect(
          await screen.findByText(/couldn't open its share options. Nothing was shared/),
        ).toBeInTheDocument();
        expect(open).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole("button", { name: "Share via WhatsApp" }));
        expect(open).toHaveBeenCalledTimes(1);
        expect(sharedText(open)).toContain("*Absent Members: 1*");
        expect(nativeShare).toHaveBeenCalledTimes(1);
      });
    });
  });
});

describe("<ViewAttendance> delete visibility", () => {
  const setup = (over: { permissions?: PermissionKey[]; isOwner?: boolean }) =>
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org1",
        attendanceStatuses: CUSTOM_STATUSES,
        ...over,
      },
    });
  const renderPage = async () => {
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");
  };
  const deleteButton = () =>
    screen.queryByRole("button", { name: /Delete Attendance/ });

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    mockGet.mockImplementation(() =>
      Promise.resolve({ data: { data: SESSION } }),
    );
  });

  it("hides Delete from a view-only officer", async () => {
    setup({ permissions: ["attendance.view"] });
    await renderPage();
    expect(deleteButton()).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("lets an attendance manager delete after confirming", async () => {
    setup({ permissions: ["attendance.view", "attendance.manage"] });
    mockDelete.mockResolvedValue({ data: { data: "deleted" } });
    await renderPage();

    fireEvent.click(deleteButton()!);
    expect(mockDelete).not.toHaveBeenCalled();
    await confirmInDialog("Delete");
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/attendance/org1/att1", {
        data: undefined,
      }),
    );
  });

  it("sends nothing when the manager cancels the confirmation", async () => {
    setup({ permissions: ["attendance.view", "attendance.manage"] });
    await renderPage();

    fireEvent.click(deleteButton()!);
    const dialog = within(await screen.findByRole("alertdialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("shows Delete to the organisation owner", async () => {
    setup({ isOwner: true, permissions: [] });
    await renderPage();
    expect(deleteButton()).toBeInTheDocument();
  });
});

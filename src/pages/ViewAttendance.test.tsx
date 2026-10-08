import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { confirmAlert } from "react-confirm-alert";
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
jest.mock("react-confirm-alert", () => ({ confirmAlert: jest.fn() }));
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
const mockConfirm = confirmAlert as jest.Mock;

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
    mockDelete.mockImplementation(() =>
      Promise.reject({ response: { data: { error: undefined } } }),
    );
    renderRoute(<ViewAttendance />, "/attendance/:id", "/attendance/att1");
    await screen.findByText("Zara");

    fireEvent.click(screen.getByRole("button", { name: /Delete Session/ }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    const options = mockConfirm.mock.calls[0][0];
    expect(options.title).toBe("Delete Session");
    expect(options.message).toContain("delete this session record?");

    options.buttons[0].onClick();
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
  const dialog = async () => within(await screen.findByRole("dialog"));

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
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
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
    expect(
      within(statusSelect)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toEqual(["Choose a status", "Present", "Late"]);
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
    fireEvent.change((await dialog()).getByLabelText(/^Attendance status/), {
      target: { value: "present" },
    });
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
    fireEvent.change((await dialog()).getByLabelText(/^Attendance status/), {
      target: { value: "late" },
    });
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
    expect((await dialog()).getByText("Remove Tolu from this attendance?")).toBeInTheDocument();
    expect(
      (await dialog()).getByText(
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
    fireEvent.click((await dialog()).getByRole("button", { name: "Remove from this attendance" }));

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
    fireEvent.click((await dialog()).getByRole("button", { name: "Remove from this attendance" }));

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
      (await dialog()).getByRole("button", { name: "Remove from this rehearsal" })
    ).toBeInTheDocument();
  });
});

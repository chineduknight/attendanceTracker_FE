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

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("react-confirm-alert", () => ({ confirmAlert: jest.fn() }));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockDelete: jest.Mock = require("services/api").default.delete;
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
      organisation: { ...EMPTY_ORG, id: "org1", attendanceStatuses: CUSTOM_STATUSES },
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

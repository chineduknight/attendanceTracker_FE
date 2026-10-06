import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import theme from "styles/theme";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";
import MemberAttendanceAvailability from "pages/MemberAttendanceAvailability";

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockArchive = jest.fn();
const mockPeriods = [
  {
    id: "past",
    memberId: "member-1",
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    reason: "Old",
  },
  {
    id: "current",
    memberId: "member-1",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    reason: "Travel",
  },
  {
    id: "upcoming",
    memberId: "member-1",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    reason: "Exams",
  },
];

jest.mock("hooks/useMembers", () => ({
  useMembers: () => ({
    members: [{ id: "member-1", name: "Ada" }],
    isSuccess: true,
  }),
}));
jest.mock("hooks/useAttendanceAvailability", () => ({
  useAttendanceAvailabilityForMember: () => ({
    periods: mockPeriods,
    isLoading: false,
    isError: false,
  }),
  useAttendanceAvailabilityMutations: () => ({
    create: mockCreate,
    update: mockUpdate,
    archive: mockArchive,
    isSaving: false,
  }),
}));
jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const renderPage = () =>
  render(
    <ChakraProvider theme={theme}>
      <MemoryRouter
        initialEntries={["/member/member-1/attendance-availability"]}
      >
        <Routes>
          <Route
            path="/member/:memberId/attendance-availability"
            element={<MemberAttendanceAvailability />}
          />
        </Routes>
      </MemoryRouter>
    </ChakraProvider>
  );

describe("<MemberAttendanceAvailability>", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org-1",
        permissions: ["attendance.view", "attendance.manage"],
        terminology: {
          ...DEFAULT_TERMINOLOGY,
          memberSingular: "Student",
          memberPlural: "Students",
          attendanceSingular: "Rehearsal",
          attendancePlural: "Rehearsals",
        },
      },
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders for attendance.view and uses local Current, Upcoming and Past groups", () => {
    renderPage();
    expect(screen.getByText("Ada rehearsal availability")).toBeInTheDocument();
    expect(screen.getByText("CURRENT")).toBeInTheDocument();
    expect(screen.getByText("UPCOMING")).toBeInTheDocument();
    expect(screen.getByText("PAST")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Availability affects rehearsals created after it is saved. Existing rehearsals are not recalculated."
      )
    ).toBeInTheDocument();
  });

  it("shows management controls only with attendance.manage", () => {
    renderPage();
    expect(
      screen.getByRole("button", { name: "Add period" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(3);

    cleanup();
    useGlobalStore.setState({
      organisation: {
        ...EMPTY_ORG,
        id: "org-1",
        permissions: ["attendance.view"],
      },
    });
    renderPage();
    expect(
      screen.queryByRole("button", { name: "Add period" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit" })
    ).not.toBeInTheDocument();
  });

  it("creates, edits, clears a reason, validates length, and removes periods", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-12-01" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-12-02" },
    });
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "Conference" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    expect(mockCreate).toHaveBeenCalledWith(
      {
        memberId: "member-1",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
        reason: "Conference",
      },
      expect.any(Function)
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(mockUpdate).toHaveBeenCalledWith(
      "current",
      expect.objectContaining({ reason: "" }),
      expect.any(Function)
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByLabelText("Start date"), {
      target: { value: "2026-12-03" },
    });
    fireEvent.change(screen.getByLabelText("End date"), {
      target: { value: "2026-12-04" },
    });
    const reason = "x".repeat(201);
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: reason },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add period" }));
    expect(mockCreate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockArchive).toHaveBeenCalledWith("current", expect.any(Function));
    await waitFor(() => expect(mockArchive).toHaveBeenCalled());
  });
});

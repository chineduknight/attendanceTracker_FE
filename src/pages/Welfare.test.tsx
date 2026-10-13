import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { render } from "test-utils/render";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Welfare from "pages/Welfare";
import {
  DEFAULT_FEATURE_VISIBILITY,
  DEFAULT_TERMINOLOGY,
} from "helpers/organisationPresentation";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock("services/api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;

const TODAY = format(new Date(), "yyyy-MM-dd");
const SNAPSHOT_END = format(addDays(new Date(), 7), "yyyy-MM-dd");
const dayOffset = (offset: number) =>
  format(addDays(new Date(), offset), "yyyy-MM-dd");
/** Birthday rows render name, date and relative label as separate text. */
const expectBirthdayRow = async (offset: number, name: string) => {
  await screen.findByText(name);
  const row = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(name) !== null);
  expect(row).toHaveTextContent(
    format(addDays(new Date(), offset), "EEE, d MMM"),
  );
  expect(row).toHaveTextContent(`In ${offset} days`);
};

/** Summary tiles are buttons named by their label, then their count. */
const summaryTile = (label: string) =>
  screen.getByRole("button", { name: new RegExp(`^${label}`) });

const MEMBER_MODEL = {
  data: {
    fields: [
      { name: "name", type: "text" },
      { name: "dob", type: "date" },
    ],
  },
};

const period = (over: Record<string, unknown> = {}) => ({
  expected: 6,
  present: 3,
  excused: 1,
  absent: 2,
  presenceRate: 50,
  attendanceRate: 66.7,
  ...over,
});

const insight = (over: Record<string, unknown> = {}) => ({
  memberId: "m1",
  name: "Ada Okafor",
  signals: ["presence_drop_with_absence", "consecutive_absence"],
  recent: period(),
  previous: period({
    present: 6,
    excused: 0,
    absent: 0,
    presenceRate: 100,
    attendanceRate: 100,
  }),
  presenceChangePoints: -50,
  consecutiveAbsent: 2,
  lastPresentDate: "2025-09-28",
  ...over,
});

const OVERVIEW = {
  asOf: TODAY,
  settings: {
    reviewWindowDays: 14,
    presenceChangeThresholdPoints: 25,
    consecutiveAbsenceThreshold: 2,
    returningSoonDays: 7,
  },
  periods: {
    recent: { fromDate: "2025-09-24", toDate: "2025-10-07" },
    previous: { fromDate: "2025-09-10", toDate: "2025-09-23" },
  },
  summary: {
    attention: 1,
    communicated: 1,
    encouragement: 1,
    currentlyAway: 1,
    returningSoon: 1,
  },
  attention: [insight()],
  communicated: [
    insight({
      memberId: "m2",
      name: "Chika Obi",
      signals: ["presence_drop_communicated"],
      recent: period({
        expected: 4,
        present: 2,
        excused: 2,
        absent: 0,
        presenceRate: 50,
        attendanceRate: 100,
      }),
      previous: period({
        expected: 4,
        present: 4,
        excused: 0,
        absent: 0,
        presenceRate: 100,
        attendanceRate: 100,
      }),
      consecutiveAbsent: 0,
      lastPresentDate: "2025-10-01",
    }),
  ],
  encouragement: [
    insight({
      memberId: "m3",
      name: "Grace Eze",
      signals: ["presence_improving"],
      recent: period({
        present: 6,
        excused: 0,
        absent: 0,
        presenceRate: 100,
        attendanceRate: 100,
      }),
      previous: period({
        present: 3,
        excused: 0,
        absent: 3,
        presenceRate: 50,
        attendanceRate: 50,
      }),
      presenceChangePoints: 50,
      consecutiveAbsent: 0,
      lastPresentDate: "2025-10-05",
    }),
  ],
  currentlyAway: [
    {
      memberId: "m4",
      name: "Favour James",
      startDate: "2025-09-20",
      endDate: "2025-10-10",
      reason: "Travelling",
      returnDate: "2025-10-11",
    },
  ],
  returningSoon: [
    {
      memberId: "m4",
      name: "Favour James",
      startDate: "2025-09-20",
      endDate: "2025-10-10",
      reason: "Travelling",
      returnDate: "2025-10-11",
    },
  ],
};

const EMPTY_OVERVIEW = {
  ...OVERVIEW,
  summary: {
    attention: 0,
    communicated: 0,
    encouragement: 0,
    currentlyAway: 0,
    returningSoon: 0,
  },
  attention: [],
  communicated: [],
  encouragement: [],
  currentlyAway: [],
  returningSoon: [],
};

const BIRTHDAY_RESPONSE = {
  data: {
    count: 1,
    members: [
      {
        name: "Ada Okeke",
        dob: "Wed, 02 January",
        birthdayOccurrence: {
          month: 1,
          day: 2,
          occurrenceDate: dayOffset(2),
        },
      },
    ],
  },
};

const serve = (over: Record<string, unknown> = {}) => {
  const overview = over.overview ?? OVERVIEW;
  const model = over.model ?? MEMBER_MODEL;
  const birthdays = over.birthdays ?? BIRTHDAY_RESPONSE;
  return mockGet.mockImplementation((url: string) => {
    const value = String(url);
    if (value.startsWith("/welfare/")) {
      return Promise.resolve({ data: { data: overview } });
    }
    if (value.includes("/model")) return Promise.resolve({ data: model });
    if (value.includes("/birthday"))
      return Promise.resolve({ data: birthdays });
    return Promise.resolve({ data: { data: {} } });
  });
};

const birthdayCalls = () =>
  mockGet.mock.calls.filter(([url]) =>
    String(url).includes("/members/birthday"),
  );

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/welfare"]}>
        <Routes>
          <Route path="/welfare" element={<Welfare />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
          <Route
            path="/analytics/member/:memberId"
            element={<div>member analytics</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const setOrg = (over: Partial<typeof EMPTY_ORG> = {}) =>
  useGlobalStore.setState({
    organisation: {
      ...EMPTY_ORG,
      id: "org1",
      permissions: ["attendance.view", "members.view"],
      ...over,
    },
  });

describe("<Welfare>", () => {
  beforeEach(() => {
    queryClient.clear();
    setOrg();
    serve();
  });

  it("loads useful data immediately with the exact review periods", async () => {
    renderPage();
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review window: last 14 days (24 Sep – 7 Oct) vs previous 14 days (10 Sep – 23 Sep)",
      ),
    ).toBeInTheDocument();
    const overviewCall = mockGet.mock.calls.find(([url]) =>
      String(url).startsWith("/welfare/"),
    );
    expect(String(overviewCall?.[0])).toBe(
      `/welfare/org1/overview?asOf=${TODAY}`,
    );
  });

  it("shows the backend summary counts as cards", async () => {
    renderPage();
    await screen.findByText("Ada Okafor");
    expect(
      within(summaryTile("Needs Check-in")).getByText(
        "1",
      ),
    ).toBeInTheDocument();
    expect(
      summaryTile("Encouragement"),
    ).toBeInTheDocument();
    expect(
      summaryTile("Currently Away"),
    ).toBeInTheDocument();
    expect(
      summaryTile("Returning Soon"),
    ).toBeInTheDocument();
  });

  it("jumps from a summary tile to its section and moves focus there", async () => {
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPage();
    await screen.findByText("Ada Okafor");

    fireEvent.click(summaryTile("Currently Away"));
    const away = screen.getByRole("region", { name: "Currently Away" });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(away);
    expect(away).toHaveFocus();

    fireEvent.click(summaryTile("Needs Check-in"));
    expect(
      screen.getByRole("region", { name: "Needs Check-in" }),
    ).toHaveFocus();
  });

  it("explains every attention reason with exact rates, change and last present", async () => {
    renderPage();
    await screen.findByText("Ada Okafor");
    expect(
      screen.getByText("Physical presence reduced, with unexplained absences"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 consecutive unexplained absences"),
    ).toBeInTheDocument();
    const ada = within(screen.getByRole("group", { name: "Ada Okafor" }));
    expect(
      ada.getByText("Physical presence: previous 100% → recent 50%", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(ada.getByText("↓ 50 pts")).toBeInTheDocument();
    expect(
      screen.getByText("Recent: 3 Present · 1 Excused · 2 Absent"),
    ).toBeInTheDocument();
    expect(screen.getByText("Last present: 28 Sep")).toBeInTheDocument();
  });

  it("keeps communicated members out of Needs Check-in and explains the excused absences", async () => {
    renderPage();
    await screen.findByText("Chika Obi");
    const attention = screen.getByRole("region", { name: "Needs Check-in" });
    expect(within(attention).queryByText("Chika Obi")).not.toBeInTheDocument();

    const communicated = screen.getByRole("region", { name: "Communicated" });
    expect(within(communicated).getByText("Chika Obi")).toBeInTheDocument();
    expect(
      within(communicated).getByText(
        "Physical presence reduced, but communicated",
      ),
    ).toBeInTheDocument();
    expect(
      within(communicated).getByText("Attendance Rate: 100%"),
    ).toBeInTheDocument();
    expect(
      within(communicated).getByText("The missed sessions were excused."),
    ).toBeInTheDocument();
  });

  it("uses positive encouragement copy", async () => {
    renderPage();
    await screen.findByText("Grace Eze");
    const encouragement = screen.getByRole("region", { name: "Encouragement" });
    expect(within(encouragement).getByText("Improving 🎉")).toBeInTheDocument();
    expect(
      within(encouragement).getByText("Physical presence improved"),
    ).toBeInTheDocument();
    expect(
      within(encouragement).getByText("↑ 50 pts"),
    ).toBeInTheDocument();
    expect(within(encouragement).queryByText(/score/i)).not.toBeInTheDocument();
  });

  it("never uses deficit wording", async () => {
    renderPage();
    await screen.findByText("Ada Okafor");
    expect(
      screen.queryByText(
        /poor|defaulter|problem member|worst attendance|bad attendance/i,
      ),
    ).not.toBeInTheDocument();
  });

  it("renders exactly the backend's arrays without reclassifying members", async () => {
    serve({
      overview: {
        ...OVERVIEW,
        summary: { ...OVERVIEW.summary, attention: 0 },
        attention: [],
      },
    });
    renderPage();
    await screen.findByText("Chika Obi");
    const attention = screen.getByRole("region", { name: "Needs Check-in" });
    expect(
      within(attention).getByText(
        /No members currently meet the check-in signals/,
      ),
    ).toBeInTheDocument();
    expect(within(attention).queryByText("Chika Obi")).not.toBeInTheDocument();
    expect(
      summaryTile("Needs Check-in"),
    ).toHaveTextContent("0");
  });

  it("shows the away and returning-soon facts the backend sent", async () => {
    renderPage();
    await screen.findByText("Favour James");
    const away = screen.getByRole("region", { name: "Currently Away" });
    expect(within(away).getByText("Favour James")).toBeInTheDocument();
    expect(within(away).getByText("Away: 20 Sep – 10 Oct")).toBeInTheDocument();
    expect(within(away).getByText("Returns: 11 Oct")).toBeInTheDocument();
    expect(within(away).getByText("Reason: Travelling")).toBeInTheDocument();

    const returning = screen.getByRole("region", { name: "Returning Soon" });
    expect(
      within(returning).getByText("11 Oct — Favour James"),
    ).toBeInTheDocument();
  });

  it("shows neutral empty states when nothing fires", async () => {
    serve({
      overview: EMPTY_OVERVIEW,
      birthdays: { data: { count: 0, members: [] } },
    });
    renderPage();
    expect(
      await screen.findByText(
        "No members currently meet the check-in signals for this review window.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "No major improvement signal yet for this comparison period.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No members are currently recorded as away."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No members are returning in the next 7 days."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No birthdays in this review range."),
    ).toBeInTheDocument();
  });

  it("uses organisation terminology for member and attendance words", async () => {
    setOrg({
      terminology: {
        ...DEFAULT_TERMINOLOGY,
        memberSingular: "Student",
        memberPlural: "Students",
        attendanceSingular: "Session",
      },
    });
    renderPage();
    await screen.findByText("Ada Okafor");
    expect(
      screen.getAllByRole("link", { name: "View session history" }),
    ).toHaveLength(3);
  });

  it("links each insight to member analytics over the full comparison horizon", async () => {
    renderPage();
    await screen.findByText("Ada Okafor");
    const links = screen.getAllByRole("link", {
      name: "View attendance history",
    });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute(
      "href",
      "/analytics/member/m1?fromDate=2025-09-10&toDate=2025-10-07",
    );
  });

  it("blocks viewers without attendance.view", async () => {
    setOrg({ permissions: ["members.view"] });
    renderPage();
    expect(await screen.findByText("dashboard")).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith("You don't have access to that.");
  });

  it("allows an owner", async () => {
    setOrg({ isOwner: true, permissions: [] });
    renderPage();
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
  });

  it("clears the previous organisation's insight when switching orgs", async () => {
    mockGet.mockImplementation((url: string) => {
      const value = String(url);
      if (value.startsWith("/welfare/org1/")) {
        return Promise.resolve({ data: { data: OVERVIEW } });
      }
      if (value.startsWith("/welfare/org2/")) {
        return Promise.resolve({ data: { data: EMPTY_OVERVIEW } });
      }
      if (value.includes("/model"))
        return Promise.resolve({ data: MEMBER_MODEL });
      if (value.includes("/birthday")) {
        return Promise.resolve({ data: BIRTHDAY_RESPONSE });
      }
      return Promise.resolve({ data: { data: {} } });
    });
    renderPage();
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();

    act(() => setOrg({ id: "org2" }));
    await waitFor(() =>
      expect(screen.queryByText("Ada Okafor")).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(
        "No members currently meet the check-in signals for this review window.",
      ),
    ).toBeInTheDocument();
  });

  describe("birthday snapshot", () => {
    it("queries the review date through +7 days and renders the result", async () => {
      renderPage();
      await expectBirthdayRow(2, "Ada Okeke");
      expect(
        screen.getByRole("heading", { name: "Upcoming Birthdays" }),
      ).toBeInTheDocument();

      expect(birthdayCalls()).toHaveLength(1);
      const url = String(birthdayCalls()[0][0]);
      expect(url).toContain("/organisations/org1/members/birthday?");
      expect(url).toContain(`startDate=${TODAY}`);
      expect(url).toContain(`endDate=${SNAPSHOT_END}`);
      expect(
        within(
          summaryTile("Upcoming Birthdays"),
        ).getByText("1"),
      ).toBeInTheDocument();
      // The actual review range, never "Today through ..." copy.
      expect(
        screen.getByText(
          `${format(new Date(), "d MMM")} – ${format(
            addDays(new Date(), 7),
            "d MMM",
          )}`,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Today through/)).not.toBeInTheDocument();
    });

    it("prefers occurrence metadata and still renders legacy rows", async () => {
      serve({
        birthdays: {
          data: {
            count: 2,
            members: [
              { name: "Legacy Member", dob: dayOffset(3) },
              {
                name: "Metadata Member",
                dob: "Wed, 02 January",
                birthdayOccurrence: {
                  month: 1,
                  day: 2,
                  occurrenceDate: dayOffset(4),
                },
              },
            ],
          },
        },
      });
      renderPage();
      await expectBirthdayRow(4, "Metadata Member");
      await expectBirthdayRow(3, "Legacy Member");
    });

    it("hides the section and never calls the API without members.view", async () => {
      setOrg({ permissions: ["attendance.view"] });
      renderPage();
      await screen.findByText("Ada Okafor");
      expect(
        screen.queryByRole("heading", { name: "Upcoming Birthdays" }),
      ).not.toBeInTheDocument();
      expect(birthdayCalls()).toHaveLength(0);
      expect(
        mockGet.mock.calls.some(([url]) => String(url).includes("/model")),
      ).toBe(false);
    });

    it("hides the section when the birthdays module is off", async () => {
      setOrg({
        featureVisibility: { ...DEFAULT_FEATURE_VISIBILITY, birthdays: false },
      });
      renderPage();
      await screen.findByText("Ada Okafor");
      expect(
        screen.queryByRole("heading", { name: "Upcoming Birthdays" }),
      ).not.toBeInTheDocument();
      expect(birthdayCalls()).toHaveLength(0);
    });

    it("hides the section when the member model has no dob date field", async () => {
      serve({ model: { data: { fields: [{ name: "name", type: "text" }] } } });
      renderPage();
      await screen.findByText("Ada Okafor");
      await waitFor(() =>
        expect(
          mockGet.mock.calls.some(([url]) => String(url).includes("/model")),
        ).toBe(true),
      );
      expect(
        screen.queryByRole("heading", { name: "Upcoming Birthdays" }),
      ).not.toBeInTheDocument();
      expect(birthdayCalls()).toHaveLength(0);
    });

    it("offers a retry when the overview fails to load", async () => {
      let overviewFails = true;
      mockGet.mockImplementation((url: string) => {
        const value = String(url);
        if (value.startsWith("/welfare/") && value.includes("/overview")) {
          return overviewFails
            ? Promise.reject({ response: { status: 500, data: { error: "Welfare service down" } } })
            : Promise.resolve({ data: { data: OVERVIEW } });
        }
        if (value.includes("/model"))
          return Promise.resolve({ data: MEMBER_MODEL });
        return Promise.resolve({ data: { data: {} } });
      });
      renderPage();
      expect(
        await screen.findByText("Couldn't load Welfare & Engagement"),
      ).toBeInTheDocument();
      expect(screen.getByText("Welfare service down")).toBeInTheDocument();

      overviewFails = false;
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    });

    it("keeps Welfare working when the birthday query fails", async () => {
      mockGet.mockImplementation((url: string) => {
        const value = String(url);
        if (value.startsWith("/welfare/")) {
          return Promise.resolve({ data: { data: OVERVIEW } });
        }
        if (value.includes("/model"))
          return Promise.resolve({ data: MEMBER_MODEL });
        if (value.includes("/birthday")) {
          return Promise.reject(new Error("birthday endpoint down"));
        }
        return Promise.resolve({ data: { data: {} } });
      });
      renderPage();
      expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
      expect(
        await screen.findByText("Birthday data is unavailable right now."),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^Upcoming Birthdays/ }),
      ).not.toBeInTheDocument();
    });
  });
});

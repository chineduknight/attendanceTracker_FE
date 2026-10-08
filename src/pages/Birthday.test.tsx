import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { addDays, addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Birthday from "pages/Birthday";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;

const TODAY = format(new Date(), "yyyy-MM-dd");
const dayOffset = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd");
const displayAt = (offset: number) => format(addDays(new Date(), offset), "EEE, d MMM");
const NEXT7_END = dayOffset(7);
const NEXT30_END = dayOffset(30);
// Secondary ranges sit behind the "More ranges" menu.
const chooseMoreRange = async (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: /^More ranges/ }));
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
};
const THIS_MONTH_START = format(startOfMonth(new Date()), "yyyy-MM-dd");
const THIS_MONTH_END = format(endOfMonth(new Date()), "yyyy-MM-dd");
const NEXT_MONTH_START = format(startOfMonth(addMonths(new Date(), 1)), "yyyy-MM-dd");
const NEXT_MONTH_END = format(endOfMonth(addMonths(new Date(), 1)), "yyyy-MM-dd");
const THREE_MONTHS_END = format(endOfMonth(addMonths(new Date(), 3)), "yyyy-MM-dd");

const MEMBER_MODEL = {
  data: {
    fields: [
      { name: "name", type: "text" },
      { name: "status", type: "option", options: ["active", "inactive", "alumni"] },
      { name: "dob", type: "date" },
    ],
  },
};
const ORG2_MODEL = {
  data: {
    fields: [
      { name: "name", type: "text" },
      { name: "status", type: "option", options: ["active"] },
      { name: "dob", type: "date" },
    ],
  },
};
const MODEL_WITHOUT_DOB = {
  data: { fields: [{ name: "name", type: "text" }] },
};
const MODEL_WITHOUT_STATUS = {
  data: {
    fields: [
      { name: "name", type: "text" },
      { name: "dob", type: "date" },
    ],
  },
};
const MODEL_EMPTY_STATUS_OPTIONS = {
  data: {
    fields: [
      { name: "name", type: "text" },
      { name: "status", type: "option", options: [] },
      { name: "dob", type: "date" },
    ],
  },
};

const withMetadata = (name: string, offset: number, status = "active") => {
  const date = addDays(new Date(), offset);
  return {
    _id: name,
    name,
    status,
    // Deliberately not a parseable legacy value: metadata must be preferred.
    dob: `display-${name}`,
    birthdayOccurrence: {
      month: date.getMonth() + 1,
      day: date.getDate(),
      occurrenceDate: dayOffset(offset),
    },
  };
};

const DEFAULT_MEMBERS = [
  withMetadata("Ada Okafor", 0),
  withMetadata("Chika Obi", 2),
  withMetadata("Grace Eze", 9, "alumni"),
];

const birthdayUrlInfo = (url: string) => {
  const parsed = new URL(String(url), "http://localhost");
  return {
    startDate: parsed.searchParams.get("startDate"),
    endDate: parsed.searchParams.get("endDate"),
    status: parsed.searchParams.get("status"),
  };
};

const serve = ({
  model = MEMBER_MODEL,
  members = DEFAULT_MEMBERS,
  exportUrl = "https://exports.example.org/birthdays.xlsx",
}: any = {}) =>
  mockGet.mockImplementation((url: string) => {
    const value = String(url);
    if (value.includes("/model")) return Promise.resolve({ data: model });
    if (value.includes("/members/birthday/export")) {
      return Promise.resolve({ data: { data: exportUrl ?? {} } });
    }
    if (value.includes("/members/birthday?")) {
      const { startDate, endDate, status } = birthdayUrlInfo(value);
      const inRange = members.filter((m: any) => {
        const occurrence = m.birthdayOccurrence?.occurrenceDate ?? m.dob;
        return (
          startDate != null &&
          endDate != null &&
          occurrence >= startDate &&
          occurrence <= endDate
        );
      });
      const selected = status ? status.split(",") : [];
      const filtered = selected.length
        ? inRange.filter((m: any) => selected.includes(m.status))
        : inRange;
      return Promise.resolve({
        data: { data: { count: filtered.length, members: filtered } },
      });
    }
    return Promise.resolve({ data: { data: {} } });
  });

const birthdayCalls = () =>
  mockGet.mock.calls.filter(([url]) =>
    String(url).includes("/members/birthday?"),
  );

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/birthday"]}>
        <Routes>
          <Route path="/birthday" element={<Birthday />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const setOrg = (over: Partial<typeof EMPTY_ORG> = {}) =>
  useGlobalStore.setState({
    organisation: {
      ...EMPTY_ORG,
      id: "org1",
      permissions: ["members.view"],
      ...over,
    },
  });

const openStatusSelect = async () => {
  const combo = screen.getByRole("combobox");
  fireEvent.focus(combo);
  fireEvent.keyDown(combo, { key: "ArrowDown" });
  return combo;
};

describe("<Birthday> proactive experience", () => {
  beforeEach(() => {
    queryClient.clear();
    setOrg();
    serve();
  });

  it("auto-loads today → +30 with one shared snapshot request and no Find click", async () => {
    renderPage();
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.getByText("Chika Obi")).toBeInTheDocument();
    expect(screen.getByText("Grace Eze")).toBeInTheDocument();

    const snapshotCalls = birthdayCalls().filter(([url]) => {
      const info = birthdayUrlInfo(String(url));
      return info.startDate === TODAY && info.endDate === NEXT30_END;
    });
    // Summary and list share one cache key: exactly one request, no status.
    expect(snapshotCalls).toHaveLength(1);
    expect(String(snapshotCalls[0][0])).not.toContain("status=");

    expect(
      within(screen.getByRole("button", { name: /^Today/ })).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /^Next 7 Days/ })).getByText(
        "2",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /^Next 30 Days/ })).getByText(
        "3",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Find" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Apply" }),
    ).not.toBeInTheDocument();
  });

  it("narrows the list to today when the Today card is clicked", async () => {
    renderPage();
    await screen.findByText("Ada Okafor");

    fireEvent.click(screen.getByRole("button", { name: /^Today/ }));

    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.queryByText("Chika Obi")).not.toBeInTheDocument();
    await waitFor(() => {
      const calls = birthdayCalls().filter(([url]) => {
        const info = birthdayUrlInfo(String(url));
        return info.startDate === TODAY && info.endDate === TODAY;
      });
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("button", { name: /^Today/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("switches to the Next 7 Days range from its card", async () => {
    renderPage();
    await screen.findByText("Grace Eze");

    fireEvent.click(screen.getByRole("button", { name: /^Next 7 Days/ }));

    expect(await screen.findByText("Chika Obi")).toBeInTheDocument();
    expect(screen.queryByText("Grace Eze")).not.toBeInTheDocument();
    await waitFor(() => {
      const calls = birthdayCalls().filter(([url]) => {
        const info = birthdayUrlInfo(String(url));
        return info.endDate === NEXT7_END && info.startDate === TODAY;
      });
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it.each([
    ["This Month", THIS_MONTH_START, THIS_MONTH_END],
    ["Next Month", NEXT_MONTH_START, NEXT_MONTH_END],
    ["3 Months", THIS_MONTH_START, THREE_MONTHS_END],
  ])(
    "auto-loads the %s preset with full dates",
    async (label, startDate, endDate) => {
      renderPage();
      await screen.findByText("Ada Okafor");

      await chooseMoreRange(label);

      await waitFor(() => {
        const calls = birthdayCalls().filter(([url]) => {
          const info = birthdayUrlInfo(String(url));
          return info.startDate === startDate && info.endDate === endDate;
        });
        expect(calls.length).toBeGreaterThan(0);
      });
    },
  );

  it("labels the heading with the ACTIVE range, not the 30-day snapshot", async () => {
    const rangeLabel = (from: Date, to: Date) =>
      `${format(from, "d MMM")} → ${format(to, "d MMM")}`;
    renderPage();
    await screen.findByText("Ada Okafor");
    expect(
      screen.getByText(rangeLabel(new Date(), addDays(new Date(), 30))),
    ).toBeInTheDocument();

    await chooseMoreRange("Next Month");
    const nextMonth = addMonths(new Date(), 1);
    expect(
      await screen.findByText(
        rangeLabel(startOfMonth(nextMonth), endOfMonth(nextMonth)),
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Today/ }));
    expect(
      await screen.findByText(format(new Date(), "d MMM")),
    ).toBeInTheDocument();
  });

  it("requires a valid custom range before loading it", async () => {
    renderPage();
    await screen.findByText("Ada Okafor");

    await chooseMoreRange("Custom");
    const from = screen.getByLabelText("From date");
    const to = screen.getByLabelText("To date");
    // Seeded with the active range; make it invalid first.
    expect((from as HTMLInputElement).value).toBe(TODAY);
    expect((to as HTMLInputElement).value).toBe(NEXT30_END);

    fireEvent.change(from, { target: { value: dayOffset(10) } });
    fireEvent.change(to, { target: { value: dayOffset(5) } });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    fireEvent.change(to, { target: { value: dayOffset(12) } });
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply).not.toBeDisabled();
    fireEvent.click(apply);

    await waitFor(() => {
      const calls = birthdayCalls().filter(([url]) => {
        const info = birthdayUrlInfo(String(url));
        return info.startDate === dayOffset(10) && info.endDate === dayOffset(12);
      });
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(
      await screen.findByText("No birthdays found for this date range."),
    ).toBeInTheDocument();
  });

  it("loads dynamic status options and refreshes with the selected status", async () => {
    renderPage();
    await screen.findByText("Ada Okafor");

    await openStatusSelect();
    expect(await screen.findByText("Alumni")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Alumni"));

    expect(await screen.findByText("Grace Eze")).toBeInTheDocument();
    expect(screen.queryByText("Ada Okafor")).not.toBeInTheDocument();
    await waitFor(() => {
      const calls = birthdayCalls().filter(([url]) =>
        String(url).includes("status=alumni"),
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it("switches organisation without cache bleed and never sends stale statuses", async () => {
    mockGet.mockImplementation((url: string) => {
      const value = String(url);
      if (value.includes("/org2/") && value.includes("/model")) {
        return Promise.resolve({ data: ORG2_MODEL });
      }
      if (value.includes("/model")) return Promise.resolve({ data: MEMBER_MODEL });
      if (value.includes("/org2/members/birthday?")) {
        return Promise.resolve({
          data: {
            data: {
              count: 1,
              members: [{ _id: "b1", name: "Beta Member", dob: dayOffset(1) }],
            },
          },
        });
      }
      if (value.includes("/members/birthday?")) {
        return Promise.resolve({
          data: { data: { count: 3, members: DEFAULT_MEMBERS } },
        });
      }
      return Promise.resolve({ data: { data: {} } });
    });
    renderPage();
    await screen.findByText("Ada Okafor");

    // Choose an org1-only status first.
    await openStatusSelect();
    fireEvent.click(await screen.findByText("Alumni"));
    await waitFor(() =>
      expect(
        birthdayCalls().some(([url]) => String(url).includes("status=alumni")),
      ).toBe(true),
    );

    act(() => setOrg({ id: "org2" }));

    expect(await screen.findByText("Beta Member")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Ada Okafor")).not.toBeInTheDocument(),
    );

    const org2Calls = mockGet.mock.calls.filter(([url]) =>
      String(url).includes("/org2/members/birthday?"),
    );
    expect(org2Calls.length).toBeGreaterThan(0);
    org2Calls.forEach(([url]) => expect(String(url)).not.toContain("status="));
  });

  it("never invents status options when the model has no status field", async () => {
    serve({ model: MODEL_WITHOUT_STATUS });
    renderPage();

    // The page still auto-loads and fetches birthdays...
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(birthdayCalls().length).toBeGreaterThan(0);
    // ...without ever sending a status parameter.
    birthdayCalls().forEach(([url]) =>
      expect(String(url)).not.toContain("status="),
    );
    // No selector is exposed, so Active/Inactive are never offered.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
  });

  it("hides the status filter when the configured options are empty", async () => {
    serve({ model: MODEL_EMPTY_STATUS_OPTIONS });
    renderPage();

    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText("Inactive")).not.toBeInTheDocument();
    birthdayCalls().forEach(([url]) =>
      expect(String(url)).not.toContain("status="),
    );
  });

  it("does not call the Birthday API and explains when dob is not configured", async () => {
    serve({ model: MODEL_WITHOUT_DOB });
    renderPage();

    expect(
      await screen.findByText(
        /does not have a date-of-birth field configured/,
      ),
    ).toBeInTheDocument();
    expect(
      mockGet.mock.calls.some(([url]) => String(url).includes("/model")),
    ).toBe(true);
    expect(birthdayCalls()).toHaveLength(0);
  });

  it("shows honest empty states without fake zero pages", async () => {
    serve({ members: [] });
    renderPage();

    expect(
      await screen.findByText("No birthdays in the next 30 days."),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /^Next 30 Days/ })).getByText(
        "0",
      ),
    ).toBeInTheDocument();
  });
});

describe("<Birthday> sharing and exports", () => {
  beforeEach(() => {
    queryClient.clear();
    setOrg();
    serve();
  });

  it("builds share text from occurrence dates with Today and relative labels", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    renderPage();
    await screen.findByText("Ada Okafor");

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Share on WhatsApp/ }),
    );

    expect(open).toHaveBeenCalledTimes(1);
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(url.replace("https://wa.me/?text=", ""));
    expect(text).toContain(
      `🎂 Birthdays (${format(new Date(), "d MMM")} to ${format(
        addDays(new Date(), 30),
        "d MMM",
      )})`,
    );
    expect(text).toContain(`1. Ada Okafor — ${displayAt(0)} (Today)`);
    expect(text).toContain(`2. Chika Obi — ${displayAt(2)} (In 2 days)`);
    open.mockRestore();
  });

  it("copies the same active-list text to the clipboard", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    renderPage();
    await screen.findByText("Ada Okafor");

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Copy to Clipboard/ }),
    );

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain(
      `1. Ada Okafor — ${displayAt(0)} (Today)`,
    );
  });

  it("exports the ACTIVE range, not the backing 30-day snapshot", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    serve({ exportUrl: "https://exports.example.org/birthdays.xlsx" });
    renderPage();
    await screen.findByText("Ada Okafor");

    await chooseMoreRange("This Month");
    expect(await screen.findByText("Ada Okafor")).toBeInTheDocument();
    await waitFor(() => {
      const calls = birthdayCalls().filter(([url]) => {
        const info = birthdayUrlInfo(String(url));
        return info.startDate === THIS_MONTH_START;
      });
      expect(calls.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Export Excel/ }),
    );

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://exports.example.org/birthdays.xlsx",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    const exportCall = mockGet.mock.calls.find(([url]) =>
      String(url).includes("/members/birthday/export?"),
    );
    const exportUrl = String(exportCall?.[0]);
    expect(exportUrl).toContain(`startDate=${THIS_MONTH_START}`);
    expect(exportUrl).toContain(`endDate=${THIS_MONTH_END}`);
    open.mockRestore();
  });

  it("shows an error when an export response has no URL", async () => {
    serve({ exportUrl: null });
    renderPage();
    await screen.findByText("Ada Okafor");

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(await screen.findByRole("button", { name: /Export PDF/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to export PDF."),
    );
  });
});

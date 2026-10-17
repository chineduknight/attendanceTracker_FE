import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { system } from "styles/theme";
import { generatedCss, toggle, chooseOption, shownValue } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { PermissionKey } from "rbac/permissions";
import Finance from "pages/Finance";
import { ComplianceRow, MonthStatus, Obligation } from "components/finance/financeTypes";
import { CLEAR_START_DATE_NOTE, todayBusinessDate } from "helpers/financeCompliance";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const YEAR = new Date().getFullYear();
const U: MonthStatus = "unpaid";
const months = (statuses: MonthStatus[]) =>
  Object.fromEntries(statuses.map((s, i) => [String(i + 1), s]));

const duesNow: Obligation = { id: "dues-now", type: "dues", name: `${YEAR} Dues`, year: YEAR, amountPerMonth: 500 };
const levy: Obligation = { id: "levy", type: "levy", name: "Building Levy", amount: 10000, date: `${YEAR}-01-10` };

const ROWS: ComplianceRow[] = [
  {
    memberId: "ada", name: "Ada", accountable: true, status: "partial",
    months: months(["paid", "paid", "paid", U, U, U, U, U, U, U, U, U]),
    totalExpected: 6000, totalPaid: 1500, balance: 4500, paidUpToMonth: 3,
  },
  {
    memberId: "bola", name: "Bola", accountable: true, status: "paid",
    months: months(Array(12).fill("paid")),
    totalExpected: 6000, totalPaid: 6000, balance: 0, paidUpToMonth: 12,
  },
  { memberId: "chidi", name: "Chidi", accountable: false },
];

const SUMMARY = { totalMembers: 3, accountableMembers: 2, totalCollected: 7500, totalOutstanding: 4500 };

/** Same people as a newer backend reports them, with the arrears lens. */
const ARREARS_ROWS: ComplianceRow[] = [
  { ...ROWS[0], dueToDate: 2000, arrears: 500, monthsBehind: 1 },
  { ...ROWS[1], dueToDate: 2000, arrears: 0, monthsBehind: 0 },
  ROWS[2],
];
const ARREARS_SUMMARY = {
  ...SUMMARY, paidMembers: 1, totalExpected: 12000,
  totalDueToDate: 4000, totalArrears: 500, behindMembers: 1,
};

let complianceRows = ROWS;
let complianceSummary: Record<string, number> = SUMMARY;
const compliance = (obligation: Obligation) => ({
  obligation,
  summary: complianceSummary,
  rows: complianceRows,
});

const MEMBERS = [
  { id: "ada", name: "Ada", financialStartDate: `${YEAR}-01-01` },
  { id: "bola", name: "Bola", financialStartDate: `${YEAR}-01-01` },
  { id: "chidi", name: "Chidi", financialStartDate: null },
];

const serve = (obligations: Obligation[]) =>
  api.get.mockImplementation((url: string) => {
    const match = url.match(/obligations\/([^/]+)\/compliance/);
    if (match) {
      const ob = obligations.find((o) => o.id === match[1]) ?? obligations[0];
      return Promise.resolve({ data: { data: compliance(ob) } });
    }
    if (url.includes("/obligations")) return Promise.resolve({ data: { data: obligations } });
    if (url.includes("/members")) return Promise.resolve({ data: { data: MEMBERS } });
    return Promise.resolve({ data: { data: [] } });
  });

const setOrg = (id: string, permissions: PermissionKey[] | "owner") =>
  useGlobalStore.setState({
    organisation: {
      ...EMPTY_ORG,
      id,
      isOwner: permissions === "owner",
      permissions: permissions === "owner" ? [] : permissions,
    },
  });

const renderFinance = () =>
  render(
    <ChakraProvider value={system}>
      <QueryClientProvider client={queryClient}>
        <Finance />
      </QueryClientProvider>
    </ChakraProvider>,
  );

/**
 * Switch tabs and let the new panel settle: v3 mounts lazy tab content
 * through a presence machine, so an element grabbed straight after the
 * click can be a copy that is about to be replaced.
 */
const openTab = async (name: string) => {
  fireEvent.click(await screen.findByRole("tab", { name }));
  await waitFor(() =>
    expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true"),
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
};

const VIEWER: PermissionKey[] = ["finance.view"];
const MANAGER: PermissionKey[] = ["finance.view", "finance.manage"];

/** Each member row is one button whose accessible name starts with the name. */
const memberRow = async (name: string) =>
  within(await screen.findByRole("list")).getByRole("button", { name: new RegExp(`^${name}`) });

const BULK_URL = "/finance/org1/members/financial-start-date";

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  complianceRows = ROWS;
  complianceSummary = SUMMARY;
  serve([levy, duesNow]);
  api.post.mockResolvedValue({ data: { data: {} } });
  api.patch.mockImplementation((url: string, body: { memberIds?: string[] }) =>
    Promise.resolve({
      data: { data: url === BULK_URL ? { updated: body.memberIds ?? [], failed: [] } : {} },
    }),
  );
});

describe("Collect", () => {
  it("shows an invalid payment record as needs review / unknown, never as unpaid or owing", async () => {
    complianceRows = [
      ...ARREARS_ROWS,
      {
        memberId: "dayo", name: "Dayo", accountable: true, liable: true, status: "needs-review",
        invalidStoredAmount: true, months: months(Array(12).fill("unknown")),
        totalExpected: 6000, dueToDate: 2000, totalPaid: null, balance: null, arrears: null,
        compliance: null, paidUpToMonth: null, monthsBehind: null,
        recordedTotal: null, appliedTotal: null, unappliedCredit: null,
      },
    ];
    complianceSummary = { ...ARREARS_SUMMARY, invalidPaymentRows: 1, invalidRowsExpected: 6000 };
    setOrg("org1", MANAGER);
    renderFinance();

    expect(await screen.findByText(/1 payment record needs review: the amount is invalid, so it is left out of these totals/))
      .toBeInTheDocument();
    expect(screen.getByText("Amount unknown")).toBeInTheDocument();
    expect(screen.getByText("Needs review · amount unknown")).toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Filter by payment status" });
    expect(within(chips).getByText(/Needs review/)).toBeInTheDocument();
    // Not counted as owing / not paid in full.
    expect(screen.getByText("1 of 2 paid in full")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Dayo"));
    const sheet = await screen.findByRole("dialog");
    // Paid and Left to pay, plus all 12 month cells.
    expect(within(sheet).getAllByText("Unknown")).toHaveLength(14);
    expect(within(sheet).getByText(/New payments are paused for this record/)).toBeInTheDocument();
    expect(within(sheet).getByText(/what was paid is unknown/)).toBeInTheDocument();
    expect(within(sheet).queryByText(/₦0/)).not.toBeInTheDocument();
  });

  it("distinguishes recorded, applied and unapplied credit when credit is held", async () => {
    complianceSummary = {
      ...SUMMARY, totalCollected: 6000, totalApplied: 6000, totalOutstanding: 6000, totalExpected: 12000,
      totalRecorded: 8000, totalUnappliedCredit: 2000,
    };
    setOrg("org1", MANAGER);
    renderFinance();

    expect(await screen.findByText(/applied · 50%/)).toBeInTheDocument();
    expect(screen.getByText(/Recorded .*8,000 · Applied .*6,000 · Unapplied credit .*2,000/)).toBeInTheDocument();
    expect(screen.getByText(/6,000 left to pay/)).toBeInTheDocument();
  });

  it("opens on this year's dues with totals and status counts", async () => {
    setOrg("org1", MANAGER);
    renderFinance();

    expect(await screen.findByText(/applied · 63%/)).toBeInTheDocument();
    expect(shownValue(screen.getByLabelText("Obligation"))).toBe(`${YEAR} Dues`);
    expect(screen.getByText("1 of 2 paid in full")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Share applied of expected" })).toBeInTheDocument();
    expect(screen.queryByText(/collected/i)).not.toBeInTheDocument();
    // No credit in this summary, so no recorded / credit breakdown.
    expect(screen.queryByText(/Unapplied credit/)).not.toBeInTheDocument();
    const chips = screen.getByRole("group", { name: "Filter by payment status" });
    expect(within(chips).getByRole("button", { name: "Owing 1" })).toBeInTheDocument();
    expect(within(chips).getByRole("button", { name: "No start date 1" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(
      `/finance/org1/obligations/dues-now/compliance?asOf=${todayBusinessDate()}`,
    );
  });

  it("filters to who still owes and describes each in words", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await screen.findByRole("button", { name: "Owing 1" }));

    const list = screen.getByRole("list");
    expect(within(list).getByText("Ada")).toBeInTheDocument();
    expect(within(list).queryByText("Bola")).not.toBeInTheDocument();
    expect(within(list).getByText("Paid to Mar")).toBeInTheDocument();
    expect(within(list).getByRole("img", { name: /^Jan paid, Feb paid, Mar paid, Apr unpaid/ })).toBeInTheDocument();
  });

  it("lets a manager record a payment from the member sheet", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await memberRow("Ada"));

    fireEvent.click(await screen.findByRole("button", { name: /1 month/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/payments", {
        organisationId: "org1",
        obligationId: "dues-now",
        memberId: "ada",
        amount: 500,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Payment saved");
  });

  it("lets a manager set a start date for someone not yet accountable", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await memberRow("Chidi"));

    fireEvent.change(await screen.findByLabelText("Financial start date"), {
      target: { value: `${YEAR}-03-01` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set start date" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, set date" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/members/chidi/financial-start-date", {
        organisationId: "org1",
        financialStartDate: `${YEAR}-03-01`,
      }),
    );
  });

  it("shows a viewer the figures but no money or liability controls", async () => {
    setOrg("org1", VIEWER);
    renderFinance();
    fireEvent.click(await memberRow("Ada"));

    expect(await screen.findByText("Owing")).toBeInTheDocument();
    expect(screen.queryByLabelText("Amount received")).not.toBeInTheDocument();
    expect(screen.queryByText(/Correct the record/)).not.toBeInTheDocument();
  });

  it("hides start-date controls from a viewer", async () => {
    setOrg("org1", VIEWER);
    renderFinance();
    fireEvent.click(await memberRow("Chidi"));
    expect(await screen.findByText(/has no financial start date/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Financial start date")).not.toBeInTheDocument();
  });
});

describe("Obligations", () => {
  it("shows progress only when the backend sends a summary", async () => {
    serve([
      levy,
      {
        ...duesNow,
        summary: {
          totalMembers: 3, accountableMembers: 2, paidMembers: 1,
          totalExpected: 12000, totalCollected: 7500, totalOutstanding: 4500,
        },
      },
    ]);
    setOrg("org1", "owner");
    renderFinance();
    await openTab("Obligations");

    expect(await screen.findByText(/of .*12,000.* · 63%/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Share applied of expected")).toHaveLength(1);
  });

  it("shows amounts, not a member count that would include people not liable", async () => {
    // 3 accountable, but one joined after the levy date (liable: false,
    // expected 0): totalExpected excludes them, accountableMembers does not.
    serve([
      duesNow,
      {
        ...levy,
        summary: {
          totalMembers: 3, accountableMembers: 3, paidMembers: 1,
          totalExpected: 2000, totalCollected: 1400, totalOutstanding: 600,
        },
      },
    ]);
    setOrg("org1", "owner");
    renderFinance();
    await openTab("Obligations");

    expect(await screen.findByText(/1,400 applied of .*2,000 · 70%$/)).toBeInTheDocument();
    expect(screen.getByLabelText("Share applied of expected")).toBeInTheDocument();
    expect(screen.queryByText(/1 of 3/)).not.toBeInTheDocument();
    expect(screen.queryByText(/paid in full/)).not.toBeInTheDocument();
  });

  it("names the card figure as applied and shows unapplied credit separately", async () => {
    serve([
      levy,
      {
        ...duesNow,
        summary: {
          totalMembers: 3, accountableMembers: 2, paidMembers: 1,
          totalExpected: 12000, totalCollected: 6000, totalOutstanding: 6000,
          totalRecorded: 8000, totalUnappliedCredit: 2000,
        },
      },
    ]);
    setOrg("org1", "owner");
    renderFinance();
    await openTab("Obligations");

    expect(await screen.findByText(/6,000 applied of .*12,000 · 50%$/)).toBeInTheDocument();
    expect(screen.getByText(/2,000 unapplied credit held/)).toBeInTheDocument();
    expect(screen.queryByText(/collected/i)).not.toBeInTheDocument();
  });

  it("opens an obligation in Collect when tapped", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    await openTab("Obligations");
    fireEvent.click(await screen.findByText("Building Levy"));

    await waitFor(() =>
      expect(shownValue(screen.getByLabelText("Obligation"))).toBe("Building Levy"),
    );
  });

  it("hides create, rename and delete from a viewer", async () => {
    setOrg("org1", VIEWER);
    renderFinance();
    await openTab("Obligations");
    await screen.findByText("Building Levy");

    expect(screen.queryByRole("button", { name: "New obligation" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /More actions/ })).not.toBeInTheDocument();
  });

  it("offers a manager the way in when nothing exists yet", async () => {
    serve([]);
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await screen.findByRole("button", { name: "Set up an obligation" }));
    expect(await screen.findByRole("button", { name: "New obligation" })).toBeInTheDocument();
  });
});

describe("Start dates", () => {
  it("filters to members without a start date and bulk-sets after confirming", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    await openTab("Start dates");
    fireEvent.click(await screen.findByRole("button", { name: "No start date 1" }));

    const list = screen.getByRole("list");
    expect(within(list).queryByText("Ada")).not.toBeInTheDocument();
    await toggle(screen.getByLabelText("Select Chidi"));
    expect(screen.getByText("1 member selected")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Start date for selected"), {
      target: { value: `${YEAR}-02-01` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set date" }));
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Yes, set 1" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith(BULK_URL, {
      memberIds: ["chidi"],
      financialStartDate: `${YEAR}-02-01`,
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Start date set for 1 member"));
    await waitFor(() => expect(screen.queryByText(/members? selected$/)).not.toBeInTheDocument());
  });

  it("keeps only the failures selected after a partial bulk update", async () => {
    api.patch.mockResolvedValueOnce({
      data: {
        data: {
          updated: ["ada"],
          failed: [{ memberId: "bola", error: "The member you specified cannot be found" }],
        },
      },
    });
    setOrg("org1", MANAGER);
    renderFinance();
    await openTab("Start dates");
    fireEvent.click(await screen.findByLabelText("Select Ada"));
    await toggle(screen.getByLabelText("Select Bola"));
    fireEvent.change(screen.getByLabelText("Start date for selected"), {
      target: { value: `${YEAR}-02-01` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set date" }));

    // Both already have a start date, so the confirm says payments move.
    expect(await screen.findByText(/2 already have a start date\. Their recorded payments are kept as they are/))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Yes, set 2" }));

    await waitFor(() =>
      expect(toast.warn).toHaveBeenCalledWith(
        "Set for 1, 1 failed: The member you specified cannot be found",
      ),
    );
    await waitFor(() => expect(screen.getByLabelText("Select Ada")).not.toBeChecked());
    expect(screen.getByText("1 member selected")).toBeInTheDocument();
    expect(screen.getByLabelText("Select Bola")).toBeChecked();
  });

  it("tells the officer that clearing a start date keeps the member's payments", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    await openTab("Start dates");
    fireEvent.click(await screen.findByRole("button", { name: "Edit start date for Ada" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Clear financial start date" });
    expect(dialog).toHaveTextContent(CLEAR_START_DATE_NOTE);
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, clear" }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/members/ada/financial-start-date", {
        organisationId: "org1",
        financialStartDate: null,
      }),
    );
  });

  it("is read-only for a viewer", async () => {
    setOrg("org1", VIEWER);
    renderFinance();
    await openTab("Start dates");
    await screen.findByText("Chidi");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Edit start date/ })).not.toBeInTheDocument();
  });
});

describe("arrears lens", () => {
  beforeEach(() => {
    complianceRows = ARREARS_ROWS;
    complianceSummary = ARREARS_SUMMARY;
  });

  it("shows who is behind, not just who has months left", async () => {
    setOrg("org1", MANAGER);
    renderFinance();

    const overdue = await screen.findByRole("button", { name: /overdue · 1 behind/ });
    const list = screen.getByRole("list");
    expect(within(list).getByText("1 month behind")).toBeInTheDocument();
    expect(within(list).getByText(/500.* behind/)).toBeInTheDocument();
    expect(within(list).getByText("Behind")).toBeInTheDocument();

    fireEvent.click(overdue);
    expect(screen.getByRole("button", { name: "Behind 1" })).toHaveAttribute("aria-pressed", "true");
    expect(shownValue(screen.getByLabelText("Sort"))).toBe("Most behind");
    const filtered = screen.getByRole("list");
    expect(within(filtered).queryByText("Bola")).not.toBeInTheDocument();
  });

  it("offers clearing the arrears when recording", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await memberRow("Ada"));
    fireEvent.click(await screen.findByRole("button", { name: /Clear arrears/ }));
    expect(screen.getByLabelText("Amount received")).toHaveValue("500");
  });

  it("hides the Behind chip and sort for a backend without arrears", async () => {
    complianceRows = ROWS;
    complianceSummary = SUMMARY;
    setOrg("org1", MANAGER);
    renderFinance();
    await screen.findByRole("button", { name: "Owing 1" });
    expect(screen.queryByRole("button", { name: /^Behind/ })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Sort"), { key: "ArrowDown" });
    expect(await screen.findAllByRole("option")).not.toHaveLength(0);
    expect(screen.queryByRole("option", { name: "Most behind" })).not.toBeInTheDocument();
  });
});

describe("organisation switching", () => {
  it("drops the previous organisation's choice and only requests the new one's data", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    const picker = await screen.findByLabelText("Obligation");
    await chooseOption(picker, "Building Levy");
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/finance/org1/obligations/levy/compliance")),
    );

    api.get.mockClear();
    act(() => setOrg("org2", MANAGER));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/finance/org2/obligations/dues-now/compliance")),
    );
    expect(api.get.mock.calls.every(([url]: [string]) => !url.includes("org1"))).toBe(true);
    expect(shownValue(await screen.findByLabelText("Obligation"))).toBe(`${YEAR} Dues`);
  });

  it("resets the tab and any selections when the organisation changes", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    await openTab("Start dates");
    await toggle(await screen.findByLabelText("Select Chidi"));
    expect(screen.getByText("1 member selected")).toBeInTheDocument();

    act(() => setOrg("org2", MANAGER));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Collect" })).toHaveAttribute("aria-selected", "true"),
    );
    await openTab("Start dates");
    expect(await screen.findByLabelText("Select Chidi")).not.toBeChecked();
    expect(screen.queryByText(/members? selected$/)).not.toBeInTheDocument();
  });
});

describe("<Finance> load errors and phone targets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    complianceRows = ROWS;
    complianceSummary = SUMMARY;
    setOrg("org-a", MANAGER);
  });

  it("says obligations failed to load (not 'nothing to collect') and retries", async () => {
    api.get.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: { error: "Finance service down" } } }),
    );
    renderFinance();
    expect(await screen.findByText("Couldn't load obligations")).toBeInTheDocument();
    expect(screen.getByText("Finance service down")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to collect yet")).not.toBeInTheDocument();

    serve([duesNow]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Ada")).toBeInTheDocument();
  });

  it("gives the export menu and the tabs a 44px tap target", async () => {
    serve([duesNow]);
    renderFinance();
    await screen.findByText("Ada");
    for (const element of [
      screen.getByRole("button", { name: "Export" }),
      screen.getByRole("tab", { name: "Collect" }),
    ]) {
      expect(generatedCss(element)).toMatch(/min-height:\s*44px|height:\s*44px/);
    }
  });
});

describe("<Finance> creating obligations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    complianceRows = ROWS;
    complianceSummary = SUMMARY;
    setOrg("org-a", MANAGER);
    serve([duesNow]);
    api.post.mockResolvedValue({ data: { data: {} } });
  });

  it("shows dues with separators but posts a plain monthly amount", async () => {
    renderFinance();
    await openTab("Obligations");
    fireEvent.click(await screen.findByRole("button", { name: "New obligation" }));
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Dues" } });
    const perMonth = screen.getByLabelText("Per month");
    fireEvent.change(perMonth, { target: { value: "2500" } });
    expect(perMonth).toHaveValue("2,500");
    fireEvent.click(screen.getByRole("button", { name: "Create obligation" }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ type: "dues", name: "Dues", amountPerMonth: 2500 });
  });

  it("posts a levy's amount as a number and its date as YYYY-MM-DD", async () => {
    renderFinance();
    await openTab("Obligations");
    fireEvent.click(await screen.findByRole("button", { name: "New obligation" }));
    fireEvent.click(await screen.findByRole("button", { name: "One-off levy" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Robes" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "15000" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: `${YEAR}-03-14` } });
    fireEvent.click(screen.getByRole("button", { name: "Create obligation" }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({
      type: "levy",
      name: "Robes",
      amount: 15000,
      date: `${YEAR}-03-14`,
    });
  });
});

describe("<Finance> start dates on phones", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    complianceRows = ROWS;
    complianceSummary = SUMMARY;
    setOrg("org1", MANAGER);
    serve([duesNow]);
  });

  it("reads a stored ISO start date by its calendar day", async () => {
    const base = api.get.getMockImplementation()!;
    api.get.mockImplementation((url: string) =>
      url.includes("/members")
        ? Promise.resolve({
            data: { data: [{ id: "ada", name: "Ada", financialStartDate: `${YEAR}-01-01T00:00:00.000Z` }] },
          })
        : base(url),
    );
    renderFinance();
    await openTab("Start dates");
    fireEvent.click(await screen.findByRole("button", { name: "Edit start date for Ada" }));
    expect(await screen.findByLabelText("Financial start date")).toHaveValue(`Jan 1, ${YEAR}`);
    // Unchanged until a different day is picked.
    expect(screen.getByRole("button", { name: "Update start date" })).toBeDisabled();
  });

  it("hides the bulk bar while the search has focus, so the keyboard can't hide results", async () => {
    renderFinance();
    await openTab("Start dates");
    await toggle(await screen.findByLabelText("Select Chidi"));
    expect(screen.getByText("1 member selected")).toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search members");
    fireEvent.focus(search);
    expect(screen.queryByText("1 member selected")).not.toBeInTheDocument();
    fireEvent.blur(search);
    expect(screen.getByText("1 member selected")).toBeInTheDocument();
  });
});

describe("<Finance> obligations load failure across tabs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    complianceRows = ROWS;
    complianceSummary = SUMMARY;
    setOrg("org-a", MANAGER);
  });

  it("shows the load error on Obligations too, never a false empty state, and recovers both tabs", async () => {
    api.get.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: { error: "Finance service down" } } }),
    );
    renderFinance();
    expect(await screen.findByText("Couldn't load obligations")).toBeInTheDocument();

    await openTab("Obligations");
    // The Collect panel animates out; wait until only the Obligations one is left.
    await waitFor(() => expect(screen.getAllByText("Couldn't load obligations")).toHaveLength(1));
    expect(within(screen.getByRole("tabpanel")).getByText("Finance service down")).toBeInTheDocument();
    expect(screen.queryByText("No obligations yet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New obligation" })).not.toBeInTheDocument();

    serve([duesNow]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(duesNow.name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New obligation" })).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load obligations")).not.toBeInTheDocument();

    // Collect reads the same recovered query: no second error, no refetch needed.
    const calls = api.get.mock.calls.length;
    await openTab("Collect");
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("New obligation")).not.toBeInTheDocument());
    expect(screen.queryByText("Couldn't load obligations")).not.toBeInTheDocument();
    expect(
      api.get.mock.calls.slice(calls).some(([url]) => /\/obligations$|\/obligations\?/.test(String(url))),
    ).toBe(false);
  });

  it("keeps cached obligations on screen when a background refetch fails", async () => {
    serve([duesNow]);
    renderFinance();
    await openTab("Obligations");
    expect(await screen.findByText(duesNow.name)).toBeInTheDocument();

    api.get.mockImplementation(() =>
      Promise.reject({ response: { status: 500, data: { error: "Finance service down" } } }),
    );
    await act(async () => {
      await queryClient.refetchQueries();
    });

    expect(screen.getByText(duesNow.name)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load obligations")).not.toBeInTheDocument();
  });
});

describe("<Finance> pinned search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    complianceRows = ROWS;
    complianceSummary = SUMMARY;
    setOrg("org-a", MANAGER);
    serve([duesNow]);
  });

  /** The sticky search bar wrapping this input. */
  const stickyBarOf = (input: HTMLElement) => {
    let element: HTMLElement | null = input;
    while (element && !/position:\s*sticky/.test(generatedCss(element))) {
      // The DOM tree is the behaviour here: a sticky bar is bounded by its parent.
      // eslint-disable-next-line testing-library/no-node-access
      element = element.parentElement;
    }
    return element;
  };

  it.each(["Collect", "Start dates"])(
    "%s: the search bar's parent spans the list, so it stays pinned while scrolling",
    async (tab) => {
      renderFinance();
      if (tab !== "Collect") await openTab(tab);
      const row = await screen.findByText("Ada");
      const bar = stickyBarOf(screen.getByPlaceholderText("Search members"));
      expect(bar).not.toBeNull();
      // A sticky element can't leave its parent: if the parent ends above
      // the list, the bar scrolls away with it.
      // eslint-disable-next-line testing-library/no-node-access
      expect(bar!.parentElement).toContainElement(row);
    },
  );
});

describe("<Finance> stale-screen correction guard (F0c)", () => {
  const GUARD = { paymentRowExists: true, paymentRevision: 2, memberFinanceRevision: 5 };
  const NEWER = { paymentRowExists: true, paymentRevision: 3, memberFinanceRevision: 5 };
  const adaWith = (correctionGuard?: object, extra: Partial<ComplianceRow> = {}): ComplianceRow[] => [
    { ...ROWS[0], correctionGuard, ...extra } as ComplianceRow,
    ROWS[1],
    ROWS[2],
  ];
  /** Ada after another officer recorded April. */
  const adaPaidToApr = (correctionGuard: object) =>
    adaWith(correctionGuard, {
      months: months(["paid", "paid", "paid", "paid", U, U, U, U, U, U, U, U]),
      totalPaid: 2000, balance: 4000, paidUpToMonth: 4,
    });
  const levyRows = (correctionGuard?: object, extra: Partial<ComplianceRow> = {}): ComplianceRow[] => [
    { memberId: "ada", name: "Ada", accountable: true, liable: true, status: "partial",
      expected: 10000, paid: 2000, balance: 8000, correctionGuard, ...extra } as ComplianceRow,
  ];
  const httpError = (status: number, error = "Rejected") => ({ response: { status, data: { error } } });

  /**
   * A compliance fetch that stays pending until released. Created up front so
   * releasing it can never race the fetch invalidateQueries starts.
   */
  const hungCompliance = (obligation: Obligation, summary: Record<string, number> = SUMMARY) => {
    let resolve: (rows: ComplianceRow[]) => void = () => undefined;
    const promise = new Promise((res) => {
      resolve = (rows) => res({ data: { data: { obligation, summary, rows } } });
    });
    return { promise, release: (rows: ComplianceRow[]) => resolve(rows) };
  };

  const openCorrection = async (name = "Ada") => {
    fireEvent.click(await memberRow(name));
    fireEvent.click(await screen.findByRole("button", { name: /Correct the record/ }));
    return screen.findByRole("dialog");
  };
  const openLevyCorrection = async () => {
    await chooseOption(await screen.findByLabelText("Obligation"), "Building Levy");
    return openCorrection();
  };
  const saveDuesApr = async () => {
    fireEvent.change(await screen.findByLabelText("Apr"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, update" }));
  };

  beforeEach(() => {
    api.put.mockResolvedValue({ data: { data: {} } });
  });
  afterEach(() => jest.restoreAllMocks());

  it("sends the displayed guard on a dues correction, and never on recording", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();

    fireEvent.click(await memberRow("Ada"));
    fireEvent.click(await screen.findByRole("button", { name: /1 month/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty("expectedCorrectionGuard");
    // Saving closes the sheet; the list is aria-hidden until it has gone.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await openCorrection();
    await saveDuesApr();
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/finance/payments", {
        organisationId: "org1",
        obligationId: "dues-now",
        memberId: "ada",
        monthlyPaid: { "1": 500, "2": 500, "3": 500, "4": 500 },
        expectedCorrectionGuard: GUARD,
      }),
    );
  });

  it("sends zero revisions on a levy correction instead of dropping them", async () => {
    const zero = { paymentRowExists: true, paymentRevision: 0, memberFinanceRevision: 0 };
    complianceRows = levyRows(zero);
    setOrg("org1", MANAGER);
    renderFinance();
    await openLevyCorrection();

    fireEvent.change(screen.getByLabelText(/total amount paid/i), { target: { value: "2500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, update" }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/finance/payments", {
        organisationId: "org1", obligationId: "levy", memberId: "ada",
        amountPaid: 2500, expectedCorrectionGuard: zero,
      }),
    );
  });

  it("sends the guard with replaceUnappliedCredit only after the red confirmation", async () => {
    complianceRows = levyRows(GUARD, { recordedTotal: 3000, appliedTotal: 2000, unappliedCredit: 1000 });
    setOrg("org1", MANAGER);
    renderFinance();
    await openLevyCorrection();

    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/unapplied credit on this record will be replaced too/);
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Yes, update" }));
    await waitFor(() =>
      expect(api.put.mock.calls[0][1]).toMatchObject({
        amountPaid: 2000, replaceUnappliedCredit: true, expectedCorrectionGuard: GUARD,
      }),
    );
  });

  it("repairs an invalid stored amount with the guard it was opened with", async () => {
    const legacy = { paymentRowExists: true, paymentRevision: null, memberFinanceRevision: 4 };
    complianceRows = levyRows(legacy, {
      status: "needs-review", invalidStoredAmount: true, paid: null, balance: null,
    });
    setOrg("org1", MANAGER);
    renderFinance();
    await openLevyCorrection();

    fireEvent.change(screen.getByLabelText(/total amount paid/i), { target: { value: "3000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, update" }));
    await waitFor(() =>
      expect(api.put.mock.calls[0][1]).toMatchObject({ amountPaid: 3000, expectedCorrectionGuard: legacy }),
    );
  });

  it("on a 409 keeps the sheet open, refetches this organisation and makes the officer start again", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    // Another officer recorded April after this editor opened.
    complianceRows = adaPaidToApr(NEWER);
    api.put.mockRejectedValueOnce(httpError(409, "Payment changed"));
    await saveDuesApr();

    const notice = await within(sheet).findByRole("alert");
    expect(notice).toHaveTextContent("Record changed");
    expect(notice).toHaveTextContent(/Your correction was not saved/);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // The stale amounts are gone, not left waiting to be resent.
    expect(within(sheet).queryByLabelText("Apr")).not.toBeInTheDocument();
    expect(invalidate.mock.calls.every(([filters]) => (filters as unknown as { queryKey: readonly unknown[] }).queryKey[1] === "org1"))
      .toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance", "org1", "compliance"] });

    fireEvent.click(await within(sheet).findByRole("button", { name: "Review and correct again" }));
    // A fresh editor from the reloaded row: April is now part of the record.
    expect(await within(sheet).findByLabelText("Apr")).toHaveValue("500");
    expect(api.put).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("May"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, update" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put.mock.calls[1][1]).toMatchObject({
      monthlyPaid: { "1": 500, "2": 500, "3": 500, "4": 500, "5": 500 },
      expectedCorrectionGuard: NEWER,
    });
  });

  it("on a levy 409 waits for fresh rows before offering a new correction", async () => {
    complianceRows = levyRows(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openLevyCorrection();

    // The refetch after the conflict hangs until released.
    let release: () => void = () => undefined;
    api.get.mockImplementation((url: string) => {
      if (url.includes("/compliance")) {
        return new Promise((resolve) => {
          release = () => resolve({ data: { data: { obligation: levy, summary: SUMMARY, rows: levyRows(NEWER, { paid: 3000 }) } } });
        });
      }
      return Promise.resolve({ data: { data: url.includes("/obligations") ? [levy, duesNow] : MEMBERS } });
    });
    api.put.mockRejectedValueOnce(httpError(409));
    fireEvent.change(screen.getByLabelText(/total amount paid/i), { target: { value: "2500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, update" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Record changed");
    expect(within(sheet).getByRole("button", { name: /Reloading…|Reload latest/ })).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Review and correct again" })).not.toBeInTheDocument();

    await act(async () => release());
    fireEvent.click(await within(sheet).findByRole("button", { name: "Review and correct again" }));
    expect(await within(sheet).findByLabelText(/total amount paid/i)).toHaveValue("3,000");
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not adopt a newer guard when the row refreshes under an open form", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    fireEvent.change(await within(sheet).findByLabelText("Apr"), { target: { value: "500" } });

    // Another tab saves; this tab's cache refreshes in the background.
    complianceRows = adaPaidToApr(NEWER);
    await act(() => queryClient.invalidateQueries({ queryKey: ["finance", "org1", "compliance"] }));

    const notice = await within(sheet).findByRole("alert");
    expect(notice).toHaveTextContent(/changed while you were correcting it/);
    expect(within(sheet).queryByRole("button", { name: "Save correction" })).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("blocks corrections without a guard but still records payments", async () => {
    complianceRows = adaWith(undefined);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();

    expect(within(sheet).getByText(/refresh the page after the Finance update before correcting/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Save correction" })).toBeDisabled();

    fireEvent.click(within(sheet).getByRole("button", { name: "Back to record payment" }));
    fireEvent.click(await screen.findByRole("button", { name: /1 month/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Record/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.put).not.toHaveBeenCalled();
  });

  it("on a 428 explains the page needs refreshing, without a toast or success", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    api.put.mockRejectedValueOnce(httpError(428, "Precondition required"));
    await saveDuesApr();

    expect(await within(sheet).findByRole("alert")).toHaveTextContent(/older than the latest Finance update/);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // This build is outdated, so the same token must not be sent again.
    expect(within(sheet).getByRole("button", { name: "Save correction" })).toBeDisabled();
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("on a 422 shows the backend's message and keeps the form open", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    api.put.mockRejectedValueOnce(httpError(422, "Amount exceeds what is owed"));
    await saveDuesApr();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Amount exceeds what is owed"));
    expect(toast.success).not.toHaveBeenCalled();
    expect(within(sheet).getByLabelText("Apr")).toHaveValue("500");
    expect(within(sheet).queryByText("Record changed")).not.toBeInTheDocument();
  });

  it("drops an open correction when the organisation changes", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    await openCorrection();

    act(() => setOrg("org2", MANAGER));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save correction" })).not.toBeInTheDocument());
    await openCorrection();
    await saveDuesApr();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0][1]).toMatchObject({ organisationId: "org2", expectedCorrectionGuard: GUARD });
  });

  it("keeps typed values when a refetch leaves the guard unchanged", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    fireEvent.change(await within(sheet).findByLabelText("Apr"), { target: { value: "500" } });

    await act(() => queryClient.invalidateQueries({ queryKey: ["finance", "org1", "compliance"] }));

    expect(within(sheet).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(sheet).getByLabelText("Apr")).toHaveValue("500");
    expect(within(sheet).getByRole("button", { name: "Save correction" })).toBeEnabled();
  });

  it.each([
    ["transactions unavailable", "Payment corrections are temporarily unavailable. No change was made."],
    ["unknown commit outcome", "We could not confirm whether this correction was saved."],
  ])("a 503 (%s) is never resent and requires a reload before any fresh correction", async (_case, message) => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    // The refetch after the 503 hangs until released.
    const hung = hungCompliance(duesNow);
    api.get.mockImplementation((url: string) =>
      url.includes("/compliance")
        ? hung.promise
        : Promise.resolve({ data: { data: url.includes("/obligations") ? [levy, duesNow] : MEMBERS } }),
    );
    api.put.mockRejectedValueOnce(httpError(503, message));
    await saveDuesApr();

    const notice = await within(sheet).findByRole("alert");
    expect(notice).toHaveTextContent("Correction not confirmed");
    expect(notice).toHaveTextContent(/may already be saved/);
    await waitFor(() => expect(notice).toHaveFocus());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(within(sheet).queryByRole("button", { name: "Save correction" })).not.toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["finance", "org1", "compliance"] });
    // Nothing is replayed while the stored state is unknown.
    expect(api.put).toHaveBeenCalledTimes(1);

    await act(async () => hung.release(adaPaidToApr(NEWER)));

    // Fresh figures are shown, but a new correction is a deliberate step.
    fireEvent.click(await within(sheet).findByRole("button", { name: "Review latest figures" }));
    expect(await within(sheet).findByRole("button", { name: /Correct the record/ })).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledTimes(1);

    fireEvent.click(within(sheet).getByRole("button", { name: /Correct the record/ }));
    fireEvent.change(await within(sheet).findByLabelText("May"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, update" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put.mock.calls[1][1]).toMatchObject({ expectedCorrectionGuard: NEWER });
  });

  it("does not re-enable a stale correction when the reload fails", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    api.get.mockImplementation((url: string) => {
      if (url.includes("/compliance")) return Promise.reject(new Error("offline"));
      return Promise.resolve({ data: { data: url.includes("/obligations") ? [levy, duesNow] : MEMBERS } });
    });
    api.put.mockRejectedValueOnce(httpError(503));
    await saveDuesApr();

    const notice = await within(sheet).findByRole("alert");
    expect(notice).toHaveTextContent("Correction not confirmed");
    fireEvent.click(within(notice).getByRole("button", { name: "Reload latest" }));
    await act(async () => {
      await Promise.resolve();
    });

    expect(within(sheet).queryByRole("button", { name: "Review latest figures" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Save correction" })).not.toBeInTheDocument();
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("keeps the Record changed notice when the start date is cleared mid-correction", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();

    const hung = hungCompliance(duesNow);
    api.get.mockImplementation((url: string) =>
      url.includes("/compliance")
        ? hung.promise
        : Promise.resolve({ data: { data: url.includes("/obligations") ? [levy, duesNow] : MEMBERS } }),
    );
    api.put.mockRejectedValueOnce(httpError(409));
    await saveDuesApr();

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Record changed");
    await act(async () =>
      hung.release([{ ...ROWS[0], accountable: false, correctionGuard: NEWER }, ROWS[1], ROWS[2]]),
    );

    await waitFor(() =>
      expect(within(sheet).getByRole("alert")).toHaveTextContent(/no longer owe this obligation/),
    );
    const notice = within(sheet).getByRole("alert");
    expect(notice).toHaveTextContent(/no longer owe this obligation/);
    expect(within(sheet).queryByRole("button", { name: "Review and correct again" })).not.toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Save correction" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(within(sheet).getByText(/has no financial start date/)).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows the notice when a background refetch makes the dues year not liable", async () => {
    complianceRows = adaWith(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    fireEvent.change(await within(sheet).findByLabelText("Apr"), { target: { value: "500" } });

    complianceRows = [
      {
        ...ROWS[0],
        liable: false,
        status: "not-due",
        months: months(Array(12).fill("not-due")),
        totalExpected: 0,
        totalPaid: 0,
        balance: 0,
        paidUpToMonth: 0,
        correctionGuard: NEWER,
      },
      ROWS[1],
      ROWS[2],
    ];
    await act(() => queryClient.invalidateQueries({ queryKey: ["finance", "org1", "compliance"] }));

    const notice = await within(sheet).findByRole("alert");
    expect(notice).toHaveTextContent(/changed while you were correcting it/);
    expect(notice).toHaveTextContent(/no longer owe this obligation/);
    expect(within(sheet).queryByRole("button", { name: "Review and correct again" })).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(within(sheet).getByText(/after this dues year/)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("keeps the notice when a levy correction conflicts with a later start date", async () => {
    complianceRows = levyRows(GUARD);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openLevyCorrection();

    const hung = hungCompliance(levy);
    api.get.mockImplementation((url: string) =>
      url.includes("/compliance")
        ? hung.promise
        : Promise.resolve({ data: { data: url.includes("/obligations") ? [levy, duesNow] : MEMBERS } }),
    );
    api.put.mockRejectedValueOnce(httpError(409));
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, update" }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Record changed");
    await act(async () =>
      hung.release([
        {
          memberId: "ada",
          name: "Ada",
          accountable: true,
          liable: false,
          status: "not-due",
          expected: 0,
          paid: 0,
          balance: 0,
          correctionGuard: NEWER,
        } as ComplianceRow,
      ]),
    );

    await waitFor(() =>
      expect(within(sheet).getByRole("alert")).toHaveTextContent(/no longer owe this obligation/),
    );
    const notice = within(sheet).getByRole("alert");
    expect(notice).toHaveTextContent(/no longer owe this obligation/);
    expect(within(sheet).queryByRole("button", { name: "Review and correct again" })).not.toBeInTheDocument();
    expect(within(sheet).getByText(/after this levy's date/)).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledTimes(1);
  });

  it("explains a first-row 400 and offers recording instead of another correction", async () => {
    const noRow = { paymentRowExists: false, paymentRevision: null, memberFinanceRevision: 2 };
    complianceRows = adaWith(noRow);
    setOrg("org1", MANAGER);
    renderFinance();
    const sheet = await openCorrection();
    api.put.mockRejectedValueOnce(httpError(400, "There is no payment record for this obligation yet."));
    await saveDuesApr();

    const notice = await within(sheet).findByRole("alert");
    expect(notice).toHaveTextContent("No payment record to correct");
    expect(notice).toHaveTextContent(/Record a payment instead/);
    expect(toast.success).not.toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(within(sheet).queryByRole("button", { name: "Save correction" })).not.toBeInTheDocument();

    fireEvent.click(within(notice).getByRole("button", { name: "Record a payment instead" }));
    expect(await within(sheet).findByLabelText("Amount received")).toBeInTheDocument();
  });
});

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { system } from "styles/theme";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { PermissionKey } from "rbac/permissions";
import Finance from "pages/Finance";
import { ComplianceRow, MonthStatus, Obligation } from "components/finance/financeTypes";
import { CLEAR_WARNING, todayBusinessDate } from "helpers/financeCompliance";

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
  it("opens on this year's dues with totals and status counts", async () => {
    setOrg("org1", MANAGER);
    renderFinance();

    expect(await screen.findByText(/collected · 63%/)).toBeInTheDocument();
    expect(screen.getByLabelText("Obligation")).toHaveValue("dues-now");
    expect(screen.getByText("1 of 2 paid in full")).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("tab", { name: "Obligations" }));

    expect(await screen.findByText(/of .*12,000.* · 63%/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Share collected")).toHaveLength(1);
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
    fireEvent.click(await screen.findByRole("tab", { name: "Obligations" }));

    expect(await screen.findByText(/1,400 of .*2,000 · 70%$/)).toBeInTheDocument();
    expect(screen.getByLabelText("Share collected")).toBeInTheDocument();
    expect(screen.queryByText(/1 of 3/)).not.toBeInTheDocument();
    expect(screen.queryByText(/paid in full/)).not.toBeInTheDocument();
  });

  it("opens an obligation in Collect when tapped", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await screen.findByRole("tab", { name: "Obligations" }));
    fireEvent.click(await screen.findByText("Building Levy"));

    await waitFor(() => expect(screen.getByLabelText("Obligation")).toHaveValue("levy"));
  });

  it("hides create, rename and delete from a viewer", async () => {
    setOrg("org1", VIEWER);
    renderFinance();
    fireEvent.click(await screen.findByRole("tab", { name: "Obligations" }));
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
    fireEvent.click(await screen.findByRole("tab", { name: "Start dates" }));
    fireEvent.click(await screen.findByRole("button", { name: "No start date 1" }));

    const list = screen.getByRole("list");
    expect(within(list).queryByText("Ada")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select Chidi"));
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
    fireEvent.click(await screen.findByRole("tab", { name: "Start dates" }));
    fireEvent.click(await screen.findByLabelText("Select Ada"));
    fireEvent.click(screen.getByLabelText("Select Bola"));
    fireEvent.change(screen.getByLabelText("Start date for selected"), {
      target: { value: `${YEAR}-02-01` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set date" }));

    // Both already have a start date, so the confirm says payments move.
    expect(await screen.findByText(/2 already have a start date\. Their recorded dues payments will be re-applied/))
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

  it("warns that clearing a start date clears the member's payments", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await screen.findByRole("tab", { name: "Start dates" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit start date for Ada" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));

    const dialog = await screen.findByRole("dialog", { name: "Clear financial start date" });
    expect(dialog).toHaveTextContent(CLEAR_WARNING);
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
    fireEvent.click(await screen.findByRole("tab", { name: "Start dates" }));
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
    expect(screen.getByLabelText("Sort")).toHaveValue("behind");
    const filtered = screen.getByRole("list");
    expect(within(filtered).queryByText("Bola")).not.toBeInTheDocument();
  });

  it("offers clearing the arrears when recording", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await memberRow("Ada"));
    fireEvent.click(await screen.findByRole("button", { name: /Clear arrears/ }));
    expect(screen.getByLabelText("Amount received")).toHaveValue(500);
  });

  it("hides the Behind chip and sort for a backend without arrears", async () => {
    complianceRows = ROWS;
    complianceSummary = SUMMARY;
    setOrg("org1", MANAGER);
    renderFinance();
    await screen.findByRole("button", { name: "Owing 1" });
    expect(screen.queryByRole("button", { name: /^Behind/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Most behind" })).not.toBeInTheDocument();
  });
});

describe("organisation switching", () => {
  it("drops the previous organisation's choice and only requests the new one's data", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    const picker = await screen.findByLabelText("Obligation");
    fireEvent.change(picker, { target: { value: "levy" } });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/finance/org1/obligations/levy/compliance")),
    );

    api.get.mockClear();
    act(() => setOrg("org2", MANAGER));

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining("/finance/org2/obligations/dues-now/compliance")),
    );
    expect(api.get.mock.calls.every(([url]: [string]) => !url.includes("org1"))).toBe(true);
    expect(await screen.findByLabelText("Obligation")).toHaveValue("dues-now");
  });

  it("resets the tab and any selections when the organisation changes", async () => {
    setOrg("org1", MANAGER);
    renderFinance();
    fireEvent.click(await screen.findByRole("tab", { name: "Start dates" }));
    fireEvent.click(await screen.findByLabelText("Select Chidi"));
    expect(screen.getByText("1 member selected")).toBeInTheDocument();

    act(() => setOrg("org2", MANAGER));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Collect" })).toHaveAttribute("aria-selected", "true"),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Start dates" }));
    expect(await screen.findByLabelText("Select Chidi")).not.toBeChecked();
    expect(screen.queryByText(/members? selected$/)).not.toBeInTheDocument();
  });
});

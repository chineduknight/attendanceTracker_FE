import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { optionLabels, chooseOption, render, selectTab, shownValue } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { toLedgerAccounts } from "helpers/ledger";
import LedgerReportsPanel from "components/finance/reports/LedgerReportsPanel";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const id = (char: string) => char.repeat(24);
const CASH_ID = id("c");
const BANK_ID = id("b");
const OLD_BANK_ID = id("o");

const RAW_ACCOUNTS = [
  { id: BANK_ID, name: "Bank account", class: "asset", subtype: "bank", currency: "NGN", active: true, openingVerified: true, bankName: "GTBank", accountNumberLast4: "0123" },
  { id: CASH_ID, name: "Cash in hand", class: "asset", subtype: "cash", currency: "NGN", active: true, openingVerified: true },
  { id: OLD_BANK_ID, name: "Old bank", class: "asset", subtype: "bank", currency: "NGN", active: false, openingVerified: false },
  { id: id("i"), name: "Donations", class: "income", subtype: null, currency: "NGN", active: true },
  { id: id("d"), name: "Member dues income", class: "income", subtype: "member_dues_income", currency: "NGN", active: true },
  { id: id("e"), name: "Hall hire", class: "expense", subtype: null, currency: "NGN", active: true },
  { id: id("l"), name: "Member money held", class: "liability", subtype: "member_receipts_unallocated", currency: "NGN", active: true },
  { id: id("q"), name: "Opening balance equity", class: "equity", subtype: "opening_balance_equity", currency: "NGN", active: true },
];
const ACCOUNTS = toLedgerAccounts(RAW_ACCOUNTS) as LedgerAccount[];

const journal = (
  journalId: string,
  businessDate: string,
  sourceType: string,
  extra: Record<string, unknown> = {},
) => ({
  id: journalId,
  businessDate,
  reference: null,
  note: null,
  sourceType,
  lines: [
    { accountId: BANK_ID, side: "debit", amountKobo: 5000 },
    { accountId: id("i"), side: "credit", amountKobo: 5000 },
  ],
  totalKobo: 5000,
  postedAt: "2026-09-07T09:00:00.000Z",
  reversesJournalId: null,
  reversedByJournalId: null,
  entry: null,
  ...extra,
});

const account = (accountId: string) => RAW_ACCOUNTS.find((raw) => raw.id === accountId);

/** Page 1 of Bank account: 7 Sep in full, then 8 Sep continuing on page 2. */
const PAGE_1 = {
  account: account(BANK_ID),
  balanceState: "known",
  balanceBeforeKobo: 1200000,
  items: [
    { journal: journal(id("1"), "2026-09-07", "cash_receipt", { entry: { number: "R-000001", counterpartyName: "Ada" } }), direction: "in", amountKobo: 500000, runningBalanceKobo: 1700000 },
    { journal: journal(id("2"), "2026-09-07", "cash_transfer", { note: "To cash box", entry: { number: "T-000001" } }), direction: "out", amountKobo: 200000, runningBalanceKobo: 1500000 },
    { journal: journal(id("3"), "2026-09-08", "reversal", { reference: "REV-1" }), direction: "out", amountKobo: 100000, runningBalanceKobo: 1400000 },
  ],
  dayClosings: [
    { date: "2026-09-07", closingKobo: 1500000 },
    // The whole day's closing: the day goes on below 1,400,000 on page 2.
    { date: "2026-09-08", closingKobo: 1100000 },
  ],
  nextCursor: "cursor-page-2",
};
const PAGE_2 = {
  account: account(BANK_ID),
  balanceState: "known",
  balanceBeforeKobo: 1400000,
  items: [
    { journal: journal(id("4"), "2026-09-08", "cash_expense", { entry: { number: "E-000001", counterpartyName: "Hall owner" } }), direction: "out", amountKobo: 300000, runningBalanceKobo: 1100000 },
  ],
  dayClosings: [{ date: "2026-09-08", closingKobo: 1100000 }],
  nextCursor: null,
};
const CASH_PAGE = {
  account: account(CASH_ID),
  balanceState: "known",
  balanceBeforeKobo: 0,
  items: [],
  dayClosings: [],
  nextCursor: null,
};
const UNKNOWN_PAGE = {
  account: account(OLD_BANK_ID),
  balanceState: "unknown",
  balanceBeforeKobo: null,
  items: [
    { journal: journal(id("5"), "2026-09-02", "cash_receipt", { reference: "R-OLD" }), direction: "in", amountKobo: 70000, runningBalanceKobo: null },
  ],
  dayClosings: [{ date: "2026-09-02", closingKobo: null }],
  nextCursor: null,
};

const BALANCES = {
  asOf: "2026-09-30",
  accounts: [
    { accountId: OLD_BANK_ID, balanceKobo: null, balanceState: "unknown" },
    { accountId: BANK_ID, balanceKobo: 1100000, balanceState: "known" },
    { accountId: CASH_ID, balanceKobo: 0, balanceState: "known" },
    { accountId: id("i"), balanceKobo: 900000, balanceState: "known" },
    { accountId: id("d"), balanceKobo: 0, balanceState: "known" },
    { accountId: id("e"), balanceKobo: -25000, balanceState: "known" },
    { accountId: id("l"), balanceKobo: 720000, balanceState: "known" },
    { accountId: id("q"), balanceKobo: 1200000, balanceState: "known" },
  ],
  moneyTotalKobo: 1100000,
};

const TODAY = "2026-10-23";
const OPENING = "2026-09-01";
const THIS_MONTH = { from: "2026-10-01", to: TODAY };

const periodOf = (url: string) => {
  const search = new URLSearchParams(url.split("?")[1] ?? "");
  return { from: search.get("from") ?? "", to: search.get("to") ?? "" };
};

const accountRow = (
  accountId: string,
  name: string,
  kind: "cash" | "bank",
  carriedForwardKobo: number | null,
  extra: Record<string, unknown> = {},
) => ({
  accountId,
  name,
  kind,
  active: true,
  state: "in_books",
  broughtInOn: null,
  broughtForwardKobo: 0,
  receivedKobo: 0,
  paidKobo: 0,
  transfersInKobo: 0,
  transfersOutKobo: 0,
  broughtInKobo: 0,
  carriedForwardKobo,
  bankName: null,
  accountNumberLast4: null,
  ...extra,
});

/**
 * The acceptance sample: B/F ₦170,000 + income ₦5,000 = gross ₦175,000;
 * less ₦200 expenses = ₦174,800 (cash ₦54,800 + bank ₦120,000).
 */
const PREVIEW = (period = THIS_MONTH) => ({
  organisation: { id: "org1", name: "Organisation A" },
  period,
  openingDate: OPENING,
  lockedThrough: "2026-10-31",
  provisional: false,
  generatedBy: { userId: "officer-1", username: "Treasurer" },
  generatedAt: "2026-10-23T10:00:00.000Z",
  readAt: "2026-10-23T10:00:00.000Z",
  dataState: "complete",
  issues: [],
  excludedAccounts: [],
  statement: {
    broughtForward: { asOf: "2026-09-30", basis: "balance", totalKobo: 17000000 },
    moneyReceived: {
      totalKobo: 500000,
      groups: [
        {
          key: "receipts",
          label: "Receipts",
          count: 2,
          totalKobo: 500000,
          categories: [
            { categoryAccountId: id("i"), categoryName: "Donations", count: 1, totalKobo: 550000 },
            { categoryAccountId: id("r"), categoryName: "Old raffle", count: 1, totalKobo: -50000 },
            { categoryAccountId: id("d"), categoryName: "Member dues income", count: 0, totalKobo: 0 },
          ],
          rows: [],
          rowsTruncated: false,
        },
        {
          key: "member_money",
          label: "Money received for members",
          count: 1,
          totalKobo: 300000,
          categories: [
            { categoryAccountId: null, categoryName: null, count: 1, totalKobo: 300000 },
          ],
          rows: [],
          rowsTruncated: false,
        },
      ],
    },
    moneyPaid: {
      totalKobo: 20000,
      groups: [
        {
          key: "expenses",
          label: "Expenses",
          count: 1,
          totalKobo: 20000,
          categories: [
            { categoryAccountId: id("e"), categoryName: "Hall hire", count: 1, totalKobo: 20000 },
          ],
          rows: [],
          rowsTruncated: false,
        },
        {
          key: "member_refunds",
          label: "Member money refunded",
          count: 0,
          totalKobo: 0,
          categories: [],
          rows: [],
          rowsTruncated: false,
        },
      ],
    },
    broughtIntoBooks: { totalKobo: 0, count: 0, rows: [], rowsTruncated: false },
    transfers: { totalMovedKobo: 0, count: 0, rows: [], rowsTruncated: false },
    carriedForward: { asOf: period.to, totalKobo: 17480000 },
    grossBalanceKobo: 17500000,
  },
  accounts: [
    accountRow(BANK_ID, "Bank account", "bank", 12000000, { bankName: "GTBank", accountNumberLast4: "0123" }),
    accountRow(CASH_ID, "Cash in hand", "cash", 5480000),
    accountRow(OLD_BANK_ID, "Old bank", "bank", null, { active: false, state: "unknown" }),
  ],
  reconciliation: {
    income: {},
    expense: {},
    surplusKobo: 0,
    bridge: {},
    allocations: {},
    memberMoney: {
      heldAtStartKobo: 0,
      openingKobo: 0,
      receivedKobo: 300000,
      refundedKobo: 0,
      allocatedKobo: 0,
      reversals: { receiptsKobo: 0, refundsKobo: 0, allocationsKobo: 0 },
      heldAtEndKobo: 300000,
    },
  },
  downloads: { xlsx: true, pdf: false },
});

type Responder = (url: string) => unknown;

const serve = (respond: Responder) => {
  api.get.mockImplementation((url: string) => {
    const body = respond(url);
    if (body instanceof Error) return Promise.reject(body);
    if (body === undefined) return Promise.reject(new Error(`unexpected GET ${url}`));
    return Promise.resolve({ data: { data: body } });
  });
};

const defaultResponder: Responder = (url) => {
  if (url.includes(`/accounts/${BANK_ID}/cashbook`)) return url.includes("cursor=cursor-page-2") ? PAGE_2 : PAGE_1;
  if (url.includes(`/accounts/${CASH_ID}/cashbook`)) return CASH_PAGE;
  if (url.includes(`/accounts/${OLD_BANK_ID}/cashbook`)) return UNKNOWN_PAGE;
  if (url.includes("/ledger/balances")) return BALANCES;
  if (url.includes("/ledger/reports/financial")) return PREVIEW(periodOf(url));
  return undefined;
};

const httpError = (status: number, error: string) =>
  Object.assign(new Error(error), { response: { status, data: { error } } });

const setSession = (permissions: PermissionKey[] = ["finance.view"], organisationId = "org1") =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: organisationId, isOwner: false, permissions },
  });

const ui = (organisationId = "org1", accounts: LedgerAccount[] | null = ACCOUNTS) => (
  <QueryClientProvider client={queryClient}>
    <LedgerReportsPanel
      organisationId={organisationId}
      accounts={accounts}
      openingDate={OPENING}
      today={TODAY}
      enabled
    />
  </QueryClientProvider>
);

/** The panel of one report tab (closed panels stay mounted in jsdom). */
const tabPanel = (name: "Cashbook" | "Balances" | "Summary") =>
  screen.getByRole("tabpanel", { name });

/** Open a report tab and wait until the tab itself reports the switch. */
const openReport = async (name: "Cashbook" | "Balances" | "Summary") => {
  await selectTab(screen.getByRole("tab", { name }));
};

/** The reports open on the Summary: open the cashbook when a test needs it. */
const openCashbook = async () => {
  render(ui());
  await openReport("Cashbook");
  return screen.findByText("Balance before these entries");
};

/** A FigureRow by its label (the row is a named group). */
const figure = (label: string, container: HTMLElement = document.body) =>
  within(container).getByRole("group", { name: label });

const getUrls = () => api.get.mock.calls.map(([url]) => url as string);

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  setSession();
  serve(defaultResponder);
});

afterAll(() => {
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("<LedgerReportsPanel> cashbook", () => {
  it("offers only cash and bank accounts and reads the first one's cashbook", async () => {
    await openCashbook();
    expect(getUrls().filter((url) => url.includes("/cashbook"))).toEqual([
      `/finance/org1/ledger/accounts/${BANK_ID}/cashbook?limit=50`,
    ]);

    const select = screen.getByLabelText("Account");
    expect(shownValue(select)).toContain("Bank account — Bank · GTBank · ••••0123");
    expect(await optionLabels(select)).toEqual([
      "Bank account — Bank · GTBank · ••••0123",
      "Cash in hand — Cash",
      "Old bank — Bank · inactive · opening not verified",
    ]);
  });

  it("reads the chosen account's cashbook under its own key", async () => {
    await openCashbook();
    await chooseOption(screen.getByLabelText("Account"), "Cash in hand — Cash");

    expect(await screen.findByText("No entries in this period")).toBeInTheDocument();
    expect(getUrls()).toContain(`/finance/org1/ledger/accounts/${CASH_ID}/cashbook?limit=50`);
    expect(
      queryClient.getQueryData(
        queryKeys.finance.ledger.cashbook("org1", CASH_ID, { from: "", to: "", limit: 50, cursor: "" }),
      ),
    ).toBeDefined();
    // A genuine zero balance is ₦0.
    expect(figure("Balance at the start of this period")).toHaveTextContent("₦0");
  });

  it("shows the server's rows in order, with directions, running balances and whole-day closings", async () => {
    await openCashbook();

    expect(screen.getByText(/Within a day: money in, then money out\. This is a reporting order/)).toBeInTheDocument();
    expect(screen.getByText("₦12,000")).toBeInTheDocument();

    const day7 = screen.getByRole("list", { name: "Cashbook entries on 7 Sep 2026" });
    const rows7 = within(day7).getAllByRole("listitem");
    expect(rows7.map((row) => within(row).getAllByText(/^[RT]-0000/)[0].textContent)).toEqual(["R-000001", "T-000001"]);
    expect(rows7[0]).toHaveTextContent("Ada");
    expect(rows7[0]).toHaveTextContent("+₦5,000");
    expect(rows7[0]).toHaveTextContent("Money in");
    expect(rows7[0]).toHaveTextContent("Balance ₦17,000");
    // A transfer out of this account is money out here.
    expect(rows7[1]).toHaveTextContent("To cash box");
    expect(rows7[1]).toHaveTextContent("−₦2,000");
    expect(rows7[1]).toHaveTextContent("Money out");
    expect(rows7[1]).toHaveTextContent("Balance ₦15,000");
    expect(figure("Closing balance, 7 Sep 2026")).toHaveTextContent("₦15,000");

    // A reversal is shown in the direction the server reports.
    const day8 = screen.getByRole("list", { name: "Cashbook entries on 8 Sep 2026" });
    expect(within(day8).getByRole("listitem")).toHaveTextContent("REV-1");
    expect(within(day8).getByRole("listitem")).toHaveTextContent("Reversal");
    expect(within(day8).getByRole("listitem")).toHaveTextContent("Money out");
    // The closing is the server's whole-day figure, not the last visible row.
    const closing8 = figure("Closing balance, 8 Sep 2026");
    expect(closing8).toHaveTextContent("₦11,000");
    expect(closing8).toHaveTextContent("This day may continue on the next page");
    expect(screen.getByText(/not a member's dues position/)).toBeInTheDocument();
  });

  it("pages by cursor, keeps the account and window, and shows a day split across pages", async () => {
    await openCashbook();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    expect(await screen.findByText("E-000001")).toBeInTheDocument();
    expect(getUrls()).toContain(
      `/finance/org1/ledger/accounts/${BANK_ID}/cashbook?limit=50&cursor=cursor-page-2`,
    );
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText("Earlier entries for this day may be on the previous page.")).toBeInTheDocument();
    // The page's own opening and the same whole-day closing.
    expect(figure("Balance before these entries")).toHaveTextContent("₦14,000");
    expect(figure("Closing balance, 8 Sep 2026")).toHaveTextContent("₦11,000");
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();

    // The visited page comes straight back from the cache (no loader).
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("R-000001")).toBeInTheDocument();
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    expect(screen.queryByText("Loading cashbook...")).not.toBeInTheDocument();
  });

  it("keeps the applied account, window and page across a tab switch", async () => {
    await openCashbook();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("E-000001");
    await selectTab(screen.getByRole("tab", { name: "Summary" }));
    await screen.findByText("1 Oct 2026 – 23 Oct 2026");
    // Only the open report is mounted. The closed tab unmounts after its exit
    // transition, which jsdom finishes asynchronously.
    await waitFor(() => expect(screen.queryByText("E-000001")).not.toBeInTheDocument());

    await selectTab(screen.getByRole("tab", { name: "Cashbook" }));
    expect(await screen.findByText("E-000001")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
  });

  it("applies a date window, restarting at the first page", async () => {
    await openCashbook();
    const panel = within(tabPanel("Cashbook"));
    fireEvent.click(panel.getByRole("button", { name: "Next page" }));
    await screen.findByText("Page 2");

    fireEvent.change(panel.getByLabelText("From"), { target: { value: "2026-09-05" } });
    fireEvent.change(panel.getByLabelText("To"), { target: { value: "2026-09-20" } });
    fireEvent.click(panel.getByRole("button", { name: "Show" }));

    await waitFor(() =>
      expect(getUrls()).toContain(
        `/finance/org1/ledger/accounts/${BANK_ID}/cashbook?from=2026-09-05&to=2026-09-20&limit=50`,
      ),
    );
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
  });

  it("refuses a From date after the To date without a request", async () => {
    await openCashbook();
    const panel = within(tabPanel("Cashbook"));
    const calls = api.get.mock.calls.length;
    fireEvent.change(panel.getByLabelText("From"), { target: { value: "2026-09-20" } });
    fireEvent.change(panel.getByLabelText("To"), { target: { value: "2026-09-05" } });

    expect(panel.getByRole("alert")).toHaveTextContent("The From date can't be after the To date.");
    expect(panel.getByRole("button", { name: "Show" })).toBeDisabled();
    expect(api.get.mock.calls.length).toBe(calls);
  });

  it("shows an unknown balance as Unknown, never ₦0", async () => {
    await openCashbook();
    await chooseOption(screen.getByLabelText("Account"), /Old bank/);

    expect(await screen.findByText("Balance unknown")).toBeInTheDocument();
    expect(screen.getByText(/balance isn't known for this period/)).toBeInTheDocument();
    expect(figure("Balance before these entries")).toHaveTextContent("Unknown");
    const row = within(screen.getByRole("list", { name: "Cashbook entries on 2 Sep 2026" })).getByRole("listitem");
    expect(row).toHaveTextContent("+₦700");
    expect(row).toHaveTextContent("Balance Unknown");
    expect(figure("Closing balance, 2 Sep 2026")).toHaveTextContent("Unknown");
    expect(screen.queryByText("₦0")).not.toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("Opening not verified")).toBeInTheDocument();
  });

  it("shows the server's error, and no figures, when the cashbook fails", async () => {
    serve((url) => (url.includes("/cashbook") ? httpError(422, "Only cash and bank accounts have a cashbook.") : defaultResponder(url)));
    render(ui());
    await openReport("Cashbook");

    expect(await screen.findByText("Couldn't load the cashbook")).toBeInTheDocument();
    expect(screen.getByText(/Only cash and bank accounts have a cashbook\. No figures are shown\./)).toBeInTheDocument();
    expect(within(tabPanel("Cashbook")).queryByText(/₦/)).not.toBeInTheDocument();
  });

  it("never shows a malformed cashbook as an empty or zero position", async () => {
    serve((url) =>
      url.includes("/cashbook") ? { ...PAGE_1, balanceBeforeKobo: "1200000" } : defaultResponder(url),
    );
    render(ui());
    await openReport("Cashbook");

    expect(await screen.findByText("The cashbook couldn't be read")).toBeInTheDocument();
    const panel = within(tabPanel("Cashbook"));
    expect(panel.queryByText(/₦/)).not.toBeInTheDocument();
    expect(panel.queryByText("No entries in this period")).not.toBeInTheDocument();
  });

  it("says so when there are no cash or bank accounts, or no account list", async () => {
    const { rerender } = render(ui("org1", ACCOUNTS.filter((a) => a.class !== "asset")));
    await openReport("Cashbook");
    expect(await screen.findByText("No cash or bank accounts yet")).toBeInTheDocument();
    rerender(ui("org1", null));
    expect(await screen.findByText("Accounts aren't available")).toBeInTheDocument();
    expect(getUrls().filter((url) => url.includes("/cashbook"))).toEqual([]);
  });
});

describe("<LedgerReportsPanel> account balances", () => {
  const openBalances = async () => {
    render(ui());
    await openReport("Balances");
    return screen.findByText("Balances at the end of 30 Sep 2026");
  };

  const balanceOf = (list: string, name: string) => {
    const rows = within(screen.getByRole("list", { name: `${list} balances` })).getAllByRole("listitem");
    const row = rows.find((item) => within(item).queryAllByText(name).length > 0);
    if (!row) throw new Error(`no ${name} in ${list}`);
    return row;
  };

  it("shows every account's server balance by type, keeping signs, zeros and unknowns", async () => {
    await openBalances();
    expect(getUrls()).toContain("/finance/org1/ledger/balances");

    expect(balanceOf("Cash and bank", "Bank account")).toHaveTextContent("₦11,000");
    expect(balanceOf("Cash and bank", "Cash in hand")).toHaveTextContent("₦0");
    expect(balanceOf("Cash and bank", "Old bank")).toHaveTextContent("Unknown");
    expect(balanceOf("Cash and bank", "Old bank")).toHaveTextContent("Inactive");
    expect(balanceOf("Income", "Donations")).toHaveTextContent("₦9,000");
    expect(balanceOf("Income", "Member dues income")).toHaveTextContent("Member dues income");
    expect(balanceOf("Expenses", "Hall hire")).toHaveTextContent("-₦250");
    expect(balanceOf("Liabilities (member money)", "Member money held")).toHaveTextContent("₦7,200");
    expect(balanceOf("Equity", "Opening balance equity")).toHaveTextContent("₦12,000");

    const total = figure("Total money (cash and bank)");
    expect(total).toHaveTextContent("₦11,000");
    expect(screen.getByText(/cash, bank and expenses as debits/)).toBeInTheDocument();
  });

  it("shows an unknown money total as Unknown, not a sum of the rows", async () => {
    serve((url) => (url.includes("/balances") ? { ...BALANCES, moneyTotalKobo: null } : defaultResponder(url)));
    await openBalances();
    const total = figure("Total money (cash and bank)");
    expect(total).toHaveTextContent("Unknown");
    expect(total).toHaveTextContent(/at least one active cash or bank account has no known balance/);
  });

  it("reads balances as of a chosen day", async () => {
    await openBalances();
    const panel = within(tabPanel("Balances"));
    fireEvent.change(panel.getByLabelText("As of"), { target: { value: "2026-09-15" } });
    fireEvent.click(panel.getByRole("button", { name: "Show" }));
    await waitFor(() => expect(getUrls()).toContain("/finance/org1/ledger/balances?asOf=2026-09-15"));
  });

  it("never shows a malformed balances report", async () => {
    serve((url) => (url.includes("/balances") ? { ...BALANCES, moneyTotalKobo: undefined } : defaultResponder(url)));
    render(ui());
    await openReport("Balances");
    expect(await screen.findByText("The account balances couldn't be read")).toBeInTheDocument();
    expect(within(tabPanel("Balances")).queryByText(/₦/)).not.toBeInTheDocument();
  });
});

describe("<LedgerReportsPanel> financial summary", () => {
  const openSummary = async (openingDate: string | null = OPENING) => {
    render(
      <QueryClientProvider client={queryClient}>
        <LedgerReportsPanel
          organisationId="org1"
          accounts={ACCOUNTS}
          openingDate={openingDate}
          today={TODAY}
          enabled
        />
      </QueryClientProvider>,
    );
    await screen.findByText("Financial Summary");
  };

  const previewUrls = () => getUrls().filter((url) => url.includes("/reports/financial"));

  it("is the default tab, order Summary → Cashbook → Balances, and reads month to date", async () => {
    render(ui());
    await screen.findByText("Financial Summary");

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Summary", "Cashbook", "Balances"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    // The dates are in the fields themselves, not placeholders.
    expect(screen.getByLabelText("From")).toHaveValue("Oct 1, 2026");
    expect(screen.getByLabelText("To")).toHaveValue("Oct 23, 2026");
    expect(previewUrls()).toEqual(["/finance/org1/ledger/reports/financial?from=2026-10-01&to=2026-10-23"]);
    expect(await screen.findByText("1 Oct 2026 – 23 Oct 2026")).toBeInTheDocument();
    // The redundant "Reports" heading inside the panel is gone; the section
    // keeps its accessible name (the screen's own heading still says Reports).
    expect(screen.queryByRole("heading", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Reports" })).toBeInTheDocument();
  });

  it("starts at the ledger's opening date when the books opened mid-month", async () => {
    serve((url) => (url.includes("/reports/financial") ? PREVIEW(periodOf(url)) : defaultResponder(url)));
    await openSummary("2026-10-21");

    expect(screen.getByLabelText("From")).toHaveValue("Oct 21, 2026");
    expect(await screen.findByText("21 Oct 2026 – 23 Oct 2026")).toBeInTheDocument();
    expect(previewUrls()).toEqual(["/finance/org1/ledger/reports/financial?from=2026-10-21&to=2026-10-23"]);
  });

  it("shows the statement in the PDF's order with the backend's figures", async () => {
    await openSummary();

    expect(figure("Bal B/F")).toHaveTextContent("₦170,000");

    const income = screen.getByRole("region", { name: "Income" });
    expect(within(income).getByText("Donations")).toBeInTheDocument();
    expect(within(income).getByText("₦5,500")).toBeInTheDocument();
    // A negative category (a reversal) stays; a zero one is hidden.
    expect(within(income).getByText("Old raffle")).toBeInTheDocument();
    expect(within(income).getByText("-₦500")).toBeInTheDocument();
    expect(within(income).queryByText("Member dues income")).not.toBeInTheDocument();
    expect(figure("Total income")).toHaveTextContent("₦5,000");

    // Member money is not ordinary income.
    expect(figure("Total received for members")).toHaveTextContent("₦3,000");
    expect(within(screen.getByRole("region", { name: "Money received for members" })).getByText(/liability, not income/)).toBeInTheDocument();

    expect(figure("Gross balance")).toHaveTextContent("₦175,000");
    expect(figure("Total expenses")).toHaveTextContent("₦200");
    expect(figure("Bal as at 23 Oct 2026")).toHaveTextContent("₦174,800");
    expect(screen.queryByRole("region", { name: "Member money refunded" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Transfers between own accounts" })).not.toBeInTheDocument();

    // Cash first, then banks, each with the server's closing balance.
    const breakdown = screen.getByRole("region", { name: "Breakdown" });
    const rowLabels = within(breakdown)
      .getAllByRole("group")
      .map((row) => row.getAttribute("aria-label"));
    expect(rowLabels.slice(0, 3)).toEqual(["Cash in hand", "Bank account", "Old bank"]);
    expect(within(breakdown).getByRole("group", { name: "Cash in hand" })).toHaveTextContent("₦54,800");
    expect(within(breakdown).getByRole("group", { name: "Bank account" })).toHaveTextContent("₦120,000");
    // An inactive account the PDF reports is not silently dropped; an
    // unknown balance stays Unknown.
    const oldBank = within(breakdown).getByRole("group", { name: "Old bank" });
    expect(oldBank).not.toHaveTextContent("₦0");
    expect(oldBank).toHaveTextContent("Unknown");
    expect(oldBank).toHaveTextContent("Inactive");
    expect(figure("Of this balance, held for members")).toHaveTextContent("₦3,000");
    expect(screen.getByText(/A reversal of an entry from an earlier period/)).toBeInTheDocument();
  });

  it("shows accounts brought into the books, member refunds and transfers apart", async () => {
    serve((url) => {
      if (!url.includes("/reports/financial")) return defaultResponder(url);
      const base = PREVIEW(periodOf(url));
      return {
        ...base,
        statement: {
          ...base.statement,
          broughtIntoBooks: { totalKobo: 75000, count: 1, rows: [], rowsTruncated: false },
          moneyPaid: {
            ...base.statement.moneyPaid,
            groups: base.statement.moneyPaid.groups.map((group) =>
              group.key === "member_refunds"
                ? {
                    ...group,
                    count: 1,
                    totalKobo: 30000,
                    categories: [{ categoryAccountId: null, categoryName: null, count: 1, totalKobo: 30000 }],
                  }
                : group,
            ),
          },
          transfers: { totalMovedKobo: 40000, count: 2, rows: [], rowsTruncated: false },
        },
      };
    });
    await openSummary();

    const broughtIn = screen.getByRole("region", { name: "Accounts brought into the books" });
    expect(within(broughtIn).getByText(/not income/)).toBeInTheDocument();
    expect(figure("Brought into the books")).toHaveTextContent("₦750");
    expect(figure("Total refunded to members")).toHaveTextContent("₦300");
    expect(within(screen.getByRole("region", { name: "Member money refunded" })).getByText(/not an expense/)).toBeInTheDocument();
    expect(figure("Moved between own accounts")).toHaveTextContent("₦400");
    expect(within(screen.getByRole("region", { name: "Transfers between own accounts" })).getByText(/Not income and not expenses/)).toBeInTheDocument();
  });

  it("keeps the server's total and says so when every income category is zero", async () => {
    serve((url) => {
      if (!url.includes("/reports/financial")) return defaultResponder(url);
      const base = PREVIEW(periodOf(url));
      return {
        ...base,
        statement: {
          ...base.statement,
          moneyReceived: {
            totalKobo: 0,
            groups: base.statement.moneyReceived.groups.map((group) =>
              group.key === "receipts"
                ? {
                    ...group,
                    count: 0,
                    totalKobo: 0,
                    categories: group.categories.map((category) => ({ ...category, count: 0, totalKobo: 0 })),
                  }
                : group,
            ),
          },
        },
      };
    });
    await openSummary();

    const income = screen.getByRole("region", { name: "Income" });
    expect(within(income).getByText("No income categories with a balance in this period.")).toBeInTheDocument();
    expect(within(income).queryByText("Donations")).not.toBeInTheDocument();
    expect(figure("Total income")).toHaveTextContent("₦0");
  });

  it("applies a period only after Show, and never reads an unsubmitted draft", async () => {
    await openSummary();
    const asked = previewUrls().length;

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-15" } });
    expect(previewUrls()).toHaveLength(asked);
    expect(screen.getByText("1 Oct 2026 – 23 Oct 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() =>
      expect(previewUrls()).toContain("/finance/org1/ledger/reports/financial?from=2026-10-05&to=2026-10-15"),
    );
    expect(await screen.findByText("5 Oct 2026 – 15 Oct 2026")).toBeInTheDocument();
  });

  it("cannot be moved before the books' opening date", async () => {
    await openSummary();
    const asked = previewUrls().length;

    // The field's minimum is the opening date, so a typed earlier date is
    // not applied: Show stays disabled and the applied period is unchanged.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-08-15" } });
    expect(screen.getByRole("button", { name: "Show" })).toBeDisabled();
    expect(screen.getByText("1 Oct 2026 – 23 Oct 2026")).toBeInTheDocument();
    expect(previewUrls()).toHaveLength(asked);
  });

  it("presents an incomplete report with Unknown balances and its issues", async () => {
    serve((url) => {
      if (!url.includes("/reports/financial")) return defaultResponder(url);
      const base = PREVIEW(periodOf(url));
      return {
        ...base,
        dataState: "incomplete",
        issues: [{ code: "REPORT_MONEY_ACCOUNT_UNKNOWN", message: "Cash box has no known balance." }],
        statement: {
          ...base.statement,
          broughtForward: { ...base.statement.broughtForward, totalKobo: null },
          grossBalanceKobo: null,
          carriedForward: { ...base.statement.carriedForward, totalKobo: null },
        },
      };
    });
    await openSummary();

    const statement = within(screen.getByRole("region", { name: "Financial summary" }));
    expect(statement.getByText("Report incomplete")).toBeInTheDocument();
    expect(statement.getByText(/Cash box has no known balance/)).toBeInTheDocument();
    expect(figure("Bal B/F")).toHaveTextContent("Unknown");
    expect(figure("Gross balance")).toHaveTextContent("Unknown");
    expect(figure("Bal as at 23 Oct 2026")).toHaveTextContent("Unknown");
  });

  it("resets the period and figures when the organisation changes", async () => {
    const { rerender } = render(ui("org1"));
    await screen.findByText("Financial Summary");
    expect(figure("Bal B/F")).toHaveTextContent("₦170,000");

    setSession(["finance.view"], "org2");
    serve((url) => {
      if (!url.includes("/reports/financial")) return undefined;
      const base = PREVIEW(periodOf(url));
      return {
        ...base,
        statement: {
          ...base.statement,
          broughtForward: { ...base.statement.broughtForward, totalKobo: 4200 },
          moneyReceived: { totalKobo: 0, groups: [] },
          moneyPaid: { totalKobo: 0, groups: [] },
          grossBalanceKobo: 4200,
          carriedForward: { ...base.statement.carriedForward, totalKobo: 4200 },
        },
        accounts: [],
      };
    });
    rerender(ui("org2"));

    expect(await screen.findByText("Financial Summary")).toBeInTheDocument();
    await waitFor(() => expect(figure("Bal B/F")).toHaveTextContent("₦42"));
    expect(screen.queryByText("₦170,000")).not.toBeInTheDocument();
    expect(previewUrls().some((url) => url.startsWith("/finance/org2/"))).toBe(true);
  });

  it("refreshes after a ledger write for that organisation only", async () => {
    render(ui());
    await screen.findByText("Financial Summary");
    const reads = () => previewUrls().length;
    expect(reads()).toBe(1);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.root("org2") });
    });
    expect(reads()).toBe(1);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.root("org1") });
    });
    await waitFor(() => expect(reads()).toBe(2));
  });

  it("presents an unavailable report without any figures", async () => {
    serve((url) => {
      if (!url.includes("/reports/financial")) return defaultResponder(url);
      const base = PREVIEW(periodOf(url));
      return {
        ...base,
        dataState: "unavailable",
        issues: [{ code: "REPORT_PERIOD_BEFORE_OPENING", message: "The books start on 1 Sep 2026." }],
        statement: null,
        accounts: null,
        reconciliation: null,
      };
    });
    await openSummary();

    const statement = within(screen.getByRole("region", { name: "Financial summary" }));
    expect(statement.getByText("Report unavailable")).toBeInTheDocument();
    expect(statement.getByText(/The books start on 1 Sep 2026/)).toBeInTheDocument();
    expect(statement.queryByText(/₦/)).not.toBeInTheDocument();
    expect(statement.queryByText("Bal B/F")).not.toBeInTheDocument();
  });
});

describe("<LedgerReportsPanel> freshness, isolation and permissions", () => {
  it("keeps figures after a failed refresh but says they may be out of date", async () => {
    await openCashbook();
    serve((url) => (url.includes("/cashbook") ? httpError(500, "Server busy.") : defaultResponder(url)));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.reports("org1") });
    });

    expect(await screen.findByText(/Couldn't refresh these figures\. Server busy\./)).toBeInTheDocument();
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
    expect(screen.queryByText(/^Loaded at/)).not.toBeInTheDocument();
  });

  it("refreshes reports on a ledger write's root invalidation, for that organisation only", async () => {
    await openCashbook();
    const reads = () => getUrls().filter((url) => url.includes("/cashbook")).length;
    expect(reads()).toBe(1);

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.root("org2") });
    });
    expect(reads()).toBe(1);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.root("org1") });
    });
    await waitFor(() => expect(reads()).toBe(2));
  });

  it("never shows one organisation's report under another", async () => {
    const { unmount } = render(ui("org1"));
    await openReport("Cashbook");
    await screen.findByText("₦12,000");
    unmount();

    setSession(["finance.view"], "org2");
    serve((url) =>
      url.startsWith("/finance/org2/") && url.includes(`/accounts/${BANK_ID}/cashbook`)
        ? { ...PAGE_2, balanceBeforeKobo: 4200, nextCursor: null }
        : undefined,
    );
    render(ui("org2"));
    await openReport("Cashbook");
    expect(await screen.findByText("₦42")).toBeInTheDocument();
    expect(screen.queryByText("₦12,000")).not.toBeInTheDocument();
    expect(getUrls().filter((url) => url.includes("/cashbook"))).toEqual([
      `/finance/org1/ledger/accounts/${BANK_ID}/cashbook?limit=50`,
      `/finance/org2/ledger/accounts/${BANK_ID}/cashbook?limit=50`,
    ]);
    expect(
      queryClient.getQueryData(
        queryKeys.finance.ledger.cashbook("org2", BANK_ID, { from: "", to: "", limit: 50, cursor: "" }),
      ),
    ).toBeDefined();
  });

  it("renders and fetches nothing without finance.view", () => {
    setSession([]);
    const { container } = render(ui());
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("needs finance.view only, and never writes", async () => {
    setSession(["finance.view"]);
    render(ui());
    expect(await screen.findByText("Financial Summary")).toBeInTheDocument();
    for (const method of ["post", "put", "patch", "delete"] as const) {
      expect(api[method]).not.toHaveBeenCalled();
    }
  });

  it("renders nothing while its gate is off", () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <LedgerReportsPanel organisationId="org1" accounts={ACCOUNTS} enabled={false} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });
});

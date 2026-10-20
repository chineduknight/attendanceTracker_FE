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

const SUMMARY = {
  from: "2026-09-01",
  to: "2026-09-30",
  summaryState: "known",
  income: {
    totalKobo: 205000,
    categories: [
      { accountId: id("i"), name: "Donations", active: true, amountKobo: 255000 },
      { accountId: id("r"), name: "Old raffle", active: false, amountKobo: -50000 },
      { accountId: id("d"), name: "Member dues income", active: true, amountKobo: 0 },
    ],
  },
  expense: {
    totalKobo: 150000,
    categories: [{ accountId: id("e"), name: "Hall hire", active: true, amountKobo: 150000 }],
  },
  netKobo: 55000,
  memberMoney: {
    heldAtStartKobo: 10000,
    openingKobo: 150000,
    receivedKobo: 600000,
    refundedKobo: 30000,
    allocatedKobo: 25000,
    reversalsKobo: -5000,
    otherKobo: 0,
    heldAtEndKobo: 700000,
  },
};

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
  if (url.includes("/ledger/summary")) return SUMMARY;
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
    <LedgerReportsPanel organisationId={organisationId} accounts={accounts} enabled />
  </QueryClientProvider>
);

/** Open a report tab and wait for the Cashbook tab (open first) to unmount. */
const openReport = async (name: "Balances" | "Summary") => {
  await selectTab(screen.getByRole("tab", { name }));
  await waitFor(() => expect(screen.queryByLabelText("Account")).not.toBeInTheDocument());
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
    render(ui());
    expect(await screen.findByText("Balance before these entries")).toBeInTheDocument();
    expect(getUrls()).toEqual([`/finance/org1/ledger/accounts/${BANK_ID}/cashbook?limit=50`]);

    const select = screen.getByLabelText("Account");
    expect(shownValue(select)).toContain("Bank account — Bank · GTBank · ••••0123");
    expect(await optionLabels(select)).toEqual([
      "Bank account — Bank · GTBank · ••••0123",
      "Cash in hand — Cash",
      "Old bank — Bank · inactive · opening not verified",
    ]);
  });

  it("reads the chosen account's cashbook under its own key", async () => {
    render(ui());
    await screen.findByText("Balance before these entries");
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
    render(ui());
    await screen.findByText("Balance before these entries");

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
    render(ui());
    await screen.findByText("Balance before these entries");
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
    render(ui());
    await screen.findByText("Balance before these entries");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("E-000001");
    await selectTab(screen.getByRole("tab", { name: "Summary" }));
    await screen.findByText("1 Sep 2026 – 30 Sep 2026");
    // Only the open report is mounted.
    expect(screen.queryByText("E-000001")).not.toBeInTheDocument();

    await selectTab(screen.getByRole("tab", { name: "Cashbook" }));
    expect(await screen.findByText("E-000001")).toBeInTheDocument();
    expect(screen.getByText("Page 2")).toBeInTheDocument();
  });

  it("applies a date window, restarting at the first page", async () => {
    render(ui());
    await screen.findByText("Balance before these entries");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await screen.findByText("Page 2");

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-05" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));

    await waitFor(() =>
      expect(getUrls()).toContain(
        `/finance/org1/ledger/accounts/${BANK_ID}/cashbook?from=2026-09-05&to=2026-09-20&limit=50`,
      ),
    );
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
  });

  it("refuses a From date after the To date without a request", async () => {
    render(ui());
    await screen.findByText("Balance before these entries");
    const calls = api.get.mock.calls.length;
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-05" } });

    expect(screen.getByRole("alert")).toHaveTextContent("The From date can't be after the To date.");
    expect(screen.getByRole("button", { name: "Show" })).toBeDisabled();
    expect(api.get.mock.calls.length).toBe(calls);
  });

  it("shows an unknown balance as Unknown, never ₦0", async () => {
    render(ui());
    await screen.findByText("Balance before these entries");
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

    expect(await screen.findByText("Couldn't load the cashbook")).toBeInTheDocument();
    expect(screen.getByText(/Only cash and bank accounts have a cashbook\. No figures are shown\./)).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
  });

  it("never shows a malformed cashbook as an empty or zero position", async () => {
    serve((url) =>
      url.includes("/cashbook") ? { ...PAGE_1, balanceBeforeKobo: "1200000" } : defaultResponder(url),
    );
    render(ui());

    expect(await screen.findByText("The cashbook couldn't be read")).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
    expect(screen.queryByText("No entries in this period")).not.toBeInTheDocument();
  });

  it("says so when there are no cash or bank accounts, or no account list", async () => {
    const { rerender } = render(ui("org1", ACCOUNTS.filter((a) => a.class !== "asset")));
    expect(screen.getByText("No cash or bank accounts yet")).toBeInTheDocument();
    rerender(ui("org1", null));
    expect(screen.getByText("Accounts aren't available")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
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
    fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-09-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() => expect(getUrls()).toContain("/finance/org1/ledger/balances?asOf=2026-09-15"));
  });

  it("never shows a malformed balances report", async () => {
    serve((url) => (url.includes("/balances") ? { ...BALANCES, moneyTotalKobo: undefined } : defaultResponder(url)));
    render(ui());
    await openReport("Balances");
    expect(await screen.findByText("The account balances couldn't be read")).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
  });
});

describe("<LedgerReportsPanel> financial summary", () => {
  const openSummary = async () => {
    render(ui());
    await openReport("Summary");
    return screen.findByText("1 Sep 2026 – 30 Sep 2026");
  };

  it("shows the server's income, expenses and net, including negative categories", async () => {
    await openSummary();
    expect(getUrls()).toContain("/finance/org1/ledger/summary");

    const income = screen.getByRole("list", { name: "Income categories" });
    const rows = within(income).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      "Donations₦2,550",
      "Old raffleInactive-₦500",
      "Member dues income₦0",
    ]);
    expect(figure("Total income")).toHaveTextContent("₦2,050");
    expect(figure("Total expenses")).toHaveTextContent("₦1,500");
    expect(figure("Net (income less expenses)")).toHaveTextContent("₦550");
    expect(screen.getByText(/A reversal of an entry from an earlier period can make a category negative/)).toBeInTheDocument();
  });

  it("reports member money apart from income, with allocations and reversals as sent", async () => {
    await openSummary();
    const section = screen.getByRole("region", { name: "Member money held" });
    const held = (label: string) => figure(label, section);
    expect(held("Held at start")).toHaveTextContent("₦100");
    expect(held("+ Opening member money")).toHaveTextContent("₦1,500");
    expect(held("+ Received")).toHaveTextContent("₦6,000");
    expect(held("− Refunded")).toHaveTextContent("₦300");
    expect(held("− Allocated to dues and levies")).toHaveTextContent("₦250");
    expect(held("+ Reversals")).toHaveTextContent("-₦50");
    expect(held("+ Other movements")).toHaveTextContent("₦0");
    expect(held("= Held at end")).toHaveTextContent("₦7,000");
    expect(within(section).getByText(/It is never income/)).toBeInTheDocument();
    // Received member money is not an income line or part of total income.
    const income = screen.getByRole("region", { name: "Income" });
    expect(within(income).queryByText("₦6,000")).not.toBeInTheDocument();
  });

  it("presents an unknown summary without figures", async () => {
    serve((url) =>
      url.includes("/summary")
        ? { ...SUMMARY, summaryState: "unknown", netKobo: 0 }
        : defaultResponder(url),
    );
    await openSummary();
    expect(screen.getByText("Figures not known yet")).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
    expect(screen.queryByText("Total income")).not.toBeInTheDocument();
  });

  it("says when the organisation has no member money account", async () => {
    serve((url) => (url.includes("/summary") ? { ...SUMMARY, memberMoney: null } : defaultResponder(url)));
    await openSummary();
    expect(screen.getByText("This organisation has no member money account.")).toBeInTheDocument();
  });

  it("reads a chosen period", async () => {
    await openSummary();
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() =>
      expect(getUrls()).toContain("/finance/org1/ledger/summary?from=2026-09-01&to=2026-09-15"),
    );
  });
});

describe("<LedgerReportsPanel> freshness, isolation and permissions", () => {
  it("keeps figures after a failed refresh but says they may be out of date", async () => {
    render(ui());
    await screen.findByText("Balance before these entries");
    serve((url) => (url.includes("/cashbook") ? httpError(500, "Server busy.") : defaultResponder(url)));
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.reports("org1") });
    });

    expect(await screen.findByText(/Couldn't refresh these figures\. Server busy\./)).toBeInTheDocument();
    expect(screen.getByText(/may be out of date/)).toBeInTheDocument();
    expect(screen.queryByText(/^Loaded at/)).not.toBeInTheDocument();
  });

  it("refreshes reports on a ledger write's root invalidation, for that organisation only", async () => {
    render(ui());
    await screen.findByText("Balance before these entries");
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
    await screen.findByText("₦12,000");
    unmount();

    setSession(["finance.view"], "org2");
    serve((url) =>
      url.startsWith("/finance/org2/") && url.includes(`/accounts/${BANK_ID}/cashbook`)
        ? { ...PAGE_2, balanceBeforeKobo: 4200, nextCursor: null }
        : undefined,
    );
    render(ui("org2"));
    expect(await screen.findByText("₦42")).toBeInTheDocument();
    expect(screen.queryByText("₦12,000")).not.toBeInTheDocument();
    expect(getUrls().filter((url) => url.startsWith("/finance/org2/"))).toEqual([
      `/finance/org2/ledger/accounts/${BANK_ID}/cashbook?limit=50`,
    ]);
    const keys = queryClient.getQueryCache().findAll({ queryKey: queryKeys.finance.ledger.reports("org2") });
    expect(keys).toHaveLength(1);
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
    expect(await screen.findByText("Balance before these entries")).toBeInTheDocument();
    for (const method of ["post", "put", "patch", "delete"] as const) {
      expect(api[method]).not.toHaveBeenCalled();
    }
  });

  it("renders nothing while its gate is off", () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <LedgerReportsPanel organisationId="org1" accounts={ACCOUNTS} />
      </QueryClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(api.get).not.toHaveBeenCalled();
  });
});

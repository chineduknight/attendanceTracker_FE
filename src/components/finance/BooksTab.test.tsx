import { fireEvent, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { generatedCss, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import BooksTab from "components/finance/BooksTab";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const NOT_ACTIVE = {
  state: "not_active",
  currency: "NGN",
  openingBalancesVerified: false,
  postingEnabled: false,
};
const ACTIVE = {
  state: "active",
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: true,
};
const ACCOUNTS = [
  {
    id: "cash",
    name: "Cash at bank",
    class: "asset",
    subtype: "bank",
    currency: "NGN",
    active: true,
  },
  { id: "dues", name: "Dues income", class: "income", currency: "NGN", active: false },
];
const JOURNALS = [
  {
    id: "j1",
    businessDate: "2026-10-12",
    reference: "RCPT-001",
    note: "October dues",
    sourceType: "receipt",
    lines: [
      { accountId: "cash", side: "debit", amountKobo: 125050 },
      { accountId: "dues", side: "credit", amountKobo: 600000 },
    ],
  },
];

const serveLedger = (
  status: unknown = NOT_ACTIVE,
  accounts: unknown = [],
  journals: unknown = [],
) => {
  api.get.mockImplementation((url: string) => {
    if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: status } });
    if (url.endsWith("/ledger/accounts")) return Promise.resolve({ data: { data: accounts } });
    if (url.endsWith("/ledger/journals")) return Promise.resolve({ data: { data: journals } });
    return Promise.resolve({ data: { data: [] } });
  });
};

const renderBooks = (organisationId = "org1") =>
  render(
    <QueryClientProvider client={queryClient}>
      <BooksTab organisationId={organisationId} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
});

describe("<BooksTab> gated foundation", () => {
  it("explains that books are not active and shows no money at all", async () => {
    serveLedger();
    renderBooks();

    expect(
      await screen.findByText(/Bookkeeping has not been activated for this organisation/),
    ).toBeInTheDocument();
    expect(screen.getByText("Not active")).toBeInTheDocument();
    expect(screen.getByText("No finance accounts configured")).toBeInTheDocument();
    expect(screen.getByText("No journal entries yet")).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cash on hand|bank balance|0 collected/i)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("renders supplied accounts and journal lines without deriving a balance", async () => {
    serveLedger(ACTIVE, ACCOUNTS, JOURNALS);
    renderBooks();

    const accountsList = await screen.findByRole("list", { name: "Finance accounts" });
    expect(within(accountsList).getByText("Cash at bank")).toBeInTheDocument();
    expect(within(accountsList).getByText("Dues income")).toBeInTheDocument();
    expect(screen.getByText("RCPT-001")).toBeInTheDocument();
    expect(screen.getByText("12 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("October dues")).toBeInTheDocument();
    expect(screen.getByText("Source: receipt")).toBeInTheDocument();
    expect(screen.getByText(/1,250\.50$/)).toBeInTheDocument();
    expect(screen.getByText(/6,000$/)).toBeInTheDocument();
    expect(screen.getByText("Debit")).toBeInTheDocument();
    expect(screen.getByText("Credit")).toBeInTheDocument();
    // The two line amounts are never summed into a balance.
    expect(screen.queryByText(/7,250\.50|7,251\.50/)).not.toBeInTheDocument();
    // Read-only: no post/correct/reverse/transfer control and no writable form.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("never formats an amount that was not supplied as integer kobo", async () => {
    serveLedger(ACTIVE, ACCOUNTS, [
      {
        ...JOURNALS[0],
        lines: [
          { accountId: "cash", side: "debit", amountKobo: 1250.5 },
          { accountId: "dues", side: "credit", amountKobo: "600000" },
        ],
      },
    ]);
    renderBooks();

    expect(await screen.findAllByText("Amount unavailable")).toHaveLength(2);
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
  });

  it("uses mode-aware surface tokens and renders at a phone width", async () => {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    try {
      serveLedger(ACTIVE, ACCOUNTS, JOURNALS);
      renderBooks();
      const accountsList = await screen.findByRole("list", { name: "Finance accounts" });
      expect(generatedCss(accountsList)).toMatch(/bg-panel/);
      expect(screen.getByText("RCPT-001")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
    }
  });
});

describe("<BooksTab> unavailable and failed endpoints", () => {
  it("treats a forbidden ledger as neutral and stops after the status request", async () => {
    api.get.mockRejectedValue({ response: { status: 403, data: { error: "Forbidden" } } });
    renderBooks();

    expect(await screen.findByText("Books aren't available to your account yet")).toBeInTheDocument();
    expect(screen.getByText(/No balances or transactions have been estimated/)).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/finance/org1/ledger/status");
  });

  it("treats a missing endpoint as not available yet", async () => {
    api.get.mockRejectedValue({ response: { status: 404, data: { error: "Not found" } } });
    renderBooks();

    expect(await screen.findByText("Books aren't available yet")).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
  });

  it("treats an older backend's unexpected 200 as unavailable, not an empty active book", async () => {
    serveLedger([]);
    renderBooks();

    expect(await screen.findByText("Books aren't available yet")).toBeInTheDocument();
    expect(screen.queryByText("No finance accounts configured")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("keeps genuinely empty lists as empty states", async () => {
    serveLedger(ACTIVE, [], []);
    renderBooks();

    expect(await screen.findByText("No finance accounts configured")).toBeInTheDocument();
    expect(screen.getByText("No journal entries yet")).toBeInTheDocument();
    expect(screen.queryByText("Books aren't available yet")).not.toBeInTheDocument();
  });

  it("treats a malformed nonempty accounts list as unavailable, not empty", async () => {
    serveLedger(
      ACTIVE,
      [
        { id: "cash", name: "Cash at bank", class: "asset", currency: "NGN", active: true },
        { name: "No stable id" },
      ],
      [],
    );
    renderBooks();

    expect(await screen.findByText("Books aren't available yet")).toBeInTheDocument();
    expect(screen.queryByText("No finance accounts configured")).not.toBeInTheDocument();
    expect(screen.queryByText("Cash at bank")).not.toBeInTheDocument();
  });

  it("treats a malformed nonempty journal list as unavailable, not empty", async () => {
    serveLedger(ACTIVE, ACCOUNTS, [
      { businessDate: "2026-10-12", reference: "RCPT-001", lines: [] },
    ]);
    renderBooks();

    expect(await screen.findByText("Books aren't available yet")).toBeInTheDocument();
    expect(screen.queryByText("No journal entries yet")).not.toBeInTheDocument();
    expect(screen.queryByText("RCPT-001")).not.toBeInTheDocument();
  });

  it("treats a malformed journal line as unavailable rather than showing an incomplete journal", async () => {
    serveLedger(ACTIVE, ACCOUNTS, [
      { ...JOURNALS[0], lines: [JOURNALS[0].lines[0], "not a line"] },
    ]);
    renderBooks();

    expect(await screen.findByText("Books aren't available yet")).toBeInTheDocument();
    expect(screen.queryByText("RCPT-001")).not.toBeInTheDocument();
    expect(screen.queryByText(/1,250\.50$/)).not.toBeInTheDocument();
  });

  it("shows the backend's load error and retries into the gated explanation", async () => {
    api.get.mockRejectedValue({
      response: { status: 500, data: { error: "Ledger service down" } },
    });
    renderBooks();

    expect(await screen.findByText("Couldn't load books")).toBeInTheDocument();
    expect(screen.getByText("Ledger service down")).toBeInTheDocument();

    serveLedger();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText(/Bookkeeping has not been activated/)).toBeInTheDocument();
  });

  it("keeps journals visible when accounts fail and retries only accounts", async () => {
    api.get.mockImplementation((url: string) => {
      if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: ACTIVE } });
      if (url.endsWith("/ledger/accounts")) {
        return Promise.reject({ response: { status: 500, data: { error: "Accounts down" } } });
      }
      return Promise.resolve({ data: { data: JOURNALS } });
    });
    renderBooks();

    expect(await screen.findByText("Couldn't load accounts")).toBeInTheDocument();
    expect(screen.getByText("Accounts down")).toBeInTheDocument();
    expect(screen.getByText("RCPT-001")).toBeInTheDocument();

    const before = api.get.mock.calls.length;
    const base = api.get.getMockImplementation()!;
    api.get.mockImplementation((url: string) =>
      url.endsWith("/ledger/accounts") ? Promise.resolve({ data: { data: ACCOUNTS } }) : base(url),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    const accountsList = await screen.findByRole("list", { name: "Finance accounts" });
    expect(within(accountsList).getByText("Cash at bank")).toBeInTheDocument();
    expect(screen.getByText("RCPT-001")).toBeInTheDocument();
    const refetched = api.get.mock.calls.slice(before).map(([url]) => String(url));
    expect(refetched).toContain("/finance/org1/ledger/accounts");
    expect(refetched).not.toContain("/finance/org1/ledger/journals");
  });

  it("loads only the new organisation's books after a switch", async () => {
    serveLedger(NOT_ACTIVE, [
      { id: "a1", name: "Org A cash", class: "asset", currency: "NGN", active: true },
    ]);
    const view = renderBooks("org1");
    expect(await screen.findByText("Org A cash")).toBeInTheDocument();

    api.get.mockClear();
    serveLedger(ACTIVE, [
      { id: "b1", name: "Org B cash", class: "asset", currency: "NGN", active: true },
    ]);
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <BooksTab organisationId="org2" />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Org B cash")).toBeInTheDocument();
    expect(screen.queryByText("Org A cash")).not.toBeInTheDocument();
    expect(api.get.mock.calls.length).toBeGreaterThan(0);
    expect(api.get.mock.calls.every(([url]) => String(url).includes("/finance/org2/"))).toBe(true);
  });
});

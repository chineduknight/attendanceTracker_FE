import { fireEvent, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { generatedCss, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { MemoryRouter } from "react-router-dom";
import BooksTab from "components/finance/BooksTab";

import { LEDGER_NOT_ACTIVE_NOTE } from "helpers/ledger";
import { LEDGER_F3_RECONCILIATION_UI_ENABLED } from "config/ledgerF3Reconciliation";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { RECONCILIATION_NOT_LIVE_NOTE } from "components/finance/reconciliation/ReconciliationPanel";

/** Where Books opens; a test points it at the screen it covers. */
let booksUrl = "/finance?tab=books";
const openBooksAt = (books: string, org = "org1") => {
  booksUrl = `/finance?tab=books&books=${books}&org=${org}`;
};
beforeEach(() => {
  booksUrl = "/finance?tab=books";
});

// This file specifies Books with the write gates off: the read-only account
// list the kill switch falls back to. BooksTabSetupGate.test and the panel
// tests cover them on.
jest.mock("config/ledgerSetup", () => ({ LEDGER_SETUP_UI_ENABLED: false }));
jest.mock("config/ledgerF3Setup", () => ({ LEDGER_F3_SETUP_UI_ENABLED: false }));
jest.mock("config/ledgerOpeningBalances", () => ({ LEDGER_OPENING_BALANCES_UI_ENABLED: false }));
jest.mock("config/ledgerLifecycle", () => ({ LEDGER_LIFECYCLE_UI_ENABLED: false }));
jest.mock("config/ledgerPostings", () => ({ LEDGER_POSTINGS_UI_ENABLED: false }));
jest.mock("config/ledgerReversals", () => ({ LEDGER_REVERSALS_UI_ENABLED: false }));
jest.mock("config/ledgerMemberMoney", () => ({ LEDGER_MEMBER_MONEY_UI_ENABLED: false }));
jest.mock("config/ledgerF3Allocations", () => ({ LEDGER_F3_ALLOCATION_UI_ENABLED: false }));
jest.mock("config/ledgerReports", () => ({ LEDGER_REPORTS_UI_ENABLED: false }));

/** The shipped value, not this file's fallback mock. */
const shipped = (path: string, name: string): boolean => jest.requireActual(path)[name];

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

/** The approved F2 status shape (RFC v0.3 §4.9), all fields additive. */
const F2_ACTIVE = {
  ...ACTIVE,
  blockers: [],
  openingDate: "2026-11-01",
  lockedThrough: "2026-10-31",
  memberReceiptsEnabled: true,
  revision: 7,
  pendingProposal: null,
  unconfirmedAttempts: 0,
  contractVersion: "f2-0.3",
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
    // The paged item fields every F2 journal read carries.
    totalKobo: 600000,
    postedAt: "2026-10-12T10:00:00.000Z",
    postedBy: null,
    sourceId: null,
    reversesJournalId: null,
    reversedByJournalId: null,
    entry: null,
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
    // Books reads the paged list (and one entry at a time on its entry screen).
    if (url.includes("/ledger/journals?")) {
      return Promise.resolve({
        data: { data: Array.isArray(journals) ? { items: journals, nextCursor: null } : journals },
      });
    }
    const one = url.match(/\/ledger\/journals\/([^/?]+)$/);
    if (one && Array.isArray(journals)) {
      const found = journals.find((journal: { id?: string }) => journal?.id === one[1]);
      return found ? Promise.resolve({ data: { data: found } }) : Promise.reject({ response: { status: 404 } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
};

const renderBooks = (organisationId = "org1") =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId={organisationId} /></MemoryRouter>
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
    expect(screen.getAllByText("Not active").length).toBeGreaterThan(0);
    expect(screen.getByText("No finance accounts configured")).toBeInTheDocument();
    expect(screen.getByText("Books aren't set up")).toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cash on hand|bank balance|0 collected/i)).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("renders supplied accounts as the server sent them", async () => {
    openBooksAt("manage-setup");
    serveLedger(ACTIVE, ACCOUNTS, JOURNALS);
    renderBooks();

    const accountsList = await screen.findByRole("list", { name: "Finance accounts" });
    expect(within(accountsList).getByText("Cash at bank")).toBeInTheDocument();
    expect(within(accountsList).getByText("Dues income")).toBeInTheDocument();
  });

  it("renders a journal's lines on its entry screen without deriving a balance", async () => {
    openBooksAt("entry&journal=j1");
    serveLedger(ACTIVE, ACCOUNTS, JOURNALS);
    renderBooks();

    expect(await screen.findByText(/1,250\.50$/)).toBeInTheDocument();
    expect(screen.getAllByText(/6,000$/).length).toBeGreaterThan(0);
    expect(screen.getByText("Debit")).toBeInTheDocument();
    expect(screen.getByText("Credit")).toBeInTheDocument();
    // The two line amounts are never summed into a balance.
    expect(screen.queryByText(/7,250\.50|7,251\.50/)).not.toBeInTheDocument();
    // Read-only: only the way back, no undo control and no writable form.
    expect(screen.getAllByRole("button").map((button) => button.textContent?.trim())).toEqual([
      "Transactions",
    ]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("never formats an amount that was not supplied as integer kobo", async () => {
    openBooksAt("entry&journal=j1");
    serveLedger(ACTIVE, ACCOUNTS, [
      {
        ...JOURNALS[0],
        lines: [
          { accountId: "cash", side: "debit", amountKobo: 1250.5 },
          { accountId: "dues", side: "credit", amountKobo: "600000" },
        ],
        totalKobo: null,
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
      openBooksAt("manage-setup");
      serveLedger(ACTIVE, ACCOUNTS, JOURNALS);
      renderBooks();
      const accountsList = await screen.findByRole("list", { name: "Finance accounts" });
      expect(generatedCss(accountsList)).toMatch(/bg-panel/);
      expect(await screen.findByText("RCPT-001")).toBeInTheDocument();
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
    expect(await screen.findByText("No transactions yet")).toBeInTheDocument();
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

  it("treats a malformed nonempty journal page as unreadable, not empty", async () => {
    serveLedger(ACTIVE, ACCOUNTS, [
      { businessDate: "2026-10-12", reference: "RCPT-001", lines: [] },
    ]);
    renderBooks();

    // An unreadable page is an error, never "no transactions".
    expect(await screen.findByText("Couldn't load transactions")).toBeInTheDocument();
    expect(screen.queryByText("No transactions yet")).not.toBeInTheDocument();
    expect(screen.queryByText("RCPT-001")).not.toBeInTheDocument();
  });

  it("treats a malformed journal line as unavailable rather than showing an incomplete journal", async () => {
    serveLedger(ACTIVE, ACCOUNTS, [
      { ...JOURNALS[0], lines: [JOURNALS[0].lines[0], "not a line"] },
    ]);
    renderBooks();

    expect(await screen.findByText("Couldn't load transactions")).toBeInTheDocument();
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
    openBooksAt("manage-setup");
    api.get.mockImplementation((url: string) => {
      if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: ACTIVE } });
      if (url.endsWith("/ledger/accounts")) {
        return Promise.reject({ response: { status: 500, data: { error: "Accounts down" } } });
      }
      return Promise.resolve({ data: { data: { items: JOURNALS, nextCursor: null } } });
    });
    renderBooks();

    expect(await screen.findByText("Couldn't load accounts")).toBeInTheDocument();
    expect(screen.getByText("Accounts down")).toBeInTheDocument();
    expect(await screen.findByText("RCPT-001")).toBeInTheDocument();

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
        <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId="org2" /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Org B cash")).toBeInTheDocument();
    expect(screen.queryByText("Org A cash")).not.toBeInTheDocument();
    expect(api.get.mock.calls.length).toBeGreaterThan(0);
    expect(api.get.mock.calls.every(([url]) => String(url).includes("/finance/org2/"))).toBe(true);
  });
});

describe("<BooksTab> release gates", () => {
  it("ships every finance gate on", () => {
    expect({
      setup: shipped("config/ledgerSetup", "LEDGER_SETUP_UI_ENABLED"),
      openingBalances: shipped("config/ledgerOpeningBalances", "LEDGER_OPENING_BALANCES_UI_ENABLED"),
      lifecycle: shipped("config/ledgerLifecycle", "LEDGER_LIFECYCLE_UI_ENABLED"),
      postings: shipped("config/ledgerPostings", "LEDGER_POSTINGS_UI_ENABLED"),
      memberMoney: shipped("config/ledgerMemberMoney", "LEDGER_MEMBER_MONEY_UI_ENABLED"),
      reversals: shipped("config/ledgerReversals", "LEDGER_REVERSALS_UI_ENABLED"),
      reports: shipped("config/ledgerReports", "LEDGER_REPORTS_UI_ENABLED"),
      f3Setup: shipped("config/ledgerF3Setup", "LEDGER_F3_SETUP_UI_ENABLED"),
      f3Reconciliation: LEDGER_F3_RECONCILIATION_UI_ENABLED,
      f3Allocations: shipped("config/ledgerF3Allocations", "LEDGER_F3_ALLOCATION_UI_ENABLED"),
    }).toEqual({
      setup: true,
      openingBalances: true,
      lifecycle: true,
      postings: true,
      memberMoney: true,
      reversals: true,
      reports: true,
      f3Setup: true,
      f3Reconciliation: true,
      f3Allocations: true,
    });
  });

  it("reads no reconciliation for books that aren't active", async () => {
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", isOwner: true } });
    try {
      openBooksAt("manage-reconciliation");
      serveLedger(NOT_ACTIVE);
      renderBooks();
      const region = await screen.findByRole("region", { name: "Member money reconciliation" });
      expect(region).toHaveTextContent(RECONCILIATION_NOT_LIVE_NOTE);
      const urls = api.get.mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => /\/reconciliation\/|\/ledger\/allocations/.test(url))).toBe(false);
    } finally {
      useGlobalStore.setState({ organisation: EMPTY_ORG });
    }
  });

  it("shows the read-only reconciliation but no allocation posting, and writes nothing", async () => {
    useGlobalStore.setState({ organisation: { ...EMPTY_ORG, id: "org1", isOwner: true } });
    try {
      openBooksAt("manage-reconciliation");
      serveLedger({ ...F2_ACTIVE, allocationsEnabled: true }, ACCOUNTS, JOURNALS);
      renderBooks();
      expect(await screen.findByText("RCPT-001")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Member money reconciliation" })).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Allocate member money" })).not.toBeInTheDocument();
      for (const method of ["post", "put", "patch", "delete"] as const) {
        expect(api[method]).not.toHaveBeenCalled();
      }
    } finally {
      useGlobalStore.setState({ organisation: EMPTY_ORG });
    }
  });

  it("shows no F3A allocation setup, and writes nothing, with its gate off", async () => {
    serveLedger({ ...F2_ACTIVE, allocationsEnabled: true }, [
      ...ACCOUNTS,
      { id: "mdi", name: "Dues income (from allocations)", class: "income", subtype: "member_dues_income", currency: "NGN", active: true, revision: 0 },
    ], JOURNALS);
    renderBooks();
    expect(await screen.findByText("RCPT-001")).toBeInTheDocument();
    expect(screen.queryByText("Member money allocations")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /allocations|income account/i })).not.toBeInTheDocument();
    // The plain F1 account list still shows what the server sent.
    expect(screen.getByText("Dues income (from allocations)")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("shows no F2B-4 reports, and reads none, with its gate off", async () => {
    serveLedger(F2_ACTIVE, ACCOUNTS, JOURNALS);
    renderBooks();
    expect(await screen.findByText("RCPT-001")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reports" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Cashbook" })).not.toBeInTheDocument();
    const urls = api.get.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => /\/cashbook|\/ledger\/balances|\/ledger\/summary/.test(url))).toBe(false);
  });

  it("shows no F2B-3 reversal or attempts UI, and reads neither, with its gate off", async () => {
    serveLedger({ ...F2_ACTIVE, unconfirmedAttempts: 2 }, ACCOUNTS, JOURNALS);
    renderBooks();
    expect(await screen.findByText("RCPT-001")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reversals" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Unconfirmed attempts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Details/ })).not.toBeInTheDocument();
    const urls = api.get.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("/ledger/attempts") || /\/journals\/./.test(url))).toBe(false);
  });
});

describe("<BooksTab> approved F2 read compatibility", () => {
  it.each([
    ["setup", "Setup", /setup has started for this organisation/],
    [
      "pending_verification",
      "Awaiting verification",
      /awaiting independent verification/,
    ],
    ["suspended", "Suspended", /Bookkeeping is suspended for this organisation/],
  ])(
    "renders the %s state as not ready, never active",
    async (state, label, note) => {
      serveLedger(
        { ...F2_ACTIVE, state, openingBalancesVerified: false, postingEnabled: false },
        [],
        [],
      );
      renderBooks();

      expect((await screen.findAllByText(label)).length).toBeGreaterThan(0);
      expect(screen.getByText(note)).toBeInTheDocument();
      expect(screen.queryByText("Active")).not.toBeInTheDocument();
      expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
      // Reads still happen, but nothing is invented from them.
      expect(screen.getByText("No finance accounts configured")).toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
      expect(api.put).not.toHaveBeenCalled();
      expect(api.patch).not.toHaveBeenCalled();
      expect(api.delete).not.toHaveBeenCalled();
    },
  );

  it("keeps an unrecognised state unknown and reads no lists", async () => {
    serveLedger(
      { ...F2_ACTIVE, state: "frozen_for_review", contractVersion: "f2-9" },
      ACCOUNTS,
      JOURNALS,
    );
    renderBooks();

    expect(await screen.findByText("Unknown state")).toBeInTheDocument();
    expect(
      screen.getByText(/doesn't recognise the bookkeeping state the server reported/),
    ).toBeInTheDocument();
    expect(screen.getByText("Books aren't available yet")).toBeInTheDocument();
    expect(screen.queryByText("No finance accounts configured")).not.toBeInTheDocument();
    expect(screen.queryByText("RCPT-001")).not.toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
    expect(screen.queryByText(/₦/)).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/finance/org1/ledger/status");
  });

  it("shows additive F2 facts exactly as supplied", async () => {
    serveLedger(
      {
        ...F2_ACTIVE,
        pendingProposal: { id: "p1" },
        unconfirmedAttempts: 2,
        blockers: ["LEDGER_WRITES_DISABLED"],
      },
      ACCOUNTS,
      JOURNALS,
    );
    renderBooks();

    expect(await screen.findByText("Opening date: 1 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Period locked through: 31 Oct 2026")).toBeInTheDocument();
    expect(
      screen.getByText("An opening proposal is open and awaiting verification."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "2 posting requests have unconfirmed outcomes and need resolution.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Member receipts are enabled.")).toBeInTheDocument();
    expect(screen.getByText("Server-reported blockers:")).toBeInTheDocument();
    expect(screen.getByText("LEDGER_WRITES_DISABLED")).toBeInTheDocument();
  });

  it("invents no F2 details for a plain F1 payload", async () => {
    serveLedger(NOT_ACTIVE, [], []);
    renderBooks();

    expect(await screen.findByText(LEDGER_NOT_ACTIVE_NOTE)).toBeInTheDocument();
    expect(screen.getAllByText("Not active").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Opening date:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Period locked through:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Member receipts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/unconfirmed outcome/)).not.toBeInTheDocument();
    expect(screen.queryByText("Server-reported blockers:")).not.toBeInTheDocument();
    expect(screen.queryByText(/opening proposal is open/)).not.toBeInTheDocument();
  });

  it("stays read-only when an F2 status claims active and posting enabled", async () => {
    serveLedger(F2_ACTIVE, ACCOUNTS, JOURNALS);
    renderBooks();

    // The active wording appears, but the shell still offers no controls.
    expect(
      await screen.findByText(
        "Bookkeeping is active. Only recorded journal entries are shown; balances are not calculated here.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("RCPT-001")).toBeInTheDocument();
    expect(screen.queryByText("Not active")).not.toBeInTheDocument();
    // Navigation only: nothing records, moves or undoes money.
    expect(
      screen.queryByRole("button", { name: /Money in|Money out|Transfer|Record|Post|Reverse|Undo/, hidden: true }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { hidden: true })).not.toBeInTheDocument();

    // Status plus the two F1 arrays only: no legacy payment read, no write.
    const urls = api.get.mock.calls.map(([url]) => String(url)).sort();
    expect(urls).toEqual([
      "/finance/org1/ledger/accounts",
      "/finance/org1/ledger/journals?pagination=cursor&limit=5",
      "/finance/org1/ledger/status",
    ]);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});

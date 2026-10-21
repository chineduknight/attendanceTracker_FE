import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { chooseOption, confirmInDialog, render } from "test-utils/render";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import BooksTab from "components/finance/BooksTab";
import Finance from "pages/Finance";
import {
  beginLedgerPostingIntent,
  ledgerPostingIntentKey,
  markLedgerPostingIntentUnresolved,
} from "helpers/ledgerPostingIntent";
import { todayInLagos } from "helpers/openingBalances";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

/** The Books screen stack: navigation, permissions, organisation safety. */

jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const TODAY = todayInLagos();

const statusOf = (overrides: Record<string, unknown> = {}) => ({
  state: "active",
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: true,
  blockers: [],
  openingDate: "2026-09-01",
  lockedThrough: null,
  memberReceiptsEnabled: false,
  allocationsEnabled: false,
  revision: 4,
  pendingProposal: null,
  activatedAt: "2026-09-01T10:00:00.000Z",
  gapWindowAttestedAt: null,
  unconfirmedAttempts: 0,
  contractVersion: "f2-0.3",
  ...overrides,
});

const account = (id: string, name: string, cls: string, subtype: string | null) => ({
  id,
  name,
  class: cls,
  subtype,
  currency: "NGN",
  active: true,
  revision: 0,
  openingVerified: cls === "asset" ? true : null,
  bankName: null,
  accountNumberLast4: null,
});

const ACCOUNTS = [
  account("cash", "Cash in hand", "asset", "cash"),
  account("bank", "Main bank", "asset", "bank"),
  account("equity", "Opening balance equity", "equity", "opening_balance_equity"),
  account("donations", "Donations", "income", null),
  account("ops", "Operating expenses", "expense", null),
];

let status = statusOf();

const serve = (org = "org1") =>
  api.get.mockImplementation((url: string) => {
    if (!url.includes(`/finance/${org}/`)) return Promise.resolve({ data: { data: null } });
    if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: status } });
    if (url.endsWith("/ledger/accounts")) return Promise.resolve({ data: { data: ACCOUNTS } });
    if (url.includes("/ledger/balances")) {
      return Promise.resolve({
        data: {
          data: {
            asOf: TODAY,
            accounts: [
              { accountId: "cash", balanceState: "known", balanceKobo: 7300000 },
              { accountId: "bank", balanceState: "known", balanceKobo: 9500000 },
            ],
            moneyTotalKobo: 16800000,
          },
        },
      });
    }
    if (url.includes("/ledger/journals?")) {
      return Promise.resolve({ data: { data: { items: [], nextCursor: null } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });

const setSession = (permissions: PermissionKey[] | "owner", org = "org1") =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: {
      ...EMPTY_ORG,
      id: org,
      isOwner: permissions === "owner",
      permissions: permissions === "owner" ? [] : permissions,
    },
  });

const seen = { search: "" };
const Spy = () => {
  seen.search = useLocation().search;
  return null;
};

const renderBooks = (entry = "/finance?tab=books", organisationId = "org1") =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entry]}>
        <BooksTab organisationId={organisationId} />
        <Spy />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const MANAGER: PermissionKey[] = ["finance.view", "finance.manage"];
const VIEWER: PermissionKey[] = ["finance.view"];

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  Object.values(api).forEach((mock) => mock.mockReset());
  installPostingLockManager();
  status = statusOf();
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("Books Overview", () => {
  it("shows cash and bank first, then Money in, Money out and Transfer to a manager", async () => {
    setSession(MANAGER);
    serve();
    renderBooks();
    expect(await screen.findByRole("group", { name: "Cash in hand" })).toHaveTextContent("₦73,000");
    expect(screen.getByRole("group", { name: "Main bank" })).toHaveTextContent("₦95,000");
    expect(screen.getByText("₦168,000")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Money in/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Money out/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Transfer between accounts/ })).toBeEnabled();
  });

  it("gives a viewer the figures but no way to record", async () => {
    setSession(VIEWER);
    serve();
    renderBooks();
    expect(await screen.findByRole("group", { name: "Cash in hand" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money out/ })).not.toBeInTheDocument();
  });

  it("opens Money in as a sheet in the URL", async () => {
    setSession(MANAGER);
    serve();
    renderBooks();
    fireEvent.click(await screen.findByRole("button", { name: /Money in/ }));
    expect(await screen.findByRole("dialog", { name: "Money in" })).toBeInTheDocument();
    expect(seen.search).toContain("sheet=money-in");
  });

  it("says books aren't set up, and offers setup only to a manager", async () => {
    status = statusOf({ state: "not_active", openingBalancesVerified: false, postingEnabled: false });
    setSession(MANAGER);
    serve();
    renderBooks();
    expect(await screen.findByText("Books aren't set up")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up books" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });

  it("shows no member-money surface while member receipts are off", async () => {
    setSession(MANAGER);
    serve();
    renderBooks();
    fireEvent.click(await screen.findByRole("button", { name: /Money in/ }));
    await screen.findByRole("dialog", { name: "Money in" });
    expect(screen.queryByRole("button", { name: "For a member" })).not.toBeInTheDocument();
    expect(screen.queryByText("Held for members")).not.toBeInTheDocument();
  });
});

describe("Books navigation", () => {
  it("moves into Manage Books and back", async () => {
    setSession(MANAGER);
    serve();
    renderBooks();
    fireEvent.click(await screen.findByRole("button", { name: /Manage Books/ }));
    expect(await screen.findByRole("heading", { name: "Manage Books" })).toBeVisible();
    expect(seen.search).toContain("books=manage");

    fireEvent.click(screen.getByRole("button", { name: /Setup & accounts/ }));
    expect(await screen.findByRole("heading", { name: "Setup & accounts" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Manage Books" }));
    await waitFor(() => expect(seen.search).not.toContain("manage-setup"));
    expect(screen.getByRole("heading", { name: "Manage Books" })).toBeVisible();
  });

  it("sends a viewer who opens a manage-only screen to the Overview", async () => {
    setSession(VIEWER);
    serve();
    renderBooks("/finance?tab=books&books=manage-attempts&org=org1");
    await waitFor(() => expect(seen.search).not.toContain("manage-attempts"));
    expect(await screen.findByRole("group", { name: "Cash in hand" })).toBeVisible();
  });

  it("ignores another organisation's Books URL and never reads its entry", async () => {
    setSession(MANAGER, "org2");
    serve("org2");
    renderBooks("/finance?tab=books&books=entry&journal=j-from-org1&org=org1", "org2");
    await waitFor(() => expect(seen.search).toBe("?tab=books&org=org2"));
    expect(api.get.mock.calls.some(([url]) => String(url).includes("j-from-org1"))).toBe(false);
  });
});

describe("Books transactions", () => {
  it("filters on the server and says when the list is complete", async () => {
    setSession(MANAGER);
    serve();
    renderBooks("/finance?tab=books&books=transactions&org=org1");
    expect(await screen.findByText("That's everything for these filters")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Money out" }));
    await waitFor(() =>
      expect(api.get.mock.calls.some(([url]) => String(url).includes("sourceType=cash_expense"))).toBe(true),
    );
  });
});

type Seed = Parameters<typeof beginLedgerPostingIntent>[0];

const seedPending = async (
  key: string,
  operation: Seed["operation"],
  body: Record<string, unknown>,
  extra: Partial<Seed> = {},
  retryMode: "retry" | "owner" = "retry",
) => {
  const claim = await beginLedgerPostingIntent({
    organisationId: "org1",
    officerId: "officer-1",
    key,
    operation,
    body: { idempotencyKey: key, businessDate: TODAY, ...body } as Seed["body"],
    summary: {
      operation,
      amountKobo: 500000,
      businessDate: TODAY,
      method: operation === "reversal" ? null : "cash",
      fromAccountName: null,
      toAccountName: "Cash in hand",
      categoryName: "Donations",
    } as Seed["summary"],
    ...extra,
  });
  if (claim.kind !== "claimed") throw new Error(`seed failed: ${claim.reason}`);
  await markLedgerPostingIntentUnresolved(claim.record, {
    ambiguous: true,
    retryMode,
    message: "Unknown.",
  });
};

const RECEIPT_BODY = { amountKobo: 500000, toAccountId: "cash", incomeAccountId: "donations", method: "cash" };

const openAttentionItem = async (name: RegExp) => {
  const attention = await screen.findByRole("region", { name: "Needs attention" });
  fireEvent.click(within(attention).getByRole("button", { name }));
};

describe("Books pending postings", () => {
  it("offers one retry, reached from Needs attention", async () => {
    await seedPending("key-12345678", "receipt", RECEIPT_BODY);
    setSession(MANAGER);
    serve();
    renderBooks();
    await openAttentionItem(/wasn't confirmed/);
    const sheet = await screen.findByRole("dialog", { name: "Money in" });
    expect(within(sheet).getByRole("button", { name: "Retry this posting" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry this posting", hidden: true })).toHaveLength(1);
  });

  it("reaches the retry of a member receipt while member receipts are off", async () => {
    await seedPending("key-member01", "member_receipt", {
      amountKobo: 500000,
      toAccountId: "cash",
      method: "cash",
      counterpartyName: "Ada Obi",
      purpose: "dues",
      receivedAfterOpeningCount: true,
    });
    setSession(MANAGER);
    serve();
    renderBooks();
    await openAttentionItem(/wasn't confirmed/);
    const sheet = await screen.findByRole("dialog", { name: "Money in" });
    expect(within(sheet).getByRole("button", { name: "Retry this posting" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry this posting", hidden: true })).toHaveLength(1);
  });

  it("opens the reversed entry for an unconfirmed reversal, where its retry is", async () => {
    await seedPending(
      "key-reversal1",
      "reversal",
      { reason: "Posted twice" },
      {
        reversalTarget: {
          journalId: "a".repeat(24),
          sourceType: "cash_receipt",
          number: "R-000012",
          businessDate: TODAY,
          totalKobo: 500000,
        },
      },
    );
    setSession(MANAGER);
    serve();
    renderBooks();
    await openAttentionItem(/wasn't confirmed/);
    await waitFor(() => expect(seen.search).toContain(`journal=${"a".repeat(24)}`));
    expect(await screen.findByRole("button", { name: "Retry this posting" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Retry this posting", hidden: true })).toHaveLength(1);
  });

  it("sends a posting only an owner can resolve to Unconfirmed saves", async () => {
    await seedPending("key-owner001", "receipt", RECEIPT_BODY, {}, "owner");
    setSession(MANAGER);
    serve();
    renderBooks();
    const attention = await screen.findByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText("Resend can't fix it. Resolve it in Unconfirmed saves.")).toBeInTheDocument();
    await openAttentionItem(/wasn't confirmed/);
    expect(await screen.findByRole("heading", { name: "Unconfirmed saves" })).toBeVisible();
  });

  it("tells a viewer who can retry instead of linking to a dead end", async () => {
    await seedPending("key-viewer01", "receipt", RECEIPT_BODY);
    setSession(VIEWER);
    serve();
    renderBooks();
    const attention = await screen.findByRole("region", { name: "Needs attention" });
    expect(within(attention).getByText(/wasn't confirmed/)).toBeInTheDocument();
    expect(within(attention).getByText("Only an officer who can manage finance can retry it.")).toBeInTheDocument();
    expect(within(attention).queryByRole("button", { name: /wasn't confirmed/ })).not.toBeInTheDocument();
  });
});

const RECEIPT_ID = "a".repeat(24);
const REVERSAL_ID = "b".repeat(24);

const journalOf = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  businessDate: TODAY,
  reference: null,
  note: null,
  sourceType: "cash_receipt",
  lines: [
    { accountId: "cash", side: "debit", amountKobo: 500000 },
    { accountId: "donations", side: "credit", amountKobo: 500000 },
  ],
  totalKobo: 500000,
  postedAt: `${TODAY}T10:00:00.000Z`,
  postedBy: { id: "officer-1", name: "treasurer" },
  sourceId: null,
  reversesJournalId: null,
  reversedByJournalId: null,
  entry: { number: "R-000012", method: "cash", counterpartyName: null },
  ...overrides,
});

/** One receipt in the books, readable in the list and on its own. */
const serveOneReceipt = () => {
  serve();
  const base = api.get.getMockImplementation()!;
  api.get.mockImplementation((url: string) => {
    if (url === `/finance/org1/ledger/journals/${RECEIPT_ID}`) {
      return Promise.resolve({ data: { data: journalOf(RECEIPT_ID) } });
    }
    if (url.includes("/ledger/journals?")) {
      return Promise.resolve({ data: { data: { items: [journalOf(RECEIPT_ID)], nextCursor: null } } });
    }
    return base(url);
  });
};

const deferredPost = () => {
  let resolve: (value: unknown) => void = () => undefined;
  api.post.mockImplementation(() => new Promise((done) => (resolve = done)));
  return (value: unknown) => resolve(value);
};

describe("Books saves the officer walks away from", () => {
  it("keeps a save in flight when the officer switches Finance tab, and shows its receipt on return", async () => {
    const settle = deferredPost();
    setSession(MANAGER);
    serve();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/finance?tab=books"]}>
          <Finance />
          <Spy />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Money in/ }));
    const sheet = await screen.findByRole("dialog", { name: "Money in" });
    fireEvent.change(within(sheet).getByLabelText("Amount"), { target: { value: "5000" } });
    fireEvent.click(within(within(sheet).getByRole("radiogroup", { name: "Into" })).getByRole("radio", { name: /Cash in hand/ }));
    await chooseOption(within(sheet).getByLabelText("Category"), "Donations");
    fireEvent.click(within(sheet).getByRole("button", { name: "Record money in" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("tab", { name: "Collect" }));
    await waitFor(() => expect(seen.search).toBe("?tab=collect"));
    // Let Collect's panel settle, so a Books that unmounts has unmounted.
    await screen.findByText("Nothing to collect yet");
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    settle({
      status: 201,
      data: { data: { replayed: false, journal: journalOf("c".repeat(24), { entry: { number: "R-000013", method: "cash", counterpartyName: null } }) } },
    });
    await waitFor(() => expect(window.localStorage.getItem(ledgerPostingIntentKey("org1"))).toBeNull());

    fireEvent.click(screen.getByRole("tab", { name: "Books" }));
    await waitFor(() => expect(screen.getByText(/R-000013/)).toBeVisible());
    expect(api.post).toHaveBeenCalledTimes(1);

    // "Record another posting" opens a fresh form for the same kind of money.
    fireEvent.click(screen.getByRole("button", { name: "Record another posting" }));
    const again = await screen.findByRole("dialog", { name: "Money in" });
    expect(within(again).getByLabelText("Amount")).toHaveValue("");
  });

  it("shows a reversal's confirmation after the officer goes Back while it saves", async () => {
    const settle = deferredPost();
    setSession(MANAGER);
    serveOneReceipt();
    renderBooks("/finance?tab=books&books=transactions&org=org1");

    fireEvent.click(await screen.findByRole("button", { name: /R-000012|Money in/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Reverse this entry" }));
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Posted twice" } });
    fireEvent.click(screen.getByRole("button", { name: "Review reversal" }));
    await confirmInDialog("Reverse entry");
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Transactions" }));
    await waitFor(() => expect(seen.search).not.toContain("books=entry"));

    settle({
      status: 201,
      data: {
        data: {
          replayed: false,
          journal: journalOf(REVERSAL_ID, {
            sourceType: "reversal",
            note: "Posted twice",
            sourceId: RECEIPT_ID,
            reversesJournalId: RECEIPT_ID,
            entry: null,
            lines: [
              { accountId: "donations", side: "debit", amountKobo: 500000 },
              { accountId: "cash", side: "credit", amountKobo: 500000 },
            ],
          }),
        },
      },
    });
    // Role queries see only what is shown: the receipt on Transactions, not
    // the copy left on the hidden entry screen.
    await waitFor(() =>
      expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("Reversed"))).toBe(true),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe("Books small affordances", () => {
  it("says when more transactions couldn't load, and keeps the ones shown", async () => {
    setSession(MANAGER);
    serve();
    const base = api.get.getMockImplementation()!;
    api.get.mockImplementation((url: string) => {
      if (url.includes("/ledger/journals?") && url.includes("cursor=page2")) {
        return Promise.reject({ response: { status: 500, data: { error: "Journals are down" } } });
      }
      if (url.includes("/ledger/journals?")) {
        return Promise.resolve({ data: { data: { items: [journalOf(RECEIPT_ID)], nextCursor: "page2" } } });
      }
      return base(url);
    });
    renderBooks("/finance?tab=books&books=transactions&org=org1");
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Couldn't load more transactions")).toBeVisible();
    expect(screen.getByText("Journals are down")).toBeVisible();
    expect(screen.getByRole("button", { name: /R-000012|Money in/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Load more" })).toBeEnabled();
  });

  it("puts focus on the Books heading when the officer comes back to the Overview", async () => {
    setSession(MANAGER);
    serve();
    renderBooks();
    fireEvent.click(await screen.findByRole("button", { name: /Manage Books/ }));
    expect(await screen.findByRole("heading", { name: "Manage Books" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Books" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Books", level: 2 })).toHaveFocus());
  });
});

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { format, parseISO, subDays } from "date-fns";
import { chooseOption, optionLabels, render } from "test-utils/render";
import {
  installPostingLockManager,
  removePostingLockManager,
} from "test-utils/postingLocks";
import CashbookPostingsPanel from "components/finance/postings/CashbookPostingsPanel";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import {
  beginLedgerPostingIntent,
  clearLedgerPostingIntent,
  ledgerPostingIntentKey,
  markLedgerPostingIntentUnresolved,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
import { POSTING_STORAGE_CLEAR_FAILED_MESSAGE } from "hooks/useLedgerPostings";
import { todayInLagos } from "helpers/openingBalances";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<
  "get" | "post" | "put" | "patch" | "delete",
  jest.Mock
>;

const TODAY = todayInLagos();
const OPENING = format(subDays(parseISO(TODAY), 30), "yyyy-MM-dd");

const account = (overrides: Partial<LedgerAccount>): LedgerAccount => ({
  id: "cash",
  name: "Cash in hand",
  class: "asset",
  subtype: "cash",
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: true,
  ...overrides,
});

const ACCOUNTS: LedgerAccount[] = [
  account({ id: "cash" }),
  account({
    id: "bank",
    name: "Main bank",
    subtype: "bank",
    bankName: "GTBank",
    accountNumberLast4: "0123",
  }),
  account({ id: "old-cash", name: "Old cash", active: false }),
  account({ id: "new-bank", name: "New bank", subtype: "bank", openingVerified: false }),
  account({ id: "income", name: "Donations", class: "income", subtype: null, openingVerified: null }),
  account({ id: "expense", name: "Venue hire", class: "expense", subtype: null, openingVerified: null }),
  account({
    id: "holding",
    name: "Member money held",
    class: "liability",
    subtype: "member_receipts_unallocated",
    openingVerified: null,
  }),
];

const statusOf = (overrides: Partial<LedgerStatus> = {}): LedgerStatus => ({
  state: { kind: "known", state: "active" },
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: true,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: OPENING,
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 7,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: `${OPENING}T09:00:00.000Z`,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

const successBody = (
  number = "R-000001",
  overrides: Record<string, unknown> = {},
  replayed = false,
) => ({
  status: replayed ? 200 : 201,
  data: {
    data: {
      replayed,
      journal: {
        id: "journal-1",
        businessDate: TODAY,
        reference: "R1",
        note: null,
        sourceType: "cash_receipt",
        totalKobo: 2500000,
        postedAt: "2026-10-18T10:00:00.000Z",
        postedBy: { id: "officer-1", name: "treasurer" },
        sourceId: "source-1",
        entry: {
          number,
          method: "cash",
          counterpartyName: "Ada Obi",
          externalReference: null,
          evidenceReference: null,
        },
        lines: [],
        ...overrides,
      },
    },
  },
});

const setSession = ({
  permissions = ["finance.manage"] as PermissionKey[],
  isOwner = false,
} = {}) => {
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner, permissions },
  });
};

const renderPanel = ({
  organisationId = "org1",
  status = statusOf(),
  accounts = ACCOUNTS,
  enabled = true,
}: {
  organisationId?: string;
  status?: LedgerStatus;
  accounts?: LedgerAccount[] | null;
  enabled?: boolean;
} = {}) =>
  render(
    <CashbookPostingsPanel
      organisationId={organisationId}
      status={status}
      accounts={accounts}
      enabled={enabled}
      onRecheckLedger={jest.fn()}
    />,
  );

const openReceipt = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Money in/ }));
};
const openExpense = () => {
  fireEvent.click(screen.getByRole("button", { name: /Money out/ }));
};
const openTransfer = () => {
  fireEvent.click(screen.getByRole("button", { name: /^Transfer/ }));
};

const fillReceipt = async (amount = "25000") => {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
  await chooseOption(screen.getByLabelText("Money received into"), "Cash in hand");
  await chooseOption(screen.getByLabelText("Income category"), "Donations");
};

const fillExpense = async (amount = "7500") => {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
  await chooseOption(screen.getByLabelText("Paid from"), "Main bank");
  await chooseOption(screen.getByLabelText("Expense category"), "Venue hire");
  fireEvent.change(screen.getByLabelText("Paid to (required)"), {
    target: { value: "Venue Ltd" },
  });
};

const fillTransfer = async (amount = "20000") => {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: amount } });
  await chooseOption(screen.getByLabelText("Transfer from"), "Cash in hand");
  await chooseOption(screen.getByLabelText("Transfer to"), "Main bank");
};

const submit = async (label: string) => {
  fireEvent.click(screen.getByRole("button", { name: label }));
  await waitFor(() => expect(api.post).toHaveBeenCalled());
};

const stored = () => readLedgerPostingIntents("org1");

const pendingIntents = () => {
  const read = stored();
  if (read.kind !== "pending") {
    throw new Error(`Expected a pending intent, got ${read.kind}`);
  }
  return read.intents;
};

/** Simulates another tab's confirmed write for this organisation. */
const seedIntent = async (organisationId = "org1", key = "key-12345678") => {
  const result = await beginLedgerPostingIntent({
    organisationId,
    officerId: "officer-1",
    key,
    operation: "receipt",
    body: {
      idempotencyKey: key,
      businessDate: TODAY,
      amountKobo: 2500000,
      toAccountId: "cash",
      incomeAccountId: "income",
      method: "cash",
    },
    summary: {
      operation: "receipt",
      amountKobo: 2500000,
      businessDate: TODAY,
      method: "cash",
      fromAccountName: null,
      toAccountName: "Cash in hand",
      categoryName: "Donations",
    },
  });
  if (result.kind !== "claimed") {
    throw new Error(`Expected a seeded claim, got ${result.reason}`);
  }
  return result.record;
};

/**
 * What the browser delivers to every other open tab when one tab writes the
 * organisation's posting record. jsdom has one window, so the test delivers
 * it; the writing tab has either left its form or has its own request in
 * flight, and the hook ignores the event in both cases.
 */
const deliverStorageEvent = (organisationId = "org1") => {
  const event = new Event("storage") as StorageEvent;
  Object.defineProperty(event, "key", { value: ledgerPostingIntentKey(organisationId) });
  act(() => {
    window.dispatchEvent(event);
  });
};

/** Two open tabs of the same organisation's Books screen. */
const renderTwoTabs = () => {
  const recheck = [jest.fn(), jest.fn()] as const;
  render(
    <>
      {recheck.map((onRecheckLedger, index) => (
        <CashbookPostingsPanel
          key={index}
          organisationId="org1"
          status={statusOf()}
          accounts={ACCOUNTS}
          enabled
          onRecheckLedger={onRecheckLedger}
        />
      ))}
    </>,
  );
  const [firstPanel, secondPanel] = screen.getAllByRole("region");
  expect(screen.getAllByRole("region")).toHaveLength(2);
  return {
    firstPanel,
    secondPanel,
    first: within(firstPanel),
    second: within(secondPanel),
    recheck,
  };
};

const fillReceiptIn = async (panel: HTMLElement, amount = "25000", { open = true } = {}) => {
  const tab = within(panel);
  if (open) fireEvent.click(tab.getByRole("button", { name: /Money in/ }));
  fireEvent.change(tab.getByLabelText("Amount"), { target: { value: amount } });
  await chooseOption(tab.getByLabelText("Money received into"), "Cash in hand");
  await chooseOption(tab.getByLabelText("Income category"), "Donations");
};

const SUPERSEDED = "Check the journal entries before posting this";

/** The form keeps its entries but can't be edited or submitted. */
const expectLocked = (panel: HTMLElement, amountShown = "25,000") => {
  const tab = within(panel);
  expect(tab.getByText(SUPERSEDED)).toBeInTheDocument();
  expect(tab.getByLabelText("Amount")).toHaveValue(amountShown);
  expect(tab.getByLabelText("Amount")).toBeDisabled();
  expect(tab.getByLabelText("Money received into")).toBeDisabled();
  expect(tab.getByRole("button", { name: "Post receipt" })).toBeDisabled();
  // Nothing claims the other tab's outcome.
  expect(tab.queryByText("Posted")).not.toBeInTheDocument();
  expect(tab.queryByText("Already posted")).not.toBeInTheDocument();
};

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  setSession();
  api.post.mockResolvedValue(successBody());
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("feature gate and readiness", () => {
  it("defaults the release gate to off", () => {
    expect(LEDGER_POSTINGS_UI_ENABLED).toBe(false);
  });

  it("renders nothing while its gate is off", () => {
    renderPanel({ enabled: false });
    expect(screen.queryByText("Record money")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows no posting control to a view-only officer", () => {
    setSession({ permissions: ["finance.view"] });
    renderPanel();

    expect(screen.getByText(/permission to manage finance/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money out/ })).not.toBeInTheDocument();
  });

  it("explains a suspended ledger instead of offering a posting", () => {
    renderPanel({ status: statusOf({ state: { kind: "known", state: "suspended" } }) });
    expect(screen.getByText(/Bookkeeping is suspended/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });

  it("explains server blockers instead of offering a posting", () => {
    renderPanel({
      status: statusOf({
        postingEnabled: false,
        blockers: ["LEDGER_WRITES_DISABLED"],
      }),
    });
    expect(screen.getByText(/switched off on the server/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });

  it("refuses contradictory readiness: posting enabled with blockers", () => {
    renderPanel({
      status: statusOf({
        postingEnabled: true,
        blockers: ["LEDGER_WRITES_DISABLED"],
      }),
    });
    expect(screen.getByText(/switched off on the server/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });

  it("refuses readiness when the blocker list is unavailable", () => {
    renderPanel({
      status: statusOf({ postingEnabled: true, blockers: null }),
    });
    expect(
      screen.getByText(/didn't report whether posting is available/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });

  it("reports unresolved server attempts without pretending they are clear", () => {
    renderPanel({ status: statusOf({ unconfirmedAttempts: 2 }) });
    expect(screen.getByText(/server reports 2 unresolved posting attempts/)).toBeInTheDocument();
  });
});

describe("successful postings", () => {
  it("posts a receipt with integer kobo and shows the server journal number", async () => {
    renderPanel();
    await openReceipt();
    await fillReceipt();
    fireEvent.change(screen.getByLabelText("Received from"), {
      target: { value: "Ada Obi" },
    });
    await submit("Post receipt");

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/finance/org1/ledger/receipts");
    expect(body).toMatchObject({
      businessDate: TODAY,
      amountKobo: 2500000,
      toAccountId: "cash",
      incomeAccountId: "income",
      method: "cash",
      counterpartyName: "Ada Obi",
    });
    expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/);
    expect("lines" in body).toBe(false);
    expect("sourceType" in body).toBe(false);
    expect("organisationId" in body).toBe(false);

    expect(await screen.findByText("Journal number: R-000001")).toBeInTheDocument();
    expect(screen.getByText("Posted")).toBeInTheDocument();
    expect(screen.getByText("Amount: ₦25,000")).toBeInTheDocument();
    expect(stored().kind).toBe("none");
  });

  it("posts an expense with the required payee", async () => {
    api.post.mockResolvedValueOnce(
      successBody("E-000001", { sourceType: "cash_expense", totalKobo: 750000 }),
    );
    renderPanel();
    openExpense();
    await fillExpense();
    await submit("Post expense");

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/finance/org1/ledger/expenses");
    expect(body).toMatchObject({
      amountKobo: 750000,
      fromAccountId: "bank",
      expenseAccountId: "expense",
      counterpartyName: "Venue Ltd",
      method: "cash",
    });
    expect(await screen.findByText(/Journal number: E-000001/)).toBeInTheDocument();
  });

  it("posts a transfer without transfer-invalid fields", async () => {
    api.post.mockResolvedValueOnce(
      successBody("T-000001", { sourceType: "cash_transfer", totalKobo: 2000000 }),
    );
    renderPanel();
    openTransfer();
    await fillTransfer();
    await submit("Post transfer");

    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/finance/org1/ledger/transfers");
    expect(body).toMatchObject({
      amountKobo: 2000000,
      fromAccountId: "cash",
      toAccountId: "bank",
      method: "bank_transfer",
    });
    expect("counterpartyName" in body).toBe(false);
    expect("evidenceReference" in body).toBe(false);
    expect(await screen.findByText(/Journal number: T-000001/)).toBeInTheDocument();
  });

  it("shows a 200 replay as already posted, not as a new posting", async () => {
    api.post.mockResolvedValueOnce(successBody("R-000009", {}, true));
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("Already posted")).toBeInTheDocument();
    expect(screen.getByText("Journal number: R-000009")).toBeInTheDocument();
    expect(screen.getByText("Confirmed replay")).toBeInTheDocument();
    expect(stored().kind).toBe("none");
  });
});

describe("malformed success responses", () => {
  it("does not clear the intent when a 201 has no usable journal identity", async () => {
    api.post.mockResolvedValueOnce({
      status: 201,
      data: { data: { replayed: false, journal: null } },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByText("Posted")).not.toBeInTheDocument();
    expect(pendingIntents()[0]).toMatchObject({
      hadAmbiguousAttempt: true,
      state: "unresolved",
    });
    expect(pendingIntents()[0].body).toEqual(api.post.mock.calls[0][1]);
  });

  it("does not clear the intent when replay information is missing", async () => {
    const body = successBody();
    delete (body.data.data as { replayed?: boolean }).replayed;
    api.post.mockResolvedValueOnce(body);
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByText("Posted")).not.toBeInTheDocument();
    expect(stored().kind).toBe("pending");
  });

  it("rejects a contradictory 201 that claims to be a replay", async () => {
    api.post.mockResolvedValueOnce({
      ...successBody("R-000001", {}, true),
      status: 201,
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByText("Posted")).not.toBeInTheDocument();
    expect(stored().kind).toBe("pending");
  });

  it("rejects a 204 or another unexpected 2xx", async () => {
    api.post.mockResolvedValueOnce({ status: 204, data: undefined });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(stored().kind).toBe("pending");
  });

  it("rejects a success journal without the server-issued number", async () => {
    api.post.mockResolvedValueOnce(successBody(""));
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByText(/Journal number:/)).not.toBeInTheDocument();
    expect(stored().kind).toBe("pending");
  });

  it("rejects a success journal for the wrong operation", async () => {
    api.post.mockResolvedValueOnce(
      successBody("R-000001", { sourceType: "cash_expense" }),
    );
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(stored().kind).toBe("pending");
  });

  it("keeps an unreadable success pending across reload and retries the exact request", async () => {
    api.post.mockResolvedValueOnce({
      status: 201,
      data: { data: { replayed: false, journal: null } },
    });
    const view = renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();

    view.unmount();
    renderPanel();
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);

    api.post.mockResolvedValueOnce(successBody("R-000001", {}, true));
    fireEvent.click(screen.getByRole("button", { name: "Retry this posting" }));
    expect(await screen.findByText("Already posted")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
    expect(stored().kind).toBe("none");
  });
});

describe("cross-tab coordination", () => {
  it("blocks new postings when the browser cannot coordinate tabs", async () => {
    removePostingLockManager();
    renderPanel();
    await openReceipt();
    await fillReceipt();
    fireEvent.click(screen.getByRole("button", { name: "Post receipt" }));

    expect(
      await screen.findByText(/couldn't be coordinated safely across open tabs/),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(stored().kind).toBe("none");
  });

  it("dispatches only one request when two open panels compete", async () => {
    let resolvePost: (value: unknown) => void = () => undefined;
    api.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    render(
      <>
        <CashbookPostingsPanel
          organisationId="org1"
          status={statusOf()}
          accounts={ACCOUNTS}
          enabled
        />
        <CashbookPostingsPanel
          organisationId="org1"
          status={statusOf()}
          accounts={ACCOUNTS}
          enabled
        />
      </>,
    );
    const panels = screen.getAllByRole("region");
    expect(panels).toHaveLength(2);
    const first = within(panels[0]);
    const second = within(panels[1]);
    const secondPanel = panels[1];

    fireEvent.click(first.getByRole("button", { name: /Money in/ }));
    fireEvent.change(first.getByLabelText("Amount"), {
      target: { value: "25000" },
    });
    await chooseOption(first.getByLabelText("Money received into"), "Cash in hand");
    await chooseOption(first.getByLabelText("Income category"), "Donations");

    fireEvent.click(second.getByRole("button", { name: /Money in/ }));
    fireEvent.change(second.getByLabelText("Amount"), {
      target: { value: "25000" },
    });
    await chooseOption(second.getByLabelText("Money received into"), "Cash in hand");
    await chooseOption(second.getByLabelText("Income category"), "Donations");

    const submitButtons = screen.getAllByRole("button", { name: "Post receipt" });
    fireEvent.click(submitButtons[0]);
    fireEvent.click(submitButtons[1]);

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    // The second tab's claim was refused: its form is locked, not re-armed.
    expect(await second.findByText(SUPERSEDED)).toBeInTheDocument();
    expect(second.queryByText(/still unconfirmed. Retry that exact request first/)).not.toBeInTheDocument();
    expectLocked(secondPanel);
    expect(api.post).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePost(successBody());
    });
    expect(await screen.findByText(/Journal number: R-000001/)).toBeInTheDocument();
    deliverStorageEvent();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(stored().kind).toBe("none");
    // The first tab's record cleared, yet the second form stays locked.
    expectLocked(secondPanel);
    fireEvent.click(second.getByRole("button", { name: "Post receipt" }));
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("refreshes when another tab writes the organisation's intent", async () => {
    renderPanel();
    await seedIntent("org1");
    deliverStorageEvent();

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });
});

describe("validation and eligibility", () => {
  it("refuses to post without an amount", async () => {
    renderPanel();
    await openReceipt();
    fireEvent.click(screen.getByRole("button", { name: "Post receipt" }));

    expect(await screen.findByText("Enter an amount.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("requires the expense payee", async () => {
    renderPanel();
    openExpense();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "7500" } });
    await chooseOption(screen.getByLabelText("Paid from"), "Main bank");
    await chooseOption(screen.getByLabelText("Expense category"), "Venue hire");
    fireEvent.click(screen.getByRole("button", { name: "Post expense" }));

    expect(await screen.findByText("Paid to is required.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("offers only active, verified accounts and active categories", async () => {
    renderPanel();
    await openReceipt();

    const accounts = await optionLabels(screen.getByLabelText("Money received into"));
    expect(accounts).toEqual(["Cash in hand", "Main bank"]);
    expect(accounts).not.toContain("Old cash");
    expect(accounts).not.toContain("New bank");
    expect(accounts).not.toContain("Member money held");

    const categories = await optionLabels(screen.getByLabelText("Income category"));
    expect(categories).toEqual(["Donations"]);
  });

  it("never offers F3 member dues or levy income as a receipt category", async () => {
    renderPanel({
      accounts: [
        ...ACCOUNTS,
        account({ id: "dues-income", name: "Dues income", class: "income", subtype: "member_dues_income", openingVerified: null }),
        account({ id: "levy-income", name: "Levy income", class: "income", subtype: "member_levy_income", openingVerified: null }),
        account({ id: "grants", name: "Grants", class: "income", subtype: null, openingVerified: null }),
      ],
    });
    await openReceipt();

    const categories = await optionLabels(screen.getByLabelText("Income category"));
    expect(categories).toEqual(["Donations", "Grants"]);
  });

  it("does not offer the sending account as the transfer destination", async () => {
    renderPanel();
    openTransfer();
    await chooseOption(screen.getByLabelText("Transfer from"), "Cash in hand");

    const destinations = await optionLabels(screen.getByLabelText("Transfer to"));
    expect(destinations).toEqual(["Main bank"]);
  });

  it("refuses a second click while the first posting is in flight", async () => {
    let resolvePost: (value: unknown) => void = () => undefined;
    api.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    renderPanel();
    await openReceipt();
    await fillReceipt();

    const button = screen.getByRole("button", { name: "Post receipt" });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolvePost(successBody());
    });
    expect(await screen.findByText("Journal number: R-000001")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});

describe("unknown outcomes and durable retry", () => {
  it("persists the exact body before sending and retries it with the same key", async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 503, data: { error: "Service unavailable" } },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    await waitFor(() => expect(stored().kind).toBe("pending"));
    expect(pendingIntents()[0]).toMatchObject({
      state: "unresolved",
      hadAmbiguousAttempt: true,
      organisationId: "org1",
      officerId: "officer-1",
    });
    expect(pendingIntents()[0].body).toEqual(api.post.mock.calls[0][1]);
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();

    // The earlier attempt did commit: the retry replays it.
    api.post.mockResolvedValueOnce(successBody("R-000001", {}, true));
    fireEvent.click(screen.getByRole("button", { name: "Retry this posting" }));
    expect(await screen.findByText("Already posted")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
    expect(stored().kind).toBe("none");
  });

  it("does not treat a timeout as a clean refusal", async () => {
    api.post.mockRejectedValueOnce({ code: "ECONNABORTED" });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(stored().kind).toBe("pending");
  });

  it("keeps a pending posting across a fresh render", async () => {
    await seedIntent();

    renderPanel();
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("keeps organisations isolated when switching", async () => {
    await seedIntent();

    const view = renderPanel({ organisationId: "org2" });
    expect(screen.queryByText("A financial posting is unconfirmed")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Money in/ })).toBeInTheDocument();

    // Switching back re-reads Organisation A's stored intent: it was never
    // cleared by Organisation B's screen.
    view.rerender(
      <CashbookPostingsPanel
        organisationId="org1"
        status={statusOf()}
        accounts={ACCOUNTS}
        enabled
      />,
    );
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });
});

describe("proof rules", () => {
  it("clears a first clean 422 and uses a new key on the next attempt", async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 422, data: { error: "The period is locked", code: "LEDGER_PERIOD_LOCKED" } },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("The period is locked")).toBeInTheDocument();
    expect(stored().kind).toBe("none");
    expect(screen.getByRole("button", { name: "Post receipt" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Post receipt" }));
    expect(await screen.findByText(/Journal number: R-000001/)).toBeInTheDocument();

    expect(api.post).toHaveBeenCalledTimes(2);
    const firstKey = api.post.mock.calls[0][1].idempotencyKey;
    const secondKey = api.post.mock.calls[1][1].idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });

  it("keeps a later 422 pending after an earlier ambiguous attempt", async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 502, data: { error: "Bad gateway" } },
    });
    api.post.mockRejectedValueOnce({
      response: { status: 422, data: { error: "The period is locked", code: "LEDGER_PERIOD_LOCKED" } },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");
    await screen.findByText("A financial posting is unconfirmed");

    fireEvent.click(screen.getByRole("button", { name: "Retry this posting" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));

    expect(await screen.findByText(/Not saved now: The period is locked/)).toBeInTheDocument();
    expect(stored().kind).toBe("pending");
    expect(pendingIntents()[0].hadAmbiguousAttempt).toBe(true);
  });

  it("keeps pending on 403 and offers owner resolution instead of a resend", async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 403, data: { error: "Permission changed" } },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry this posting" })).not.toBeInTheDocument();
    expect(screen.getByText(/Resending this request cannot fix it/)).toBeInTheDocument();
    expect(pendingIntents()[0]).toMatchObject({
      hadAmbiguousAttempt: false,
      retryMode: "owner",
    });
  });

  it("clears a retryable writes-disabled record on a later first-clean 422", async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 503,
        data: { error: "Ledger writes are disabled", code: "LEDGER_WRITES_DISABLED" },
      },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();

    api.post.mockRejectedValueOnce({
      response: { status: 422, data: { error: "Still refused", code: "LEDGER_PERIOD_LOCKED" } },
    });
    fireEvent.click(screen.getByRole("button", { name: "Retry this posting" }));
    expect(await screen.findByText("Still refused")).toBeInTheDocument();
    await waitFor(() => expect(stored().kind).toBe("none"));
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("clears on a voided key and explains that a new key is needed", async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: "Key voided", code: "LEDGER_IDEMPOTENCY_KEY_VOIDED" },
      },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText(/earlier attempt was voided/)).toBeInTheDocument();
    expect(stored().kind).toBe("none");
    expect(screen.getByRole("button", { name: "Post receipt" })).toBeInTheDocument();
  });

  it("keeps a reused key pending and does not resend it automatically", async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: "Key reused", code: "LEDGER_IDEMPOTENCY_KEY_REUSED" },
      },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.getByText(/already used for a different posting/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry this posting" })).not.toBeInTheDocument();
    expect(screen.getByText(/Resending this request cannot fix it/)).toBeInTheDocument();
    expect(stored().kind).toBe("pending");
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("keeps a writes-disabled 503 pending and retries it later with the same key", async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 503,
        data: { error: "Ledger writes are disabled", code: "LEDGER_WRITES_DISABLED" },
      },
    });
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(pendingIntents()[0].hadAmbiguousAttempt).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Retry this posting" }));
    expect(await screen.findByText(/Journal number: R-000001/)).toBeInTheDocument();
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
  });

  it("touches only the ledger posting endpoints, never F0 payments or obligations", async () => {
    renderPanel();
    await openReceipt();
    await fillReceipt();
    await submit("Post receipt");

    const url = api.post.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/finance\/org1\/ledger\/(receipts|expenses|transfers)$/);
    expect(url).not.toContain("/payments");
    expect(url).not.toContain("/obligations");
    expect(await screen.findByText(/Journal number: R-000001/)).toBeInTheDocument();
  });
});

describe("repairing unreadable storage", () => {
  it("blocks posting when the stored record is corrupt", () => {
    window.localStorage.setItem(ledgerPostingIntentKey("org1"), "{not json");
    renderPanel();

    expect(screen.getByText(/record that this app version can't read/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });
});

describe("confirmed posting whose safety record can't be cleared", () => {
  it.each([
    [
      "storage rejects the removal",
      () => {
        const spy = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
          throw new Error("blocked");
        });
        return () => spy.mockRestore();
      },
    ],
    [
      "the cross-tab lock is lost after sending",
      () => {
        api.post.mockImplementationOnce(async () => {
          removePostingLockManager();
          return successBody();
        });
        return () => undefined;
      },
    ],
  ])("still shows the confirmation but blocks new postings when %s", async (_label, arrange) => {
    const restore = arrange();
    try {
      renderPanel();
      await openReceipt();
      await fillReceipt();
      await submit("Post receipt");

      expect(await screen.findByText("Journal number: R-000001")).toBeInTheDocument();
      expect(screen.getByText("Posted")).toBeInTheDocument();
      expect(screen.getByText(POSTING_STORAGE_CLEAR_FAILED_MESSAGE)).toBeInTheDocument();
      expect(pendingIntents()).toHaveLength(1);

      fireEvent.click(screen.getByRole("button", { name: "Record another posting" }));
      expect(screen.queryByText("Journal number: R-000001")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
      expect(screen.getByText(/New postings are blocked/)).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });
});

describe("a retry resolving after another tab moved on", () => {
  const OTHER_TAB_KEY = "key-87654321";

  it.each([
    ["a replayed success", () => successBody("R-000001", {}, true), "resolve"],
    [
      "a writes-disabled 503",
      () => ({
        response: {
          status: 503,
          data: { error: "Ledger writes are disabled", code: "LEDGER_WRITES_DISABLED" },
        },
      }),
      "reject",
    ],
  ] as const)(
    "leaves the other tab's newer claim untouched on %s",
    async (_label, outcome, settleAs) => {
      const original = await seedIntent();
      let settle: (value: unknown) => void = () => undefined;
      api.post.mockReturnValueOnce(
        new Promise((resolve, reject) => {
          settle = settleAs === "resolve" ? resolve : reject;
        }),
      );
      renderPanel();
      fireEvent.click(await screen.findByRole("button", { name: "Retry this posting" }));
      await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
      expect(api.post.mock.calls[0][1]).toEqual(original.body);

      // The other tab's retry of the same key was proved first: it cleared
      // that key and claimed a new posting while this response was pending.
      expect(await clearLedgerPostingIntent("org1", original.key)).toBe(true);
      await seedIntent("org1", OTHER_TAB_KEY);

      await act(async () => {
        settle(outcome());
      });

      await waitFor(() => expect(screen.queryByRole("button", { name: /Money in/ })).toBeNull());
      const intents = pendingIntents();
      expect(intents).toHaveLength(1);
      expect(intents[0]).toMatchObject({
        key: OTHER_TAB_KEY,
        state: "dispatching",
        lastFailure: null,
        body: { idempotencyKey: OTHER_TAB_KEY },
      });
      expect(screen.getByText(/New postings are blocked/)).toBeInTheDocument();
      expect(api.post).toHaveBeenCalledTimes(1);
    },
  );
});

describe("another tab changes the posting record while a form is open (F1)", () => {
  it("locks the second tab's copy of a receipt the first tab has just posted", async () => {
    const { first, firstPanel, second, secondPanel, recheck } = renderTwoTabs();
    await fillReceiptIn(firstPanel);
    await fillReceiptIn(secondPanel);

    fireEvent.click(first.getByRole("button", { name: "Post receipt" }));
    expect(await first.findByText(/Journal number: R-000001/)).toBeInTheDocument();
    // The first tab claimed and then cleared the record.
    deliverStorageEvent();

    expectLocked(secondPanel);
    expect(recheck[1]).toHaveBeenCalled();
    expect(second.getByRole("button", { name: "Start a new posting" })).toBeEnabled();

    // The officer tries to submit the same real-world receipt again.
    fireEvent.click(second.getByRole("button", { name: "Post receipt" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(stored().kind).toBe("none");
  });

  it("only allows a deliberate, empty new posting after the interruption", async () => {
    const { first, firstPanel, second, secondPanel } = renderTwoTabs();
    await fillReceiptIn(firstPanel);
    await fillReceiptIn(secondPanel, "1000");
    fireEvent.click(first.getByRole("button", { name: "Post receipt" }));
    expect(await first.findByText(/Journal number: R-000001/)).toBeInTheDocument();
    deliverStorageEvent();
    expectLocked(secondPanel, "1,000");

    fireEvent.click(second.getByRole("button", { name: "Start a new posting" }));
    expect(second.queryByText(SUPERSEDED)).not.toBeInTheDocument();
    expect(second.getByLabelText("Amount")).toHaveValue("");
    expect(second.getByLabelText("Amount")).toBeEnabled();

    await fillReceiptIn(secondPanel, "1000", { open: false });
    // The server's proof must match this posting's own amount (₦1,000).
    api.post.mockResolvedValueOnce(successBody("R-000002", { totalKobo: 100000 }));
    fireEvent.click(second.getByRole("button", { name: "Post receipt" }));
    expect(await second.findByText(/Journal number: R-000002/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
    const [firstKey, secondKey] = api.post.mock.calls.map(([, body]) => body.idempotencyKey);
    expect(secondKey).not.toBe(firstKey);
  });

  it.each([
    ["posted", async (record: Awaited<ReturnType<typeof seedIntent>>) => {
      await clearLedgerPostingIntent("org1", record.key);
    }],
    ["refused", async (record: Awaited<ReturnType<typeof seedIntent>>) => {
      await clearLedgerPostingIntent("org1", record.key);
    }],
    ["voided after an unknown outcome", async (record: Awaited<ReturnType<typeof seedIntent>>) => {
      await markLedgerPostingIntentUnresolved(record, { ambiguous: true, message: "Unknown." });
      deliverStorageEvent();
      await clearLedgerPostingIntent("org1", record.key);
    }],
  ])(
    "makes no claim about the outcome when the other tab's posting was %s",
    async (_outcome, resolveElsewhere) => {
      renderPanel({});
      await openReceipt();
      await fillReceipt();

      // Another tab claims the record: this form locks at once.
      const record = await seedIntent();
      deliverStorageEvent();
      expect(screen.getByText(SUPERSEDED)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start a new posting" })).toBeDisabled();
      expect(screen.getByText(/a new posting can't start until it is\s+proved/)).toBeInTheDocument();

      // The other tab resolves it; this tab only sees the record disappear.
      await resolveElsewhere(record);
      deliverStorageEvent();

      expect(stored().kind).toBe("none");
      expect(screen.getByText(SUPERSEDED)).toBeInTheDocument();
      expect(screen.getByText(/can't tell whether that posting was saved, refused or voided/)).toBeInTheDocument();
      expect(screen.getByLabelText("Amount")).toHaveValue("25,000");
      expect(screen.getByRole("button", { name: "Post receipt" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Start a new posting" })).toBeEnabled();
      expect(screen.queryByText("Posted")).not.toBeInTheDocument();
      expect(screen.queryByText("Already posted")).not.toBeInTheDocument();
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it("ignores another organisation's posting record", async () => {
    renderPanel();
    await openReceipt();
    await fillReceipt();

    await seedIntent("org2");
    deliverStorageEvent("org2");

    expect(screen.queryByText(SUPERSEDED)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post receipt" })).toBeEnabled();
  });

  it("leaves the overview usable when no form was open", async () => {
    renderPanel();
    const record = await seedIntent();
    deliverStorageEvent();
    await clearLedgerPostingIntent("org1", record.key);
    deliverStorageEvent();

    expect(screen.queryByText(SUPERSEDED)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Money in/ })).toBeEnabled();
  });

  it("does not interrupt this tab's own request in flight", async () => {
    let resolvePost: (value: unknown) => void = () => undefined;
    api.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    renderPanel();
    await openReceipt();
    await fillReceipt();
    fireEvent.click(screen.getByRole("button", { name: "Post receipt" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    // Another tab retries this tab's own record (same key) meanwhile.
    deliverStorageEvent();
    await act(async () => {
      resolvePost(successBody());
    });

    expect(await screen.findByText(/Journal number: R-000001/)).toBeInTheDocument();
    expect(screen.queryByText(SUPERSEDED)).not.toBeInTheDocument();
  });

  it("clears the lock when the officer goes back", async () => {
    renderPanel();
    await openReceipt();
    await fillReceipt();
    const record = await seedIntent();
    deliverStorageEvent();
    await clearLedgerPostingIntent("org1", record.key);
    deliverStorageEvent();
    expect(screen.getByText(SUPERSEDED)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await openReceipt();
    expect(screen.queryByText(SUPERSEDED)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Post receipt" })).toBeEnabled();
  });
});

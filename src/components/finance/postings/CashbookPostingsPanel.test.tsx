import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { format, parseISO, subDays } from "date-fns";
import { chooseOption, optionLabels, render } from "test-utils/render";
import CashbookPostingsPanel from "components/finance/postings/CashbookPostingsPanel";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { LEDGER_POSTINGS_UI_ENABLED } from "config/ledgerPostings";
import {
  beginLedgerPostingIntent,
  ledgerPostingIntentKey,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
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

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  setSession();
  api.post.mockResolvedValue(successBody());
});

afterEach(() => {
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
    expect(await screen.findByText(/Journal number: R-000001/)).toBeInTheDocument();
  });

  it("posts a transfer without transfer-invalid fields", async () => {
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
    expect(await screen.findByText(/Journal number: R-000001/)).toBeInTheDocument();
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

    expect(api.post).toHaveBeenCalledTimes(1);
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
    const record = beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "key-12345678",
      operation: "receipt",
      body: {
        idempotencyKey: "key-12345678",
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
    expect(record).not.toBeNull();

    renderPanel();
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("keeps organisations isolated when switching", async () => {
    beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "key-12345678",
      operation: "receipt",
      body: {
        idempotencyKey: "key-12345678",
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

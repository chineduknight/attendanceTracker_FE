import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { confirmInDialog, render } from "test-utils/render";
import {
  holdLedgerKeyActivity,
  installPostingLockManager,
  removePostingLockManager,
} from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import ReversalsPanel from "components/finance/reversals/ReversalsPanel";
import CashbookPostingsPanel from "components/finance/postings/CashbookPostingsPanel";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
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
const api = require("services/api").default as Record<"get" | "post", jest.Mock>;

const TODAY = todayInLagos();
const daysAgo = (days: number) => format(subDays(parseISO(TODAY), days), "yyyy-MM-dd");
const RECEIPT_ID = "a".repeat(24);
const REVERSAL_ID = "b".repeat(24);
const OPENING_ID = "c".repeat(24);
const MEMBER_RECEIPT_ID = "d".repeat(24);

const ACCOUNTS: LedgerAccount[] = [
  {
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
  },
  {
    id: "income",
    name: "Donations",
    class: "income",
    subtype: null,
    currency: "NGN",
    active: true,
    revision: 0,
    bankName: null,
    accountNumberLast4: null,
    openingVerified: null,
  },
];

const statusOf = (overrides: Partial<LedgerStatus> = {}): LedgerStatus => ({
  state: { kind: "known", state: "active" },
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: true,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: daysAgo(30),
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 7,
  memberReceiptsEnabled: true,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

const journal = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  businessDate: daysAgo(5),
  reference: "Sunday offering",
  note: null,
  sourceType: "cash_receipt",
  lines: [
    { accountId: "cash", side: "debit", amountKobo: 500000 },
    { accountId: "income", side: "credit", amountKobo: 500000 },
  ],
  totalKobo: 500000,
  postedAt: `${daysAgo(5)}T10:00:00.000Z`,
  postedBy: { id: "officer-1", name: "treasurer" },
  sourceId: null,
  reversesJournalId: null,
  reversedByJournalId: null,
  entry: { number: "R-000012", method: "cash", counterpartyName: "Ada Obi" },
  ...overrides,
});

const reversalJournal = (overrides: Record<string, unknown> = {}) =>
  journal(REVERSAL_ID, {
    businessDate: TODAY,
    note: "Posted twice",
    sourceType: "reversal",
    lines: [
      { accountId: "income", side: "debit", amountKobo: 500000 },
      { accountId: "cash", side: "credit", amountKobo: 500000 },
    ],
    postedAt: `${TODAY}T11:00:00.000Z`,
    sourceId: RECEIPT_ID,
    reversesJournalId: RECEIPT_ID,
    entry: null,
    ...overrides,
  });

let journals: Record<string, unknown>;

const serveJournals = () => {
  api.get.mockImplementation((url: string) => {
    const match = /^\/finance\/(org\d)\/ledger\/journals\/([a-z0-9]+)$/.exec(url);
    if (match && journals[`${match[1]}:${match[2]}`]) {
      return Promise.resolve({ data: { data: journals[`${match[1]}:${match[2]}`] } });
    }
    if (match) return Promise.reject({ response: { status: 404, data: { error: "Not found" } } });
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const setSession = (permissions: PermissionKey[] = ["finance.view", "finance.manage"]) => {
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions },
  });
};

/** The panel as Books renders it: the open journal is Books' state. */
const Harness = ({
  initialJournalId = RECEIPT_ID,
  organisationId = "org1",
  withCashbook = false,
  ...props
}: Partial<ComponentProps<typeof ReversalsPanel>> & {
  initialJournalId?: string | null;
  withCashbook?: boolean;
}) => {
  const [openJournalId, setOpenJournalId] = useState<string | null>(initialJournalId);
  return (
    <QueryClientProvider client={queryClient}>
      {/* Plays a Details button in Journal entries. */}
      <button type="button" onClick={() => setOpenJournalId(MEMBER_RECEIPT_ID)}>
        Details of M-000004
      </button>
      {withCashbook && (
        <CashbookPostingsPanel
          organisationId={organisationId}
          status={statusOf()}
          accounts={ACCOUNTS}
          enabled
          memberMoneyEnabled={false}
          reversalsEnabled
        />
      )}
      <ReversalsPanel
        organisationId={organisationId}
        status={statusOf()}
        accounts={ACCOUNTS}
        openJournalId={openJournalId}
        onOpenJournal={setOpenJournalId}
        onCloseJournal={() => setOpenJournalId(null)}
        enabled
        cashbookEnabled={withCashbook}
        memberMoneyEnabled={false}
        {...props}
      />
    </QueryClientProvider>
  );
};

const panel = () => within(screen.getByRole("region", { name: "Reversals" }));

const startReversal = async (reason = "  Posted twice  ") => {
  fireEvent.click(await panel().findByRole("button", { name: "Reverse this entry" }));
  fireEvent.change(panel().getByLabelText("Reason (required)"), { target: { value: reason } });
  fireEvent.click(panel().getByRole("button", { name: "Review reversal" }));
};

const confirmReversal = async () => {
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/undo Money in R-000012 \(₦5,000, dated/)).toBeInTheDocument();
  expect(within(dialog).getByText("Reason: Posted twice")).toBeInTheDocument();
  await confirmInDialog("Reverse entry");
};

const reversalPosts = () =>
  api.post.mock.calls.filter(([url]) => String(url).includes("/reversal"));

const stored = (organisationId = "org1") => readLedgerPostingIntents(organisationId);

const deliverStorageEvent = (organisationId = "org1") => {
  const event = new Event("storage") as StorageEvent;
  Object.defineProperty(event, "key", { value: ledgerPostingIntentKey(organisationId) });
  act(() => {
    window.dispatchEvent(event);
  });
};

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  setSession();
  journals = {
    [`org1:${RECEIPT_ID}`]: journal(RECEIPT_ID),
    [`org1:${REVERSAL_ID}`]: reversalJournal(),
    [`org1:${OPENING_ID}`]: journal(OPENING_ID, { sourceType: "opening_balance", entry: null }),
    [`org1:${MEMBER_RECEIPT_ID}`]: journal(MEMBER_RECEIPT_ID, {
      sourceType: "member_receipt",
      entry: { number: "M-000004", method: "cash", counterpartyName: "Ada Obi", purpose: "dues" },
    }),
  };
  serveJournals();
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("eligibility and permission", () => {
  it("renders nothing with the gate off", () => {
    render(<Harness enabled={false} />);
    expect(screen.queryByRole("region", { name: "Reversals" })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows the original's details before anything else", async () => {
    render(<Harness />);
    expect(await panel().findByText("Money in R-000012")).toBeInTheDocument();
    expect(panel().getByText("Amount: ₦5,000")).toBeInTheDocument();
    expect(panel().getByText("Counterparty: Ada Obi")).toBeInTheDocument();
    expect(panel().getByText(`Journal id: ${RECEIPT_ID}`)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(`/finance/org1/ledger/journals/${RECEIPT_ID}`);
  });

  it("lets a view-only officer see the entry but never reverse it", async () => {
    setSession(["finance.view"]);
    render(<Harness />);
    expect(await panel().findByText(/Only officers with permission to manage finance can reverse/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();
  });

  it("never offers to reverse an opening", async () => {
    render(<Harness initialJournalId={OPENING_ID} />);
    expect(await panel().findByText(/Opening balance entries are never reversed/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();
  });

  it("never offers to reverse a reversal, and links back to its original", async () => {
    render(<Harness initialJournalId={REVERSAL_ID} />);
    expect(await panel().findByText(/itself a reversal/)).toBeInTheDocument();
    expect(panel().getByText("Reversal reason: Posted twice")).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "View the original entry" }));
    expect(await panel().findByText("Money in R-000012")).toBeInTheDocument();
  });

  it("never offers to reverse an already-reversed entry, and links to its reversal", async () => {
    journals[`org1:${RECEIPT_ID}`] = journal(RECEIPT_ID, { reversedByJournalId: REVERSAL_ID });
    render(<Harness />);
    expect(await panel().findByText(/already been reversed/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "View the reversal" }));
    expect(await panel().findByText(/itself a reversal/)).toBeInTheDocument();
  });

  it("explains why reversing isn't available while bookkeeping is suspended", async () => {
    render(<Harness status={statusOf({ state: { kind: "known", state: "suspended" } })} />);
    expect(await panel().findByText(/Bookkeeping is suspended/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();
  });

  it("says a missing entry can't be found", async () => {
    render(<Harness initialJournalId={"e".repeat(24)} />);
    expect(await panel().findByText("This entry can't be found")).toBeInTheDocument();
  });
});

describe("posting a reversal", () => {
  it("requires a reason", async () => {
    render(<Harness />);
    await startReversal("   ");
    expect(await panel().findByText("Reason is required.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    render(<Harness />);
    await startReversal();
    await confirmInDialog("Cancel");
    expect(api.post).not.toHaveBeenCalled();
    expect(stored()).toEqual({ kind: "none" });
  });

  it("stores the intent, sends the exact body to the original's route and shows the link", async () => {
    let storedAtSend: unknown;
    api.post.mockImplementation(() => {
      storedAtSend = stored();
      return Promise.resolve({ status: 201, data: { data: { replayed: false, journal: reversalJournal() } } });
    });
    render(<Harness />);
    await startReversal();
    await confirmReversal();

    expect(await panel().findByText("Reversed")).toBeInTheDocument();
    const [[url, body]] = reversalPosts();
    expect(url).toBe(`/finance/org1/ledger/journals/${RECEIPT_ID}/reversal`);
    expect(body).toEqual({ idempotencyKey: expect.any(String), businessDate: TODAY, reason: "Posted twice" });
    expect(Object.keys(body)).toEqual(["idempotencyKey", "businessDate", "reason"]);
    expect(storedAtSend).toMatchObject({
      kind: "pending",
      intents: [{ key: body.idempotencyKey, operation: "reversal", reversalTarget: { journalId: RECEIPT_ID, totalKobo: 500000 } }],
    });
    expect(stored()).toEqual({ kind: "none" });
    expect(panel().getByText(`Reversal journal id: ${REVERSAL_ID}`)).toBeInTheDocument();
    expect(panel().getByText(`Reverses journal id: ${RECEIPT_ID}`)).toBeInTheDocument();
    expect(panel().getByText(/stays in the books unchanged, linked to its reversal/)).toBeInTheDocument();
  });

  it("retires the receipt when another entry is opened, so it can be reversed too", async () => {
    api.post.mockResolvedValue({ status: 201, data: { data: { replayed: false, journal: reversalJournal() } } });
    render(<Harness />);
    await startReversal();
    await confirmReversal();
    expect(await panel().findByText("Reversed")).toBeInTheDocument();
    journals[`org1:${RECEIPT_ID}`] = journal(RECEIPT_ID, { reversedByJournalId: REVERSAL_ID });

    fireEvent.click(screen.getByRole("button", { name: "Details of M-000004" }));
    expect(await panel().findByText("Member money in M-000004")).toBeInTheDocument();
    expect(panel().queryByText(`Reversal journal id: ${REVERSAL_ID}`)).not.toBeInTheDocument();
    expect(panel().getByRole("button", { name: "Reverse this entry" })).toBeInTheDocument();
  });

  it("never shows a 2xx that doesn't name the original as a reversal", async () => {
    api.post.mockResolvedValue({
      status: 201,
      data: { data: { replayed: false, journal: reversalJournal({ reversesJournalId: "f".repeat(24) }) } },
    });
    render(<Harness />);
    await startReversal();
    await confirmReversal();
    expect(await panel().findByText(/did not name the journal it was sent to undo/)).toBeInTheDocument();
    expect(panel().queryByText("Reversed")).not.toBeInTheDocument();
    expect(stored()).toMatchObject({ kind: "pending", intents: [{ state: "unresolved", hadAmbiguousAttempt: true }] });
  });

  it("recovers a lost response by retrying the exact request, proved by a replay", async () => {
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    render(<Harness />);
    await startReversal();
    await confirmReversal();
    expect(await panel().findByText(/The outcome is unknown/)).toBeInTheDocument();
    expect(panel().getByText(/Reversal of money in R-000012: ₦5,000/)).toBeInTheDocument();
    // A pending posting blocks every new posting, including another reversal.
    expect(panel().queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();

    api.post.mockResolvedValueOnce({
      status: 200,
      data: { data: { replayed: true, journal: reversalJournal() } },
    });
    fireEvent.click(panel().getByRole("button", { name: "Retry this posting" }));
    expect(await panel().findByText("Already reversed")).toBeInTheDocument();
    const [first, second] = reversalPosts();
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toEqual(first[1]);
    expect(stored()).toEqual({ kind: "none" });
  });

  it("retries a reversal stored before a reload", async () => {
    const claimed = await beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "rev-reloaded1",
      operation: "reversal",
      body: { idempotencyKey: "rev-reloaded1", businessDate: TODAY, reason: "Posted twice" },
      reversalTarget: {
        journalId: RECEIPT_ID,
        sourceType: "cash_receipt",
        number: "R-000012",
        businessDate: daysAgo(5),
        totalKobo: 500000,
      },
      summary: {
        operation: "reversal",
        amountKobo: 500000,
        businessDate: TODAY,
        method: null,
        fromAccountName: null,
        toAccountName: null,
        categoryName: null,
        originalSourceType: "cash_receipt",
        originalNumber: "R-000012",
      },
    });
    expect(claimed.kind).toBe("claimed");
    api.post.mockResolvedValue({ status: 200, data: { data: { replayed: true, journal: reversalJournal() } } });
    render(<Harness initialJournalId={null} />);
    fireEvent.click(await panel().findByRole("button", { name: "Retry this posting" }));
    expect(await panel().findByText("Already reversed")).toBeInTheDocument();
    expect(reversalPosts()[0]).toEqual([
      `/finance/org1/ledger/journals/${RECEIPT_ID}/reversal`,
      { idempotencyKey: "rev-reloaded1", businessDate: TODAY, reason: "Posted twice" },
    ]);
  });

  it("never sends a retry while this browser is resolving the same key", async () => {
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    render(<Harness />);
    await startReversal();
    await confirmReversal();
    await panel().findByText(/The outcome is unknown/);
    const read = stored();
    const key = read.kind === "pending" ? read.intents[0].key : "";
    const resolving = await holdLedgerKeyActivity("org1", key, "resolving");
    fireEvent.click(panel().getByRole("button", { name: "Retry this posting" }));
    expect(await panel().findByText(/being resolved in this browser right now/)).toBeInTheDocument();
    expect(reversalPosts()).toHaveLength(1);
    await resolving.release();
  });

  it("shows an already-reversed refusal, clears the clean first attempt and rereads the entry", async () => {
    api.post.mockRejectedValue({
      response: { status: 409, data: { code: "LEDGER_ALREADY_REVERSED", error: "This journal has already been reversed." } },
    });
    render(<Harness />);
    await startReversal();
    await confirmReversal();
    journals[`org1:${RECEIPT_ID}`] = journal(RECEIPT_ID, { reversedByJournalId: REVERSAL_ID });
    expect(await panel().findByText("This journal has already been reversed.")).toBeInTheDocument();
    expect(stored()).toEqual({ kind: "none" });
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([url]) => url.endsWith(RECEIPT_ID)).length).toBeGreaterThan(1),
    );
  });

  it("shows an insufficient-funds refusal from the server", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 422,
        data: { code: "LEDGER_INSUFFICIENT_FUNDS", error: "Reversing this entry would make a cash or bank account close a day below zero." },
      },
    });
    render(<Harness />);
    await startReversal();
    await confirmReversal();
    expect(await panel().findByText(/would make a cash or bank account close a day below zero/)).toBeInTheDocument();
    expect(panel().queryByText("Reversed")).not.toBeInTheDocument();
    expect(stored()).toEqual({ kind: "none" });
  });

  it("explains, then shows, the member-receipt-in-use refusal", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 422,
        data: { code: "LEDGER_MEMBER_RECEIPT_IN_USE", error: "Money from this member receipt has been refunded. Reverse those refunds first, then reverse the receipt." },
      },
    });
    render(<Harness initialJournalId={MEMBER_RECEIPT_ID} />);
    expect(await panel().findByText(/reversed only while none of its money has been refunded or allocated/)).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "Reverse this entry" }));
    fireEvent.change(panel().getByLabelText("Reason (required)"), { target: { value: "Wrong payer" } });
    fireEvent.click(panel().getByRole("button", { name: "Review reversal" }));
    await confirmInDialog("Reverse entry");
    expect(await panel().findByText(/Reverse those refunds first/)).toBeInTheDocument();
    expect(reversalPosts()[0][0]).toBe(`/finance/org1/ledger/journals/${MEMBER_RECEIPT_ID}/reversal`);
  });
});

describe("one pending slot across sections, tabs and organisations", () => {
  const claimReceipt = (organisationId = "org1") =>
    beginLedgerPostingIntent({
      organisationId,
      officerId: "officer-1",
      key: "key-receipt1",
      operation: "receipt",
      body: {
        idempotencyKey: "key-receipt1",
        businessDate: TODAY,
        amountKobo: 100000,
        toAccountId: "cash",
        incomeAccountId: "income",
        method: "cash",
      },
      summary: {
        operation: "receipt",
        amountKobo: 100000,
        businessDate: TODAY,
        method: "cash",
        fromAccountName: null,
        toAccountName: "Cash in hand",
        categoryName: "Donations",
      },
    });

  it("blocks a reversal while an ordinary posting is pending, and points to its section", async () => {
    await claimReceipt();
    render(<Harness withCashbook />);
    expect(await panel().findByText("Money in R-000012")).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();
    expect(panel().getByText(/It is shown in Record money/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Retry this posting" })).not.toBeInTheDocument();
  });

  it("offers a pending reversal's retry in Record money when Reversals is hidden", async () => {
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    const { unmount } = render(<Harness />);
    await startReversal();
    await confirmReversal();
    await panel().findByText(/The outcome is unknown/);
    unmount();

    render(
      <QueryClientProvider client={queryClient}>
        <CashbookPostingsPanel
          organisationId="org1"
          status={statusOf()}
          accounts={ACCOUNTS}
          enabled
          memberMoneyEnabled={false}
          reversalsEnabled={false}
        />
      </QueryClientProvider>,
    );
    const recordMoney = within(screen.getByRole("region", { name: "Record money" }));
    expect(recordMoney.getByText(/Reversal of money in R-000012/)).toBeInTheDocument();
    api.post.mockResolvedValueOnce({ status: 200, data: { data: { replayed: true, journal: reversalJournal() } } });
    fireEvent.click(recordMoney.getByRole("button", { name: "Retry this posting" }));
    expect(await recordMoney.findByText("Already reversed")).toBeInTheDocument();
    expect(recordMoney.queryByText(/Journal number/)).not.toBeInTheDocument();
  });

  it("locks an open reversal form when another tab claims the slot", async () => {
    render(<Harness />);
    fireEvent.click(await panel().findByRole("button", { name: "Reverse this entry" }));
    await claimReceipt();
    deliverStorageEvent();
    expect(await panel().findByText("Check the journal entries before posting this")).toBeInTheDocument();
    expect(panel().getByRole("button", { name: "Review reversal" })).toBeDisabled();
  });

  it("keeps Organisation A's pending reversal out of Organisation B", async () => {
    api.post.mockRejectedValueOnce(new Error("Network Error"));
    const { unmount } = render(<Harness />);
    await startReversal();
    await confirmReversal();
    await panel().findByText(/The outcome is unknown/);
    unmount();

    journals[`org2:${RECEIPT_ID}`] = journal(RECEIPT_ID);
    render(<Harness organisationId="org2" />);
    expect(await panel().findByRole("button", { name: "Reverse this entry" })).toBeInTheDocument();
    expect(panel().queryByText(/A financial posting is unconfirmed/)).not.toBeInTheDocument();
    expect(stored("org1").kind).toBe("pending");
    expect(stored("org2")).toEqual({ kind: "none" });
  });
});

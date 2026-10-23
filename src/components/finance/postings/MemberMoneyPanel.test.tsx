import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { chooseOption, optionLabels, render, toggle } from "test-utils/render";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import CashbookPostingsPanel from "components/finance/postings/CashbookPostingsPanel";
import MemberMoneyPanel from "components/finance/postings/MemberMoneyPanel";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { LEDGER_MEMBER_MONEY_UI_ENABLED } from "config/ledgerMemberMoney";
import {
  beginLedgerPostingIntent,
  ledgerPostingIntentKey,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
import { MEMBER_MONEY_NOT_DUES_NOTE } from "helpers/memberMoney";
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
const RECEIVED = format(subDays(parseISO(TODAY), 10), "yyyy-MM-dd");
const RECEIPT_SOURCE_ID = "a".repeat(24);
const OPENING_ITEM_ID = "b".repeat(24);
const MEMBER_ID = "c".repeat(24);
const OBLIGATION_ID = "d".repeat(24);

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

const HOLDING = account({
  id: "holding",
  name: "Member money held",
  class: "liability",
  subtype: "member_receipts_unallocated",
  openingVerified: null,
});

const ACCOUNTS: LedgerAccount[] = [
  account({ id: "cash" }),
  account({ id: "bank", name: "Main bank", subtype: "bank" }),
  account({ id: "income", name: "Donations", class: "income", subtype: null, openingVerified: null }),
  HOLDING,
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
  memberReceiptsEnabled: true,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: `${OPENING}T09:00:00.000Z`,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  allocationsEnabled: false,
  ...overrides,
});

const SOURCES = [
  {
    kind: "opening_item",
    id: OPENING_ITEM_ID,
    number: "OM-000001",
    payerName: "Chidi Eze",
    memberId: null,
    purpose: "levy",
    obligationId: null,
    businessDate: OPENING,
    effectiveKobo: 200000,
    refundedKobo: 0,
    remainingKobo: 200000,
  },
  {
    kind: "receipt",
    id: RECEIPT_SOURCE_ID,
    number: "M-000012",
    payerName: "Ada Obi",
    memberId: null,
    purpose: "dues",
    obligationId: null,
    businessDate: RECEIVED,
    effectiveKobo: 600000,
    refundedKobo: 100000,
    remainingKobo: 500000,
  },
];

let sourcesBody: unknown;
let sourcesError: unknown;

const serveReads = () => {
  api.get.mockImplementation((url: string) => {
    if (/^\/finance\/org\d\/ledger\/member-money/.test(url)) {
      return sourcesError
        ? Promise.reject(sourcesError)
        : Promise.resolve({ data: { data: sourcesBody } });
    }
    if (url === "/organisations/org1/members") {
      return Promise.resolve({
        data: { data: [{ id: MEMBER_ID, name: "Ada Obi" }, { id: "e".repeat(24), name: "Bayo Ade" }] },
      });
    }
    if (url === "/finance/org1/obligations") {
      return Promise.resolve({
        data: { data: [{ id: OBLIGATION_ID, type: "dues", name: "Annual dues", year: 2026 }] },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const journalResponse = (
  journal: Record<string, unknown>,
  { status = 201, replayed = false } = {},
) => ({ status, data: { data: { replayed, journal } } });

const memberReceiptJournal = (amountKobo = 600000, number = "M-000001") =>
  journalResponse({
    id: "journal-m1",
    businessDate: TODAY,
    reference: null,
    note: null,
    sourceType: "member_receipt",
    totalKobo: amountKobo,
    postedAt: `${TODAY}T10:00:00.000Z`,
    postedBy: { id: "officer-1", name: "treasurer" },
    sourceId: null,
    entry: {
      number,
      method: "cash",
      counterpartyName: "Ada Obi",
      externalReference: null,
      evidenceReference: null,
      memberId: null,
      purpose: "dues",
      obligationId: null,
      receivedAfterOpeningCount: true,
    },
    lines: [],
  });

const refundJournal = (sourceId = RECEIPT_SOURCE_ID, amountKobo = 100000, options = {}) =>
  journalResponse(
    {
      id: "journal-f1",
      businessDate: TODAY,
      reference: null,
      note: null,
      sourceType: "member_receipt_refund",
      totalKobo: amountKobo,
      postedAt: `${TODAY}T10:00:00.000Z`,
      postedBy: { id: "officer-1", name: "treasurer" },
      sourceId: null,
      entry: {
        number: "F-000001",
        method: "cash",
        counterpartyName: "Ada Obi",
        externalReference: null,
        evidenceReference: null,
        memberMoneySource: { kind: "receipt", id: sourceId, number: "M-000012" },
        memberId: null,
        reason: "Paid twice",
      },
      lines: [],
    },
    options,
  );

const setSession = (permissions: PermissionKey[] = ["finance.view", "finance.manage"]) => {
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions },
  });
};

const recheck = jest.fn();

const renderPanel = (props: Partial<ComponentProps<typeof MemberMoneyPanel>> = {}) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemberMoneyPanel
        organisationId="org1"
        status={statusOf()}
        accounts={ACCOUNTS}
        enabled
        cashbookEnabled
        onRecheckLedger={recheck}
        {...props}
      />
    </QueryClientProvider>,
  );

/** Books with both posting sections, as BooksTab renders them. */
const renderBoth = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <CashbookPostingsPanel
        organisationId="org1"
        status={statusOf()}
        accounts={ACCOUNTS}
        enabled
        memberMoneyEnabled
      />
      <MemberMoneyPanel
        organisationId="org1"
        status={statusOf()}
        accounts={ACCOUNTS}
        enabled
        cashbookEnabled
      />
    </QueryClientProvider>,
  );

const memberMoney = () => within(screen.getByRole("region", { name: "Member money" }));
const recordMoney = () => within(screen.getByRole("region", { name: "Record money" }));

const fillMemberReceipt = async ({
  purpose = "Dues" as string | null,
  attest = true,
  amount = "6000",
} = {}) => {
  const scope = within(screen.getByRole("region", { name: "Member money" }));
  fireEvent.change(scope.getByLabelText("Amount"), { target: { value: amount } });
  await chooseOption(scope.getByLabelText("Money received into"), "Cash in hand");
  fireEvent.change(scope.getByLabelText("Paid by (required)"), { target: { value: "Ada Obi" } });
  if (purpose) await chooseOption(scope.getByLabelText("What the money is for (required)"), purpose);
  if (attest) {
    await toggle(scope.getByRole("checkbox", { name: /received after the opening count/ }));
  }
};

const openRefund = async (number = "M-000012") => {
  fireEvent.click(await memberMoney().findByRole("button", { name: `Refund from ${number}` }));
};

const fillRefund = async (amount = "1000") => {
  const scope = within(screen.getByRole("region", { name: "Member money" }));
  fireEvent.change(scope.getByLabelText("Amount"), { target: { value: amount } });
  await chooseOption(scope.getByLabelText("Paid back from"), "Cash in hand");
  fireEvent.change(scope.getByLabelText("Reason (required)"), { target: { value: "Paid twice" } });
};

const memberMoneyReads = () =>
  api.get.mock.calls.filter(([url]) => String(url).includes("/ledger/member-money")).length;

const stored = () => readLedgerPostingIntents("org1");

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  setSession();
  sourcesBody = { items: SOURCES, nextCursor: null };
  sourcesError = null;
  serveReads();
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("gate and readiness", () => {
  it("ships the release gate on and renders nothing while it is off", () => {
    expect(LEDGER_MEMBER_MONEY_UI_ENABLED).toBe(true);
    renderPanel({ enabled: false });
    expect(screen.queryByRole("region", { name: "Member money" })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("explains member receipts being off and reads nothing", () => {
    renderPanel({ status: statusOf({ memberReceiptsEnabled: false }) });
    expect(screen.getByText(/Member receipts are turned off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Member money in/ })).not.toBeInTheDocument();
    expect(memberMoneyReads()).toBe(0);
  });

  it("explains a missing holding account", async () => {
    renderPanel({ accounts: ACCOUNTS.filter((entry) => entry.id !== "holding") });
    expect(screen.getByText(/No active member money holding account/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Member money in/ })).not.toBeInTheDocument();
  });

  it("shows a view-only officer what is held, with no posting or refund", async () => {
    setSession(["finance.view"]);
    renderPanel();
    expect(await screen.findByText("₦5,000 held")).toBeInTheDocument();
    expect(screen.getByText(/permission to manage finance/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Member money in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refund from/ })).not.toBeInTheDocument();
  });

  it("says plainly that member money is not dues paid or income", () => {
    renderPanel();
    expect(screen.getByText(MEMBER_MONEY_NOT_DUES_NOTE)).toBeInTheDocument();
  });
});

describe("member receipts", () => {
  it("needs an explicit purpose and the opening-count confirmation before sending", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Member money in/ }));
    await fillMemberReceipt({ purpose: null, attest: false });

    fireEvent.click(screen.getByRole("button", { name: "Record member money" }));
    expect(await screen.findByText("Choose what the money is for.")).toBeInTheDocument();
    await chooseOption(screen.getByLabelText("What the money is for (required)"), "Dues");
    expect(screen.getByText(/Confirm the money was received after the opening count/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("records a member receipt with the exact body and shows the server's M-number", async () => {
    api.post.mockResolvedValueOnce(memberReceiptJournal());
    renderPanel();
    await screen.findByText("₦5,000 held");
    const readsBefore = memberMoneyReads();
    fireEvent.click(screen.getByRole("button", { name: /Member money in/ }));
    await fillMemberReceipt();
    fireEvent.click(screen.getByRole("button", { name: "Record member money" }));

    expect(await screen.findByText("Journal number: M-000001")).toBeInTheDocument();
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/finance/org1/ledger/member-receipts");
    expect(body).toEqual({
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/),
      businessDate: TODAY,
      amountKobo: 600000,
      toAccountId: "cash",
      method: "cash",
      counterpartyName: "Ada Obi",
      purpose: "dues",
      receivedAfterOpeningCount: true,
    });
    const receipt = within(screen.getByRole("status"));
    expect(receipt.getByText("Purpose: Dues")).toBeInTheDocument();
    expect(receipt.getByText("Paid by: Ada Obi")).toBeInTheDocument();
    expect(screen.getByText(MEMBER_MONEY_NOT_DUES_NOTE)).toBeInTheDocument();
    expect(stored().kind).toBe("none");
    // The held list is re-read from the server after the posting.
    await waitFor(() => expect(memberMoneyReads()).toBeGreaterThan(readsBefore));
  });

  it("offers the member hint only to an officer who can read members", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Member money in/ }));
    expect(screen.queryByLabelText("Member (optional)")).not.toBeInTheDocument();
    expect(api.get.mock.calls.some(([url]) => url === "/organisations/org1/members")).toBe(false);
    expect(await screen.findByLabelText("Obligation (optional)")).toBeInTheDocument();
  });

  it("sends the chosen member and obligation as hints", async () => {
    setSession(["finance.view", "finance.manage", "members.view"]);
    api.post.mockResolvedValueOnce(memberReceiptJournal());
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Member money in/ }));
    await fillMemberReceipt();
    const memberInput = await screen.findByLabelText("Member (optional)");
    expect(await optionLabels(memberInput)).toEqual(["Ada Obi", "Bayo Ade"]);
    await chooseOption(memberInput, "Ada Obi");
    await chooseOption(screen.getByLabelText("Obligation (optional)"), "Annual dues (2026)");
    fireEvent.click(screen.getByRole("button", { name: "Record member money" }));

    await screen.findByText("Journal number: M-000001");
    expect(api.post.mock.calls[0][1]).toMatchObject({
      memberId: MEMBER_ID,
      obligationId: OBLIGATION_ID,
    });
  });
});

describe("refunds", () => {
  it("lists opening items and receipts with what each still holds", async () => {
    renderPanel();
    const held = await screen.findAllByRole("listitem");
    expect(held).toHaveLength(2);
    expect(within(held[0]).getByText("OM-000001")).toBeInTheDocument();
    expect(within(held[0]).getByText("Opening member money")).toBeInTheDocument();
    expect(within(held[1]).getByText("₦5,000 held")).toBeInTheDocument();
    expect(within(held[1]).getByText("₦6,000 received · ₦1,000 refunded")).toBeInTheDocument();
    expect(api.get.mock.calls.find(([url]) => String(url).includes("member-money"))?.[0]).toBe(
      "/finance/org1/ledger/member-money?open=true&limit=100",
    );
  });

  it("refunds against the chosen source, which travels in the route", async () => {
    api.post.mockResolvedValueOnce(refundJournal());
    renderPanel();
    await openRefund();
    expect(screen.getByText("Still held: ₦5,000")).toBeInTheDocument();
    expect(screen.getByLabelText("Paid to (required)")).toHaveValue("Ada Obi");
    await fillRefund();
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));

    expect(await screen.findByText("Journal number: F-000001")).toBeInTheDocument();
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe(`/finance/org1/ledger/member-money/${RECEIPT_SOURCE_ID}/refunds`);
    expect(body).toEqual({
      idempotencyKey: expect.any(String),
      businessDate: TODAY,
      amountKobo: 100000,
      fromAccountId: "cash",
      method: "cash",
      counterpartyName: "Ada Obi",
      reason: "Paid twice",
    });
    const receipt = within(screen.getByRole("status"));
    expect(receipt.getByText("Refunded from: M-000012")).toBeInTheDocument();
    expect(receipt.getByText("Reason: Paid twice")).toBeInTheDocument();
  });

  it("won't send a refund above what the source still holds", async () => {
    renderPanel();
    await openRefund();
    await fillRefund("5000.01");
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));
    expect(
      await screen.findByText("A refund can't be more than the ₦5,000 still held from M-000012."),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows the server's refusal and keeps nothing pending", async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "This refund is more than the money still held from this source.",
          code: "LEDGER_REFUND_EXCEEDS_REMAINING",
        },
      },
    });
    renderPanel();
    await openRefund();
    await fillRefund();
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));
    expect(
      await screen.findByText("This refund is more than the money still held from this source."),
    ).toBeInTheDocument();
    expect(stored().kind).toBe("none");
  });

  it("never reports a refund for another source as posted", async () => {
    api.post.mockResolvedValueOnce(refundJournal(OPENING_ITEM_ID));
    renderPanel();
    await openRefund();
    await fillRefund();
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));

    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByText("Journal number: F-000001")).not.toBeInTheDocument();
    expect(stored()).toMatchObject({ kind: "pending" });
  });

  it("retries an unconfirmed refund to the same source with the same body after a reload", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 503, data: { error: "Unavailable" } } });
    const view = renderPanel();
    await openRefund();
    await fillRefund();
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    view.unmount();

    api.post.mockResolvedValueOnce(refundJournal(RECEIPT_SOURCE_ID, 100000, { status: 200, replayed: true }));
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Retry this posting" }));
    expect(await screen.findByText("Already posted")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post.mock.calls[1]).toEqual(api.post.mock.calls[0]);
    expect(stored().kind).toBe("none");
  });
});

describe("what each source holds stays the server's current figure", () => {
  /** The server's list after ₦2,000 more was refunded from M-000012 elsewhere. */
  const refundedElsewhere = () => {
    sourcesBody = {
      items: [
        SOURCES[0],
        { ...SOURCES[1], refundedKobo: 300000, remainingKobo: 300000 },
      ],
      nextCursor: null,
    };
  };

  /** What the browser delivers to this tab when another tab writes the posting record. */
  const anotherTabWrote = () => {
    const event = new Event("storage") as StorageEvent;
    Object.defineProperty(event, "key", { value: ledgerPostingIntentKey("org1") });
    act(() => {
      window.dispatchEvent(event);
    });
  };

  it("re-reads the held list when another tab posts, with no form open", async () => {
    renderPanel();
    expect(await screen.findByText("₦5,000 held")).toBeInTheDocument();
    refundedElsewhere();
    anotherTabWrote();

    expect(await screen.findByText("₦3,000 held")).toBeInTheDocument();
    expect(screen.queryByText("₦5,000 held")).not.toBeInTheDocument();
    await openRefund();
    expect(screen.getByText("Still held: ₦3,000")).toBeInTheDocument();
    await fillRefund("4000");
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));
    expect(
      await screen.findByText("A refund can't be more than the ₦3,000 still held from M-000012."),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("updates an open refund form, locked, when another tab posts", async () => {
    renderPanel();
    await openRefund();
    expect(screen.getByText("Still held: ₦5,000")).toBeInTheDocument();
    await fillRefund("4000");
    refundedElsewhere();
    anotherTabWrote();

    expect(await screen.findByText("Still held: ₦3,000")).toBeInTheDocument();
    expect(screen.getByText("Check the journal entries before posting this")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record refund" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("re-reads the held list on a deliberate recheck", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 503, data: { error: "Unavailable" } } });
    renderPanel();
    await openRefund();
    await fillRefund();
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(await screen.findByText("₦5,000 held")).toBeInTheDocument();
    const readsBefore = memberMoneyReads();
    refundedElsewhere();

    fireEvent.click(screen.getByRole("button", { name: "Recheck the books" }));
    expect(await screen.findByText("₦3,000 held")).toBeInTheDocument();
    expect(memberMoneyReads()).toBeGreaterThan(readsBefore);
    expect(recheck).toHaveBeenCalled();
  });

  it("shows the current amount held after the server refuses a refund as too large", async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 422,
        data: {
          error: "This refund is more than the money still held from this source.",
          code: "LEDGER_REFUND_EXCEEDS_REMAINING",
        },
      },
    });
    renderPanel();
    await openRefund();
    await fillRefund("4000");
    refundedElsewhere();
    fireEvent.click(screen.getByRole("button", { name: "Record refund" }));

    expect(
      await screen.findByText("This refund is more than the money still held from this source."),
    ).toBeInTheDocument();
    expect(await screen.findByText("Still held: ₦3,000")).toBeInTheDocument();
  });

  it("withdraws the refund form when the source no longer holds anything", async () => {
    renderPanel();
    await openRefund();
    sourcesBody = { items: [SOURCES[0]], nextCursor: null };
    anotherTabWrote();

    expect(await screen.findByText("Nothing is held to refund any more")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record refund" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("button", { name: "Refund from M-000012" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refund from OM-000001" })).toBeInTheDocument();
  });

  it("pauses the refund when the refreshed list can't be trusted", async () => {
    renderPanel();
    await openRefund();
    sourcesBody = {
      items: [SOURCES[0], { ...SOURCES[1], remainingKobo: 600000 }],
      nextCursor: null,
    };
    anotherTabWrote();

    expect(await screen.findByText("What is held couldn't be confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record refund" })).not.toBeInTheDocument();

    sourcesBody = { items: SOURCES, nextCursor: null };
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("Still held: ₦5,000")).toBeInTheDocument();
  });

  it("treats a source repeated across pages as an unreadable list", async () => {
    api.get.mockImplementation((url: string) => {
      if (url.startsWith("/finance/org1/ledger/member-money")) {
        return Promise.resolve({
          data: {
            data: url.includes("cursor=")
              ? { items: [SOURCES[1]], nextCursor: null }
              : { items: SOURCES, nextCursor: "next-page" },
          },
        });
      }
      return Promise.reject(new Error(`unexpected GET ${url}`));
    });
    renderPanel();
    expect(await screen.findByText(/couldn't be read, so no refund is offered/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refund from/ })).not.toBeInTheDocument();
  });
});

describe("held list states", () => {
  it("offers no refund when the list can't be read", async () => {
    sourcesBody = { items: [{ kind: "receipt", id: "x" }], nextCursor: null };
    renderPanel();
    expect(await screen.findByText(/couldn't be read, so no refund is offered/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refund from/ })).not.toBeInTheDocument();
  });

  it("says when nothing is held", async () => {
    sourcesBody = { items: [], nextCursor: null };
    renderPanel();
    expect(await screen.findByText("No member money is held")).toBeInTheDocument();
  });

  it("shows a load error with a retry", async () => {
    sourcesError = { response: { status: 500, data: { error: "Server error" } } };
    renderPanel();
    expect(await screen.findByText("Member money held couldn't be loaded")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("one pending posting shared with Record money", () => {
  const seedOrdinaryReceipt = () =>
    beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "key-ordinary1",
      operation: "receipt",
      body: {
        idempotencyKey: "key-ordinary1",
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

  it("blocks member money while an ordinary receipt is unconfirmed, and points to it", async () => {
    await seedOrdinaryReceipt();
    renderPanel();
    expect(await screen.findByText(/It is shown in Record money/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Member money in/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refund from/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry this posting" })).not.toBeInTheDocument();
  });

  it("offers each pending retry in its own section only", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 503, data: { error: "Unavailable" } } });
    renderBoth();
    fireEvent.click(memberMoney().getByRole("button", { name: /Member money in/ }));
    await fillMemberReceipt();
    fireEvent.click(memberMoney().getByRole("button", { name: "Record member money" }));

    expect(await memberMoney().findByRole("button", { name: "Retry this posting" })).toBeInTheDocument();
    expect(recordMoney().queryByRole("button", { name: "Retry this posting" })).not.toBeInTheDocument();
    expect(recordMoney().getByText(/It is shown in Member money/)).toBeInTheDocument();
    expect(recordMoney().queryByRole("button", { name: /Money in/ })).not.toBeInTheDocument();
  });

  it("locks an open member form when Record money posts on the same page", async () => {
    api.post.mockResolvedValueOnce({
      status: 201,
      data: {
        data: {
          replayed: false,
          journal: {
            id: "journal-r1",
            businessDate: TODAY,
            sourceType: "cash_receipt",
            totalKobo: 2500000,
            entry: { number: "R-000001", method: "cash" },
            lines: [],
          },
        },
      },
    });
    renderBoth();
    fireEvent.click(memberMoney().getByRole("button", { name: /Member money in/ }));
    await fillMemberReceipt();

    fireEvent.click(recordMoney().getByRole("button", { name: /Money in/ }));
    fireEvent.change(recordMoney().getByLabelText("Amount"), { target: { value: "25000" } });
    fireEvent.click(
      within(recordMoney().getByRole("radiogroup", { name: "Into" })).getByRole("radio", { name: /Cash in hand/ }),
    );
    await chooseOption(recordMoney().getByLabelText("Category"), "Donations");
    fireEvent.change(recordMoney().getByLabelText("Description (required)"), {
      target: { value: "Donation towards choir anniversary" },
    });
    fireEvent.click(recordMoney().getByRole("button", { name: "Record money in" }));
    expect(await recordMoney().findByText("Journal number: R-000001")).toBeInTheDocument();

    expect(memberMoney().getByText("Check the journal entries before posting this")).toBeInTheDocument();
    expect(memberMoney().getByRole("button", { name: "Record member money" })).toBeDisabled();
    expect(memberMoney().getByLabelText("Amount")).toHaveValue("6,000");
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("keeps an ordinary posting retryable here when Record money isn't shown", async () => {
    await seedOrdinaryReceipt();
    renderPanel({ cashbookEnabled: false });
    expect(await screen.findByRole("button", { name: "Retry this posting" })).toBeInTheDocument();
    expect(screen.queryByText(/It is shown in Record money/)).not.toBeInTheDocument();
  });
});

describe("scope", () => {
  it("never calls dues, payment or compliance endpoints", async () => {
    api.post.mockResolvedValueOnce(memberReceiptJournal());
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Member money in/ }));
    await fillMemberReceipt();
    fireEvent.click(screen.getByRole("button", { name: "Record member money" }));
    await screen.findByText("Journal number: M-000001");

    for (const [url] of [...api.post.mock.calls, ...api.put.mock.calls, ...api.patch.mock.calls]) {
      expect(String(url)).toMatch(/^\/finance\/org1\/ledger\/(member-receipts|member-money\/)/);
    }
    for (const [url] of api.get.mock.calls) {
      expect(String(url)).not.toMatch(/payments|compliance/);
    }
  });

  it("reads only the selected organisation's member money", async () => {
    sourcesBody = { items: [], nextCursor: null };
    renderPanel({ organisationId: "org2" });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get.mock.calls.map(([url]) => url)).toContain(
      "/finance/org2/ledger/member-money?open=true&limit=100",
    );
    await act(async () => undefined);
  });
});

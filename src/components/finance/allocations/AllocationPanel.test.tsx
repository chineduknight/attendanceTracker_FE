import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { chooseOption, confirmInDialog, render, toggle } from "test-utils/render";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import AllocationPanel from "components/finance/allocations/AllocationPanel";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { act } from "@testing-library/react";
import { beginLedgerPostingIntent, ledgerPostingIntentKey, readLedgerPostingIntents } from "helpers/ledgerPostingIntent";
import { todayInLagos } from "helpers/openingBalances";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";
import { format, parseISO, subDays } from "date-fns";
import {
  MEMBER_ADA,
  MEMBER_CHIDI,
  OBLIGATION_DUES,
  OBLIGATION_LEVY,
  SOURCE_M12,
  allocationJournal,
  knownPosition,
  overLinkedPosition,
  positionsReport,
  unknownPosition,
} from "test-utils/ledgerF3Fixtures";

/**
 * F3C allocation posting. Every request is mocked; nothing reaches a real
 * ledger. The posting intent runs on the deterministic Web Locks stand-in.
 */

jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post", jest.Mock>;

const TODAY = todayInLagos();
const daysAgo = (days: number) => format(subDays(parseISO(TODAY), days), "yyyy-MM-dd");

const account = (id: string, cls: string, subtype: string | null): LedgerAccount => ({
  id,
  name: id,
  class: cls,
  subtype,
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: cls === "asset" ? true : null,
});
const ACCOUNTS = [
  account("cash", "asset", "cash"),
  account("hold", "liability", "member_receipts_unallocated"),
  account("dues", "income", "member_dues_income"),
  account("levy", "income", "member_levy_income"),
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
  allocationsEnabled: true,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

/** `GET /member-money?open=true` item: hints member Ada, purpose dues. */
const memberMoney = (overrides: Record<string, unknown> = {}) => ({
  kind: "receipt",
  id: SOURCE_M12,
  number: "M-000012",
  payerName: "Ada Obi",
  memberId: MEMBER_ADA,
  purpose: "dues",
  obligationId: null,
  businessDate: daysAgo(5),
  effectiveKobo: 600000,
  refundedKobo: 100000,
  allocatedKobo: 0,
  remainingKobo: 500000,
  ...overrides,
});

const OBLIGATIONS = [
  { id: OBLIGATION_DUES, type: "dues", name: "Dues", year: 2026, amountPerMonth: 1000 },
  { id: OBLIGATION_LEVY, type: "levy", name: "Building levy", amount: 5000 },
];

const complianceFor = (obligationId: string) => ({
  obligation: OBLIGATIONS.find((entry) => entry.id === obligationId),
  summary: {},
  rows: [
    { memberId: MEMBER_ADA, name: "Ada Obi", accountable: true },
    { memberId: MEMBER_CHIDI, name: "Chidi Eze", accountable: true },
  ],
});

let sources: unknown[];
let positionFor: (memberId: string, obligationId: string) => unknown[];

const serve = () =>
  api.get.mockImplementation((url: string) => {
    const [path, search = ""] = url.split("?");
    const params = new URLSearchParams(search);
    const reply = (body: unknown) => Promise.resolve({ data: { data: body } });
    if (path.endsWith("/ledger/member-money")) return reply({ items: sources, nextCursor: null });
    if (path.endsWith("/obligations")) return reply(OBLIGATIONS);
    const compliance = /\/obligations\/([a-f0-9]{24})\/compliance$/.exec(path);
    if (compliance) return reply(complianceFor(compliance[1]));
    if (path.endsWith("/reconciliation/positions")) {
      return reply(positionsReport(positionFor(params.get("memberId") ?? "", params.get("obligationId") ?? "")));
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

const setPermissions = (permissions: PermissionKey[], orgId = "org1") =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: orgId, isOwner: false, permissions },
  });

const panel = (props: Partial<ComponentProps<typeof AllocationPanel>> = {}) => (
  <QueryClientProvider client={queryClient}>
    <AllocationPanel
      organisationId="org1"
      status={statusOf()}
      accounts={ACCOUNTS}
      enabled
      cashbookEnabled={false}
      memberMoneyEnabled={false}
      reversalsEnabled={false}
      {...props}
    />
  </QueryClientProvider>
);

const allocationPosts = () => api.post.mock.calls.filter(([url]) => String(url).endsWith("/ledger/allocations"));

const confirmed = (body: Record<string, unknown>, replayed = false) => ({
  status: replayed ? 200 : 201,
  data: {
    data: {
      journal: allocationJournal(
        { businessDate: body.businessDate, totalKobo: body.amountKobo },
        { memberId: body.memberId, obligationId: body.obligationId, obligationType: body.obligationId === OBLIGATION_LEVY ? "levy" : "dues" },
      ),
      replayed,
    },
  },
});

/** Choose the source, obligation and member, wait for the position. */
const openForm = async (obligation = "Dues (2026)", member = "Ada Obi") => {
  fireEvent.click(await screen.findByRole("button", { name: "Allocate from M-000012" }));
  await chooseOption(await screen.findByLabelText("Obligation"), obligation);
  await chooseOption(await screen.findByLabelText("Member"), member);
};

const fillAmount = async (naira: string) => {
  fireEvent.change(await screen.findByLabelText("Amount"), { target: { value: naira } });
};

const review = () => fireEvent.click(screen.getByRole("button", { name: "Review and allocate" }));

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  setPermissions(["finance.view", "finance.manage"]);
  sources = [memberMoney()];
  positionFor = () => [knownPosition({ allocatedKobo: 300000, linkedKobo: 300000, unlinkedKobo: 900000 })];
  serve();
  api.post.mockImplementation((_url: string, body: Record<string, unknown>) => Promise.resolve(confirmed(body)));
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("gate, permission and readiness", () => {
  it("renders and reads nothing with its gate off", () => {
    render(panel({ enabled: false }));
    expect(screen.queryByText("Allocate member money")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("offers nothing to a finance viewer", async () => {
    setPermissions(["finance.view"]);
    render(panel());
    expect(await screen.findByText(/Only officers with permission to manage finance can allocate/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allocate from/ })).not.toBeInTheDocument();
  });

  it.each([
    ["allocations are off", { status: statusOf({ allocationsEnabled: false }) }, /allocations are turned off/],
    ["member receipts are off", { status: statusOf({ memberReceiptsEnabled: false }) }, /Member receipts are turned off/],
    ["the period lock is unknown", { status: statusOf({ lockedThroughState: "unknown" }) }, /didn't report the current period lock/],
    ["the server write gate is off", { status: statusOf({ blockers: ["LEDGER_WRITES_DISABLED"] }) }, /switched off on the server/],
    ["an income account is missing", { accounts: ACCOUNTS.slice(0, 3) }, /are both needed/],
  ])("explains why when %s", async (_label, props, message) => {
    render(panel(props));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allocate from/ })).not.toBeInTheDocument();
  });

  it("says when no money is available", async () => {
    sources = [];
    render(panel());
    expect(await screen.findByText("No member money is held")).toBeInTheDocument();
  });
});

describe("the officer workflow", () => {
  it("allocates once, after every confirmation, with the exact body", async () => {
    const onViewHistory = jest.fn();
    render(panel({ onViewHistory }));
    await openForm();

    const position = await screen.findByLabelText("Current position");
    expect(within(await within(position).findByRole("group", { name: "Recorded in Finance" })).getByText("₦12,000")).toBeInTheDocument();
    expect(within(within(position).getByRole("group", { name: "Already allocated" })).getByText("₦3,000")).toBeInTheDocument();
    expect(within(position).getByText(/At most ₦5,000 can be allocated here/)).toBeInTheDocument();

    await fillAmount("2000");
    fireEvent.change(screen.getByLabelText("Reference"), { target: { value: " Envelope 3 " } });
    review();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Allocate ₦2,000 from M-000012 to Ada Obi, Dues \(2026\), as dues income/)).toBeInTheDocument();
    expect(within(dialog).getByText(/does not record a payment in Finance and doesn't change anyone's compliance/)).toBeInTheDocument();
    await confirmInDialog("Allocate");

    expect(await screen.findByText("Journal number: A-000001")).toBeInTheDocument();
    expect(allocationPosts()).toHaveLength(1);
    const [url, body] = allocationPosts()[0];
    expect(url).toBe("/finance/org1/ledger/allocations");
    expect(body).toEqual({
      idempotencyKey: expect.any(String),
      businessDate: TODAY,
      amountKobo: 200000,
      sourceId: SOURCE_M12,
      memberId: MEMBER_ADA,
      obligationId: OBLIGATION_DUES,
      reference: "Envelope 3",
    });
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "View in allocation history" }));
    expect(onViewHistory).toHaveBeenCalledWith(expect.any(String), SOURCE_M12, "M-000012");
  });

  it("needs a separate confirmation for each of the three mismatched hints", async () => {
    sources = [memberMoney({ obligationId: OBLIGATION_DUES })];
    positionFor = () => [knownPosition({ memberId: MEMBER_CHIDI, obligationId: OBLIGATION_LEVY, obligationType: "levy" })];
    render(panel());
    await openForm("Building levy", "Chidi Eze");
    await fillAmount("1000");

    const boxes = await screen.findAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    expect(screen.getByText(/recorded for Ada Obi\. I confirm it should count for Chidi Eze/)).toBeInTheDocument();
    expect(screen.getByText(/recorded as dues\. I confirm it should be allocated to levy/)).toBeInTheDocument();

    // Two of three is not enough.
    await toggle(boxes[0]);
    await toggle(boxes[1]);
    review();
    expect(await screen.findByText("Confirm each hint on the money that differs from what you are allocating to.")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await toggle(boxes[2]);
    review();
    await confirmInDialog("Allocate");
    await waitFor(() => expect(allocationPosts()).toHaveLength(1));
    expect(allocationPosts()[0][1]).toMatchObject({
      confirmMemberMismatch: true,
      confirmObligationMismatch: true,
      confirmPurposeMismatch: true,
    });
  });

  it("sends no flag when every hint agrees", async () => {
    render(panel());
    await openForm();
    await fillAmount("1000");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    review();
    await confirmInDialog("Allocate");
    await waitFor(() => expect(allocationPosts()).toHaveLength(1));
    expect(Object.keys(allocationPosts()[0][1])).not.toEqual(expect.arrayContaining(["confirmMemberMismatch"]));
  });

  it("refuses more than the source still holds before sending", async () => {
    positionFor = () => [knownPosition({ recordedKobo: 9000000, allocatedKobo: 0, linkedKobo: 0, unlinkedKobo: 9000000 })];
    render(panel());
    await openForm();
    await fillAmount("5000.01");
    review();
    expect(await screen.findByText(/can't be more than the ₦5,000 M-000012 still holds/)).toBeInTheDocument();
    expect(allocationPosts()).toHaveLength(0);
  });

  it("refuses more than Finance records but hasn't linked, in the server's figures", async () => {
    positionFor = () => [knownPosition({ recordedKobo: 150000, allocatedKobo: 100000, linkedKobo: 100000, unlinkedKobo: 50000, appliedKobo: 150000 })];
    render(panel());
    await openForm();
    await fillAmount("600");
    review();
    expect(await screen.findByText(/Finance records ₦1,500 for this member on this obligation and ₦1,000 is already allocated to it, so at most ₦500/)).toBeInTheDocument();
    expect(allocationPosts()).toHaveLength(0);
  });

  it.each([
    ["no Finance payment row", () => [], /recorded value is ₦0/],
    ["an over-linked position", () => [overLinkedPosition()], /More is allocated than Finance now records/],
    ["a malformed Finance value", () => [unknownPosition("unknown")], /Fix the record in Finance/],
    ["two Finance rows", () => [unknownPosition("ambiguous")], /two or more active payment records/],
    ["an archived member", () => [knownPosition({ flags: ["MEMBER_ARCHIVED"] })], /archived or missing/],
  ])("offers no allocation for %s", async (_label, rows, message) => {
    positionFor = (memberId) =>
      (rows() as Array<Record<string, unknown>>).map((row) => ({ ...row, memberId, obligationId: OBLIGATION_DUES }));
    render(panel());
    await openForm();
    expect((await screen.findAllByText(message)).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review and allocate" })).toBeDisabled();
  });

  it("shows the server's refusal and re-reads stale figures", async () => {
    api.post.mockRejectedValue({
      response: { status: 422, data: { error: "The allocation is more than the source still holds.", code: "LEDGER_ALLOCATION_EXCEEDS_REMAINING" } },
    });
    render(panel());
    await openForm();
    await fillAmount("2000");
    const sourceReads = () => api.get.mock.calls.filter(([url]) => String(url).includes("/member-money")).length;
    const before = sourceReads();
    review();
    await confirmInDialog("Allocate");
    expect(await screen.findByText("The allocation is more than the source still holds.")).toBeInTheDocument();
    await waitFor(() => expect(sourceReads()).toBeGreaterThan(before));
    // A clean first refusal wrote nothing: nothing stays pending.
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
  });

  it("keeps the server's refusal on screen when the re-read source holds nothing any more", async () => {
    api.post.mockImplementationOnce(() => {
      // Another officer used the money first: the next read no longer lists it.
      sources = [];
      return Promise.reject({
        response: { status: 422, data: { error: "The allocation is more than the source still holds.", code: "LEDGER_ALLOCATION_EXCEEDS_REMAINING" } },
      });
    });
    render(panel());
    await openForm();
    await fillAmount("2000");
    review();
    await confirmInDialog("Allocate");
    expect(await screen.findByText("Nothing is held to allocate any more")).toBeInTheDocument();
    expect(screen.getByText("The allocation is more than the source still holds.")).toBeInTheDocument();
  });

  it("starts from a chosen suggestion with its member and obligation", async () => {
    render(panel({ start: { sourceId: SOURCE_M12, sourceNumber: "M-000012", memberId: MEMBER_ADA, obligationId: OBLIGATION_DUES, nonce: 1 } }));
    expect(await screen.findByLabelText("Current position")).toBeInTheDocument();
    expect(await screen.findByText(/At most ₦5,000 can be allocated here/)).toBeInTheDocument();
  });
});

describe("unconfirmed outcomes", () => {
  it("keeps a lost response pending across a reload and retries the same key and body", async () => {
    api.post.mockRejectedValueOnce({ message: "Network Error" });
    const view = render(panel());
    await openForm();
    await fillAmount("2000");
    review();
    await confirmInDialog("Allocate");
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.getByText("Allocation: ₦2,000 from M-000012 to Ada Obi, Dues (2026)")).toBeInTheDocument();
    const first = allocationPosts()[0][1];

    // A reload: the stored intent still blocks and offers only the exact retry.
    view.unmount();
    render(panel());
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allocate from/ })).not.toBeInTheDocument();

    api.post.mockImplementationOnce((_url: string, body: Record<string, unknown>) => Promise.resolve(confirmed(body, true)));
    fireEvent.click(screen.getByRole("button", { name: "Retry this posting" }));
    expect(await screen.findByText("Already posted")).toBeInTheDocument();
    expect(allocationPosts()).toHaveLength(2);
    expect(allocationPosts()[1][1]).toEqual(first);
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
  });

  it("never sends a new allocation automatically after an unknown outcome", async () => {
    api.post.mockRejectedValue({ response: { status: 503, data: { error: "Unknown", code: "LEDGER_POSTING_OUTCOME_UNKNOWN" } } });
    render(panel());
    await openForm();
    await fillAmount("2000");
    review();
    await confirmInDialog("Allocate");
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(allocationPosts()).toHaveLength(1);
  });

  it("starts again with a new key only after the server proves the key was voided", async () => {
    api.post
      .mockRejectedValueOnce({ message: "Network Error" })
      .mockRejectedValueOnce({ response: { status: 409, data: { error: "Voided", code: "LEDGER_IDEMPOTENCY_KEY_VOIDED" } } });
    render(panel());
    await openForm();
    await fillAmount("2000");
    review();
    await confirmInDialog("Allocate");
    fireEvent.click(await screen.findByRole("button", { name: "Retry this posting" }));
    expect(await screen.findByText(/earlier attempt was voided, so nothing was posted/)).toBeInTheDocument();
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
    expect(allocationPosts()[1][1]).toEqual(allocationPosts()[0][1]);
  });

  it("can't be submitted twice while the request is in flight", async () => {
    let release: (value: unknown) => void = () => undefined;
    api.post.mockImplementationOnce(
      (_url: string, body: Record<string, unknown>) =>
        new Promise((resolve) => {
          release = () => resolve(confirmed(body));
        }),
    );
    render(panel());
    await openForm();
    await fillAmount("2000");
    review();
    await confirmInDialog("Allocate");
    await waitFor(() => expect(allocationPosts()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const submit = screen.getAllByRole("button").find((button) => button.hasAttribute("data-loading"));
    expect(submit).toBeDisabled();
    release(null);
    expect(await screen.findByText("Journal number: A-000001")).toBeInTheDocument();
    expect(allocationPosts()).toHaveLength(1);
  });
});

describe("concurrent changes", () => {
  it("locks an open form when another tab claims a posting, keeping the entries", async () => {
    render(panel());
    await openForm();
    await fillAmount("2000");
    // Another tab stores its own posting for this organisation.
    await beginLedgerPostingIntent({
      organisationId: "org1",
      officerId: "officer-1",
      key: "other-tab-key-1",
      operation: "reversal",
      body: { idempotencyKey: "other-tab-key-1", businessDate: TODAY, reason: "Elsewhere" },
      reversalTarget: { journalId: "e".repeat(24), sourceType: "cash_receipt", number: "R-000001", businessDate: daysAgo(3), totalKobo: 5000 },
      summary: { operation: "reversal", amountKobo: 5000, businessDate: TODAY, method: null, fromAccountName: null, toAccountName: null, categoryName: null },
    });
    const event = new Event("storage") as StorageEvent;
    Object.defineProperty(event, "key", { value: ledgerPostingIntentKey("org1") });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(await screen.findByText("Check the journal entries before posting this")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount")).toHaveValue("2,000");
    expect(screen.getByRole("button", { name: "Review and allocate" })).toBeDisabled();
    expect(allocationPosts()).toHaveLength(0);
  });
});

describe("organisation isolation", () => {
  it("keeps one organisation's pending allocation out of another and posts to the one on screen", async () => {
    api.post.mockRejectedValueOnce({ message: "Network Error" });
    const view = render(panel());
    await openForm();
    await fillAmount("2000");
    review();
    await confirmInDialog("Allocate");
    expect(await screen.findByText("A financial posting is unconfirmed")).toBeInTheDocument();

    view.unmount();
    setPermissions(["finance.view", "finance.manage"], "org2");
    render(panel({ organisationId: "org2" }));
    expect(await screen.findByRole("button", { name: "Allocate from M-000012" })).toBeInTheDocument();
    expect(screen.queryByText("A financial posting is unconfirmed")).not.toBeInTheDocument();
    await openForm();
    await fillAmount("1000");
    review();
    await confirmInDialog("Allocate");
    await waitFor(() => expect(allocationPosts()).toHaveLength(2));
    expect(allocationPosts()[1][0]).toBe("/finance/org2/ledger/allocations");
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
  });
});

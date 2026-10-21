import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { confirmInDialog, render, selectTab } from "test-utils/render";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import { MemoryRouter } from "react-router-dom";
import BooksTab from "components/finance/BooksTab";

import { todayInLagos } from "helpers/openingBalances";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";
import {
  MEMBER_ADA,
  OBLIGATION_DUES,
  REVERSAL_R1,
  SOURCE_M12,
  allocationJournal,
  knownPosition,
  positionsReport,
  sourcesReport,
  summaryReport,
} from "test-utils/ledgerF3Fixtures";

/** Where Books opens; a test points it at the screen it covers. */
let booksUrl = "/finance?tab=books";
const openBooksAt = (books: string, org = "org1") => {
  booksUrl = `/finance?tab=books&books=${books}&org=${org}`;
};
beforeEach(() => {
  booksUrl = "/finance?tab=books";
});

/**
 * F3 across Books with the F3 gates (and Reversals) switched on in this file
 * only: a suggestion starts an allocation, the receipt opens the history, the
 * history opens the entry, and the allocation is reversed. Every request is
 * mocked; the real gates stay off (asserted in BooksTab.test.tsx and the F3
 * helper tests).
 */

jest.mock("config/ledgerReversals", () => ({ LEDGER_REVERSALS_UI_ENABLED: true }));
jest.mock("config/ledgerF3Reconciliation", () => ({ LEDGER_F3_RECONCILIATION_UI_ENABLED: true }));
jest.mock("config/ledgerF3Allocations", () => ({ LEDGER_F3_ALLOCATION_UI_ENABLED: true }));
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
const ALLOCATION_ID = "0000000000000000000000a9";

const STATUS = {
  state: "active",
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: true,
  blockers: [],
  openingDate: daysAgo(30),
  lockedThrough: null,
  memberReceiptsEnabled: true,
  allocationsEnabled: true,
  revision: 7,
  pendingProposal: null,
  unconfirmedAttempts: 0,
  contractVersion: "f2-0.3",
  gapWindowAttestedAt: null,
};

const account = (id: string, cls: string, subtype: string | null) => ({
  id,
  name: id,
  class: cls,
  subtype,
  currency: "NGN",
  active: true,
  revision: 0,
  openingVerified: cls === "asset" ? true : null,
});
const ACCOUNTS = [
  account("0000000000000000000000c0", "asset", "cash"),
  account("0000000000000000000000c1", "liability", "member_receipts_unallocated"),
  account("0000000000000000000000c2", "income", "member_dues_income"),
  account("0000000000000000000000c3", "income", "member_levy_income"),
];

const OBLIGATIONS = [{ id: OBLIGATION_DUES, type: "dues", name: "Dues", year: 2026, amountPerMonth: 1000 }];
const COMPLIANCE = { obligation: OBLIGATIONS[0], summary: {}, rows: [{ memberId: MEMBER_ADA, name: "Ada Obi", accountable: true }] };

const memberMoney = {
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
};

let posted: Record<string, unknown> | null;
let reversed = false;

const postedJournal = () =>
  allocationJournal(
    { id: ALLOCATION_ID, businessDate: TODAY, totalKobo: posted?.amountKobo ?? 200000, reversedByJournalId: reversed ? REVERSAL_R1 : null },
    { memberId: MEMBER_ADA, obligationId: OBLIGATION_DUES },
  );

const serve = () =>
  api.get.mockImplementation((url: string) => {
    const path = url.split("?")[0];
    const reply = (body: unknown) => Promise.resolve({ data: { data: body } });
    if (path.endsWith("/ledger/status")) return reply(STATUS);
    if (path.endsWith("/ledger/accounts")) return reply(ACCOUNTS);
    if (path.endsWith("/ledger/journals")) return reply(posted ? [postedJournal()] : []);
    if (path.endsWith(`/ledger/journals/${ALLOCATION_ID}`)) return reply(postedJournal());
    if (path.endsWith("/ledger/member-money")) return reply({ items: [memberMoney], nextCursor: null });
    if (path.endsWith("/ledger/attempts")) return reply({ items: [], nextCursor: null });
    if (path.endsWith("/obligations")) return reply(OBLIGATIONS);
    if (path.endsWith("/compliance")) return reply(COMPLIANCE);
    if (path.endsWith("/reconciliation/positions")) return reply(positionsReport([knownPosition()]));
    if (path.endsWith("/reconciliation/sources")) return reply(sourcesReport());
    if (path.endsWith("/reconciliation/summary")) return reply(summaryReport());
    if (path.endsWith("/ledger/allocations")) {
      return reply({
        readAt: "2026-11-14T10:00:00.000Z",
        items: posted
          ? [
              {
                journal: postedJournal(),
                state: reversed ? "reversed" : "live",
                reversal: reversed ? { journalId: REVERSAL_R1, businessDate: TODAY, postedAt: null } : null,
              },
            ]
          : [],
        nextCursor: null,
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  posted = null;
  reversed = false;
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions: ["finance.view", "finance.manage"] },
  });
  serve();
  api.post.mockImplementation((url: string, body: Record<string, unknown>) => {
    if (url.endsWith("/ledger/allocations")) {
      posted = body;
      return Promise.resolve({ status: 201, data: { data: { journal: postedJournal(), replayed: false } } });
    }
    if (url.endsWith(`/journals/${ALLOCATION_ID}/reversal`)) {
      reversed = true;
      return Promise.resolve({
        status: 201,
        data: {
          data: {
            journal: {
              id: REVERSAL_R1,
              businessDate: body.businessDate,
              reference: null,
              note: body.reason,
              sourceType: "reversal",
              lines: [
                { accountId: "0000000000000000000000c2", side: "debit", amountKobo: 200000 },
                { accountId: "0000000000000000000000c1", side: "credit", amountKobo: 200000 },
              ],
              totalKobo: 200000,
              postedAt: `${TODAY}T10:00:00.000Z`,
              postedBy: { id: "officer-1", name: "Treasurer" },
              sourceId: ALLOCATION_ID,
              reversesJournalId: ALLOCATION_ID,
              reversedByJournalId: null,
              entry: null,
            },
            replayed: false,
          },
        },
      });
    }
    return Promise.reject(new Error(`unexpected POST ${url}`));
  });
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

const region = (name: string) => within(screen.getByRole("region", { name }));

it("runs the whole officer workflow across Books", async () => {
  openBooksAt("manage-reconciliation");
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId="org1" /></MemoryRouter>
    </QueryClientProvider>,
  );

  // 1. A current suggestion starts the allocation, already pointed at Ada's dues.
  await screen.findByRole("region", { name: "Member money reconciliation" });
  await selectTab(region("Member money reconciliation").getByRole("tab", { name: "Unallocated money" }));
  fireEvent.click(await region("Member money reconciliation").findByRole("button", { name: "Start allocation" }));
  const allocate = () => region("Allocate member money");
  expect(await allocate().findByText(/At most ₦5,000 can be allocated here/)).toBeInTheDocument();

  // 2. Amount, review, final confirmation, one request.
  fireEvent.change(allocate().getByLabelText("Amount"), { target: { value: "2000" } });
  fireEvent.click(allocate().getByRole("button", { name: "Review and allocate" }));
  await confirmInDialog("Allocate");
  expect(await allocate().findByText("Journal number: A-000001")).toBeInTheDocument();
  expect(posted).toMatchObject({ sourceId: SOURCE_M12, memberId: MEMBER_ADA, obligationId: OBLIGATION_DUES, amountKobo: 200000 });

  // 3. The receipt opens the allocation in the history, filtered to its source.
  fireEvent.click(allocate().getByRole("button", { name: "View in allocation history" }));
  const history = await region("Member money reconciliation").findByRole("list", { name: "Allocations" });
  expect(within(history).getByText("Just posted")).toBeInTheDocument();
  expect(region("Member money reconciliation").getByText("Source M-000012")).toBeInTheDocument();
  await waitFor(() =>
    expect(api.get.mock.calls.some(([url]) => String(url).includes(`/ledger/allocations?sourceId=${SOURCE_M12}`))).toBe(true),
  );

  // 4. Details open in Reversals, which offers the allocation's reversal.
  fireEvent.click(within(history).getByRole("button", { name: "Details of allocation A-000001" }));
  const reversals = () => region("Reversals");
  fireEvent.click(await reversals().findByRole("button", { name: "Reverse this entry" }));
  fireEvent.change(reversals().getByLabelText("Reason (required)"), { target: { value: "Wrong member" } });
  fireEvent.click(reversals().getByRole("button", { name: "Review reversal" }));
  await confirmInDialog("Reverse entry");
  await waitFor(() =>
    expect(api.post.mock.calls.some(([url]) => String(url).endsWith(`/journals/${ALLOCATION_ID}/reversal`))).toBe(true),
  );

  // 5. The ledger refresh shows it reversed in the history; nothing was deleted.
  // Back from the entry to the reconciliation it was opened from.
  fireEvent.click(screen.getByRole("button", { name: "Transactions" }));
  expect(await within(await region("Member money reconciliation").findByRole("list", { name: "Allocations" })).findByText("Reversed")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledTimes(2);
});

it("offers no allocation start from the reports to a finance viewer", async () => {
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-2" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions: ["finance.view"] },
  });
  openBooksAt("manage-reconciliation");
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId="org1" /></MemoryRouter>
    </QueryClientProvider>,
  );
  await screen.findByText("Member money reconciliation");
  await selectTab(region("Member money reconciliation").getByRole("tab", { name: "Unallocated money" }));
  expect(await region("Member money reconciliation").findByText("Suggestions from current Finance values")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Start allocation" })).not.toBeInTheDocument();
  expect(screen.getByText(/Only officers with permission to manage finance can allocate/)).toBeInTheDocument();
});

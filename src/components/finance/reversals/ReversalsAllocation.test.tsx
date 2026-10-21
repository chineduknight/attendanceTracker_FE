import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { confirmInDialog, render } from "test-utils/render";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import ReversalsPanel from "components/finance/reversals/ReversalsPanel";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import { readLedgerPostingIntents } from "helpers/ledgerPostingIntent";
import { todayInLagos } from "helpers/openingBalances";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";
import { ALLOCATION_A1, REVERSAL_R1, allocationJournal } from "test-utils/ledgerF3Fixtures";

/** F3C allocation reversal through the F2B-3 reversal route and intent. */

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

const ACCOUNTS: LedgerAccount[] = [];

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

let original: Record<string, unknown>;

const reversalOf = () => ({
  id: REVERSAL_R1,
  businessDate: TODAY,
  reference: null,
  note: "Wrong member",
  sourceType: "reversal",
  lines: [
    { accountId: "0000000000000000000000c2", side: "debit", amountKobo: 200000 },
    { accountId: "0000000000000000000000c1", side: "credit", amountKobo: 200000 },
  ],
  totalKobo: 200000,
  postedAt: `${TODAY}T10:00:00.000Z`,
  postedBy: { id: "officer-1", name: "Treasurer" },
  sourceId: ALLOCATION_A1,
  reversesJournalId: ALLOCATION_A1,
  reversedByJournalId: null,
  entry: null,
});

const panel = (props: Partial<ComponentProps<typeof ReversalsPanel>> = {}) => (
  <QueryClientProvider client={queryClient}>
    <ReversalsPanel
      organisationId="org1"
      status={statusOf()}
      accounts={ACCOUNTS}
      openJournalId={ALLOCATION_A1}
      onOpenJournal={() => undefined}
      onCloseJournal={() => undefined}
      enabled
      cashbookEnabled={false}
      memberMoneyEnabled={false}
      allocationsEnabled
      {...props}
    />
  </QueryClientProvider>
);

const reversalPosts = () => api.post.mock.calls.filter(([url]) => String(url).includes("/reversal"));

const reverse = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Reverse this entry" }));
  fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: " Wrong member " } });
  fireEvent.click(screen.getByRole("button", { name: "Review reversal" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Reverse Allocation A-000001?")).toBeInTheDocument();
  await confirmInDialog("Reverse entry");
};

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions: ["finance.view", "finance.manage"] },
  });
  original = allocationJournal({ businessDate: daysAgo(3) });
  api.get.mockImplementation((url: string) =>
    url.endsWith(`/ledger/journals/${ALLOCATION_A1}`)
      ? Promise.resolve({ data: { data: original } })
      : Promise.reject(new Error(`unexpected GET ${url}`)),
  );
  api.post.mockResolvedValue({ status: 201, data: { data: { journal: reversalOf(), replayed: false } } });
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("allocation reversal", () => {
  it("isn't offered with the F3 allocation gate off (F2B-3 unchanged)", async () => {
    render(panel({ allocationsEnabled: false }));
    expect(
      await screen.findByText("Only money in, money out, transfer, member money in and member money refund entries can be reversed here."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();
  });

  it("shows the allocation as such in its details", async () => {
    render(panel());
    expect(await screen.findByText("Allocation A-000001")).toBeInTheDocument();
    expect(screen.getByText("Allocated from: M-000012")).toBeInTheDocument();
    expect(screen.getByText("Recognised as: member dues income")).toBeInTheDocument();
  });

  it("reverses through the F2B-3 route with exactly three fields and refreshes the ledger", async () => {
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");
    render(panel());
    expect(await screen.findByText(/moves the amount out of member dues or levy income/)).toBeInTheDocument();
    await reverse();
    await waitFor(() => expect(reversalPosts()).toHaveLength(1));
    const [url, body] = reversalPosts()[0];
    expect(url).toBe(`/finance/org1/ledger/journals/${ALLOCATION_A1}/reversal`);
    expect(body).toEqual({ idempotencyKey: expect.any(String), businessDate: TODAY, reason: "Wrong member" });
    await waitFor(() => expect(readLedgerPostingIntents("org1").kind).toBe("none"));
    // Sources, positions, reconciliation and reports all sit under the root.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
    invalidate.mockRestore();
  });

  it("stays available after allocations and member receipts are turned off", async () => {
    render(panel({ status: statusOf({ allocationsEnabled: false, memberReceiptsEnabled: false }) }));
    expect(await screen.findByRole("button", { name: "Reverse this entry" })).toBeInTheDocument();
  });

  it("is never offered for an allocation already reversed", async () => {
    original = allocationJournal({ businessDate: daysAgo(3), reversedByJournalId: REVERSAL_R1 });
    render(panel());
    expect(await screen.findByText(/already been reversed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();
  });

  it("shows the server's double-reversal refusal and writes nothing", async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { error: "This journal is already reversed.", code: "LEDGER_ALREADY_REVERSED" } } });
    render(panel());
    await reverse();
    expect(await screen.findByText("This journal is already reversed.")).toBeInTheDocument();
    expect(readLedgerPostingIntents("org1").kind).toBe("none");
  });
});

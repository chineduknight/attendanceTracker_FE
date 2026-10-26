import { ReactElement, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { format, parseISO, subDays } from "date-fns";
import { chooseOption, generatedCss, render } from "test-utils/render";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import PostingSheet from "components/finance/books/PostingSheet";
import { BooksSheet } from "helpers/booksNavigation";
import {
  beginLedgerPostingIntent,
  clearLedgerPostingIntent,
  ledgerPostingIntentKey,
  markLedgerPostingIntentUnresolved,
} from "helpers/ledgerPostingIntent";
import { todayInLagos } from "helpers/openingBalances";
import { useCashbookPostings } from "hooks/useCashbookPostings";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

jest.mock("react-toastify", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post", jest.Mock>;

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

const ACCOUNTS = [
  account({}),
  account({ id: "income", name: "Donations", class: "income", subtype: null, openingVerified: null }),
];

const STATUS: LedgerStatus = {
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
  allocationsEnabled: false,
};

const success = {
  status: 201,
  data: {
    data: {
      replayed: false,
      journal: {
        id: "journal-1",
        businessDate: TODAY,
        reference: null,
        note: null,
        sourceType: "cash_receipt",
        totalKobo: 2500000,
        postedAt: `${TODAY}T10:00:00.000Z`,
        postedBy: { id: "officer-1", name: "treasurer" },
        sourceId: null,
        entry: { number: "R-000001", method: "cash", counterpartyName: null },
        lines: [],
      },
    },
  },
};

/** Books' shell in miniature: it owns the workflow, the sheet comes and goes. */
const Harness = ({ initial, onForMember }: { initial: BooksSheet | null; onForMember?: () => void }) => {
  const [sheet, setSheet] = useState<BooksSheet | null>(initial);
  const postings = useCashbookPostings({ organisationId: "org1", status: STATUS, accounts: ACCOUNTS });
  return (
    <>
      <PostingSheet
        sheet={sheet}
        postings={postings}
        shownSections={["cashbook"]}
        isRechecking={false}
        onClose={() => setSheet(null)}
        onForMember={onForMember}
      />
      {/* The browser's Back: the URL drops the sheet without the sheet's own Close. */}
      <button onClick={() => setSheet(null)}>browser back</button>
      <button onClick={() => setSheet("money-in")}>reopen money in</button>
      <p>{postings.workflow.success ? `recorded ${postings.workflow.success.result.journal.number}` : "nothing recorded"}</p>
    </>
  );
};

const renderSheet = (ui: ReactElement) =>
  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

/** Taps one of the account cards in the named group, inside `container` when given. */
const pickAccount = (group: string, name: string, container?: HTMLElement) => {
  const cards = container
    ? within(container).getByRole("radiogroup", { name: group })
    : screen.getByRole("radiogroup", { name: group });
  fireEvent.click(within(cards).getByRole("radio", { name: new RegExp(name) }));
};

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions: ["finance.view", "finance.manage"] },
  });
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

it("opens Money in on the receipt form", async () => {
  renderSheet(<Harness initial="money-in" />);
  expect(await screen.findByRole("dialog", { name: "Money in" })).toBeInTheDocument();
  expect(screen.getByLabelText("Amount")).toBeInTheDocument();
});

it("keeps a save that is in flight when the sheet closes, and reports its receipt", async () => {
  let resolve: (value: unknown) => void = () => {};
  api.post.mockImplementation(() => new Promise((done) => (resolve = done)));
  renderSheet(<Harness initial="money-in" />);
  await screen.findByRole("dialog", { name: "Money in" });

  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "25000" } });
  pickAccount("Into", "Cash in hand");
  await chooseOption(screen.getByLabelText("Category"), "Donations");
  fireEvent.change(screen.getByLabelText("Description (required)"), {
    target: { value: "Donation towards choir anniversary" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Record money in" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  resolve(success);
  expect(await screen.findByText("recorded R-000001")).toBeInTheDocument();
  expect(api.post).toHaveBeenCalledTimes(1);
});

it("shows the pending posting's retry instead of a new form", async () => {
  const claim = await beginLedgerPostingIntent({
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
  if (claim.kind !== "claimed") throw new Error("seed failed");
  await markLedgerPostingIntentUnresolved(claim.record, { ambiguous: true, message: "Unknown." });

  renderSheet(<Harness initial="money-in" />);
  await screen.findByRole("dialog", { name: "Money in" });
  expect(await screen.findByRole("button", { name: "Retry this posting" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Amount")).not.toBeInTheDocument();
});

/** Another tab or section changed this organisation's posting record. */
const externalPostingChange = () =>
  window.dispatchEvent(new StorageEvent("storage", { key: ledgerPostingIntentKey("org1") }));

const seedUnresolved = async () => {
  const claim = await beginLedgerPostingIntent({
    organisationId: "org1",
    officerId: "officer-1",
    key: "key-87654321",
    operation: "receipt",
    body: {
      idempotencyKey: "key-87654321",
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
  if (claim.kind !== "claimed") throw new Error("seed failed");
  await markLedgerPostingIntentUnresolved(claim.record, { ambiguous: true, message: "Unknown." });
};

it("starts a fresh form after Back, even when another posting changed meanwhile", async () => {
  renderSheet(<Harness initial="money-in" />);
  await screen.findByRole("dialog", { name: "Money in" });
  fireEvent.click(screen.getByRole("button", { name: "browser back", hidden: true }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  externalPostingChange();
  fireEvent.click(screen.getByRole("button", { name: "reopen money in" }));
  await screen.findByRole("dialog", { name: "Money in" });
  expect(screen.getByLabelText("Amount")).toBeEnabled();
  expect(screen.queryByRole("button", { name: /Start a new posting/ })).not.toBeInTheDocument();
});

it("opens the form once a pending posting clears while the sheet is open", async () => {
  await seedUnresolved();
  renderSheet(<Harness initial="money-in" />);
  expect(await screen.findByRole("button", { name: "Retry this posting" })).toBeInTheDocument();

  await clearLedgerPostingIntent("org1", "key-87654321");
  externalPostingChange();
  expect(await screen.findByLabelText("Amount")).toBeEnabled();
});

it("gives the Income / For a member switch phone-sized targets", async () => {
  renderSheet(<Harness initial="money-in" onForMember={() => undefined} />);
  const forMember = await screen.findByRole("button", { name: "For a member" });
  expect(generatedCss(forMember)).toMatch(/min-height:\s*44px/);
});

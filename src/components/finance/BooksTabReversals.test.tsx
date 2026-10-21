import { fireEvent, screen, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { installPostingLockManager, removePostingLockManager } from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import { MemoryRouter } from "react-router-dom";
import BooksTab from "components/finance/BooksTab";

import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

/** Where Books opens; a test points it at the screen it covers. */
let booksUrl = "/finance?tab=books";
const openBooksAt = (books: string, org = "org1") => {
  booksUrl = `/finance?tab=books&books=${books}&org=${org}`;
};
beforeEach(() => {
  booksUrl = "/finance?tab=books";
});

// Wiring only: the real gate stays off (BooksTab.test.tsx asserts it).
jest.mock("config/ledgerReversals", () => ({ LEDGER_REVERSALS_UI_ENABLED: true }));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post", jest.Mock>;

const JOURNAL_ID = "a".repeat(24);
const JOURNAL = {
  id: JOURNAL_ID,
  businessDate: "2026-10-12",
  reference: "RCPT-001",
  note: null,
  sourceType: "cash_receipt",
  lines: [
    { accountId: "cash", side: "debit", amountKobo: 125000 },
    { accountId: "income", side: "credit", amountKobo: 125000 },
  ],
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
  api.get.mockImplementation((url: string) => {
    if (url.endsWith("/ledger/status")) {
      return Promise.resolve({
        data: {
          data: {
            state: "suspended",
            currency: "NGN",
            openingBalancesVerified: true,
            postingEnabled: false,
            blockers: [],
            openingDate: "2026-10-01",
            lockedThrough: null,
            unconfirmedAttempts: 0,
            contractVersion: "f2-0.3",
          },
        },
      });
    }
    if (url.endsWith("/ledger/accounts")) return Promise.resolve({ data: { data: [] } });
    if (url.includes("/ledger/journals?")) {
      return Promise.resolve({
        data: { data: { items: [{ ...JOURNAL, totalKobo: 125000, entry: null }], nextCursor: null } },
      });
    }
    if (url.includes("/ledger/attempts")) return Promise.resolve({ data: { data: { items: [], nextCursor: null } } });
    if (url.endsWith(`/ledger/journals/${JOURNAL_ID}`)) {
      return Promise.resolve({
        data: {
          data: {
            ...JOURNAL,
            totalKobo: 125000,
            reversesJournalId: null,
            reversedByJournalId: null,
            entry: { number: "R-000001", method: "cash" },
          },
        },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

it("opens a journal's details from the list and keeps attempts resolvable while suspended", async () => {
  openBooksAt("manage-attempts");
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId="org1" /></MemoryRouter>
    </QueryClientProvider>,
  );
  // Resolving does not depend on posting readiness: the list is read even
  // though bookkeeping is suspended.
  const attempts = await screen.findByRole("region", { name: "Unconfirmed attempts" });
  expect(await within(attempts).findByText("No unconfirmed attempts")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Manage Books" }));
  fireEvent.click(await screen.findByRole("button", { name: "Books" }));
  fireEvent.click(await screen.findByRole("button", { name: "See all" }));
  fireEvent.click(await screen.findByRole("button", { name: /^Money in: .*12 Oct 2026/ }));
  const reversals = await screen.findByRole("region", { name: "Reversals" });
  expect(await within(reversals).findByText("Money in R-000001")).toBeInTheDocument();
  expect(within(reversals).getByRole("heading", { name: "Entry details" })).toHaveFocus();
  expect(within(reversals).getByText(/Bookkeeping is suspended/)).toBeInTheDocument();
  expect(within(reversals).queryByRole("button", { name: "Reverse this entry" })).not.toBeInTheDocument();

  fireEvent.click(within(reversals).getByRole("button", { name: "Close details" }));
  expect(within(reversals).queryByText("Money in R-000001")).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

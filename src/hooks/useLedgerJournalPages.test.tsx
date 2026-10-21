import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { EMPTY_JOURNAL_FILTERS, JournalFilters } from "helpers/booksTransactions";
import { useLedgerJournalPages } from "hooks/useLedgerJournalPages";

jest.mock("services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as { get: jest.Mock };

const item = (id: string) => ({
  id,
  businessDate: "2026-10-21",
  reference: null,
  note: null,
  sourceType: "cash_expense",
  lines: [
    { accountId: "ops", side: "debit", amountKobo: 100 },
    { accountId: "cash", side: "credit", amountKobo: 100 },
  ],
  totalKobo: 100,
  postedAt: "2026-10-21T10:00:00.000Z",
  postedBy: null,
  sourceId: null,
  reversesJournalId: null,
  reversedByJournalId: null,
  entry: null,
});

const page = (ids: string[], nextCursor: string | null) =>
  Promise.resolve({ data: { data: { items: ids.map(item), nextCursor } } });

const Probe = ({ filters }: { filters: JournalFilters }) => {
  const pages = useLedgerJournalPages("o1", filters, true);
  return (
    <div>
      <p>{pages.items ? `rows:${pages.items.length}` : "loading"}</p>
      <p>{pages.hasMore ? "more" : "end"}</p>
      <button onClick={pages.loadMore}>load more</button>
    </div>
  );
};

const renderProbe = (filters: JournalFilters) =>
  render(
    <QueryClientProvider client={queryClient}>
      <Probe filters={filters} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  queryClient.clear();
  api.get.mockReset();
});

it("sends every filter to the server and pages with the cursor", async () => {
  api.get.mockImplementationOnce(() => page(["a"], "c1")).mockImplementationOnce(() => page(["b"], null));
  renderProbe({ sourceType: "cash_expense", accountId: "a1", from: "2026-10-01", to: "" });

  expect(await screen.findByText("rows:1")).toBeInTheDocument();
  const first = api.get.mock.calls[0][0] as string;
  expect(first).toContain("/finance/o1/ledger/journals?");
  expect(first).toContain("pagination=cursor");
  expect(first).toContain("sourceType=cash_expense");
  expect(first).toContain("accountId=a1");
  expect(first).toContain("from=2026-10-01");
  expect(first).not.toContain("to=");
  expect(screen.getByText("more")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "load more" }));
  expect(await screen.findByText("rows:2")).toBeInTheDocument();
  expect(api.get.mock.calls[1][0]).toContain("cursor=c1");
  expect(screen.getByText("end")).toBeInTheDocument();
});

it("says there is no more only when the server's cursor is null", async () => {
  api.get.mockImplementationOnce(() => page(["a"], null));
  renderProbe(EMPTY_JOURNAL_FILTERS);
  expect(await screen.findByText("rows:1")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("end")).toBeInTheDocument());
});

it("keys each organisation and filter set apart", () => {
  expect(queryKeys.finance.ledger.journalPages("o1", EMPTY_JOURNAL_FILTERS, 50)).not.toEqual(
    queryKeys.finance.ledger.journalPages("o2", EMPTY_JOURNAL_FILTERS, 50),
  );
  expect(queryKeys.finance.ledger.journalPages("o1", EMPTY_JOURNAL_FILTERS, 50).slice(0, 4)).toEqual(
    queryKeys.finance.ledger.journals("o1"),
  );
});

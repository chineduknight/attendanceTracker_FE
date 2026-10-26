import { screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { todayInLagos } from "helpers/openingBalances";
import { LedgerAccount } from "components/finance/ledgerTypes";
import BalanceTiles from "components/finance/books/BalanceTiles";

jest.mock("services/api", () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})) } }));

const money = (id: string, name: string, subtype: "cash" | "bank"): LedgerAccount => ({
  id,
  name,
  class: "asset",
  subtype,
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: true,
});

const ACCOUNTS = [money("cash", "Cash in hand", "cash"), money("bank", "Main bank", "bank")];

const seed = (accounts: { accountId: string; balanceKobo: number | null }[], moneyTotalKobo: number | null) =>
  queryClient.setQueryData(queryKeys.finance.ledger.balances("o1", todayInLagos()), {
    data: {
      asOf: todayInLagos(),
      accounts: accounts.map((entry) => ({
        ...entry,
        balanceState: entry.balanceKobo === null ? "unknown" : "known",
      })),
      moneyTotalKobo,
    },
  });

const renderTiles = (accounts: LedgerAccount[] | null = ACCOUNTS) =>
  render(
    <QueryClientProvider client={queryClient}>
      <BalanceTiles
        organisationId="o1"
        accounts={accounts}
        accountsError={accounts ? null : { response: { status: 500, data: { error: "Accounts down" } } }}
        onRetryAccounts={() => undefined}
        enabled
        memberReceiptsOn={false}
        onOpenHeld={() => {}}
      />
    </QueryClientProvider>,
  );

beforeEach(() => queryClient.clear());

it("shows an unknown balance as Unknown, never ₦0", () => {
  seed(
    [
      { accountId: "cash", balanceKobo: null },
      { accountId: "bank", balanceKobo: 9500000 },
    ],
    null,
  );
  renderTiles();
  expect(screen.getByRole("group", { name: "Cash in hand" })).toHaveTextContent("Unknown");
  expect(screen.queryByText("₦0")).not.toBeInTheDocument();
  expect(screen.getByText("Total unknown until every account's opening is verified")).toBeInTheDocument();
});

it("shows the server's total exactly as sent", () => {
  seed(
    [
      { accountId: "cash", balanceKobo: 7300000 },
      { accountId: "bank", balanceKobo: 9500000 },
    ],
    17000000,
  );
  renderTiles();
  expect(screen.getByRole("group", { name: "Cash in hand" })).toHaveTextContent("₦73,000");
  expect(screen.getByRole("group", { name: "Main bank" })).toHaveTextContent("₦95,000");
  expect(screen.getByText("₦170,000")).toBeInTheDocument();
});

it("never says there is no cash or bank account when the accounts failed to load", () => {
  seed([{ accountId: "cash", balanceKobo: 7300000 }], 7300000);
  renderTiles(null);
  expect(screen.getByText("Couldn't load accounts")).toBeInTheDocument();
  expect(screen.getByText("Accounts down")).toBeInTheDocument();
  expect(screen.queryByText("No cash or bank account yet")).not.toBeInTheDocument();
});

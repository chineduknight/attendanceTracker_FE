import { screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { MemoryRouter } from "react-router-dom";
import BooksTab from "components/finance/BooksTab";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

/** Where Books opens; a test points it at the screen it covers. */
let booksUrl = "/finance?tab=books";
const openBooksAt = (books: string, org = "org1") => {
  booksUrl = `/finance?tab=books&books=${books}&org=${org}`;
};
beforeEach(() => {
  booksUrl = "/finance?tab=books";
});

beforeEach(() => openBooksAt("reports"));

// Wiring only: BooksTab.test.tsx asserts the shipped gates. The lifecycle
// and opening panels repeat the state label, so they stay out of this file.
jest.mock("config/ledgerReports", () => ({ LEDGER_REPORTS_UI_ENABLED: true }));
jest.mock("config/ledgerLifecycle", () => ({ LEDGER_LIFECYCLE_UI_ENABLED: false }));
jest.mock("config/ledgerOpeningBalances", () => ({ LEDGER_OPENING_BALANCES_UI_ENABLED: false }));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const BANK_ID = "b".repeat(24);
const BANK = { id: BANK_ID, name: "Bank account", class: "asset", subtype: "bank", currency: "NGN", active: true, openingVerified: true };

const status = (state: string, extra: Record<string, unknown> = {}) => ({
  state,
  currency: "NGN",
  openingBalancesVerified: state === "active" || state === "suspended",
  postingEnabled: false,
  blockers: ["LEDGER_WRITES_DISABLED"],
  openingDate: "2026-09-01",
  lockedThrough: null,
  unconfirmedAttempts: 0,
  contractVersion: "f2-0.3",
  ...extra,
});

const serve = (ledgerStatus: unknown, balanceState: "known" | "unknown" = "known") =>
  api.get.mockImplementation((url: string) => {
    if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: ledgerStatus } });
    if (url.endsWith("/ledger/accounts")) return Promise.resolve({ data: { data: [BANK] } });
    if (url.endsWith("/ledger/journals")) return Promise.resolve({ data: { data: [] } });
    if (url.includes("/cashbook")) {
      return Promise.resolve({
        data: {
          data: {
            account: BANK,
            balanceState,
            balanceBeforeKobo: balanceState === "known" ? 1200000 : null,
            items: [],
            dayClosings: [],
            nextCursor: null,
          },
        },
      });
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

const setSession = (permissions: PermissionKey[]) =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions },
  });

const renderBooks = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId="org1" /></MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  setSession(["finance.view"]);
});

afterAll(() => {
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("<BooksTab> with the F2B-4 reports gate on", () => {
  it("reads history while bookkeeping is suspended and posting is disabled", async () => {
    serve(status("suspended"));
    renderBooks();

    expect(await screen.findByRole("region", { name: "Reports" })).toBeInTheDocument();
    expect(await screen.findByText("₦12,000")).toBeInTheDocument();
    expect(screen.getAllByText("Suspended").length).toBeGreaterThan(0);
    // The other Books screens are still there.
    expect(screen.getByRole("heading", { name: "Transactions", hidden: true })).toBeInTheDocument();
    for (const method of ["post", "put", "patch", "delete"] as const) {
      expect(api[method]).not.toHaveBeenCalled();
    }
  });

  it("shows the server's unknown balance before the books are active, never ₦0", async () => {
    serve(status("setup", { openingDate: null }), "unknown");
    renderBooks();

    expect(await screen.findByText("Balance unknown")).toBeInTheDocument();
    expect(screen.queryByText(/₦0/)).not.toBeInTheDocument();
  });

  it("is hidden, and reads nothing, for an officer without finance.view", async () => {
    setSession([]);
    serve(status("active"));
    renderBooks();

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reports" })).not.toBeInTheDocument();
    expect(api.get.mock.calls.some(([url]) => String(url).includes("/cashbook"))).toBe(false);
  });
});

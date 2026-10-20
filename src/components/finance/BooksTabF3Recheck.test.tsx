import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import BooksTab from "components/finance/BooksTab";
import { markLedgerWriteUncertain } from "helpers/ledgerWriteUncertainty";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

/**
 * Review of FE #140: "I've checked the ledger" after an unresolved F3A write
 * unlocks only after BooksTab reloaded a usable status and account list. An
 * HTTP 200 carrying a body this build cannot read is not a recheck.
 */

// Wiring only: the real gates stay off (BooksTab.test.tsx asserts them).
jest.mock("config/ledgerSetup", () => ({ LEDGER_SETUP_UI_ENABLED: true }));
jest.mock("config/ledgerF3Setup", () => ({ LEDGER_F3_SETUP_UI_ENABLED: true }));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const STATUS = {
  state: "active",
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: false,
  blockers: ["LEDGER_WRITES_DISABLED"],
  openingDate: "2026-09-01",
  lockedThrough: null,
  memberReceiptsEnabled: true,
  allocationsEnabled: false,
  revision: 4,
  pendingProposal: null,
  unconfirmedAttempts: 0,
  contractVersion: "f2-0.3",
};
const ACCOUNTS = [
  { id: "cash", name: "Cash in hand", class: "asset", subtype: "cash", currency: "NGN", active: true, revision: 0, openingVerified: true },
];

const serve = (status: unknown, accounts: unknown) =>
  api.get.mockImplementation((url: string) => {
    if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: status } });
    if (url.endsWith("/ledger/accounts")) return Promise.resolve({ data: { data: accounts } });
    if (url.endsWith("/ledger/journals")) return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });

const renderBooks = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <BooksTab organisationId="org1" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner: false, permissions: ["finance.manage"] },
  });
});

afterAll(() => {
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

const recheck = async () => {
  const callsBefore = api.get.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
  await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 2));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  // Let the recheck promise settle and the notice re-render.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("F3A recheck before acknowledgement", () => {
  it.each([
    ["a malformed account list", STATUS, { accounts: "not a list" }],
    ["a status without the allocations setting", { ...STATUS, allocationsEnabled: undefined }, ACCOUNTS],
    ["a status without a revision", { ...STATUS, revision: undefined }, ACCOUNTS],
  ])("keeps acknowledgement locked after a 200 with %s", async (_label, status, accounts) => {
    markLedgerWriteUncertain("org1", "member-allocations");
    serve(STATUS, ACCOUNTS);
    renderBooks();
    const acknowledge = await screen.findByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();

    serve(status, accounts);
    await recheck();
    expect(screen.getByRole("button", { name: "I've checked the ledger" })).toBeDisabled();

    // A usable reload is what unlocks it.
    serve(STATUS, ACCOUNTS);
    await recheck();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "I've checked the ledger" })).toBeEnabled(),
    );
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("keeps acknowledgement locked when the reload fails", async () => {
    markLedgerWriteUncertain("org1", "member-allocations");
    serve(STATUS, ACCOUNTS);
    renderBooks();
    await screen.findByRole("button", { name: "I've checked the ledger" });

    api.get.mockImplementation((url: string) =>
      url.endsWith("/ledger/accounts")
        ? Promise.reject({ response: { status: 500, data: { error: "Server error" } } })
        : Promise.resolve({ data: { data: url.endsWith("/ledger/status") ? STATUS : [] } }),
    );
    await recheck();
    expect(screen.getByRole("button", { name: "I've checked the ledger" })).toBeDisabled();
  });
});

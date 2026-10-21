import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { MemoryRouter } from "react-router-dom";
import BooksTab from "components/finance/BooksTab";

import { LEDGER_UNAVAILABLE_TITLE } from "helpers/ledger";
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

/**
 * Books with the shipped setup gates on (`LEDGER_SETUP_UI_ENABLED`,
 * `LEDGER_F3_SETUP_UI_ENABLED`): the managed chart replaces the plain account
 * list, and rendering it never writes. BooksTab.test.tsx covers the gates off.
 */

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const F2 = {
  currency: "NGN",
  postingEnabled: false,
  blockers: [],
  lockedThrough: null,
  pendingProposal: null,
  unconfirmedAttempts: 0,
  contractVersion: "f2-0.3",
};
const NO_LEDGER = {
  ...F2,
  state: "not_active",
  openingBalancesVerified: false,
  openingDate: null,
  memberReceiptsEnabled: false,
  allocationsEnabled: false,
  revision: null,
};
const ACTIVE = {
  ...F2,
  state: "active",
  openingBalancesVerified: true,
  openingDate: "2026-09-01",
  memberReceiptsEnabled: true,
  allocationsEnabled: false,
  revision: 11,
};
const account = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  class: "asset",
  subtype: "bank",
  currency: "NGN",
  active: true,
  revision: 0,
  openingVerified: true,
  ...extra,
});

const serve = (status: unknown, accounts: unknown, org = "org1") =>
  api.get.mockImplementation((url: string) => {
    if (!url.includes(`/finance/${org}/`)) return Promise.resolve({ data: { data: null } });
    if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: status } });
    if (url.endsWith("/ledger/accounts")) return Promise.resolve({ data: { data: accounts } });
    return Promise.resolve({ data: { data: [] } });
  });

const setSession = (permissions: PermissionKey[] = ["finance.manage"], org = "org1") =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: org, isOwner: false, permissions },
  });

const books = (organisationId = "org1") => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId={organisationId} /></MemoryRouter>
  </QueryClientProvider>
);

const expectNoWrites = () => {
  expect(api.post).not.toHaveBeenCalled();
  expect(api.put).not.toHaveBeenCalled();
  expect(api.patch).not.toHaveBeenCalled();
  expect(api.delete).not.toHaveBeenCalled();
};

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setSession();
  openBooksAt("manage-setup");
});

afterAll(() => useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG }));

describe("<BooksTab> setup gates on", () => {
  it("offers a manager the setup start and writes nothing until it is confirmed", async () => {
    serve(NO_LEDGER, []);
    render(books());

    expect(await screen.findByRole("button", { name: "Start bookkeeping setup" })).toBeEnabled();
    expect(screen.queryByText("Chart of accounts")).not.toBeInTheDocument();
    expect(screen.queryByText("Member money allocations")).not.toBeInTheDocument();
    expectNoWrites();
  });

  it("shows a finance.view officer the setup without any action", async () => {
    setSession(["finance.view"]);
    serve(ACTIVE, [account("bank", "Main account")]);
    render(books());

    const chart = await screen.findByRole("list", { name: "Chart of accounts" });
    expect(within(chart).getByText("Main account")).toBeInTheDocument();
    expect(
      screen.getByText(/Starting it or changing accounts needs the finance manage permission/),
    ).toBeInTheDocument();
    expect(screen.getByText("Member money allocations")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dues income account|allocations/i })).not.toBeInTheDocument();
    expectNoWrites();
  });

  it("replaces the plain account list with the managed chart", async () => {
    serve(ACTIVE, [account("bank", "Main account")]);
    render(books());

    expect(await screen.findByRole("list", { name: "Chart of accounts" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Finance accounts" })).not.toBeInTheDocument();
    expect(screen.getByText("Member money allocations")).toBeInTheDocument();
    expectNoWrites();
  });

  it("keeps an empty account list an empty state", async () => {
    serve(ACTIVE, []);
    render(books());
    expect(await screen.findByText("No accounts yet")).toBeInTheDocument();
  });

  it("shows an unreadable account list as not available, never as still loading", async () => {
    serve(ACTIVE, { accounts: "not a list" });
    render(books());

    expect(await screen.findByText(LEDGER_UNAVAILABLE_TITLE)).toBeInTheDocument();
    expect(screen.queryByText("Loading accounts...")).not.toBeInTheDocument();
  });

  it("retries only the accounts after they fail to load", async () => {
    api.get.mockImplementation((url: string) => {
      if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: ACTIVE } });
      if (url.endsWith("/ledger/accounts"))
        return Promise.reject({ response: { status: 500, data: { error: "Accounts are down" } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(books());

    expect(await screen.findByText("Couldn't load the chart of accounts")).toBeInTheDocument();
    serve(ACTIVE, [account("bank", "Main account")]);
    api.get.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Main account")).toBeInTheDocument();
    // Only the accounts are fetched again. The opening-balance reads wait for
    // the account list, so they load here for the first time.
    const urls = api.get.mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url === "/finance/org1/ledger/accounts")).toHaveLength(1);
    expect(urls.filter((url) => /\/ledger\/(status|journals)/.test(url))).toEqual([]);
  });

  it("shows only the new organisation's chart after a switch", async () => {
    serve(ACTIVE, [account("a", "Org A bank")], "org1");
    const view = render(books("org1"));
    expect(await screen.findByText("Org A bank")).toBeInTheDocument();

    api.get.mockClear();
    setSession(["finance.manage"], "org2");
    serve(ACTIVE, [account("b", "Org B bank")], "org2");
    view.rerender(books("org2"));

    expect(await screen.findByText("Org B bank")).toBeInTheDocument();
    expect(screen.queryByText("Org A bank")).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get.mock.calls.every(([url]) => String(url).includes("/finance/org2/"))).toBe(true);
    expectNoWrites();
  });
});

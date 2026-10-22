import { fireEvent, screen, waitFor } from "@testing-library/react";
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

/**
 * Books with the shipped setup gates on (`LEDGER_SETUP_UI_ENABLED`,
 * `LEDGER_F3_SETUP_UI_ENABLED`): Setup is the plain starting point and
 * Categories & Accounts is the account list, and rendering either never
 * writes. BooksTab.test.tsx covers the gates off.
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
const expense = (id: string, name: string) =>
  account(id, name, { class: "expense", subtype: null, openingVerified: null });

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

describe("<BooksTab> Setup", () => {
  it("offers a manager the setup start and writes nothing until it is confirmed", async () => {
    serve(NO_LEDGER, []);
    render(books());

    expect(await screen.findByRole("button", { name: "Start bookkeeping setup" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Add bank account" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add selected categories/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Member money allocations")).not.toBeInTheDocument();
    expectNoWrites();
  });

  it("shows a finance.view officer the setup without any action", async () => {
    setSession(["finance.view"]);
    serve(ACTIVE, [account("bank", "Main account")]);
    render(books());

    expect(
      await screen.findByText(/Starting it or changing accounts needs the finance manage permission/),
    ).toBeInTheDocument();
    expect(screen.getByText("Member money allocations")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add bank account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create them" })).not.toBeInTheDocument();
    expectNoWrites();
  });

  it("offers the starting bank and category points after setup, still writing nothing", async () => {
    serve(ACTIVE, [account("bank", "Main account")]);
    render(books());

    expect(await screen.findByRole("button", { name: "Add bank account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add selected categories" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select Donations" })).not.toBeChecked();
    expect(screen.getByText("Member money allocations")).toBeInTheDocument();
    expectNoWrites();
  });

  it("keeps a missing bookkeeping account recoverable without writing on load", async () => {
    serve(ACTIVE, [account("bank", "Main account")]);
    render(books());

    expect(
      await screen.findByText("Finish setup: some bookkeeping accounts are missing"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create them" })).toBeInTheDocument();
    expectNoWrites();
  });

  it("waits for a readable account list instead of claiming the accounts are ready", async () => {
    serve(ACTIVE, { accounts: "not a list" });
    render(books());

    expect(
      (await screen.findAllByText(/Waiting for the current account list/)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Add bank account" })).not.toBeInTheDocument();
    expectNoWrites();
  });
});

describe("<BooksTab> Categories & Accounts", () => {
  beforeEach(() => openBooksAt("manage-categories"));

  it("lists the organisation's categories and offers a retry after a failed load", async () => {
    api.get.mockImplementation((url: string) => {
      if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: ACTIVE } });
      if (url.endsWith("/ledger/accounts"))
        return Promise.reject({ response: { status: 500, data: { error: "Accounts are down" } } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(books());

    expect(
      (await screen.findAllByText("Couldn't load accounts")).length,
    ).toBeGreaterThan(0);
    serve(ACTIVE, [expense("fuel", "Fuel")]);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText("Fuel")).toBeInTheDocument();
    expectNoWrites();
  });

  it("shows only the new organisation's categories after a switch", async () => {
    serve(ACTIVE, [expense("a", "Org A fuel")], "org1");
    const view = render(books("org1"));
    expect(await screen.findByText("Org A fuel")).toBeInTheDocument();

    api.get.mockClear();
    setSession(["finance.manage"], "org2");
    serve(ACTIVE, [expense("b", "Org B fuel")], "org2");
    view.rerender(books("org2"));

    expect(await screen.findByText("Org B fuel")).toBeInTheDocument();
    expect(screen.queryByText("Org A fuel")).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get.mock.calls.every(([url]) => String(url).includes("/finance/org2/"))).toBe(true);
    expectNoWrites();
  });
});

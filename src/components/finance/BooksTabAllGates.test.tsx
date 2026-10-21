import { screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { MemoryRouter } from "react-router-dom";
import BooksTab from "components/finance/BooksTab";

import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

/** Where Books opens. */
const booksUrl = "/finance?tab=books";

/**
 * Books with every shipped finance gate on and nothing mocked but the API.
 * Panels have their own gate-on tests; this pins the release as a whole.
 */

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const ACTIVE = {
  state: "active",
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: true,
  blockers: [],
  openingDate: "2026-09-01",
  lockedThrough: null,
  memberReceiptsEnabled: true,
  allocationsEnabled: true,
  revision: 4,
  pendingProposal: null,
  activatedAt: "2026-09-01T10:00:00.000Z",
  gapWindowAttestedAt: null,
  unconfirmedAttempts: 0,
  contractVersion: "f2-0.3",
};
const account = (id: string, name: string, cls: string, subtype: string | null) => ({
  id: id.repeat(24).slice(0, 24),
  name,
  class: cls,
  subtype,
  currency: "NGN",
  active: true,
  revision: 0,
  openingVerified: cls === "asset" ? true : null,
  bankName: null,
  accountNumberLast4: null,
});
const accountsFor = (org: string) => [
  account("a", `${org} cash`, "asset", "cash"),
  account("b", "Opening balance equity", "equity", "opening_balance_equity"),
  account("c", "Member money held", "liability", "member_receipts_unallocated"),
  account("d", "Donations", "income", null),
  account("e", "Dues income", "income", "member_dues_income"),
  account("f", "Levy income", "income", "member_levy_income"),
];

const serve = (org: string) =>
  api.get.mockImplementation((url: string) => {
    if (!url.includes(`/finance/${org}/`)) return Promise.resolve({ data: { data: null } });
    if (url.endsWith("/ledger/status")) return Promise.resolve({ data: { data: ACTIVE } });
    if (url.endsWith("/ledger/accounts")) return Promise.resolve({ data: { data: accountsFor(org) } });
    return Promise.resolve({ data: { data: [] } });
  });

const setSession = (permissions: PermissionKey[], org = "org1", isOwner = false) =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: org, isOwner, permissions },
  });

const books = (organisationId = "org1") => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={[booksUrl]}><BooksTab organisationId={organisationId} /></MemoryRouter>
  </QueryClientProvider>
);

const writeCalls = () => [...api.post.mock.calls, ...api.put.mock.calls, ...api.patch.mock.calls, ...api.delete.mock.calls];

/** Entry points that start a ledger write, in any section. */
const WRITE_CONTROL =
  /^(Money in|Money out|Move money|Member money in|Refund|Allocate|Reverse|Resolve|Propose|Suspend|Resume|Lock|Remove the lock|Attest|Start bookkeeping|Add|New account|Turn on|Turn off|Rename|Deactivate|Reactivate)/;

const enabledWriteControls = () =>
  screen
    // Every screen, including the ones not currently shown.
    .queryAllByRole("button", { hidden: true })
    .filter((button) => !button.hasAttribute("disabled") && WRITE_CONTROL.test(button.textContent?.trim() ?? ""))
    .map((button) => button.textContent?.trim());

beforeEach(() => {
  queryClient.clear();
  localStorage.clear();
  Object.values(api).forEach((mock) => mock.mockReset());
});

afterEach(() => useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG }));

describe("<BooksTab> with every finance gate on", () => {
  it("renders an active ledger for a finance manager without writing anything", async () => {
    setSession(["finance.view", "finance.manage"]);
    serve("org1");
    render(books());

    expect(await screen.findAllByText("org1 cash")).not.toHaveLength(0);
    // The viewer test below is only meaningful if these exist for a manager.
    const controls = enabledWriteControls();
    expect(controls.some((name) => name?.startsWith("Money in"))).toBe(true);
    expect(controls.some((name) => name?.startsWith("Member money in"))).toBe(true);
    expect(controls).toContain("New account");
    // Give every section's reads time to settle; none of them may write.
    await waitFor(() => expect(api.get.mock.calls.length).toBeGreaterThan(5));
    expect(writeCalls()).toEqual([]);
  });

  it("offers a finance viewer no ledger write control in any section", async () => {
    setSession(["finance.view"]);
    serve("org1");
    render(books());

    expect(await screen.findAllByText("org1 cash")).not.toHaveLength(0);
    expect(enabledWriteControls()).toEqual([]);
    expect(writeCalls()).toEqual([]);
  });

  it("reads only the new organisation after a switch", async () => {
    setSession(["finance.view", "finance.manage"], "org1");
    serve("org1");
    const view = render(books("org1"));
    expect(await screen.findAllByText("org1 cash")).not.toHaveLength(0);

    api.get.mockClear();
    setSession(["finance.view", "finance.manage"], "org2");
    serve("org2");
    view.rerender(books("org2"));

    expect(await screen.findAllByText("org2 cash")).not.toHaveLength(0);
    expect(screen.queryByText("org1 cash")).not.toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get.mock.calls.every(([url]) => String(url).includes("/finance/org2/"))).toBe(true);
    expect(writeCalls()).toEqual([]);
  });
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { confirmInDialog, render, selectTab } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import CategoriesScreen from "components/finance/categories/CategoriesScreen";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import {
  ACCOUNT_CHANGE_UNAVAILABLE_NOTE,
  OPENING_PENDING_CREATE_NOTE,
  SUSPENDED_ACCOUNTS_NOTE,
  SUSPENDED_CREATE_NOTE,
} from "helpers/ledgerSetup";
import {
  LEDGER_WRITE_UNCERTAIN_NOTE,
  markLedgerWriteUncertain,
} from "helpers/ledgerWriteUncertainty";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG } from "zStore";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<
  "get" | "post" | "put" | "patch" | "delete",
  jest.Mock
>;

const ORGANISATION_ID = "org1";

const statusOf = (
  state: LedgerKnownState,
  overrides: Partial<LedgerStatus> = {},
): LedgerStatus => ({
  state: { kind: "known", state },
  currency: "NGN",
  openingBalancesVerified: state === "active",
  postingEnabled: state === "active",
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: null,
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 2,
  memberReceiptsEnabled: false,
  allocationsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "a1",
  name: "Transport",
  class: "expense",
  subtype: null,
  currency: "NGN",
  active: true,
  revision: 3,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

const CHART: LedgerAccount[] = [
  account({ id: "e1", name: "Transport", revision: 4 }),
  account({ id: "e2", name: "Fuel", revision: 2 }),
  account({ id: "i1", name: "Donations", class: "income" }),
  account({
    id: "i2",
    name: "Dues income (from allocations)",
    class: "income",
    subtype: "member_dues_income",
  }),
  account({
    id: "b1",
    name: "Operating account",
    class: "asset",
    subtype: "bank",
    bankName: "GTBank",
    accountNumberLast4: "1234",
  }),
  account({ id: "c1", name: "Cash in hand", class: "asset", subtype: "cash" }),
  account({
    id: "q1",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
  }),
];

const setPermissions = (permissions: PermissionKey[], isOwner = false) =>
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id: ORGANISATION_ID, isOwner, permissions },
  });

const renderScreen = (props: Partial<ComponentProps<typeof CategoriesScreen>> = {}) =>
  render(
    <QueryClientProvider client={queryClient}>
      <CategoriesScreen
        organisationId={ORGANISATION_ID}
        status={statusOf("active")}
        accounts={CHART}
        accountsError={null}
        onRetryAccounts={() => undefined}
        isRetryingAccounts={false}
        onRecheckLedger={async () => true}
        {...props}
      />
    </QueryClientProvider>,
  );

const openRow = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole("button", { name }));

/**
 * The selected tab's panel. Chakra keeps every panel mounted, so a query on
 * the whole document can match a closed one in jsdom; scoping to the open
 * panel asserts what the officer actually sees.
 */
const openPanel = () => {
  const panels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-part="content"]'),
  );
  const open = panels.find((panel) => panel.getAttribute("data-state") === "open");
  if (!open) throw new Error("openPanel(): no open tab panel");
  return open;
};

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setPermissions(["finance.view", "finance.manage"]);
  api.post.mockResolvedValue({ data: { data: { accounts: [] } } });
  api.patch.mockResolvedValue({ data: { data: {} } });
});

afterEach(() => useGlobalStore.setState({ organisation: EMPTY_ORG }));

describe("<CategoriesScreen> tabs and lists", () => {
  it("opens on Expenses and lists only that kind, A–Z", () => {
    renderScreen();

    const list = within(openPanel()).getByRole("list", { name: "Expense categories" });
    expect(within(list).getAllByRole("button").map((row) => row.textContent)).toEqual([
      "Fuel",
      "Transport",
    ]);
    expect(screen.getByRole("tab", { name: /Expenses/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(within(openPanel()).queryByText("Donations")).not.toBeInTheDocument();
  });

  it("counts each tab and switches between them", async () => {
    renderScreen();
    expect(screen.getByRole("tab", { name: /Expenses/ })).toHaveTextContent("2");
    expect(screen.getByRole("tab", { name: /Income/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Cash & bank/ })).toHaveTextContent("2");

    await selectTab(screen.getByRole("tab", { name: /Income/ }));
    expect(within(openPanel()).getByText("Donations")).toBeInTheDocument();
    expect(within(openPanel()).queryByText("Transport")).not.toBeInTheDocument();

    await selectTab(screen.getByRole("tab", { name: /Cash & bank/ }));
    expect(within(openPanel()).getByText("Cash in hand")).toBeInTheDocument();
    expect(within(openPanel()).getByText("Operating account")).toBeInTheDocument();
    expect(within(openPanel()).getByText("GTBank · ••••1234")).toBeInTheDocument();
  });

  it("keeps dues income out of Income and lists it under the collapsed bookkeeping accounts", async () => {
    renderScreen();
    await selectTab(screen.getByRole("tab", { name: /Income/ }));
    expect(screen.queryByText("Dues income (from allocations)")).not.toBeInTheDocument();

    expect(screen.queryByText("Balances the opening count.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Bookkeeping accounts/ }));

    expect(await screen.findByText("Dues income (from allocations)")).toBeInTheDocument();
    expect(
      screen.getByText("Income recorded when member money is allocated."),
    ).toBeInTheDocument();
    expect(screen.getByText("Balances the opening count.")).toBeInTheDocument();
    // Read-only: the technical accounts offer no actions at all.
    expect(screen.queryByRole("button", { name: /^(Rename|Retire|Restore)$/ })).not.toBeInTheDocument();
  });

  it("opens on Expenses even for a viewer, who gets no write buttons", () => {
    setPermissions(["finance.view"]);
    renderScreen();

    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add expense category" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transport" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retired (0)" })).not.toBeInTheDocument();
  });

  it("lets an owner manage the categories without a permission array", () => {
    setPermissions([], true);
    renderScreen();
    expect(screen.getByRole("button", { name: "Add expense category" })).toBeInTheDocument();
  });
});

describe("<CategoriesScreen> adding a category", () => {
  it("adds an expense category with a name only", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Add expense category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Stationery " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [{ name: "Stationery", class: "expense", subtype: null }],
      }),
    );
  });

  it("refuses an active duplicate before sending", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Add expense category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " fuel " } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText(/"fuel" is already in use\./)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("offers Restore for a retired category with the same name", async () => {
    renderScreen({
      accounts: [
        ...CHART,
        account({ id: "e3", name: "Utilities", active: false, revision: 7 }),
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: "Add expense category" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "utilities" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("A retired category has this name.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/e3", {
        expectedRevision: 7,
        active: true,
      }),
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("restores a retired category from its tab without a confirmation", async () => {
    renderScreen({
      accounts: [...CHART, account({ id: "e3", name: "Utilities", active: false, revision: 7 })],
    });
    fireEvent.click(screen.getByRole("button", { name: "Retired (1)" }));
    fireEvent.click(await screen.findByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/e3", {
        expectedRevision: 7,
        active: true,
      }),
    );
  });
});

describe("<CategoriesScreen> account actions", () => {
  it("renames with the account's revision", async () => {
    renderScreen();
    openRow("Transport");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Travel" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/e1", {
        expectedRevision: 4,
        name: "Travel",
      }),
    );
  });

  it("retires only after confirmation and never deletes", async () => {
    renderScreen();
    openRow("Transport");
    fireEvent.click(screen.getByRole("button", { name: "Retire" }));
    await confirmInDialog("Retire");

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/e1", {
        expectedRevision: 4,
        active: false,
      }),
    );
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("shows the server's message when a rename is refused", async () => {
    api.patch.mockRejectedValue({
      response: {
        status: 409,
        data: { error: "The account changed elsewhere.", code: "LEDGER_REVISION_CONFLICT" },
      },
    });
    renderScreen();
    openRow("Transport");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Travel" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The account changed elsewhere.")).toBeInTheDocument();
  });

  it("gives no write action while the account list has no revision", () => {
    renderScreen({ accounts: [account({ revision: null })] });
    openRow("Transport");

    expect(screen.getByText(ACCOUNT_CHANGE_UNAVAILABLE_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retire" })).not.toBeInTheDocument();
  });
});

describe("<CategoriesScreen> cash & bank", () => {
  it("adds a bank account with the one-time metadata", async () => {
    renderScreen();
    await selectTab(screen.getByRole("tab", { name: /Cash & bank/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add bank account" }));
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "Second bank" },
    });
    fireEvent.change(screen.getByLabelText("Bank (optional)"), {
      target: { value: "Access" },
    });
    fireEvent.change(screen.getByLabelText("Last 4 digits (optional)"), {
      target: { value: "5678" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add bank account" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          {
            name: "Second bank",
            class: "asset",
            subtype: "bank",
            bankName: "Access",
            accountNumberLast4: "5678",
          },
        ],
      }),
    );
  });

  it("shows bank metadata read-only and never offers to edit it", async () => {
    renderScreen();
    await selectTab(screen.getByRole("tab", { name: /Cash & bank/ }));
    openRow(/Operating account/);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("GTBank · ••••1234")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Bank/)).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Last 4/)).not.toBeInTheDocument();
  });

  it("offers Add Cash in hand only when no active cash account exists", async () => {
    const { unmount } = renderScreen({
      accounts: CHART.filter((entry) => entry.subtype !== "cash"),
    });
    await selectTab(screen.getByRole("tab", { name: /Cash & bank/ }));
    expect(screen.getByRole("button", { name: "Add Cash in hand" })).toBeInTheDocument();
    unmount();

    queryClient.clear();
    renderScreen();
    await selectTab(screen.getByRole("tab", { name: /Cash & bank/ }));
    expect(screen.queryByRole("button", { name: "Add Cash in hand" })).not.toBeInTheDocument();
  });

  it("lists two legacy cash accounts and offers no add", async () => {
    renderScreen({
      accounts: [
        ...CHART,
        account({ id: "c2", name: "Petty cash", class: "asset", subtype: "cash" }),
      ],
    });
    await selectTab(screen.getByRole("tab", { name: /Cash & bank/ }));

    expect(screen.getByText("Cash in hand")).toBeInTheDocument();
    expect(screen.getByText("Petty cash")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Cash in hand" })).not.toBeInTheDocument();
  });

  it("blocks money accounts while opening balances await verification", async () => {
    renderScreen({ status: statusOf("pending_verification") });
    await selectTab(screen.getByRole("tab", { name: /Cash & bank/ }));

    expect(screen.getByRole("button", { name: "Add bank account" })).toBeDisabled();
    expect(screen.getByText(OPENING_PENDING_CREATE_NOTE)).toBeInTheDocument();
  });
});

describe("<CategoriesScreen> permissions and states", () => {
  it("allows rename only while suspended", async () => {
    renderScreen({ status: statusOf("suspended") });
    expect(screen.queryByRole("button", { name: "Add expense category" })).not.toBeInTheDocument();
    expect(screen.getByText(SUSPENDED_CREATE_NOTE)).toBeInTheDocument();

    openRow("Transport");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Retire" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(SUSPENDED_ACCOUNTS_NOTE)).toBeInTheDocument();
  });

  it("disables every write while a ledger change is unconfirmed, and recovers after recheck", async () => {
    markLedgerWriteUncertain(ORGANISATION_ID, "update-account");
    const recheck = jest.fn().mockResolvedValue(true);
    renderScreen({ onRecheckLedger: recheck });

    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getByText(LEDGER_WRITE_UNCERTAIN_NOTE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add expense category" })).toBeDisabled();

    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(acknowledge).toBeEnabled());
    expect(recheck).toHaveBeenCalledWith({ requireAllocations: false, allowInitialSetup: false });

    fireEvent.click(acknowledge);
    await confirmInDialog("I've checked");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add expense category" })).toBeEnabled(),
    );
  });

  it("shows a load error with a retry", () => {
    const onRetryAccounts = jest.fn();
    renderScreen({
      accounts: null,
      accountsError: { response: { data: { error: "Books are temporarily unavailable." } } },
      onRetryAccounts,
    });

    expect(screen.getByText("Couldn't load accounts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetryAccounts).toHaveBeenCalled();
  });
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { confirmInDialog, render, toggle } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import LedgerSetupPanel from "components/finance/LedgerSetupPanel";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import {
  OPENING_PENDING_CREATE_NOTE,
  ledgerRecheckUsable,
} from "helpers/ledgerSetup";
import {
  LEDGER_WRITE_UNCERTAIN_NOTE,
  ledgerWriteUncertaintyKey,
  markLedgerWriteUncertain,
  readLedgerWriteUncertainty,
} from "helpers/ledgerWriteUncertainty";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG } from "zStore";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

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
  memberReceiptsEnabled: true,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  allocationsEnabled: false,
  ...overrides,
});

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "a1",
  name: "Cash in hand",
  class: "asset",
  subtype: "cash",
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

/** A status body exactly as the API sends it (state is a string on the wire). */
const wireStatusOf = (
  state: LedgerKnownState,
  overrides: Record<string, unknown> = {},
) => ({
  state,
  currency: "NGN",
  openingBalancesVerified: state === "active",
  postingEnabled: state === "active",
  blockers: [],
  openingDate: null,
  lockedThrough: null,
  revision: 0,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  pendingProposal: null,
  contractVersion: "f2-0.3",
  ...overrides,
});

const setPermissions = (permissions: PermissionKey[], isOwner = false, id = ORGANISATION_ID) =>
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id, isOwner, permissions },
  });

const renderPanel = (
  props: Partial<ComponentProps<typeof LedgerSetupPanel>> = {},
) =>
  render(
    <QueryClientProvider client={queryClient}>
      <LedgerSetupPanel
        organisationId={ORGANISATION_ID}
        status={statusOf("not_active", { memberReceiptsEnabled: null, revision: null })}
        accounts={[]}
        onRetryAccounts={() => undefined}
        isRetryingAccounts={false}
        reloadAccounts={async () => []}
        onRecheckLedger={async () => true}
        enabled
        {...props}
      />
    </QueryClientProvider>,
  );

let invalidate: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setPermissions(["finance.manage"]);
  api.post.mockResolvedValue({ data: { data: {} } });
  api.patch.mockResolvedValue({ data: { data: {} } });
  invalidate = jest.spyOn(queryClient, "invalidateQueries");
});

afterEach(() => {
  invalidate.mockRestore();
  useGlobalStore.setState({ organisation: EMPTY_ORG });
});

describe("<LedgerSetupPanel> feature gate", () => {
  it("renders nothing while the gate is off", () => {
    renderPanel({ enabled: false });
    expect(screen.queryByText("Bookkeeping setup")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("renders nothing for a lifecycle state this build does not know", () => {
    renderPanel({
      status: {
        ...statusOf("setup"),
        state: { kind: "unknown", raw: "frozen_for_review" },
      },
    });
    expect(screen.queryByText("Bookkeeping setup")).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> activation progress", () => {
  const ACTIVE_CHART = [
    account({ openingVerified: true }),
    account({
      id: "a2",
      name: "Opening balance equity",
      class: "equity",
      subtype: "opening_balance_equity",
      openingVerified: null,
    }),
  ];
  const activationRow = () => {
    const rows = within(
      screen.getByRole("list", { name: "Bookkeeping setup progress" }),
    ).getAllByRole("listitem");
    const row = rows.find((item) => within(item).queryByText("Opening balances and activation"));
    if (!row) throw new Error("activation row missing");
    return row;
  };

  it("reports an active ledger as activated when opening balances are offered", () => {
    renderPanel({
      status: statusOf("active", { memberReceiptsEnabled: false }),
      accounts: ACTIVE_CHART,
      openingBalancesEnabled: true,
    });

    const row = activationRow();
    expect(within(row).getByText("Opening balances were verified and the ledger is active.")).toBeInTheDocument();
    expect(within(row).getByText("Done")).toBeInTheDocument();
    expect(screen.queryByText(/Arrives in a later release/)).not.toBeInTheDocument();
  });

  it("keeps the later-release row where opening balances are not offered", () => {
    renderPanel({
      status: statusOf("active", { memberReceiptsEnabled: false }),
      accounts: ACTIVE_CHART,
      openingBalancesEnabled: false,
    });

    const row = activationRow();
    expect(within(row).getByText(/Arrives in a later release/)).toBeInTheDocument();
    expect(within(row).getByText("Later")).toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> permissions", () => {
  it("shows progress and accounts to a viewer without any setup action", () => {
    setPermissions(["finance.view"]);
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ revision: 3 })],
    });

    expect(screen.getByText("Bookkeeping setup")).toBeInTheDocument();
    expect(
      screen.getByText(/Starting it or changing accounts needs the finance manage permission/),
    ).toBeInTheDocument();
    // The progress list names the step; the start button is not offered.
    expect(
      screen.queryByRole("button", { name: "Start bookkeeping setup" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Start bookkeeping setup")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
  });

  it("lets a viewer see an unresolved write but not clear it", () => {
    markLedgerWriteUncertain("org1", "setup");
    setPermissions(["finance.view"]);
    renderPanel();

    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recheck the ledger" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "I've checked the ledger" }),
    ).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> starting setup", () => {
  it("keeps the starting suggestions hidden until setup has started", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Add bank account" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add selected categories/ }),
    ).not.toBeInTheDocument();
  });

  it("posts the member-receipts choice and shows the returned setup state", async () => {
    api.post.mockResolvedValue({
      data: { data: wireStatusOf("setup", { memberReceiptsEnabled: true, revision: 0 }) },
    });
    renderPanel();

    await toggle(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Start bookkeeping setup" }));
    await confirmInDialog("Start setup");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/setup", {
        memberReceiptsEnabled: true,
      }),
    );
    expect(await screen.findByText("Setup has started for this organisation.")).toBeInTheDocument();
    // No activation, posting or opening-balance control exists here.
    expect(screen.queryByRole("button", { name: /activate/i })).not.toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("does not call the API when the confirmation is cancelled", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Start bookkeeping setup" }));
    await confirmInDialog("Cancel");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("explains an already-started ledger without claiming this attempt succeeded", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: "Ledger setup has already been started for this organisation.",
          code: "LEDGER_ALREADY_EXISTS",
        },
      },
    });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Start bookkeeping setup" }));
    await confirmInDialog("Start setup");

    expect(
      await screen.findByText(/doesn't confirm whether your earlier attempt was saved/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Setup has started for this organisation/),
    ).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> member receipts setting", () => {
  it("turns receipts on with the ledger revision the PATCH requires", async () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false, revision: 5 }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Turn on member receipts" }));
    await confirmInDialog("Turn on");

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/settings", {
        expectedLedgerRevision: 5,
        memberReceiptsEnabled: true,
      }),
    );
  });

  it("offers the same action on an active ledger, and says the server takes the dues snapshot", async () => {
    renderPanel({
      status: statusOf("active", { memberReceiptsEnabled: false, revision: 8 }),
    });
    expect(screen.queryByText(/after activation/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn on member receipts" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/read-only snapshot of the current dues and levy payment records/)).toBeInTheDocument();
    expect(within(dialog).getByText(/no turn-off operation once it is on/)).toBeInTheDocument();
    await confirmInDialog("Turn on");

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/settings", {
        expectedLedgerRevision: 8,
        memberReceiptsEnabled: true,
      }),
    );
    // The organisation's ledger reloads, so every screen reads the new setting.
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") }),
    );
  });

  it("does not mention the snapshot before activation", async () => {
    renderPanel({ status: statusOf("pending_verification", { memberReceiptsEnabled: false, revision: 4 }) });
    fireEvent.click(screen.getByRole("button", { name: "Turn on member receipts" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).queryByText(/snapshot/)).not.toBeInTheDocument();
  });

  it("shows the server's refusal on an active ledger instead of claiming success", async () => {
    api.patch.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: "An F0 snapshot has already been taken for this organisation.", code: "LEDGER_ALREADY_EXISTS" },
      },
    });
    renderPanel({ status: statusOf("active", { memberReceiptsEnabled: false, revision: 8 }) });
    fireEvent.click(screen.getByRole("button", { name: "Turn on member receipts" }));
    await confirmInDialog("Turn on");
    expect(await screen.findByText("An F0 snapshot has already been taken for this organisation.")).toBeInTheDocument();
    expect(screen.getByText("That change wasn't saved")).toBeInTheDocument();
  });

  it("latches an unconfirmed outcome on an active ledger and blocks a second attempt", async () => {
    api.patch.mockRejectedValueOnce({ message: "Network Error", code: "ERR_NETWORK", request: {} });
    renderPanel({ status: statusOf("active", { memberReceiptsEnabled: false, revision: 8 }) });
    fireEvent.click(screen.getByRole("button", { name: "Turn on member receipts" }));
    await confirmInDialog("Turn on");

    expect(await screen.findByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getByText("Check whether member receipts are now on before trying again.")).toBeInTheDocument();
    expect(readLedgerWriteUncertainty(ORGANISATION_ID)).toMatchObject({ action: "member-receipts" });
    expect(screen.getByRole("button", { name: "Turn on member receipts" })).toBeDisabled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(api.patch).toHaveBeenCalledTimes(1);
  });

  it("offers nothing while suspended, and says why", () => {
    renderPanel({ status: statusOf("suspended", { memberReceiptsEnabled: false, revision: 8 }) });
    expect(screen.queryByRole("button", { name: "Turn on member receipts" })).not.toBeInTheDocument();
    expect(screen.getByText("Member receipts can't be turned on while the books are suspended.")).toBeInTheDocument();
  });

  it("offers nothing once receipts are on, or to a viewer", () => {
    const { unmount } = renderPanel({ status: statusOf("active", { memberReceiptsEnabled: true, revision: 8 }) });
    expect(screen.queryByRole("button", { name: "Turn on member receipts" })).not.toBeInTheDocument();
    unmount();

    setPermissions(["finance.view"]);
    renderPanel({ status: statusOf("active", { memberReceiptsEnabled: false, revision: 8 }) });
    expect(screen.queryByRole("button", { name: "Turn on member receipts" })).not.toBeInTheDocument();
  });

  it("offers no setting change when the read shape has no revision", () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false, revision: null }),
    });

    expect(
      screen.queryByRole("button", { name: "Turn on member receipts" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/doesn't send the ledger revision yet/)).toBeInTheDocument();
  });

  it("does not offer to turn receipts off", () => {
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: true }) });
    expect(screen.queryByRole("button", { name: /turn off member receipts/i })).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> bookkeeping accounts after setup", () => {
  const cash = account({
    id: "cash",
    name: "Cash in hand",
    class: "asset",
    subtype: "cash",
  });
  const equity = account({
    id: "equity",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
  });
  const startSetup = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start bookkeeping setup" }));
    await confirmInDialog("Start setup");
  };

  it("reloads, then creates the missing accounts in one request", async () => {
    api.post.mockResolvedValueOnce({
      data: { data: wireStatusOf("setup", { memberReceiptsEnabled: false, revision: 0 }) },
    });
    const reloadAccounts = jest.fn(async () => [] as LedgerAccount[]);
    renderPanel({ reloadAccounts });

    await startSetup();

    await waitFor(() => expect(reloadAccounts).toHaveBeenCalled());
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          { name: "Cash in hand", class: "asset", subtype: "cash" },
          {
            name: "Opening balance equity",
            class: "equity",
            subtype: "opening_balance_equity",
          },
        ],
      }),
    );
  });

  it("includes the holding account when member receipts were chosen", async () => {
    api.post.mockResolvedValueOnce({
      data: { data: wireStatusOf("setup", { memberReceiptsEnabled: true, revision: 0 }) },
    });
    renderPanel({ reloadAccounts: async () => [] });

    await toggle(screen.getByRole("checkbox"));
    await startSetup();

    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          { name: "Cash in hand", class: "asset", subtype: "cash" },
          {
            name: "Opening balance equity",
            class: "equity",
            subtype: "opening_balance_equity",
          },
          {
            name: "Member money – unallocated",
            class: "liability",
            subtype: "member_receipts_unallocated",
          },
        ],
      }),
    );
  });

  it("sends nothing when the backend already created the accounts", async () => {
    api.post.mockResolvedValueOnce({
      data: { data: wireStatusOf("setup", { memberReceiptsEnabled: false, revision: 0 }) },
    });
    const reloadAccounts = jest.fn(async () => [cash, equity]);
    renderPanel({ reloadAccounts });

    await startSetup();
    await waitFor(() => expect(reloadAccounts).toHaveBeenCalled());

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/setup", {
      memberReceiptsEnabled: false,
    });
  });

  it("sends only the holding account when cash and equity already exist", async () => {
    api.post.mockResolvedValueOnce({
      data: { data: wireStatusOf("setup", { memberReceiptsEnabled: true, revision: 0 }) },
    });
    renderPanel({ reloadAccounts: async () => [cash, equity] });

    await toggle(screen.getByRole("checkbox"));
    await startSetup();

    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          {
            name: "Member money – unallocated",
            class: "liability",
            subtype: "member_receipts_unallocated",
          },
        ],
      }),
    );
  });

  it("creates nothing when the reload is not usable", async () => {
    api.post.mockResolvedValueOnce({
      data: { data: wireStatusOf("setup", { memberReceiptsEnabled: false, revision: 0 }) },
    });
    const reloadAccounts = jest.fn(async () => null);
    renderPanel({ reloadAccounts });

    await startSetup();
    await waitFor(() => expect(reloadAccounts).toHaveBeenCalled());

    expect(api.post).toHaveBeenCalledTimes(1);
    // The recovery path stays available.
    expect(
      await screen.findByText("Finish setup: some bookkeeping accounts are missing"),
    ).toBeInTheDocument();
  });

  it("offers Create them for an older setup, reloading before creating", async () => {
    const reloadAccounts = jest.fn(async () => [cash]);
    renderPanel({
      status: statusOf("active", { memberReceiptsEnabled: false }),
      accounts: [cash],
      reloadAccounts,
    });

    fireEvent.click(screen.getByRole("button", { name: "Create them" }));

    await waitFor(() => expect(reloadAccounts).toHaveBeenCalled());
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          {
            name: "Opening balance equity",
            class: "equity",
            subtype: "opening_balance_equity",
          },
        ],
      }),
    );
  });

  it("explains instead of creating cash while opening balances are pending", () => {
    renderPanel({
      status: statusOf("pending_verification", { memberReceiptsEnabled: false }),
      accounts: [],
    });

    expect(
      screen.getByText("Finish setup: some bookkeeping accounts are missing"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create them" })).not.toBeInTheDocument();
    expect(screen.getAllByText(OPENING_PENDING_CREATE_NOTE).length).toBeGreaterThan(0);
  });
});

describe("<LedgerSetupPanel> suggested categories", () => {
  const cash = account({ id: "cash", name: "Cash in hand" });
  const equity = account({
    id: "equity",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
  });

  const setupPanel = (props: Partial<ComponentProps<typeof LedgerSetupPanel>> = {}) =>
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [cash, equity],
      reloadAccounts: async () => [cash, equity],
      ...props,
    });

  it("offers every suggestion unticked", () => {
    setupPanel();

    for (const name of ["Donations", "Offerings", "Other income", "Transport", "Utilities", "Other expenses"]) {
      expect(screen.getByRole("checkbox", { name: `Select ${name}` })).not.toBeChecked();
    }
    expect(screen.getByRole("button", { name: "Add selected categories" })).toBeDisabled();
  });

  it("posts only the chosen suggestions in one batch", async () => {
    setupPanel();

    await toggle(screen.getByRole("checkbox", { name: "Select Donations" }));
    await toggle(screen.getByRole("checkbox", { name: "Select Utilities" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected categories (2)" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          { name: "Donations", class: "income", subtype: null },
          { name: "Utilities", class: "expense", subtype: null },
        ],
      }),
    );
  });

  it("hides a suggestion an active account already uses", () => {
    setupPanel({
      accounts: [cash, equity, account({ id: "don", name: "donations", class: "income" })],
    });
    expect(
      screen.queryByRole("checkbox", { name: "Select Donations" }),
    ).not.toBeInTheDocument();
  });

  it("offers Restore for a retired suggestion instead of a duplicate", async () => {
    const retired = account({
      id: "tr",
      name: "Transport",
      class: "expense",
      subtype: null,
      active: false,
      revision: 9,
    });
    setupPanel({ accounts: [cash, equity, retired] });

    expect(
      screen.queryByRole("checkbox", { name: "Select Transport" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/tr", {
        expectedRevision: 9,
        active: true,
      }),
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("offers no Type or Subtype control anywhere", () => {
    setupPanel();
    expect(screen.queryByLabelText("Type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Subtype")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> adding a bank account", () => {
  it("posts a bank account with its one-time metadata", async () => {
    const cash = account({ id: "cash", name: "Cash in hand" });
    const equity = account({
      id: "equity",
      name: "Opening balance equity",
      class: "equity",
      subtype: "opening_balance_equity",
    });
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [cash, equity],
      reloadAccounts: async () => [cash, equity],
    });

    fireEvent.click(screen.getByRole("button", { name: "Add bank account" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Account name"), {
      target: { value: "Main bank" },
    });
    fireEvent.change(within(dialog).getByLabelText("Bank (optional)"), {
      target: { value: "GTBank" },
    });
    fireEvent.change(within(dialog).getByLabelText("Last 4 digits (optional)"), {
      target: { value: "1234" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add bank account" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          {
            name: "Main bank",
            class: "asset",
            subtype: "bank",
            bankName: "GTBank",
            accountNumberLast4: "1234",
          },
        ],
      }),
    );
  });
});

describe("<LedgerSetupPanel> unresolved write latch", () => {
  it("blocks every write after a network failure and never toasts a generic error", async () => {
    api.post.mockRejectedValue({ message: "Network Error", code: "ERR_NETWORK", request: {} });
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [],
      reloadAccounts: async () => [],
    });

    fireEvent.click(screen.getByRole("button", { name: "Create them" }));

    expect(await screen.findByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getAllByText(LEDGER_WRITE_UNCERTAIN_NOTE).length).toBeGreaterThan(0);
    expect(screen.getByText(/Check whether the account now exists/)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    // Exactly one attempt was sent; none may be repeated while unresolved.
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Create them" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add bank account" })).toBeDisabled();
  });

  it("remembers the unresolved write across a reload", () => {
    markLedgerWriteUncertain("org1", "create-accounts");
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ revision: 2 })],
    });

    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
  });

  it("requires a fresh usable recheck before an officer can acknowledge, then unblocks writes", async () => {
    markLedgerWriteUncertain("org1", "setup");
    const recheck = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPanel({ onRecheckLedger: recheck });

    expect(screen.getByRole("button", { name: "Start bookkeeping setup" })).toBeDisabled();
    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();

    // A failed or unusable reload never unlocks acknowledgement.
    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
    expect(recheck).toHaveBeenCalledWith({ requireAllocations: false, allowInitialSetup: true });
    expect(acknowledge).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(acknowledge).toBeEnabled());

    fireEvent.click(acknowledge);
    await confirmInDialog("I've checked");

    await waitFor(() =>
      expect(screen.queryByText("We couldn't confirm that change")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Start bookkeeping setup" })).toBeEnabled();
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("never lets a 409 stand in for confirmation of an unresolved attempt", async () => {
    markLedgerWriteUncertain("org1", "setup");
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: { error: "Already", code: "LEDGER_ALREADY_EXISTS" },
      },
    });
    renderPanel();

    expect(screen.getByRole("button", { name: "Start bookkeeping setup" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
    expect(readLedgerWriteUncertainty("org1")).not.toBeNull();
  });
});

describe("<LedgerSetupPanel> member receipts wording", () => {
  it("never implies a turn-off operation exists", () => {
    const { unmount } = renderPanel();
    expect(screen.getByText(/no turn-off operation once it is on/)).toBeInTheDocument();
    unmount();

    queryClient.clear();
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: false }) });
    expect(screen.getByText(/no turn-off operation once it is on/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /turn off/i })).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> organisation scope", () => {
  it("scopes account writes to the organisation it was opened for", async () => {
    renderPanel({
      organisationId: "org2",
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [],
      reloadAccounts: async () => [],
    });

    fireEvent.click(screen.getByRole("button", { name: "Create them" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org2/ledger/accounts", {
        accounts: [
          { name: "Cash in hand", class: "asset", subtype: "cash" },
          {
            name: "Opening balance equity",
            class: "equity",
            subtype: "opening_balance_equity",
          },
        ],
      }),
    );
    expect(
      api.post.mock.calls.every(([url]) => String(url).startsWith("/finance/org2/")),
    ).toBe(true);
  });
});

describe("<LedgerSetupPanel> scope guard", () => {
  it("offers no receipt, expense, transfer, reversal or payment control", () => {
    renderPanel({
      status: statusOf("active", { memberReceiptsEnabled: true }),
      accounts: [account({ revision: 2 })],
    });

    for (const name of [/receipt/i, /expense/i, /transfer/i, /reverse/i, /refund/i, /payment/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /opening balance/i })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });
});

/**
 * The inherited F2A-2 writes use the same durable lifecycle as F3A: the
 * marker is stored before the request and settled by the request promise,
 * not by a mutation callback that unmounting can drop.
 */
describe("<LedgerSetupPanel> durable F2A-2 write lifecycle", () => {
  const deferred = () => {
    let resolve: (value: unknown) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  const holdRequest = (method: jest.Mock, organisationId = "org1") => {
    const response = deferred();
    const markerAtDispatch: unknown[] = [];
    method.mockImplementation(() => {
      markerAtDispatch.push(readLedgerWriteUncertainty(organisationId));
      return response.promise;
    });
    return { ...response, markerAtDispatch };
  };

  const storedPhase = (organisationId: string) =>
    JSON.parse(window.localStorage.getItem(ledgerWriteUncertaintyKey(organisationId)) ?? "null")
      ?.phase;

  const wireAccount = {
    id: "a1",
    name: "Cash in hand",
    class: "asset",
    subtype: "cash",
    currency: "NGN",
    active: true,
  };
  const noLedgerStatus = () =>
    wireStatusOf("not_active", { revision: null, memberReceiptsEnabled: null });
  /** The real validator, not a mock that claims a recheck succeeded. */
  const realRecheck = (statusData: unknown, accountsData: unknown) =>
    jest.fn(async (options: { requireAllocations: boolean; allowInitialSetup: boolean }) =>
      ledgerRecheckUsable(statusData, accountsData, options),
    );

  const startSetup = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start bookkeeping setup" }));
    await confirmInDialog("Start setup");
  };

  it("stores a setup marker before sending and clears it after confirmation, even after unmount", async () => {
    const request = holdRequest(api.post);
    const view = renderPanel();
    await startSetup();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    expect(request.markerAtDispatch).toEqual([
      expect.objectContaining({ organisationId: "org1", action: "setup", pending: true }),
    ]);
    expect(await screen.findByText("Waiting for the server to confirm that change")).toBeInTheDocument();
    view.unmount();
    expect(storedPhase("org1")).toBe("pending");

    request.resolve({ data: { data: wireStatusOf("setup", { memberReceiptsEnabled: false, revision: 0 }) } });
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
  });

  it("latches an ambiguous setup failure that arrives after the officer leaves", async () => {
    const request = holdRequest(api.post);
    const view = renderPanel();
    await startSetup();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    view.unmount();

    request.reject({ message: "Network Error", code: "ERR_NETWORK", request: {} });
    await waitFor(() => expect(storedPhase("org1")).toBe("uncertain"));
    expect(readLedgerWriteUncertainty("org1")).toMatchObject({ action: "setup", pending: false });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });

    renderPanel();
    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start bookkeeping setup" })).toBeDisabled();
    // Never retried, and no generic toast.
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sends nothing when the browser cannot store the pending setup marker", async () => {
    renderPanel();
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      await startSetup();
      expect(
        await screen.findByText(/couldn't keep a safety record of the change, so nothing was sent/),
      ).toBeInTheDocument();
    } finally {
      setItem.mockRestore();
    }
    expect(api.post).not.toHaveBeenCalled();
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("sends nothing when another tab left a marker this screen hasn't seen", async () => {
    renderPanel();
    // Written straight to storage after this screen mounted.
    window.localStorage.setItem(
      ledgerWriteUncertaintyKey("org1"),
      JSON.stringify({ organisationId: "org1", action: "create-accounts", at: "" }),
    );
    await startSetup();

    expect(
      await screen.findByText("An earlier ledger change is still waiting to be confirmed, so nothing was sent."),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("create-accounts");
  });

  it("clears a definite setup refusal's own marker", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: { error: "Already", code: "LEDGER_ALREADY_EXISTS" },
      },
    });
    renderPanel();
    await startSetup();

    expect(
      await screen.findByText(/doesn't confirm whether your earlier attempt was saved/),
    ).toBeInTheDocument();
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("keeps organisation A's outcome while organisation B stays writable", async () => {
    const request = holdRequest(api.post);
    const view = renderPanel();
    await startSetup();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    view.unmount();

    setPermissions(["finance.manage"], false, "org2");
    renderPanel({
      organisationId: "org2",
      status: statusOf("not_active", { memberReceiptsEnabled: null, revision: null }),
      accounts: [],
    });
    expect(screen.queryByText("Waiting for the server to confirm that change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start bookkeeping setup" })).toBeEnabled();

    request.resolve({ data: { data: wireStatusOf("setup", { memberReceiptsEnabled: false, revision: 0 }) } });
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    expect(readLedgerWriteUncertainty("org2")).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org2") });
  });

  it("acknowledges an uncertain initial setup after a fresh no-ledger recheck", async () => {
    markLedgerWriteUncertain("org1", "setup");
    markLedgerWriteUncertain("org2", "setup");
    const recheck = realRecheck(noLedgerStatus(), []);
    renderPanel({ onRecheckLedger: recheck });

    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(acknowledge).toBeEnabled());
    expect(recheck).toHaveBeenCalledWith({ requireAllocations: false, allowInitialSetup: true });
    // A recheck never resends the setup.
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(acknowledge);
    await confirmInDialog("I've checked");
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    // Only the organisation being reconciled is cleared.
    expect(readLedgerWriteUncertainty("org2")?.action).toBe("setup");
  });

  it.each(["create-accounts", "update-account", "member-receipts"] as const)(
    "does not accept the no-ledger shape for an unresolved %s write",
    async (action) => {
      markLedgerWriteUncertain("org1", action);
      const recheck = realRecheck(noLedgerStatus(), []);
      renderPanel({ onRecheckLedger: recheck });
      const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });

      fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
      await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
      expect(recheck).toHaveBeenCalledWith({ requireAllocations: false, allowInitialSetup: false });
      expect(acknowledge).toBeDisabled();
    },
  );

  it.each([
    ["a failed refetch", undefined, undefined],
    ["a malformed status", { state: "not_active", revision: "bad" }, []],
    ["missing accounts", noLedgerStatus(), undefined],
    ["nonempty accounts", noLedgerStatus(), [wireAccount]],
    ["an existing ledger with no revision", { ...noLedgerStatus(), state: "setup" }, []],
  ])(
    "does not accept %s as an initial setup recheck",
    async (_label, statusData, accountsData) => {
      markLedgerWriteUncertain("org1", "setup");
      const recheck = realRecheck(statusData, accountsData);
      renderPanel({ onRecheckLedger: recheck });
      const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });

      fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
      await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
      expect(acknowledge).toBeDisabled();
    },
  );

  it("still requires the F3 allocations setting for a member-allocations recheck", async () => {
    markLedgerWriteUncertain("org1", "member-allocations");
    const recheck = realRecheck(wireStatusOf("active", { revision: 4 }), []);
    renderPanel({ onRecheckLedger: recheck });
    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });

    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
    expect(recheck).toHaveBeenCalledWith({ requireAllocations: true, allowInitialSetup: false });
    expect(acknowledge).toBeDisabled();
  });

  it("treats a setup request cut off by reload as unresolved, with a fresh usable recheck", async () => {
    window.localStorage.setItem(
      ledgerWriteUncertaintyKey("org1"),
      JSON.stringify({
        organisationId: "org1",
        action: "setup",
        at: "2026-10-20T09:00:00.000Z",
        phase: "pending",
        writeId: "sent-before-the-reload",
      }),
    );
    const recheck = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPanel({ onRecheckLedger: recheck });

    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for the server to confirm that change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start bookkeeping setup" })).toBeDisabled();
    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
    expect(recheck).toHaveBeenCalledWith({ requireAllocations: false, allowInitialSetup: true });
    expect(acknowledge).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(acknowledge).toBeEnabled());
    fireEvent.click(acknowledge);
    await confirmInDialog("I've checked");
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("never lets a delayed response clear a newer marker", async () => {
    const request = holdRequest(api.post);
    const view = renderPanel();
    await startSetup();
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    view.unmount();

    markLedgerWriteUncertain("org1", "create-accounts");
    request.resolve({ data: { data: wireStatusOf("setup", { memberReceiptsEnabled: false, revision: 0 }) } });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") }));
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("create-accounts");
  });

  it("tracks a member-receipts setting write before sending and latches a lost response", async () => {
    const request = holdRequest(api.patch);
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false, revision: 5 }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Turn on member receipts" }));
    await confirmInDialog("Turn on");
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));

    expect(request.markerAtDispatch).toEqual([
      expect.objectContaining({ action: "member-receipts", pending: true }),
    ]);
    expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/settings", {
      expectedLedgerRevision: 5,
      memberReceiptsEnabled: true,
    });
    request.reject({ message: "Network Error", code: "ERR_NETWORK", request: {} });
    await waitFor(() => expect(storedPhase("org1")).toBe("uncertain"));
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("member-receipts");
  });

  it("tracks a batch category creation before sending", async () => {
    const request = holdRequest(api.post);
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ id: "cash", name: "Cash in hand" }), account({ id: "eq", name: "Opening balance equity", class: "equity", subtype: "opening_balance_equity" })],
      reloadAccounts: async () => [],
    });

    await toggle(screen.getByRole("checkbox", { name: "Select Donations" }));
    await toggle(screen.getByRole("checkbox", { name: "Select Utilities" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected categories (2)" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    expect(request.markerAtDispatch).toEqual([
      expect.objectContaining({ action: "create-accounts", pending: true }),
    ]);
    expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
      accounts: [
        { name: "Donations", class: "income", subtype: null },
        { name: "Utilities", class: "expense", subtype: null },
      ],
    });
    request.resolve({ data: { data: { accounts: [] } } });
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
  });
});

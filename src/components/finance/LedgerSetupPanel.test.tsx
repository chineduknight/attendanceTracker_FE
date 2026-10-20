import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { confirmInDialog, render, toggle } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import LedgerSetupPanel from "components/finance/LedgerSetupPanel";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import {
  ACCOUNT_CHANGE_UNAVAILABLE_NOTE,
  OPENING_PENDING_ACCOUNTS_NOTE,
  OPENING_PENDING_CREATE_NOTE,
  SUGGESTION_FROZEN_NOTE,
  SUSPENDED_ACCOUNTS_NOTE,
  SUSPENDED_CREATE_NOTE,
} from "helpers/ledgerSetup";
import {
  LEDGER_WRITE_UNCERTAIN_NOTE,
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

const setPermissions = (permissions: PermissionKey[], isOwner = false) =>
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id: ORGANISATION_ID, isOwner, permissions },
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
        accountsError={null}
        onRetryAccounts={() => undefined}
        isRetryingAccounts={false}
        enabled
        {...props}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setPermissions(["finance.manage"]);
  api.post.mockResolvedValue({ data: { data: {} } });
  api.patch.mockResolvedValue({ data: { data: {} } });
});

afterEach(() => {
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
    expect(screen.getByText(/needs the finance manage permission/)).toBeInTheDocument();
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
  it("keeps account management hidden until setup has started", () => {
    renderPanel();
    expect(screen.queryByText("Chart of accounts")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
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

describe("<LedgerSetupPanel> starter chart", () => {
  it("never creates the suggested accounts on its own", () => {
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: true }) });
    expect(screen.getByText("Cash in hand")).toBeInTheDocument();
    expect(screen.getByText("Opening balance equity")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("posts only the chosen suggestions, in one batch", async () => {
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: false }) });

    await toggle(screen.getByRole("checkbox", { name: "Select Cash in hand" }));
    await toggle(
      screen.getByRole("checkbox", { name: "Select Opening balance equity" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add selected accounts (2)" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
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
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("offers the member-money holding account only when receipts are on", () => {
    const { unmount } = renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
    });
    expect(
      screen.queryByRole("checkbox", { name: "Select Member money – unallocated" }),
    ).not.toBeInTheDocument();
    unmount();

    queryClient.clear();
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: true }) });
    expect(
      screen.getByRole("checkbox", { name: "Select Member money – unallocated" }),
    ).toBeInTheDocument();
  });

  it("hides suggestions that are already active accounts", () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ name: "cash in hand", revision: 1 })],
    });
    expect(
      screen.queryByRole("checkbox", { name: "Select Cash in hand" }),
    ).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> creating a custom account", () => {
  it("posts the trimmed draft without inventing optional fields", async () => {
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: false }) });

    fireEvent.click(screen.getByRole("button", { name: "New account" }));
    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "  Petty cash " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [{ name: "Petty cash", class: "asset", subtype: "cash" }],
      }),
    );
  });

  it("shows the backend refusal instead of claiming success", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: 'An active account named "Petty cash" already exists.',
          code: "LEDGER_ACCOUNT_NAME_TAKEN",
        },
      },
    });
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: false }) });

    fireEvent.click(screen.getByRole("button", { name: "New account" }));
    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "Petty cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByText(/already exists/)).toBeInTheDocument();
    expect(screen.queryByText(/Account added/)).not.toBeInTheDocument();
    // The inline backend message is the only feedback: no generic toast.
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("blocks a money account while opening balances are pending", () => {
    renderPanel({ status: statusOf("pending_verification", { memberReceiptsEnabled: false }) });

    fireEvent.click(screen.getByRole("button", { name: "New account" }));
    expect(screen.getByRole("button", { name: "Add account" })).toBeDisabled();
    expect(screen.getAllByText(SUGGESTION_FROZEN_NOTE).length).toBeGreaterThan(0);
  });

  it("treats an uncoded 503 as an unconfirmed outcome, not a clean failure", async () => {
    api.post.mockRejectedValue({
      response: { status: 503, data: { error: "Gateway timeout" } },
    });
    renderPanel({ status: statusOf("setup", { memberReceiptsEnabled: false }) });

    fireEvent.click(screen.getByRole("button", { name: "New account" }));
    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "Petty cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getByText(LEDGER_WRITE_UNCERTAIN_NOTE)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    // Further writes are blocked until someone checks the ledger.
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> account row actions", () => {
  it("renames an account with its expected revision", async () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ revision: 4 })],
    });

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "Cash box" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/a1", {
        expectedRevision: 4,
        name: "Cash box",
      }),
    );
  });

  it("deactivates only after confirmation and never deletes", async () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ revision: 1 })],
    });

    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await confirmInDialog("Deactivate");

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/a1", {
        expectedRevision: 1,
        active: false,
      }),
    );
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("offers no row change when the account list has no revision", () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ revision: null })],
    });

    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_CHANGE_UNAVAILABLE_NOTE)).toBeInTheDocument();
  });

  it("never offers to deactivate the opening balance equity account", () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [
        account({
          name: "Opening balance equity",
          class: "equity",
          subtype: "opening_balance_equity",
          revision: 2,
        }),
      ],
    });

    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
  });

  it("allows rename only while the ledger is suspended", () => {
    renderPanel({
      status: statusOf("suspended", { memberReceiptsEnabled: true }),
      accounts: [account({ revision: 2 })],
    });

    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
    expect(screen.getByText(SUSPENDED_CREATE_NOTE)).toBeInTheDocument();
    expect(screen.getByText(SUSPENDED_ACCOUNTS_NOTE)).toBeInTheDocument();
  });

  it("freezes money accounts while opening balances are pending", () => {
    renderPanel({
      status: statusOf("pending_verification", { memberReceiptsEnabled: false }),
      accounts: [account({ revision: 2 })],
    });

    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.getByText(OPENING_PENDING_CREATE_NOTE)).toBeInTheDocument();
    expect(screen.getByText(OPENING_PENDING_ACCOUNTS_NOTE)).toBeInTheDocument();
  });
});

describe("<LedgerSetupPanel> unresolved write latch", () => {
  it("blocks every write after a network failure and never toasts a generic error", async () => {
    api.post.mockRejectedValue({ message: "Network Error", code: "ERR_NETWORK", request: {} });
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [account({ revision: 2 })],
    });

    fireEvent.click(screen.getByRole("button", { name: "New account" }));
    fireEvent.change(screen.getByLabelText("Account name"), {
      target: { value: "Petty cash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getAllByText(LEDGER_WRITE_UNCERTAIN_NOTE).length).toBeGreaterThan(0);
    expect(screen.getByText(/Check whether the account now exists/)).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    // Exactly one attempt was sent; none may be repeated while unresolved.
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "New account" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
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

  it("keeps writes blocked until an officer confirms the ledger was checked", async () => {
    markLedgerWriteUncertain("org1", "setup");
    renderPanel();

    expect(screen.getByRole("button", { name: "Start bookkeeping setup" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "I've checked the ledger" }));
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
    });

    await toggle(screen.getByRole("checkbox", { name: "Select Cash in hand" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected accounts (1)" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org2/ledger/accounts", {
        accounts: [{ name: "Cash in hand", class: "asset", subtype: "cash" }],
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

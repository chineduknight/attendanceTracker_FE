import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { confirmInDialog, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import LedgerSetupPanel from "components/finance/LedgerSetupPanel";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import { MEMBER_INCOME_IN_USE_NOTE } from "helpers/ledgerSetup";
import {
  ledgerWriteUncertaintyKey,
  markLedgerWriteUncertain,
  readLedgerWriteUncertainty,
} from "helpers/ledgerWriteUncertainty";
import { LEDGER_F3_SETUP_UI_ENABLED } from "config/ledgerF3Setup";
import { LEDGER_SETUP_UI_ENABLED } from "config/ledgerSetup";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG } from "zStore";

/**
 * F3A: member-money allocation setup inside the bookkeeping setup panel.
 * Every request is mocked; nothing here reaches a real ledger.
 */

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

const statusOf = (
  state: LedgerKnownState,
  overrides: Partial<LedgerStatus> = {},
): LedgerStatus => ({
  state: { kind: "known", state },
  currency: "NGN",
  openingBalancesVerified: state === "active" || state === "suspended",
  postingEnabled: false,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: null,
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 4,
  memberReceiptsEnabled: true,
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
  name: "Cash in hand",
  class: "asset",
  subtype: "cash",
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: true,
  ...overrides,
});

const DUES = account({
  id: "dues",
  name: "Dues income (from allocations)",
  class: "income",
  subtype: "member_dues_income",
  openingVerified: null,
  revision: 2,
});
const LEVY = account({
  id: "levy",
  name: "Levy income (from allocations)",
  class: "income",
  subtype: "member_levy_income",
  openingVerified: null,
  revision: 5,
});
const DONATIONS = account({
  id: "don",
  name: "Donations",
  class: "income",
  subtype: null,
  openingVerified: null,
});
const BASE_CHART = [account(), DONATIONS];

const setPermissions = (permissions: PermissionKey[], isOwner = false, id = "org1") =>
  useGlobalStore.setState({
    organisation: { ...EMPTY_ORG, id, isOwner, permissions },
  });

const panel = (props: Partial<ComponentProps<typeof LedgerSetupPanel>> = {}) => (
  <QueryClientProvider client={queryClient}>
    <LedgerSetupPanel
      organisationId="org1"
      status={statusOf("active")}
      accounts={BASE_CHART}
      accountsError={null}
      onRetryAccounts={() => undefined}
      isRetryingAccounts={false}
      enabled
      f3SetupEnabled
      {...props}
    />
  </QueryClientProvider>
);

const renderPanel = (props: Partial<ComponentProps<typeof LedgerSetupPanel>> = {}) =>
  render(panel(props));

const readinessRow = (title: string) => {
  const list = screen.getByRole("list", { name: "Allocation readiness" });
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => within(item).queryByText(title));
  if (!row) throw new Error(`readiness row "${title}" missing`);
  return row;
};

const settingsPatches = () =>
  api.patch.mock.calls.filter(([url]) => url === "/finance/org1/ledger/settings");

let invalidate: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setPermissions(["finance.manage"]);
  api.post.mockResolvedValue({ data: { data: { accounts: [] } } });
  api.patch.mockResolvedValue({ data: { data: {} } });
  invalidate = jest.spyOn(queryClient, "invalidateQueries");
});

afterEach(() => {
  invalidate.mockRestore();
  useGlobalStore.setState({ organisation: EMPTY_ORG });
});

describe("F3A gate", () => {
  it("ships with the F3A gate and the setup gate off", () => {
    expect(LEDGER_F3_SETUP_UI_ENABLED).toBe(false);
    expect(LEDGER_SETUP_UI_ENABLED).toBe(false);
  });

  it("renders no allocation controls while the F3A gate is off", () => {
    renderPanel({
      f3SetupEnabled: false,
      status: statusOf("active", { allocationsEnabled: true }),
      accounts: [...BASE_CHART, DUES, LEVY],
    });

    expect(screen.getByText("Bookkeeping setup")).toBeInTheDocument();
    expect(screen.queryByText("Member money allocations")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /allocations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dues income account/i })).not.toBeInTheDocument();
    // The chart still labels the accounts the server sent.
    expect(screen.getAllByText("Income · Member dues income")).toHaveLength(1);
  });

  it("requires a fresh recheck for an F2 write even while the F3A gate is off", async () => {
    markLedgerWriteUncertain("org1", "create-accounts");
    const recheck = jest.fn().mockResolvedValue(true);
    renderPanel({ f3SetupEnabled: false, onRecheckLedger: recheck });

    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(recheck).toHaveBeenCalledWith({ requireAllocations: false }));
    await waitFor(() => expect(acknowledge).toBeEnabled());
  });

  it("is not shown before bookkeeping setup has started", () => {
    renderPanel({ status: statusOf("not_active", { revision: null, allocationsEnabled: false }) });
    expect(screen.queryByText("Member money allocations")).not.toBeInTheDocument();
  });
});

describe("F3A readiness", () => {
  it("shows which prerequisites are met and which are missing", () => {
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: false }),
      accounts: [...BASE_CHART, DUES],
    });

    expect(within(readinessRow("Member receipts are on")).getByText("Missing")).toBeInTheDocument();
    expect(within(readinessRow("An active dues income account")).getByText("Ready")).toBeInTheDocument();
    expect(within(readinessRow("An active levy income account")).getByText("Missing")).toBeInTheDocument();
    expect(within(readinessRow("The ledger accepts setting changes")).getByText("Ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeDisabled();
    // Nothing is created or switched on for the officer.
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("explains that enabling allocates nothing already held", () => {
    renderPanel();
    expect(screen.getByText(/doesn't allocate any money already held/)).toBeInTheDocument();
  });

  it("offers nothing when the server does not report the setting", () => {
    renderPanel({ status: statusOf("active", { allocationsEnabled: null }) });

    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText(/doesn't report the allocations setting/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /allocations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /income account/i })).not.toBeInTheDocument();
  });

  it("refuses changes while the ledger is suspended", () => {
    renderPanel({
      status: statusOf("suspended", { allocationsEnabled: true }),
      accounts: [...BASE_CHART, DUES, LEVY],
    });
    expect(within(readinessRow("The ledger accepts setting changes")).getByText("Missing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off allocations" })).toBeDisabled();
  });

  it("waits for a reload before the toggle can send a revision", () => {
    renderPanel({ accounts: [...BASE_CHART, DUES, LEVY], isRefreshingLedger: true });
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeDisabled();
  });
});

describe("F3A permissions", () => {
  it("shows readiness to a viewer without any control", () => {
    setPermissions(["finance.view"]);
    renderPanel({ accounts: BASE_CHART });

    expect(screen.getByText("Member money allocations")).toBeInTheDocument();
    expect(within(readinessRow("You can manage finance")).getByText("Missing")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /allocations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /income account/i })).not.toBeInTheDocument();
  });

  it("lets the owner manage it through the owner bypass", () => {
    setPermissions([], true);
    renderPanel({ accounts: [...BASE_CHART, DUES, LEVY] });
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeEnabled();
  });
});

describe("F3A member income accounts", () => {
  it("creates the dues income account only after confirmation, with the exact body", async () => {
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Add the dues income account" }));
    await confirmInDialog("Add account");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [
          { name: "Dues income (from allocations)", class: "income", subtype: "member_dues_income" },
        ],
      }),
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") }),
    );
  });

  it("creates the levy income account under an edited name", async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText("Levy income account name"), {
      target: { value: "  Levy income " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add the levy income account" }));
    await confirmInDialog("Add account");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [{ name: "Levy income", class: "income", subtype: "member_levy_income" }],
      }),
    );
  });

  it("does not call the API when the confirmation is cancelled", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Add the dues income account" }));
    await confirmInDialog("Cancel");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("never offers a second active account in the same role", () => {
    renderPanel({ accounts: [...BASE_CHART, DUES] });
    expect(screen.queryByRole("button", { name: "Add the dues income account" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add the levy income account" })).toBeInTheDocument();
  });

  it("refuses a name an active account already uses before sending anything", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Dues income account name"), {
      target: { value: "donations" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add the dues income account" }));

    expect(await screen.findByText('An active account named "donations" already exists.')).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("reactivates an inactive account with its revision after confirmation", async () => {
    renderPanel({ accounts: [...BASE_CHART, DUES, { ...LEVY, active: false }] });

    expect(within(readinessRow("An active levy income account")).getByText(/is inactive\. Reactivate it or add a new one/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Reactivate ${LEVY.name}` }));
    await confirmInDialog("Reactivate");

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/levy", {
        expectedRevision: 5,
        active: true,
      }),
    );
  });

  it("does not offer reactivation in the chart when the role is already taken", () => {
    renderPanel({
      accounts: [...BASE_CHART, DUES, { ...DUES, id: "old-dues", name: "Old dues income", active: false }],
    });
    expect(screen.getByText(/already has an active member dues income account, so this one can't be reactivated/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reactivate" })).not.toBeInTheDocument();
  });

  it("explains a singleton conflict from the server without claiming success", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: { error: "This ledger already has an active member_dues_income account.", code: "LEDGER_ALREADY_EXISTS" },
      },
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Add the dues income account" }));
    await confirmInDialog("Add account");

    expect(await screen.findByText("This ledger already has an active member_dues_income account.")).toBeInTheDocument();
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
  });

  it("explains an older server's role refusal in plain words", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 422,
        data: { error: "Account type not allowed. Use asset with subtype cash…", code: "LEDGER_ACCOUNT_ROLE_MISMATCH" },
      },
    });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Add the levy income account" }));
    await confirmInDialog("Add account");

    expect(await screen.findByText(/doesn't accept that account type yet/)).toBeInTheDocument();
  });
});

describe("F3A deactivation rules in the chart", () => {
  it("blocks deactivating a member income account while allocations are on", () => {
    renderPanel({
      status: statusOf("active", { allocationsEnabled: true }),
      accounts: [DUES, LEVY],
    });
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
    expect(screen.getAllByText(MEMBER_INCOME_IN_USE_NOTE)).toHaveLength(2);
  });

  it("allows it once allocations are off, after confirmation", async () => {
    renderPanel({ accounts: [DUES] });
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    await confirmInDialog("Deactivate");
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/dues", {
        expectedRevision: 2,
        active: false,
      }),
    );
  });
});

describe("F3A allocation setting", () => {
  const READY = [...BASE_CHART, DUES, LEVY];

  it("turns allocations on with the exact body and the server revision", async () => {
    renderPanel({ status: statusOf("active", { revision: 9 }), accounts: READY });

    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    expect(
      within(await screen.findByRole("alertdialog")).getByText(/doesn't allocate any money that is already held/),
    ).toBeInTheDocument();
    await confirmInDialog("Turn on allocations");

    await waitFor(() => expect(settingsPatches()).toHaveLength(1));
    expect(settingsPatches()[0][1]).toEqual({ expectedLedgerRevision: 9, memberAllocationsEnabled: true });
    // One setting per request: never combined with member receipts.
    expect(settingsPatches()[0][1]).not.toHaveProperty("memberReceiptsEnabled");
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") }),
    );
  });

  it("turns allocations off with the exact body after explaining history stays", async () => {
    renderPanel({ status: statusOf("pending_verification", { allocationsEnabled: true, revision: 3 }), accounts: READY });

    expect(screen.getByText(/not reversed or deleted/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn off allocations" }));
    expect(
      within(await screen.findByRole("alertdialog")).getByText(/money already allocated stays recorded in the ledger/),
    ).toBeInTheDocument();
    await confirmInDialog("Turn off allocations");

    await waitFor(() => expect(settingsPatches()).toHaveLength(1));
    expect(settingsPatches()[0][1]).toEqual({ expectedLedgerRevision: 3, memberAllocationsEnabled: false });
  });

  it("sends nothing when the confirmation is cancelled", async () => {
    renderPanel({ accounts: READY });
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Cancel");
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("reloads the ledger after a stale revision and says nothing was saved", async () => {
    api.patch.mockRejectedValue({
      response: {
        status: 409,
        data: { error: "The ledger has changed since you loaded it. Reload and try again.", code: "LEDGER_REVISION_CONFLICT" },
      },
    });
    renderPanel({ accounts: READY });
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");

    expect(await screen.findByText(/nothing was saved\. It has been reloaded/)).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("uses the revision of the status it is given after a concurrent change", async () => {
    const view = renderPanel({ status: statusOf("active", { revision: 4 }), accounts: READY });
    // Another officer's change arrives through the refetch before this click.
    view.rerender(panel({ status: statusOf("active", { revision: 6 }), accounts: READY }));

    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");
    await waitFor(() => expect(settingsPatches()).toHaveLength(1));
    expect(settingsPatches()[0][1]).toEqual({ expectedLedgerRevision: 6, memberAllocationsEnabled: true });
  });

  it.each([
    ["LEDGER_MEMBER_RECEIPTS_DISABLED", "Enable member receipts before enabling member money allocations."],
    [
      "LEDGER_REQUIRED_ACCOUNT_MISSING",
      "Add an active member dues income account and an active member levy income account before enabling member money allocations.",
    ],
  ])("shows the backend's %s refusal", async (code, error) => {
    api.patch.mockRejectedValue({ response: { status: 422, data: { error, code } } });
    renderPanel({ accounts: READY });
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");

    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("treats a coded write-gate 503 as not saved", async () => {
    api.patch.mockRejectedValue({ response: { status: 503, data: { code: "LEDGER_WRITES_DISABLED" } } });
    renderPanel({ accounts: READY });
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");

    expect(await screen.findByText(/Ledger changes aren't available on this server right now/)).toBeInTheDocument();
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });
});

describe("F3A unconfirmed outcomes", () => {
  const READY = [...BASE_CHART, DUES, LEVY];

  it.each([
    ["an uncoded 503", { response: { status: 503, data: { error: "Gateway timeout" } } }],
    ["a network error", { message: "Network Error" }],
  ])("latches %s and blocks every write across a reload", async (_label, failure) => {
    api.patch.mockRejectedValue(failure);
    const view = renderPanel({ accounts: READY });
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");

    expect(await screen.findByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.queryByText("That change wasn't saved")).not.toBeInTheDocument();
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("member-allocations");
    expect(screen.getByText(/now on or off before trying again/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeDisabled();

    // A reload re-reads the persisted marker: still blocked, never retried.
    view.unmount();
    renderPanel({ accounts: [...BASE_CHART] });
    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add the dues income account" })).not.toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledTimes(1);
  });

  it("requires a clean recheck before an officer can acknowledge", async () => {
    markLedgerWriteUncertain("org1", "member-allocations");
    const recheck = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPanel({ accounts: READY, onRecheckLedger: recheck });

    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();
    expect(
      screen.getByText("Recheck the ledger first, then compare it with the change you made."),
    ).toBeInTheDocument();

    // A failed reload is not a recheck.
    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
    expect(recheck).toHaveBeenCalledWith({ requireAllocations: true });
    expect(acknowledge).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(acknowledge).toBeEnabled());

    fireEvent.click(acknowledge);
    await confirmInDialog("I've checked");
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeEnabled(),
    );
  });
});

describe("F3A organisation isolation", () => {
  const READY = [...BASE_CHART, DUES, LEVY];

  it("keeps one organisation's unresolved write out of another", () => {
    markLedgerWriteUncertain("org1", "member-allocations");
    setPermissions(["finance.manage"], false, "org2");
    renderPanel({ organisationId: "org2", accounts: READY });

    expect(screen.queryByText("We couldn't confirm that change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeEnabled();
  });

  it("sends and invalidates only for the organisation on screen after a switch", async () => {
    const view = renderPanel({ accounts: READY });
    setPermissions(["finance.manage"], false, "org2");
    view.rerender(panel({ organisationId: "org2", status: statusOf("active", { revision: 11 }), accounts: READY }));

    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org2/ledger/settings", {
        expectedLedgerRevision: 11,
        memberAllocationsEnabled: true,
      }),
    );
    expect(settingsPatches()).toHaveLength(0);
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org2") }),
    );
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
  });

  it("latches an unconfirmed outcome under the organisation that sent it", async () => {
    api.patch.mockRejectedValue({ message: "Network Error" });
    setPermissions(["finance.manage"], false, "org2");
    renderPanel({ organisationId: "org2", accounts: READY });
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");

    await waitFor(() => expect(readLedgerWriteUncertainty("org2")?.action).toBe("member-allocations"));
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });
});

/**
 * Review of FE #140: an F3A write must not lose its marker when the screen
 * unmounts (FinanceWorkspace is keyed by organisation, so a switch unmounts
 * it, and TanStack Query v4 drops `mutate` callbacks on unmount).
 */
describe("F3A durable write lifecycle", () => {
  const READY = [...BASE_CHART, DUES, LEVY];

  const deferred = () => {
    let resolve: (value: unknown) => void = () => undefined;
    let reject: (reason: unknown) => void = () => undefined;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  /** The request is held open; records the marker the server call saw. */
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

  const turnOn = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  };

  it("stores the marker before sending, keeps it while the screen unmounts, and clears it once confirmed", async () => {
    const request = holdRequest(api.patch);
    const view = renderPanel({ accounts: READY });
    await turnOn();

    // Durable before the request left: the server call saw it.
    expect(request.markerAtDispatch).toEqual([
      expect.objectContaining({ organisationId: "org1", action: "member-allocations", pending: true }),
    ]);
    expect(await screen.findByText("Waiting for the server to confirm that change")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I've checked the ledger" })).not.toBeInTheDocument();
    // The toggle shows its spinner (and loses its name); nothing in the
    // section can be pressed while the outcome is pending.
    const section = screen.getByRole("region", { name: "Member money allocations" });
    expect(within(section).getAllByRole("button").length).toBeGreaterThan(0);
    within(section)
      .getAllByRole("button")
      .forEach((button) => expect(button).toBeDisabled());

    view.unmount();
    expect(storedPhase("org1")).toBe("pending");

    request.resolve({ data: { data: {} } });
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });

    renderPanel({ status: statusOf("active", { allocationsEnabled: true }), accounts: READY });
    expect(screen.queryByText("We couldn't confirm that change")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for the server to confirm that change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn off allocations" })).toBeEnabled();
  });

  it("latches an ambiguous failure that arrives after the officer left Books", async () => {
    const request = holdRequest(api.patch);
    const view = renderPanel({ accounts: READY });
    await turnOn();
    view.unmount();

    request.reject({ message: "Network Error" });
    await waitFor(() => expect(storedPhase("org1")).toBe("uncertain"));
    expect(readLedgerWriteUncertainty("org1")).toMatchObject({
      action: "member-allocations",
      pending: false,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });

    renderPanel({ accounts: READY });
    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "I've checked the ledger" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeDisabled();
    // Never retried.
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("latches an ambiguous failure under the sending organisation after a switch, and leaves the other alone", async () => {
    const request = holdRequest(api.patch);
    const view = renderPanel({ accounts: READY });
    await turnOn();

    // FinanceWorkspace is keyed by organisation: a switch is a remount.
    view.unmount();
    setPermissions(["finance.manage"], false, "org2");
    renderPanel({ organisationId: "org2", status: statusOf("active", { revision: 11 }), accounts: READY });
    // Org 1's pending write never blocks Org 2.
    expect(screen.queryByText("Waiting for the server to confirm that change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeEnabled();

    request.reject({ response: { status: 502, data: { error: "Bad gateway" } } });
    await waitFor(() => expect(storedPhase("org1")).toBe("uncertain"));
    expect(readLedgerWriteUncertainty("org2")).toBeNull();
    expect(screen.queryByText("We couldn't confirm that change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeEnabled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org2") });
  });

  it("clears only the sending organisation's marker when a confirmation arrives after a switch", async () => {
    markLedgerWriteUncertain("org2", "create-accounts");
    const request = holdRequest(api.patch);
    const view = renderPanel({ accounts: READY });
    await turnOn();
    view.unmount();
    setPermissions(["finance.manage"], false, "org2");
    renderPanel({ organisationId: "org2", accounts: READY });

    request.resolve({ data: { data: {} } });
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    expect(readLedgerWriteUncertainty("org2")?.action).toBe("create-accounts");
    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org2") });
  });

  it("treats a request cut off by a hard reload as unresolved, with acknowledgement after a clean recheck", async () => {
    // What a reload leaves: the stored pending marker, no running request.
    window.localStorage.setItem(
      ledgerWriteUncertaintyKey("org1"),
      JSON.stringify({
        organisationId: "org1",
        action: "member-allocations",
        at: "2026-10-20T09:00:00.000Z",
        phase: "pending",
        writeId: "sent-before-the-reload",
      }),
    );
    const recheck = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    renderPanel({ accounts: READY, onRecheckLedger: recheck });

    expect(screen.getByText("We couldn't confirm that change")).toBeInTheDocument();
    expect(screen.queryByText("Waiting for the server to confirm that change")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn on allocations" })).toBeDisabled();
    const acknowledge = screen.getByRole("button", { name: "I've checked the ledger" });
    expect(acknowledge).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(recheck).toHaveBeenCalledTimes(1));
    expect(acknowledge).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Recheck the ledger" }));
    await waitFor(() => expect(acknowledge).toBeEnabled());

    fireEvent.click(acknowledge);
    await confirmInDialog("I've checked");
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("sends nothing when another tab left a marker this screen hasn't seen", async () => {
    renderPanel({ accounts: READY });
    // Written straight to storage: this screen was never told.
    window.localStorage.setItem(
      ledgerWriteUncertaintyKey("org1"),
      JSON.stringify({ organisationId: "org1", action: "create-accounts", at: "" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
    await confirmInDialog("Turn on allocations");

    expect(
      await screen.findByText("An earlier ledger change is still waiting to be confirmed, so nothing was sent."),
    ).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("create-accounts");
  });

  it("sends nothing when the browser cannot store the marker", async () => {
    renderPanel({ accounts: READY });
    const setItem = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      fireEvent.click(screen.getByRole("button", { name: "Turn on allocations" }));
      await confirmInDialog("Turn on allocations");
      expect(await screen.findByText(/couldn't keep a safety record of the change, so nothing was sent/)).toBeInTheDocument();
    } finally {
      setItem.mockRestore();
    }
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("creates a member income account under the same model: pending before sending, latched after unmount", async () => {
    const request = holdRequest(api.post);
    const view = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Add the dues income account" }));
    await confirmInDialog("Add account");
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

    expect(request.markerAtDispatch).toEqual([
      expect.objectContaining({ action: "create-accounts", pending: true }),
    ]);
    expect(await screen.findByText("Waiting for the server to confirm that change")).toBeInTheDocument();
    view.unmount();

    request.reject({ response: { status: 503, data: { error: "Service unavailable" } } });
    await waitFor(() => expect(storedPhase("org1")).toBe("uncertain"));
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("create-accounts");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("clears an account creation's marker when it is confirmed after unmount", async () => {
    const request = holdRequest(api.post);
    const view = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Add the levy income account" }));
    await confirmInDialog("Add account");
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    view.unmount();

    request.resolve({ data: { data: { accounts: [] } } });
    await waitFor(() => expect(readLedgerWriteUncertainty("org1")).toBeNull());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.finance.ledger.root("org1") });
  });

  it("reactivates under the same model and clears the marker on a definite refusal", async () => {
    const request = holdRequest(api.patch);
    renderPanel({ accounts: [...BASE_CHART, DUES, { ...LEVY, active: false }] });
    fireEvent.click(screen.getByRole("button", { name: `Reactivate ${LEVY.name}` }));
    await confirmInDialog("Reactivate");
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));

    expect(request.markerAtDispatch).toEqual([
      expect.objectContaining({ action: "update-account", pending: true }),
    ]);
    request.reject({
      response: {
        status: 409,
        data: { error: "The account has changed since you loaded it.", code: "LEDGER_REVISION_CONFLICT" },
      },
    });
    expect(await screen.findByText(/nothing was saved\. It has been reloaded/)).toBeInTheDocument();
    expect(readLedgerWriteUncertainty("org1")).toBeNull();
  });

  it("latches a reactivation whose response is lost after unmount", async () => {
    const request = holdRequest(api.patch);
    const view = renderPanel({ accounts: [...BASE_CHART, DUES, { ...LEVY, active: false }] });
    fireEvent.click(screen.getByRole("button", { name: `Reactivate ${LEVY.name}` }));
    await confirmInDialog("Reactivate");
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    view.unmount();

    request.reject({ message: "timeout of 0ms exceeded", code: "ECONNABORTED" });
    await waitFor(() => expect(storedPhase("org1")).toBe("uncertain"));
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("update-account");
  });

  it("protects a specialised F3 income account through the generic account update route", async () => {
    const request = holdRequest(api.patch);
    const view = renderPanel({ accounts: [...BASE_CHART, DUES, LEVY] });
    const chart = screen.getByRole("list", { name: "Chart of accounts" });
    const row = within(chart)
      .getAllByRole("listitem")
      .find((item) => within(item).queryByText(DUES.name));
    if (!row) throw new Error("member dues income row missing");
    fireEvent.click(within(row).getByRole("button", { name: "Rename" }));
    fireEvent.change(within(row).getByLabelText("Account name"), {
      target: { value: "Dues income renamed" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));

    expect(request.markerAtDispatch).toEqual([
      expect.objectContaining({ action: "update-account", pending: true }),
    ]);
    expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/dues", {
      expectedRevision: 2,
      name: "Dues income renamed",
    });

    view.unmount();
    request.reject({ response: { status: 503, data: { error: "Service unavailable" } } });
    await waitFor(() => expect(storedPhase("org1")).toBe("uncertain"));
    expect(readLedgerWriteUncertainty("org1")?.action).toBe("update-account");
  });
});

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { confirmInDialog, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import LedgerLifecyclePanel from "components/finance/lifecycle/LedgerLifecyclePanel";
import { LedgerStatus } from "components/finance/ledgerTypes";
import {
  beginLedgerWriteIntent,
  ledgerWriteIntentKey,
  markLedgerWriteIntentUnresolved,
  readLedgerWriteIntent,
} from "helpers/ledgerWriteIntent";
import { todayInLagos } from "helpers/openingBalances";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

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

const TODAY = todayInLagos();
const TODAY_DATE = parseISO(TODAY);
const OPENING = format(subDays(TODAY_DATE, 30), "yyyy-MM-dd");
const EARLIER_LOCK = format(subDays(TODAY_DATE, 10), "yyyy-MM-dd");
const LATER_LOCK = format(subDays(TODAY_DATE, 2), "yyyy-MM-dd");
const ACTIVATED_AT = `${format(subDays(TODAY_DATE, 20), "yyyy-MM-dd")}T09:00:00.000Z`;
const ATTESTED_AT = `${format(subDays(TODAY_DATE, 1), "yyyy-MM-dd")}T09:30:00.000Z`;

const statusOf = (overrides: Partial<LedgerStatus> = {}): LedgerStatus => ({
  state: { kind: "known", state: "active" },
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: false,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: OPENING,
  lockedThrough: null,
  revision: 7,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: false,
  activatedAt: ACTIVATED_AT,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
  ...overrides,
});

/** A raw wire status for write responses (parsed by the hook). */
const wireStatus = (overrides: Record<string, unknown> = {}) => ({
  state: "active",
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: false,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: OPENING,
  lockedThrough: null,
  revision: 8,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  pendingProposal: null,
  activatedAt: ACTIVATED_AT,
  gapWindowAttestedAt: null,
  ...overrides,
});

const auditRow = (overrides: Record<string, unknown> = {}) => ({
  id: "a1",
  action: "ledger_suspended",
  actorId: "owner-1",
  at: "2026-10-18T10:00:00.000Z",
  ledgerRevision: 8,
  subject: { type: "ledger", id: "org1" },
  before: { state: "active" },
  after: { state: "suspended" },
  reason: "Treasurer handover",
  voidId: null,
  ...overrides,
});

const serveAudit = ({
  items = [auditRow()] as unknown[],
  nextCursor = null as string | null,
  fail = false,
} = {}) => {
  api.get.mockImplementation((url: string) => {
    if (!String(url).includes("/ledger/audit")) {
      return Promise.resolve({ data: { data: {} } });
    }
    return fail
      ? Promise.reject({ response: { status: 404, data: { error: "Not found" } } })
      : Promise.resolve({ data: { data: { items, nextCursor } } });
  });
};

const setSession = ({
  permissions = ["finance.manage"] as PermissionKey[],
  isOwner = false,
} = {}) => {
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner, permissions },
  });
};

const renderPanel = ({
  status = statusOf(),
  organisationId = "org1",
  enabled = true,
  onRecheckLedger = jest.fn(),
}: {
  status?: LedgerStatus;
  organisationId?: string;
  enabled?: boolean;
  onRecheckLedger?: () => void;
} = {}) =>
  render(
    <QueryClientProvider client={queryClient}>
      <LedgerLifecyclePanel
        organisationId={organisationId}
        status={status}
        enabled={enabled}
        onRecheckLedger={onRecheckLedger}
      />
    </QueryClientProvider>,
  );

const openSuspend = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Suspend ledger" }));
};

const submitSuspend = async (reason: string) => {
  await openSuspend();
  fireEvent.change(screen.getByLabelText("Reason for suspending"), {
    target: { value: reason },
  });
  fireEvent.click(screen.getByRole("button", { name: "Suspend ledger" }));
  await confirmInDialog("Suspend bookkeeping");
};

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setSession();
  api.post.mockResolvedValue({ data: { data: wireStatus({ state: "suspended" }) } });
  api.put.mockResolvedValue({ data: { data: wireStatus() } });
});

afterEach(() => {
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("<LedgerLifecyclePanel> gate and state", () => {
  it("renders nothing and reads nothing while its gate is off", () => {
    serveAudit();
    renderPanel({ enabled: false });

    expect(screen.queryByText("Lifecycle")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("renders nothing for a state this build does not recognise", () => {
    serveAudit();
    renderPanel({ status: statusOf({ state: { kind: "unknown", raw: "frozen" } }) });

    expect(screen.queryByText("Lifecycle")).not.toBeInTheDocument();
  });

  it("shows lifecycle facts, readiness blockers and the audit trail", async () => {
    serveAudit({
      items: [
        auditRow({ id: "a2", action: "period_locked", before: { lockedThrough: null }, after: { lockedThrough: LATER_LOCK }, reason: null }),
        auditRow(),
      ],
      nextCursor: "older",
    });
    renderPanel({
      status: statusOf({ lockedThrough: LATER_LOCK, blockers: ["LEDGER_WRITES_DISABLED"] }),
    });

    expect(await screen.findByText("Lifecycle")).toBeInTheDocument();
    expect(screen.getByText("Ledger revision: 7")).toBeInTheDocument();
    expect(screen.getByText(`Period locked through: ${format(parseISO(LATER_LOCK), "d MMM yyyy")}`)).toBeInTheDocument();
    expect(screen.getByText("LEDGER_WRITES_DISABLED")).toBeInTheDocument();
    expect(await screen.findByText("Ledger suspended")).toBeInTheDocument();
    expect(screen.getByText("Reason: Treasurer handover")).toBeInTheDocument();
    expect(screen.getByText("State: active → suspended")).toBeInTheDocument();
    expect(screen.getByText("Period lock set")).toBeInTheDocument();
    expect(
      screen.getByText(/Showing the most recent audit records; older records aren't shown here/),
    ).toBeInTheDocument();
  });

  it("explains that lifecycle actions need activation before they are offered", () => {
    serveAudit({ items: [] });
    renderPanel({
      status: statusOf({
        state: { kind: "known", state: "setup" },
        openingBalancesVerified: false,
        activatedAt: null,
        gapWindowAttestation: "unknown",
      }),
    });

    expect(
      screen.getByText(/Lifecycle actions become available after the ledger is activated/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Suspend ledger" }),
    ).not.toBeInTheDocument();
  });

  it("does not claim an empty audit trail when the read is unavailable", async () => {
    serveAudit({ fail: true });
    renderPanel();

    expect(
      await screen.findByText("The audit trail isn't available from this server yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("No ledger audit records yet.")).not.toBeInTheDocument();
  });
});

describe("<LedgerLifecyclePanel> permissions", () => {
  it("blocks every action for a viewer and says why", async () => {
    serveAudit();
    setSession({ permissions: ["finance.view"] });
    renderPanel();

    expect(await screen.findByRole("button", { name: "Suspend ledger" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set period lock" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Record gap-window attestation" }),
    ).toBeDisabled();
    expect(
      screen.getAllByText("You need the finance manage permission.").length,
    ).toBeGreaterThan(0);
  });

  it("keeps owner-only actions away from a finance manager", async () => {
    serveAudit();
    setSession({ permissions: ["finance.manage"] });
    renderPanel();

    expect(await screen.findByRole("button", { name: "Suspend ledger" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set period lock" })).toBeDisabled();
    expect(
      screen.getByText("Only the organisation owner can suspend, resume or move the period lock."),
    ).toBeInTheDocument();
    // The gap-window attestation is the one lifecycle write a manager owns.
    expect(
      screen.getByRole("button", { name: "Record gap-window attestation" }),
    ).toBeEnabled();
  });

  it("enables the owner's lifecycle controls", async () => {
    serveAudit();
    setSession({ isOwner: true });
    renderPanel();

    expect(await screen.findByRole("button", { name: "Suspend ledger" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Set period lock" })).toBeEnabled();
  });
});

describe("<LedgerLifecyclePanel> suspend and resume", () => {
  it("requires a reason and posts only the contract fields", async () => {
    serveAudit();
    setSession({ isOwner: true });
    const onRecheckLedger = jest.fn();
    renderPanel({ onRecheckLedger });

    await openSuspend();
    const submit = screen.getByRole("button", { name: "Suspend ledger" });
    expect(submit).toBeDisabled();
    expect(screen.getByText("Enter a reason for this change.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Reason for suspending"), {
      target: { value: "Treasurer handover" },
    });
    fireEvent.click(submit);
    await confirmInDialog("Suspend bookkeeping");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/suspend", {
        expectedLedgerRevision: 7,
        reason: "Treasurer handover",
      }),
    );
    expect(await screen.findByText(/The ledger is suspended/)).toBeInTheDocument();
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
    expect(onRecheckLedger).toHaveBeenCalled();
  });

  it("keeps the safety record when the outcome is unknown, then clears it on acknowledgement", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.post.mockRejectedValue({ message: "Network Error", code: "ERR_NETWORK" });
    renderPanel();

    await submitSuspend("Treasurer handover");

    expect(
      await screen.findByText("We couldn't confirm the last ledger change"),
    ).toBeInTheDocument();
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { action: "suspend-ledger", state: "unresolved" },
    });
    expect(screen.getByRole("button", { name: "Suspend ledger" })).toBeDisabled();
    expect(screen.queryByText(/The ledger is suspended/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "I've checked the ledger" }));
    await confirmInDialog("I've checked");

    await waitFor(() => expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Suspend ledger" })).toBeEnabled(),
    );
  });

  it("shows a stale-revision refusal and clears the safety record", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: "The ledger has changed since you loaded it. Reload and try again.",
          code: "LEDGER_REVISION_CONFLICT",
        },
      },
    });
    renderPanel();

    await submitSuspend("Treasurer handover");

    expect(
      await screen.findByText(/The ledger has changed since you loaded it/),
    ).toBeInTheDocument();
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
  });

  it("never claims a suspension from an unreadable 2xx body", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.post.mockResolvedValue({ data: { data: {} } });
    renderPanel();

    await submitSuspend("Treasurer handover");

    expect(
      await screen.findByText(/couldn't read the resulting ledger state/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The ledger is suspended/)).not.toBeInTheDocument();
  });

  it("lets an owner resume a suspended ledger with a reason", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.post.mockResolvedValue({ data: { data: wireStatus({ state: "active" }) } });
    renderPanel({
      status: statusOf({ state: { kind: "known", state: "suspended" } }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Resume ledger" }));
    fireEvent.change(screen.getByLabelText("Reason for resuming"), {
      target: { value: "Handover complete" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Resume ledger" }));
    await confirmInDialog("Resume bookkeeping");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/resume", {
        expectedLedgerRevision: 7,
        reason: "Handover complete",
      }),
    );
    expect(await screen.findByText("The ledger is active again.")).toBeInTheDocument();
  });

  it("shows the suspension reason from the audit trail without inventing one", async () => {
    serveAudit({ items: [auditRow()] });
    renderPanel({
      status: statusOf({ state: { kind: "known", state: "suspended" } }),
    });

    expect((await screen.findAllByText("Reason: Treasurer handover")).length).toBeGreaterThan(0);
  });

  it("admits when the loaded audit page does not include the suspension", async () => {
    serveAudit({ items: [auditRow({ action: "period_locked", reason: null })] });
    renderPanel({
      status: statusOf({ state: { kind: "known", state: "suspended" } }),
    });

    expect(
      await screen.findByText(
        /The most recent audit records don't include the suspension, so its reason isn't shown here/,
      ),
    ).toBeInTheDocument();
  });
});

describe("<LedgerLifecyclePanel> gap-window attestation", () => {
  it("offers the attestation only when the server says it is not attested", async () => {
    serveAudit();
    renderPanel({
      status: statusOf({
        gapWindowAttestation: "attested",
        gapWindowAttestedAt: ATTESTED_AT,
      }),
    });
    expect(
      await screen.findByText(/Gap window attested:/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record gap-window attestation" }),
    ).not.toBeInTheDocument();

    queryClient.clear();
    renderPanel({ status: statusOf({ gapWindowAttestation: "unknown" }) });
    expect(
      await screen.findByText(/neither offers nor claims an attestation/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record gap-window attestation" }),
    ).not.toBeInTheDocument();
  });

  it("attests with the exact body and only claims what the status shows", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.post.mockResolvedValue({
      data: { data: wireStatus({ gapWindowAttestedAt: ATTESTED_AT }) },
    });
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Record gap-window attestation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record attestation" }));
    await confirmInDialog("Attest gap window");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/gap-window/attest", {
        expectedLedgerRevision: 7,
        attestation: true,
      }),
    );
    expect(await screen.findByText(/The gap window is recorded as attested/)).toBeInTheDocument();
  });

  it("does not report an attestation the response does not show", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.post.mockResolvedValue({ data: { data: wireStatus() } });
    renderPanel();

    fireEvent.click(
      await screen.findByRole("button", { name: "Record gap-window attestation" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record attestation" }));
    await confirmInDialog("Attest gap window");

    expect(
      await screen.findByText(/doesn't report the gap window as attested/),
    ).toBeInTheDocument();
  });
});

describe("<LedgerLifecyclePanel> period lock", () => {
  const openLock = async () => {
    fireEvent.click(await screen.findByRole("button", { name: /period lock/ }));
  };

  it("moves the lock forward without a reason and posts the contract body", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.put.mockResolvedValue({
      data: { data: wireStatus({ lockedThrough: LATER_LOCK }) },
    });
    renderPanel();

    await openLock();
    fireEvent.change(screen.getByLabelText("New lock date"), {
      target: { value: format(parseISO(LATER_LOCK), "MMM d, yyyy") },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set period lock" }));
    await confirmInDialog("Move the period lock");

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/finance/org1/ledger/period-lock", {
        expectedLedgerRevision: 7,
        lockedThrough: LATER_LOCK,
      }),
    );
    expect(await screen.findByText(/The period is now locked through/)).toBeInTheDocument();
  });

  it("requires a reason to move the lock back", async () => {
    serveAudit();
    setSession({ isOwner: true });
    renderPanel({ status: statusOf({ lockedThrough: LATER_LOCK }) });

    await openLock();
    fireEvent.change(screen.getByLabelText("New lock date"), {
      target: { value: format(parseISO(EARLIER_LOCK), "MMM d, yyyy") },
    });

    expect(
      await screen.findByText("Enter a reason for moving the period lock back."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move period lock" })).toBeDisabled();

    fireEvent.change(
      screen.getByLabelText("Reason (required when moving back or removing)"),
      { target: { value: "Late bank charge" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Move period lock" }));
    await confirmInDialog("Move the period lock");

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/finance/org1/ledger/period-lock", {
        expectedLedgerRevision: 7,
        lockedThrough: EARLIER_LOCK,
        reason: "Late bank charge",
      }),
    );
  });

  it("requires a reason to remove the lock", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.put.mockResolvedValue({ data: { data: wireStatus({ lockedThrough: null }) } });
    renderPanel({ status: statusOf({ lockedThrough: LATER_LOCK }) });

    await openLock();
    const remove = screen.getByRole("button", { name: "Remove period lock" });
    expect(remove).toBeDisabled();
    expect(
      screen.getByText("Enter a reason for removing the period lock."),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("Reason (required when moving back or removing)"),
      { target: { value: "Year-end review" } },
    );
    fireEvent.click(remove);
    await confirmInDialog("Remove the period lock");

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/finance/org1/ledger/period-lock", {
        expectedLedgerRevision: 7,
        lockedThrough: null,
        reason: "Year-end review",
      }),
    );
    expect(await screen.findByText("The period lock is removed.")).toBeInTheDocument();
  });

  it("refuses an unchanged lock date instead of posting a no-op", async () => {
    serveAudit();
    setSession({ isOwner: true });
    renderPanel({ status: statusOf({ lockedThrough: LATER_LOCK }) });

    await openLock();

    expect(
      await screen.findByText("The period lock is already at this date."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move period lock" })).toBeDisabled();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("reconciles an unknown lock outcome before allowing another move", async () => {
    serveAudit();
    setSession({ isOwner: true });
    api.put.mockRejectedValue({ message: "Network Error" });
    renderPanel();

    await openLock();
    fireEvent.change(screen.getByLabelText("New lock date"), {
      target: { value: format(parseISO(LATER_LOCK), "MMM d, yyyy") },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set period lock" }));
    await confirmInDialog("Move the period lock");

    expect(
      await screen.findByText("We couldn't confirm the last ledger change"),
    ).toBeInTheDocument();
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { action: "set-period-lock", state: "unresolved" },
    });
    expect(screen.getByRole("button", { name: "Set period lock" })).toBeDisabled();
  });
});

describe("<LedgerLifecyclePanel> organisation isolation", () => {
  it("keeps an unresolved write and the audit read scoped to one organisation", async () => {
    serveAudit();
    setSession({ isOwner: true });
    const intent = beginLedgerWriteIntent("org1", "suspend-ledger");
    if (intent) markLedgerWriteIntentUnresolved(intent);

    renderPanel({ organisationId: "org2" });

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Suspend ledger" })).toBeEnabled(),
    );
    expect(api.get.mock.calls.every(([url]) => String(url).startsWith("/finance/org2/"))).toBe(
      true,
    );
    expect(
      screen.queryByText("We couldn't confirm the last ledger change"),
    ).not.toBeInTheDocument();
    expect(readLedgerWriteIntent("org1")).toMatchObject({ kind: "pending" });
  });

  it("blocks lifecycle actions for the organisation with the unresolved write", async () => {
    serveAudit();
    setSession({ isOwner: true });
    window.localStorage.setItem(ledgerWriteIntentKey("org1"), "not json");
    renderPanel();

    expect(
      await screen.findByText(/safety record for a ledger change that this app version can't read/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspend ledger" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set period lock" })).toBeDisabled();
  });
});

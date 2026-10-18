import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { confirmInDialog, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import OpeningBalancesPanel from "components/finance/OpeningBalancesPanel";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import {
  beginLedgerWriteIntent,
  markLedgerWriteIntentUnresolved,
  readLedgerWriteIntent,
} from "helpers/ledgerWriteIntent";
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

const FINGERPRINT = "a".repeat(64);

const seedUnresolvedIntent = () => {
  const intent = beginLedgerWriteIntent("org1", "verify-opening");
  if (intent) markLedgerWriteIntentUnresolved(intent);
};

const statusOf = (
  state: LedgerKnownState,
  overrides: Partial<LedgerStatus> = {},
): LedgerStatus => ({
  state: { kind: "known", state },
  currency: "NGN",
  openingBalancesVerified: state === "active",
  postingEnabled: false,
  contractVersion: "f2-0.3",
  blockers: [],
  openingDate: null,
  lockedThrough: null,
  revision: 4,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: true,
  ...overrides,
});

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "cash",
  name: "Cash in hand",
  class: "asset",
  subtype: "cash",
  currency: "NGN",
  active: true,
  revision: 1,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

const ACCOUNTS = [
  account(),
  account({ id: "bank", name: "Main bank", subtype: "bank", bankName: "GTBank", accountNumberLast4: "4321" }),
  account({
    id: "equity",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
  }),
];

const PROPOSAL = {
  id: "p1",
  kind: "initial",
  status: "submitted",
  asOfDate: "2026-10-10",
  lines: [
    { accountId: "cash", amountKobo: 0 },
    { accountId: "bank", amountKobo: 34050050 },
  ],
  memberMoneyItems: [
    {
      id: "i1",
      payerName: "Ada Obi",
      memberId: null,
      purpose: "dues",
      obligationId: null,
      amountKobo: 200000,
      evidence: "Envelope 7",
    },
  ],
  itemChanges: [],
  summary: { moneyKobo: 34050050, memberMoneyKobo: 200000, equityKobo: 33850050 },
  evidence: "Counted by the treasurer",
  reason: null,
  fingerprint: FINGERPRINT,
  proposedBy: "proposer",
  proposedAt: "2026-10-18T10:00:00.000Z",
  decidedBy: null,
  decidedAt: null,
  decisionNote: null,
  journalId: null,
  revision: 0,
};

const EFFECTIVE = {
  openingDate: "2026-10-10",
  accounts: [
    {
      accountId: "cash",
      openingDate: "2026-10-10",
      proposalId: "p0",
      originalKobo: 0,
      corrections: [],
      effectiveKobo: 0,
    },
  ],
  memberMoneyItems: [],
};

const setSession = ({
  permissions = ["finance.manage"] as PermissionKey[],
  isOwner = false,
  userId = "officer-1",
} = {}) => {
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: userId },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner, permissions },
  });
};

const serveOpenings = ({
  proposals = [PROPOSAL] as unknown[],
  effective = EFFECTIVE as unknown,
} = {}) => {
  api.get.mockImplementation((url: string) => {
    if (String(url).includes("/opening-balances/effective"))
      return Promise.resolve({ data: { data: effective } });
    return Promise.resolve({ data: { data: { items: proposals, nextCursor: null } } });
  });
};

const renderPanel = (
  props: Partial<ComponentProps<typeof OpeningBalancesPanel>> = {},
) =>
  render(
    <QueryClientProvider client={queryClient}>
      <OpeningBalancesPanel
        organisationId="org1"
        status={statusOf("setup")}
        accounts={ACCOUNTS}
        enabled
        {...props}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setSession();
  api.post.mockResolvedValue({ data: { data: {} } });
});

afterEach(() => {
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("<OpeningBalancesPanel> gate and state", () => {
  it("renders nothing while its own gate is off", () => {
    serveOpenings();
    renderPanel({ enabled: false });

    expect(screen.queryByText("Opening balances")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("asks for ledger setup first and reads nothing before a ledger exists", () => {
    serveOpenings();
    renderPanel({ status: statusOf("not_active", { revision: null }) });

    expect(screen.getByText("Set up the ledger first")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows awaiting accounts, verified zero and verified figures", async () => {
    serveOpenings();
    renderPanel();

    expect(
      await screen.findByText("Cash and bank accounts awaiting opening verification"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Cash in hand").length).toBeGreaterThan(0);
    expect(await screen.findByText("Verified ₦0")).toBeInTheDocument();
    expect(screen.getByText(/A verified zero is a confirmed count/)).toBeInTheDocument();
    expect(screen.getByText(/These are opening figures, not current balances/)).toBeInTheDocument();
  });

  it("shows the proposal list without inventing a malformed one", async () => {
    serveOpenings({ proposals: [{ id: "p1" }] });
    renderPanel();

    expect(
      await screen.findByText(/proposal list isn't available from this server yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Awaiting decision")).not.toBeInTheDocument();
  });

  it("does not offer proposing to the owner", async () => {
    serveOpenings({ proposals: [] });
    setSession({ isOwner: true });
    renderPanel();

    const button = await screen.findByRole("button", { name: "Propose opening balances" });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/owner independently verifies opening balances/),
    ).toBeInTheDocument();
  });

  it("offers proposing to a non-owner finance officer", async () => {
    serveOpenings({ proposals: [] });
    renderPanel();

    expect(
      await screen.findByRole("button", { name: "Propose opening balances" }),
    ).toBeEnabled();
  });

  it("blocks opening actions while a persisted intent is unresolved", async () => {
    serveOpenings({ proposals: [] });
    seedUnresolvedIntent();
    renderPanel();

    expect(
      await screen.findByText("We couldn't confirm the last opening change"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Propose opening balances" }),
    ).toBeDisabled();
  });

  it("scopes both reads to the selected organisation and never reads F0", async () => {
    serveOpenings();
    renderPanel({ organisationId: "org2" });

    await screen.findByText("Awaiting decision");
    expect(
      api.get.mock.calls.every(([url]) => String(url).startsWith("/finance/org2/")),
    ).toBe(true);
    // No dues/levy/payment or compliance read is involved in opening balances.
    expect(
      api.get.mock.calls.every(([url]) => !/payments|compliance|obligations/.test(String(url))),
    ).toBe(true);
  });
});

describe("<OpeningBalancesPanel> proposal review", () => {
  it("verifies with the exact fingerprint, revision and attestation", async () => {
    serveOpenings();
    setSession({ isOwner: true, userId: "owner-1" });
    api.post.mockResolvedValue({
      data: {
        data: {
          proposal: { ...PROPOSAL, status: "verified" },
          status: {
            state: "active",
            currency: "NGN",
            openingBalancesVerified: true,
            postingEnabled: false,
          },
          journal: null,
          replayed: false,
        },
      },
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText(FINGERPRINT)).toBeInTheDocument();
    expect(screen.getByText("Counted by the treasurer")).toBeInTheDocument();
    expect(screen.getByText(/Ada Obi/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Verify opening" }));
    await confirmInDialog("Verify opening balances");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/finance/org1/ledger/opening-balances/p1/verify",
        {
          expectedFingerprint: FINGERPRINT,
          expectedLedgerRevision: 4,
          attestation: true,
        },
      ),
    );
    expect(await screen.findByText(/No journal was created/)).toBeInTheDocument();
    expect(screen.getByText("Ledger state now: active.")).toBeInTheDocument();
  });

  it("never lets the proposer verify their own proposal", async () => {
    serveOpenings();
    setSession({ isOwner: true, userId: "proposer" });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Verify opening" })).toBeDisabled();
    expect(
      screen.getByText(/another officer must verify them/),
    ).toBeInTheDocument();
  });

  it("rejects with a required reason", async () => {
    serveOpenings();
    setSession({ isOwner: true, userId: "owner-1" });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Reason for rejection"), {
      target: { value: "Bank figure does not match" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));
    await confirmInDialog("Reject this proposal");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/finance/org1/ledger/opening-balances/p1/reject",
        { reason: "Bank figure does not match" },
      ),
    );
  });

  it("withdraws with an empty body", async () => {
    serveOpenings();
    setSession({ isOwner: true, userId: "owner-1" });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    await confirmInDialog("Withdraw proposal");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/finance/org1/ledger/opening-balances/p1/withdraw",
        {},
      ),
    );
  });

  it("shows a stale-proposal refusal and clears the intent", async () => {
    serveOpenings();
    setSession({ isOwner: true, userId: "owner-1" });
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: "The proposal or the accounts it covers changed since it was loaded.",
          code: "LEDGER_OPENING_CHANGED",
        },
      },
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify opening" }));
    await confirmInDialog("Verify opening balances");

    expect(await screen.findByText(/changed since it was loaded/)).toBeInTheDocument();
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
    expect(screen.getByRole("button", { name: "Verify opening" })).toBeEnabled();
  });

  it("keeps a decided proposal read-only", async () => {
    serveOpenings({ proposals: [{ ...PROPOSAL, status: "verified" }] });
    setSession({ isOwner: true, userId: "owner-1" });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    expect(screen.getByText(/has been decided and is read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify opening" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
  });

  it("keeps the previous decision block after an unknown verification outcome", async () => {
    serveOpenings();
    setSession({ isOwner: true, userId: "owner-1" });
    api.post.mockRejectedValue({ message: "Network Error", code: "ERR_NETWORK" });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify opening" }));
    await confirmInDialog("Verify opening balances");

    expect(
      await screen.findByText("We couldn't confirm the last opening change"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify opening" })).toBeDisabled();
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { action: "verify-opening", state: "unresolved" },
    });
  });
});

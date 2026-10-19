import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { chooseOption, confirmInDialog, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import OpeningBalancesPanel from "components/finance/OpeningBalancesPanel";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
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
  lockedThroughState: "none",
  revision: 4,
  memberReceiptsEnabled: false,
  unconfirmedAttempts: 0,
  hasPendingProposal: true,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
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

    const button = await screen.findByRole("button", { name: "Propose opening balances" });
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("blocks opening actions while a persisted intent is unresolved", async () => {
    serveOpenings({ proposals: [] });
    seedUnresolvedIntent();
    renderPanel();

    expect(
      await screen.findByText("We couldn't confirm the last ledger change"),
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
      await screen.findByText("We couldn't confirm the last ledger change"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify opening" })).toBeDisabled();
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { action: "verify-opening", state: "unresolved" },
    });
  });
});

describe("<OpeningBalancesPanel> supplementary and correction gates", () => {
  const ACTIVE_STATUS = statusOf("active", {
    openingDate: "2026-01-15",
    lockedThrough: null,
  });
  const verifiedAccounts = [
    account({ id: "cash", name: "Cash in hand", openingVerified: true }),
    account({
      id: "bank",
      name: "Main bank",
      subtype: "bank",
      openingVerified: true,
      bankName: "GTBank",
      accountNumberLast4: "4321",
    }),
    account({
      id: "equity",
      name: "Opening balance equity",
      class: "equity",
      subtype: "opening_balance_equity",
    }),
  ];
  const expectAdjustmentBlocked = async (reason: RegExp) => {
    renderPanel({ status: ACTIVE_STATUS, accounts: verifiedAccounts });

    const supplementary = await screen.findByRole("button", {
      name: "Supplementary opening",
    });
    const correction = screen.getByRole("button", {
      name: "Correct a verified opening",
    });
    expect(await screen.findByText(reason)).toBeInTheDocument();
    expect(supplementary).toBeDisabled();
    expect(correction).toBeDisabled();
  };

  it("refuses a viewer without finance.manage", async () => {
    serveOpenings({ proposals: [] });
    setSession({ permissions: ["finance.view"] });
    await expectAdjustmentBlocked(/finance manage permission/);
  });

  it("refuses the owner, who verifies instead of proposing", async () => {
    serveOpenings({ proposals: [] });
    setSession({ isOwner: true });
    await expectAdjustmentBlocked(/owner independently verifies/);
  });

  it("refuses another proposal while one is already open", async () => {
    serveOpenings();
    await expectAdjustmentBlocked(/already waiting for a decision/);
  });

  it("fails closed on a proposal status this app doesn't recognise", async () => {
    serveOpenings({ proposals: [{ ...PROPOSAL, status: "mystery" }] });
    await expectAdjustmentBlocked(/isn't recognised/);
  });

  it("requires an active ledger", async () => {
    serveOpenings({ proposals: [] });
    renderPanel({ status: statusOf("setup"), accounts: verifiedAccounts });

    expect(
      await screen.findByRole("button", { name: "Propose opening balances" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supplementary opening" }),
    ).not.toBeInTheDocument();
  });

  it("finds an open proposal beyond the first page", async () => {
    api.get.mockImplementation((url: string) => {
      if (String(url).includes("/opening-balances/effective")) {
        return Promise.resolve({ data: { data: EFFECTIVE } });
      }
      if (String(url).includes("cursor=c2")) {
        return Promise.resolve({ data: { data: { items: [PROPOSAL], nextCursor: null } } });
      }
      return Promise.resolve({ data: { data: { items: [], nextCursor: "c2" } } });
    });
    await expectAdjustmentBlocked(/already waiting for a decision/);
    expect(api.get.mock.calls.some(([url]) => String(url).includes("cursor=c2"))).toBe(true);
  });

  it("blocks when the history can't be read to the end", async () => {
    api.get.mockImplementation((url: string) => {
      if (String(url).includes("/opening-balances/effective")) {
        return Promise.resolve({ data: { data: EFFECTIVE } });
      }
      return Promise.resolve({ data: { data: { items: [], nextCursor: "more" } } });
    });
    await expectAdjustmentBlocked(/couldn't be read in full/);
    expect(
      await screen.findByText(/Only part of the proposal history could be read/),
    ).toBeInTheDocument();
  });
});

describe("<OpeningBalancesPanel> supplementary dates", () => {
  const today = todayInLagos();
  const openingDate = format(subDays(parseISO(today), 60), "yyyy-MM-dd");
  const olderThan31Days = format(subDays(parseISO(today), 40), "yyyy-MM-dd");
  const lockedThrough = format(subDays(parseISO(today), 5), "yyyy-MM-dd");
  const accounts = [
    account({ id: "cash", name: "Cash in hand", openingVerified: false }),
    account({
      id: "bank",
      name: "Main bank",
      subtype: "bank",
      openingVerified: false,
      bankName: "GTBank",
      accountNumberLast4: "4321",
    }),
    account({
      id: "equity",
      name: "Opening balance equity",
      class: "equity",
      subtype: "opening_balance_equity",
    }),
  ];

  const openSupplementary = async ({
    locked = null,
  }: { locked?: string | null } = {}) => {
    serveOpenings({
      proposals: [],
      effective: { openingDate, accounts: [], memberMoneyItems: [] },
    });
    renderPanel({
      status: statusOf("active", { openingDate, lockedThrough: locked }),
      accounts,
    });
    const supplementary = await screen.findByRole("button", {
      name: "Supplementary opening",
    });
    await waitFor(() => expect(supplementary).toBeEnabled());
    fireEvent.click(supplementary);
    fireEvent.change(
      await screen.findByLabelText(
        "Amount counted at the start of the opening date for Cash in hand",
      ),
      { target: { value: "0" } },
    );
    fireEvent.change(
      screen.getByLabelText("Amount counted at the start of the opening date for Main bank"),
      { target: { value: "1,000" } },
    );
    fireEvent.change(screen.getByLabelText("Supporting evidence"), {
      target: { value: "Counted after activation" },
    });
    const date = screen.getByLabelText("Counting date");
    const typeDate = (value: string) =>
      fireEvent.change(date, { target: { value: format(parseISO(value), "MMM d, yyyy") } });
    return { date, typeDate };
  };

  it("accepts a supplementary date older than 31 days", async () => {
    const { typeDate } = await openSupplementary();
    typeDate(olderThan31Days);

    const submit = screen.getByRole("button", { name: "Submit supplementary opening" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await confirmInDialog("Submit proposal");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/finance/org1/ledger/opening-balances",
        expect.objectContaining({
          kind: "supplementary",
          asOfDate: olderThan31Days,
          expectedLedgerRevision: 4,
        }),
      ),
    );
  });

  it("refuses a supplementary date inside the locked period", async () => {
    const { typeDate } = await openSupplementary({ locked: lockedThrough });
    typeDate(lockedThrough);

    expect(
      await screen.findByText(/That date is in a locked period/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Submit supplementary opening" }),
    ).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("<OpeningBalancesPanel> corrections by opening date", () => {
  const status = statusOf("active", {
    openingDate: "2026-01-15",
    lockedThrough: null,
  });
  const accounts = [
    account({ id: "cash", name: "Cash in hand", openingVerified: true }),
    account({
      id: "bank",
      name: "Main bank",
      subtype: "bank",
      openingVerified: true,
      bankName: "GTBank",
      accountNumberLast4: "4321",
    }),
    account({
      id: "equity",
      name: "Opening balance equity",
      class: "equity",
      subtype: "opening_balance_equity",
    }),
  ];
  const multiDateEffective = {
    openingDate: "2026-01-15",
    accounts: [
      {
        accountId: "cash",
        openingDate: "2026-01-15",
        proposalId: "p0",
        originalKobo: 100000,
        corrections: [],
        effectiveKobo: 100000,
      },
      {
        accountId: "bank",
        openingDate: "2026-03-01",
        proposalId: "p1",
        originalKobo: 500000,
        corrections: [],
        effectiveKobo: 500000,
      },
    ],
    memberMoneyItems: [],
  };

  const openCorrection = async () => {
    serveOpenings({ proposals: [], effective: multiDateEffective });
    renderPanel({ status, accounts });
    const correction = await screen.findByRole("button", {
      name: "Correct a verified opening",
    });
    await waitFor(() => expect(correction).toBeEnabled());
    fireEvent.click(correction);
    return screen.findByLabelText("Which opening date are you correcting?");
  };

  it("dates each correction at its own opening and never mixes dates", async () => {
    const select = await openCorrection();
    await chooseOption(select, "1 Mar 2026");

    expect(
      screen.getByLabelText("Corrected opening for Main bank"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Corrected opening for Cash in hand"),
    ).not.toBeInTheDocument();
    // Member money belongs to the ledger's own opening date only.
    expect(
      screen.getByText(/Member-money items can only be changed at the ledger's opening date/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Corrected opening for Main bank"), {
      target: { value: "6,000" },
    });
    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "Bank statement shows a higher balance" },
    });
    fireEvent.change(screen.getByLabelText("Supporting evidence"), {
      target: { value: "Statement page 2" },
    });

    const submit = screen.getByRole("button", { name: "Submit correction" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await confirmInDialog("Submit correction");

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/opening-balances", {
        kind: "correction",
        asOfDate: "2026-03-01",
        expectedLedgerRevision: 4,
        evidence: "Statement page 2",
        reason: "Bank statement shows a higher balance",
        lines: [{ accountId: "bank", correctedAmountKobo: 600000 }],
      }),
    );
  });

  it("shows member money at the ledger's opening date", async () => {
    const select = await openCorrection();
    await chooseOption(select, "15 Jan 2026");

    expect(
      screen.getByLabelText("Corrected opening for Cash in hand"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Member-money items can only be changed at the ledger's opening date/),
    ).not.toBeInTheDocument();
  });

  it("blocks a malformed non-empty amount instead of dropping it", async () => {
    const select = await openCorrection();
    await chooseOption(select, "1 Mar 2026");

    fireEvent.change(screen.getByLabelText("Corrected opening for Main bank"), {
      target: { value: "12x" },
    });
    fireEvent.change(screen.getByLabelText("Reason for correction"), {
      target: { value: "Bank statement shows a higher balance" },
    });
    fireEvent.change(screen.getByLabelText("Supporting evidence"), {
      target: { value: "Statement page 2" },
    });

    expect(
      await screen.findByText(/Enter a valid corrected amount for Main bank/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit correction" })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("<OpeningBalancesPanel> identity and intent safety", () => {
  it("disables verification when the proposer identity is missing", async () => {
    serveOpenings({ proposals: [{ ...PROPOSAL, proposedBy: null }] });
    setSession({ isOwner: true, userId: "owner-1" });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Review" }));

    expect(screen.getByRole("button", { name: "Verify opening" })).toBeDisabled();
    expect(screen.getByText(/isn't available, so verification can't be requested/)).toBeInTheDocument();
  });

  it("clears an unreadable safety record only after explicit reconciliation", async () => {
    serveOpenings({ proposals: [] });
    window.localStorage.setItem(ledgerWriteIntentKey("org1"), "not json");
    const otherOrg = beginLedgerWriteIntent("org2", "submit-opening");
    renderPanel();

    expect(
      await screen.findByText(/safety record for a ledger change that this app version can't read/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Propose opening balances" }),
    ).toBeDisabled();
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "unknown" });

    fireEvent.click(screen.getByRole("button", { name: "I've checked the ledger" }));
    await confirmInDialog("I've checked");

    await waitFor(() => expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" }));
    expect(readLedgerWriteIntent("org2")).toMatchObject({
      kind: "pending",
      intent: { intentId: otherOrg?.intentId },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Propose opening balances" }),
      ).toBeEnabled(),
    );
  });
});

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { confirmInDialog, render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import OpeningBalancesPanel from "components/finance/OpeningBalancesPanel";
import { LedgerAccount, LedgerKnownState, LedgerStatus } from "components/finance/ledgerTypes";
import { readLedgerWriteIntent } from "helpers/ledgerWriteIntent";
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
  hasPendingProposal: false,
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

const BASE_ACCOUNTS = [
  account(),
  account({ id: "bank", name: "Main bank", subtype: "bank" }),
  account({
    id: "equity",
    name: "Opening balance equity",
    class: "equity",
    subtype: "opening_balance_equity",
  }),
];

const HOLDING = account({
  id: "holding",
  name: "Member money – unallocated",
  class: "liability",
  subtype: "member_receipts_unallocated",
});

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

const serveOpenings = () => {
  api.get.mockImplementation((url: string) => {
    if (String(url).includes("/opening-balances/effective")) {
      return Promise.resolve({
        data: { data: { openingDate: null, accounts: [], memberMoneyItems: [] } },
      });
    }
    return Promise.resolve({ data: { data: { items: [], nextCursor: null } } });
  });
};

const renderPanel = ({
  status = statusOf("setup"),
  accounts = BASE_ACCOUNTS,
}: { status?: LedgerStatus; accounts?: LedgerAccount[] } = {}) =>
  render(
    <QueryClientProvider client={queryClient}>
      <OpeningBalancesPanel
        organisationId="org1"
        status={status}
        accounts={accounts}
        enabled
      />
    </QueryClientProvider>,
  );

const openForm = async () => {
  const button = await screen.findByRole("button", { name: "Propose opening balances" });
  // The CTA stays disabled until the full proposal history proves nothing is open.
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
};

const fillEvidence = (value = "Counted by the treasurer") =>
  fireEvent.change(screen.getByLabelText("Supporting evidence"), {
    target: { value },
  });

const fillCounts = (cash = "0", bank = "340,500.50") => {
  fireEvent.change(
    screen.getByLabelText("Amount counted at the start of the opening date for Cash in hand"),
    { target: { value: cash } },
  );
  fireEvent.change(
    screen.getByLabelText("Amount counted at the start of the opening date for Main bank"),
    { target: { value: bank } },
  );
};

const submitAndConfirm = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Submit proposal" }));
  await confirmInDialog("Submit opening proposal");
};

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  setSession();
  serveOpenings();
  api.post.mockResolvedValue({ data: { data: { proposal: {}, status: null } } });
});

afterEach(() => {
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("<OpeningProposalForm> no automatic submission", () => {
  it("never creates or submits a proposal on its own", async () => {
    renderPanel();
    await openForm();

    expect(screen.getByText(/Step 1 of 4/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("blocks the form when the chart of accounts is not ready", async () => {
    renderPanel({
      accounts: [account(), account({ id: "bank", name: "Main bank", subtype: "bank" })],
    });

    expect(
      await screen.findByRole("button", { name: "Propose opening balances" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Add an active opening balance equity account/),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("<OpeningProposalForm> guided initial proposal", () => {
  it("requires evidence and every counted amount, including zero", async () => {
    renderPanel();
    await openForm();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Record the supporting evidence for this count."),
    ).toBeInTheDocument();

    fillEvidence();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText(/Enter the counted amount for Cash in hand/),
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("submits integer kobo only after the review and confirmation", async () => {
    renderPanel();
    await openForm();

    fillEvidence();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillCounts();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    // Member receipts are off: the member-money step is informational.
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText(/Step 4 of 4/)).toBeInTheDocument();
    expect(screen.getAllByText(/340,500\.50/).length).toBeGreaterThan(0);
    expect(api.post).not.toHaveBeenCalled();

    await submitAndConfirm();

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/finance/org1/ledger/opening-balances",
        {
          kind: "initial",
          asOfDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          expectedLedgerRevision: 4,
          evidence: "Counted by the treasurer",
          lines: [
            { accountId: "cash", amountKobo: 0 },
            { accountId: "bank", amountKobo: 34050050 },
          ],
        },
      ),
    );
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
  });

  it("records member-money items individually and never a holding total", async () => {
    setSession();
    renderPanel({
      status: statusOf("setup", { memberReceiptsEnabled: true }),
      accounts: [...BASE_ACCOUNTS, HOLDING],
    });
    await openForm();

    fillEvidence();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillCounts();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.click(screen.getByRole("button", { name: "Add member-money item" }));
    fireEvent.change(screen.getByLabelText("Payer name"), {
      target: { value: "Ada Obi" },
    });
    fireEvent.change(screen.getByLabelText("Amount held"), {
      target: { value: "2,000" },
    });
    fireEvent.change(screen.getByLabelText("Supporting evidence"), {
      target: { value: "Envelope 7" },
    });

    expect(screen.getAllByText(/2,000/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await submitAndConfirm();

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = api.post.mock.calls[0][1];
    expect(body.memberMoneyItems).toEqual([
      {
        payerName: "Ada Obi",
        purpose: "unspecified",
        amountKobo: 200000,
        evidence: "Envelope 7",
        memberId: null,
        obligationId: null,
      },
    ]);
    // Only the two money accounts are lines: no holding-account total is sent.
    expect(body.lines).toEqual([
      { accountId: "cash", amountKobo: 0 },
      { accountId: "bank", amountKobo: 34050050 },
    ]);
  });

  it("keeps a persisted intent and warns when the outcome is unknown", async () => {
    api.post.mockRejectedValue({ message: "timeout of 10000ms exceeded", code: "ECONNABORTED" });
    renderPanel();
    await openForm();

    fillEvidence();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillCounts();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await submitAndConfirm();

    expect(
      await screen.findByText("We couldn't confirm the last ledger change"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit proposal" })).toBeDisabled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      intent: { action: "submit-opening", state: "unresolved" },
    });
  });

  it("clears the intent after a provable refusal", async () => {
    api.post.mockRejectedValue({
      response: {
        status: 409,
        data: {
          error: "An opening-balance proposal is already waiting for a decision.",
          code: "LEDGER_ALREADY_EXISTS",
        },
      },
    });
    renderPanel();
    await openForm();

    fillEvidence();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fillCounts();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await submitAndConfirm();

    expect(
      await screen.findByText(/already waiting for a decision/),
    ).toBeInTheDocument();
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
    expect(screen.getByRole("button", { name: "Submit proposal" })).toBeEnabled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

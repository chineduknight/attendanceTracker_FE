import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { confirmInDialog, render } from "test-utils/render";
import {
  holdLedgerKeyActivity,
  installPostingLockManager,
  removePostingLockManager,
} from "test-utils/postingLocks";
import { queryClient } from "services/api/apiHelper";
import UnconfirmedAttemptsPanel from "components/finance/attempts/UnconfirmedAttemptsPanel";
import CashbookPostingsPanel from "components/finance/postings/CashbookPostingsPanel";
import { LedgerAccount, LedgerStatus } from "components/finance/ledgerTypes";
import {
  beginLedgerPostingIntent,
  markLedgerPostingIntentUnresolved,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";
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
const api = require("services/api").default as Record<"get" | "post", jest.Mock>;

const TODAY = todayInLagos();
const KEY = "key-unresolved1";
const VOID_ID = "6512345678901234567890cd";
const LONG_AGO = new Date(Date.now() - 10 * 60 * 1000);

const attemptItem = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: KEY,
  status: "unresolved",
  latestAttemptAt: LONG_AGO.toISOString(),
  settlesAt: new Date(LONG_AGO.getTime() + 120000).toISOString(),
  journalId: null,
  void: null,
  attempts: [
    {
      id: "attempt-1",
      sourceType: "cash_receipt",
      actorId: "officer-1",
      startedAt: LONG_AGO.toISOString(),
      summary: { businessDate: TODAY, amountKobo: 750000, accountIds: ["cash"], counterpartyName: "Ada Obi" },
      outcome: { outcome: "unknown", code: "LEDGER_POSTING_OUTCOME_UNKNOWN", at: LONG_AGO.toISOString() },
    },
  ],
  ...overrides,
});

let pages: Record<string, unknown>;

const serveAttempts = () => {
  api.get.mockImplementation((url: string) => {
    const page = pages[url];
    return page
      ? Promise.resolve({ data: { data: page } })
      : Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const FIRST_PAGE = "/finance/org1/ledger/attempts?status=unresolved&limit=50";

const committedJournal = {
  id: "f".repeat(24),
  businessDate: TODAY,
  reference: null,
  note: null,
  sourceType: "cash_receipt",
  totalKobo: 750000,
  lines: [],
  entry: { number: "R-000031" },
};

const setSession = ({
  permissions = ["finance.view", "finance.manage"] as PermissionKey[],
  isOwner = false,
} = {}) => {
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: "org1", isOwner, permissions },
  });
};

const ACCOUNTS: LedgerAccount[] = [
  {
    id: "cash",
    name: "Cash in hand",
    class: "asset",
    subtype: "cash",
    currency: "NGN",
    active: true,
    revision: 0,
    bankName: null,
    accountNumberLast4: null,
    openingVerified: true,
  },
];

const STATUS: LedgerStatus = {
  state: { kind: "known", state: "suspended" },
  currency: "NGN",
  openingBalancesVerified: true,
  postingEnabled: false,
  contractVersion: "f2-0.3",
  blockers: ["LEDGER_WRITES_DISABLED"],
  openingDate: TODAY,
  lockedThrough: null,
  lockedThroughState: "none",
  revision: 1,
  memberReceiptsEnabled: true,
  unconfirmedAttempts: 1,
  hasPendingProposal: false,
  activatedAt: null,
  gapWindowAttestedAt: null,
  gapWindowAttestation: "not_attested",
};

const renderPanel = ({ organisationId = "org1", withCashbook = false } = {}) =>
  render(
    <QueryClientProvider client={queryClient}>
      {withCashbook && (
        <CashbookPostingsPanel
          organisationId={organisationId}
          status={STATUS}
          accounts={ACCOUNTS}
          enabled
          memberMoneyEnabled={false}
          reversalsEnabled
        />
      )}
      <UnconfirmedAttemptsPanel organisationId={organisationId} enabled />
    </QueryClientProvider>,
  );

const panel = () => within(screen.getByRole("region", { name: "Unconfirmed attempts" }));

/** A receipt this browser sent whose outcome it never learned. */
const pendingLocally = async (organisationId = "org1", key = KEY, at = LONG_AGO) => {
  const claimed = await beginLedgerPostingIntent(
    {
      organisationId,
      officerId: "officer-1",
      key,
      operation: "receipt",
      body: {
        idempotencyKey: key,
        businessDate: TODAY,
        amountKobo: 750000,
        toAccountId: "cash",
        incomeAccountId: "income",
        method: "cash",
      },
      summary: {
        operation: "receipt",
        amountKobo: 750000,
        businessDate: TODAY,
        method: "cash",
        fromAccountName: null,
        toAccountName: "Cash in hand",
        categoryName: "Donations",
      },
    },
    at,
  );
  if (claimed.kind !== "claimed") throw new Error("not claimed");
  await markLedgerPostingIntentUnresolved(claimed.record, { ambiguous: true, message: "Lost.", now: at });
};

const resolvePosts = () =>
  api.post.mock.calls.filter(([url]) => String(url).endsWith("/ledger/attempts/resolve"));

const resolveFirst = async () => {
  fireEvent.click(await panel().findByRole("button", { name: "Resolve this request" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/voided permanently/)).toBeInTheDocument();
  await confirmInDialog("Resolve request");
};

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  installPostingLockManager();
  setSession();
  pages = { [FIRST_PAGE]: { items: [attemptItem()], nextCursor: null } };
  serveAttempts();
});

afterEach(() => {
  removePostingLockManager();
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("access and listing", () => {
  it("renders nothing and reads nothing without finance.manage", () => {
    setSession({ permissions: ["finance.view"] });
    renderPanel();
    expect(screen.queryByRole("region", { name: "Unconfirmed attempts" })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("shows an officer their own attempts as unconfirmed, never as failed", async () => {
    renderPanel();
    expect(await panel().findByText("Money in")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(FIRST_PAGE);
    expect(panel().getByText(/Your posting requests/)).toBeInTheDocument();
    expect(panel().getByText(/₦7,500/)).toBeInTheDocument();
    expect(panel().getByText(/Ada Obi/)).toBeInTheDocument();
    expect(panel().getByText("Officer: You")).toBeInTheDocument();
    expect(panel().getByText("Latest known outcome: Outcome unknown")).toBeInTheDocument();
    expect(panel().getByText("Outcome unconfirmed")).toBeInTheDocument();
    expect(panel().getByText(/may or may not have been posted/)).toBeInTheDocument();
    expect(panel().getByText(/It is not a failed transaction until resolving proves it/)).toBeInTheDocument();
    expect(panel().queryByText(/^(Failed|Not posted|Refused)$/i)).not.toBeInTheDocument();
  });

  it("tells the owner they see every officer's attempts", async () => {
    setSession({ isOwner: true });
    pages[FIRST_PAGE] = {
      items: [
        attemptItem({
          attempts: [{ ...attemptItem().attempts[0], actorId: "officer-9", outcome: null }],
        }),
      ],
      nextCursor: null,
    };
    renderPanel();
    expect(await panel().findByText("Officer: Another officer (officer-9)")).toBeInTheDocument();
    expect(panel().getByText(/As the owner you see every officer's requests/)).toBeInTheDocument();
    expect(panel().getByText(/No outcome recorded, so it is treated as unknown/)).toBeInTheDocument();
  });

  it("shows the attempt history on request", async () => {
    pages[FIRST_PAGE] = {
      items: [
        attemptItem({
          attempts: [
            attemptItem().attempts[0],
            {
              ...attemptItem().attempts[0],
              id: "attempt-2",
              outcome: { outcome: "refused", code: "LEDGER_SUSPENDED", at: LONG_AGO.toISOString() },
            },
          ],
        }),
      ],
      nextCursor: null,
    };
    renderPanel();
    fireEvent.click(await panel().findByRole("button", { name: "Show attempt history (2)" }));
    expect(panel().getByText(/Refused; this attempt wrote nothing · LEDGER_SUSPENDED/)).toBeInTheDocument();
    // A later refusal never makes the key look settled.
    expect(panel().getByText("Latest known outcome: Refused; this attempt wrote nothing")).toBeInTheDocument();
    expect(panel().getByText(/this later refusal doesn't settle it/)).toBeInTheDocument();
    expect(panel().getByText("Outcome unconfirmed")).toBeInTheDocument();
  });

  it("pages with the server's cursor", async () => {
    pages[FIRST_PAGE] = { items: [attemptItem()], nextCursor: "eyJuZXh0Ijp0cnVlfQ" };
    pages[`${FIRST_PAGE}&cursor=eyJuZXh0Ijp0cnVlfQ`] = {
      items: [attemptItem({ idempotencyKey: "key-unresolved2" })],
      nextCursor: null,
    };
    renderPanel();
    fireEvent.click(await panel().findByRole("button", { name: "Load more" }));
    expect(await panel().findByText("Request key: key-unresolved2")).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("shows an error, not an empty list, for an unreadable page", async () => {
    pages[FIRST_PAGE] = { items: [{ status: "unresolved" }], nextCursor: null };
    renderPanel();
    expect(await panel().findByText("Unconfirmed attempts couldn't be loaded")).toBeInTheDocument();
    expect(panel().queryByText("No unconfirmed attempts")).not.toBeInTheDocument();
  });

  it("says when nothing is waiting", async () => {
    pages[FIRST_PAGE] = { items: [], nextCursor: null };
    renderPanel();
    expect(await panel().findByText("No unconfirmed attempts")).toBeInTheDocument();
  });
});

describe("the settlement window", () => {
  it("offers resolution only once the server's settlesAt has passed", async () => {
    pages[FIRST_PAGE] = {
      items: [attemptItem({ settlesAt: new Date(Date.now() + 1500).toISOString() })],
      nextCursor: null,
    };
    renderPanel();
    expect(await panel().findByText(/It may still be running. It can be resolved from/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Resolve this request" })).not.toBeInTheDocument();
    expect(
      await panel().findByRole("button", { name: "Resolve this request" }, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it("explains a too-recent refusal and keeps the local record", async () => {
    await pendingLocally();
    api.post.mockRejectedValue({ response: { status: 422, data: { code: "LEDGER_ATTEMPT_TOO_RECENT" } } });
    renderPanel();
    await resolveFirst();
    expect(await panel().findByText(/may still be running. The server allows resolving it two minutes/)).toBeInTheDocument();
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
  });
});

describe("resolving", () => {
  it("sends nothing until the officer confirms", async () => {
    renderPanel();
    fireEvent.click(await panel().findByRole("button", { name: "Resolve this request" }));
    await confirmInDialog("Cancel");
    expect(resolvePosts()).toHaveLength(0);
  });

  it("shows a committed key's journal and clears only the matching local record", async () => {
    await pendingLocally("org1");
    await pendingLocally("org2");
    api.post.mockResolvedValue({ status: 200, data: { data: { outcome: "committed", journal: committedJournal } } });
    renderPanel({ withCashbook: true });
    const recordMoney = within(screen.getByRole("region", { name: "Record money" }));
    expect(await recordMoney.findByText("A financial posting is unconfirmed")).toBeInTheDocument();

    await resolveFirst();
    expect(await panel().findByText("Posted")).toBeInTheDocument();
    expect(resolvePosts()).toEqual([["/finance/org1/ledger/attempts/resolve", { idempotencyKey: KEY }]]);
    expect(panel().getByText(/Money in · R-000031 · ₦7,500/)).toBeInTheDocument();
    expect(panel().getByText(/Don't enter this transaction again/)).toBeInTheDocument();
    expect(panel().getByText(/pending record for the request was cleared/)).toBeInTheDocument();
    expect(readLedgerPostingIntents("org1")).toEqual({ kind: "none" });
    expect(readLedgerPostingIntents("org2").kind).toBe("pending");
    // The same page's posting section sees the slot free at once.
    await waitFor(() =>
      expect(recordMoney.queryByText("A financial posting is unconfirmed")).not.toBeInTheDocument(),
    );
    // The list is read again for this organisation only.
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([url]) => url === FIRST_PAGE).length).toBeGreaterThan(1),
    );
    expect(api.get.mock.calls.some(([url]) => String(url).includes("/org2/"))).toBe(false);
  });

  it.each([
    [true, "Voided now", /never posted, and its key is now voided/],
    [false, "Already voided", /had already been voided earlier/],
  ])("shows a void (by this request: %s) and clears the local record", async (byThis, badge, text) => {
    await pendingLocally();
    api.post.mockResolvedValue({
      status: 200,
      data: {
        data: {
          outcome: "voided",
          voidId: VOID_ID,
          voidedBy: "officer-1",
          voidedAt: new Date().toISOString(),
          voidedByThisRequest: byThis,
        },
      },
    });
    renderPanel();
    await resolveFirst();
    expect(await panel().findByText(badge)).toBeInTheDocument();
    expect(panel().getByText(text)).toBeInTheDocument();
    expect(panel().getByText(/record it again as a new posting; it gets a new request key/)).toBeInTheDocument();
    expect(panel().getByText(/Voided by you/)).toBeInTheDocument();
    expect(panel().getByText(`Void id: ${VOID_ID}`)).toBeInTheDocument();
    expect(readLedgerPostingIntents("org1")).toEqual({ kind: "none" });
  });

  it.each([
    ["contended", { response: { status: 409, data: { code: "LEDGER_RESOLVE_CONTENDED" } } }, /being processed at the same moment/],
    ["outcome unknown", { response: { status: 503, data: { code: "LEDGER_RESOLVE_OUTCOME_UNKNOWN" } } }, /couldn't confirm whether/],
    ["a network failure", new Error("Network Error"), /couldn't confirm whether/],
    ["forbidden", { response: { status: 403, data: { error: "Only the owner can resolve another officer's attempt." } } }, /Only the owner/],
  ])("never declares the key resolved after %s, and retries with the same key", async (_label, failure, message) => {
    await pendingLocally();
    api.post.mockRejectedValueOnce(failure);
    renderPanel();
    await resolveFirst();
    expect(await panel().findByText(message)).toBeInTheDocument();
    expect(panel().queryByText("Posted")).not.toBeInTheDocument();
    expect(panel().queryByText(/Voided/)).not.toBeInTheDocument();
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");

    api.post.mockResolvedValueOnce({ status: 200, data: { data: { outcome: "committed", journal: committedJournal } } });
    await resolveFirst();
    expect(await panel().findByText("Posted")).toBeInTheDocument();
    const [first, second] = resolvePosts();
    expect(second).toEqual(first);
  });

  const completeVoid = {
    outcome: "voided",
    voidId: VOID_ID,
    voidedBy: "officer-1",
    voidedAt: "2026-10-20T09:15:00.000Z",
    voidedByThisRequest: true,
  };

  it.each([
    ["only the outcome", { outcome: "voided" }],
    ["no void id", { ...completeVoid, voidId: undefined }],
    ["no actor", { ...completeVoid, voidedBy: null }],
    ["no time", { ...completeVoid, voidedAt: undefined }],
    ["a malformed time", { ...completeVoid, voidedAt: "20/10/2026" }],
    ["a void made now by another officer", { ...completeVoid, voidedBy: "officer-9" }],
    ["a committed key without a total", { outcome: "committed", journal: { id: "f".repeat(24), businessDate: TODAY } }],
  ])("treats a 200 with %s as unproven and keeps the pending record intact", async (_label, data) => {
    await pendingLocally();
    const before = window.localStorage.getItem("presence-pro:ledger-posting-intent:org1");
    api.post.mockResolvedValue({ status: 200, data: { data } });
    renderPanel();
    await resolveFirst();
    expect(await panel().findByText(/reply didn't prove an outcome/)).toBeInTheDocument();
    expect(panel().queryByText(/^Voided$/)).not.toBeInTheDocument();
    expect(panel().queryByText(/^Posted$/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem("presence-pro:ledger-posting-intent:org1")).toBe(before);
  });

  it("never resolves a key this browser is still sending", async () => {
    const sending = await holdLedgerKeyActivity("org1", KEY, "posting");
    renderPanel();
    await resolveFirst();
    expect(await panel().findByText(/being sent from this browser right now/)).toBeInTheDocument();
    expect(resolvePosts()).toHaveLength(0);
    await sending.release();
  });

  it("allows one resolution at a time", async () => {
    pages[FIRST_PAGE] = {
      items: [attemptItem(), attemptItem({ idempotencyKey: "key-unresolved2" })],
      nextCursor: null,
    };
    let answer!: (value: unknown) => void;
    api.post.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    renderPanel();
    const [first] = await panel().findAllByRole("button", { name: "Resolve this request" });
    fireEvent.click(first);
    await confirmInDialog("Resolve request");
    await waitFor(() =>
      panel()
        .getAllByRole("button", { name: "Resolve this request" })
        .forEach((button) => expect(button).toBeDisabled()),
    );
    answer({ status: 200, data: { data: { outcome: "committed", journal: committedJournal } } });
    expect(await panel().findByText("Posted")).toBeInTheDocument();
    expect(resolvePosts()).toHaveLength(1);
  });

  it("offers this browser's own pending request that the server doesn't list", async () => {
    pages[FIRST_PAGE] = { items: [], nextCursor: null };
    await pendingLocally("org1", "key-local0001");
    api.post.mockResolvedValue({
      status: 200,
      data: { data: { outcome: "voided", voidId: VOID_ID, voidedBy: "officer-1", voidedAt: new Date().toISOString(), voidedByThisRequest: true } },
    });
    renderPanel();
    expect(await panel().findByText(/doesn't list this request as unconfirmed/)).toBeInTheDocument();
    await resolveFirst();
    expect(await panel().findByText("Voided now")).toBeInTheDocument();
    expect(resolvePosts()[0][1]).toEqual({ idempotencyKey: "key-local0001" });
    expect(readLedgerPostingIntents("org1")).toEqual({ kind: "none" });
  });

  it("waits out this browser's own window for a request it just sent", async () => {
    pages[FIRST_PAGE] = { items: [], nextCursor: null };
    await pendingLocally("org1", "key-local0001", new Date());
    renderPanel();
    expect(await panel().findByText(/It can be resolved from/)).toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Resolve this request" })).not.toBeInTheDocument();
  });
});

describe("owner: resolve by request key", () => {
  const OWNER_KEY = "0f8e2c1a-3b44-4d1e-9a51-6f0f3c2b9a10";
  const byKey = () => panel().getByLabelText("Request key");

  const resolveByKey = async (key: string, { confirm = true } = {}) => {
    fireEvent.change(byKey(), { target: { value: key } });
    fireEvent.click(panel().getByRole("button", { name: "Resolve this key" }));
    if (!confirm) return;
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/may already have been posted/)).toBeInTheDocument();
    expect(within(dialog).getByText(new RegExp(`Request key: ${key.trim()}`))).toBeInTheDocument();
    await confirmInDialog("Resolve request");
  };

  beforeEach(() => {
    setSession({ isOwner: true });
    pages[FIRST_PAGE] = { items: [], nextCursor: null };
  });

  it("is never offered to an officer who isn't the owner", async () => {
    setSession();
    renderPanel();
    await panel().findByText("No unconfirmed attempts");
    expect(panel().queryByLabelText("Request key")).not.toBeInTheDocument();
    expect(panel().queryByRole("button", { name: "Resolve this key" })).not.toBeInTheDocument();
  });

  it("resolves a key the list doesn't show, after confirmation", async () => {
    api.post.mockResolvedValue({
      status: 200,
      data: { data: { outcome: "voided", voidId: VOID_ID, voidedBy: "officer-1", voidedAt: "2026-10-20T09:15:00.000Z", voidedByThisRequest: true } },
    });
    renderPanel();
    await panel().findByText("No unconfirmed attempts");
    await resolveByKey(`  ${OWNER_KEY}  `);
    expect(await panel().findByText("Voided now")).toBeInTheDocument();
    expect(resolvePosts()).toEqual([["/finance/org1/ledger/attempts/resolve", { idempotencyKey: OWNER_KEY }]]);
    // The input is cleared for the next key once the outcome is proved.
    expect(byKey()).toHaveValue("");
  });

  it("shows a committed key's journal", async () => {
    api.post.mockResolvedValue({ status: 200, data: { data: { outcome: "committed", journal: committedJournal } } });
    renderPanel();
    await panel().findByText("No unconfirmed attempts");
    await resolveByKey(OWNER_KEY);
    expect(await panel().findByText("Posted")).toBeInTheDocument();
    expect(panel().getByText(/R-000031/)).toBeInTheDocument();
  });

  it("sends nothing when cancelled", async () => {
    renderPanel();
    await panel().findByText("No unconfirmed attempts");
    fireEvent.change(byKey(), { target: { value: OWNER_KEY } });
    fireEvent.click(panel().getByRole("button", { name: "Resolve this key" }));
    await confirmInDialog("Cancel");
    expect(resolvePosts()).toHaveLength(0);
  });

  it.each([
    ["an empty key", ""],
    ["a key that is too short", "abc"],
    ["a key with spaces inside", "key with spaces"],
    ["a key starting with punctuation", "-key-12345678"],
    ["the server's own opening key", "opening:6512345678901234567890ab"],
  ])("refuses %s before anything is sent", async (_label, key) => {
    renderPanel();
    await panel().findByText("No unconfirmed attempts");
    await resolveByKey(key, { confirm: false });
    expect(await panel().findByText(/isn't a request key this app can resolve/)).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(resolvePosts()).toHaveLength(0);
  });

  it("shows the server's refusal for a key the owner may not resolve", async () => {
    api.post.mockRejectedValue({
      response: { status: 403, data: { error: "Only the owner can resolve another officer's attempt, or a key with no recorded attempt." } },
    });
    renderPanel();
    await panel().findByText("No unconfirmed attempts");
    await resolveByKey(OWNER_KEY);
    expect(await panel().findByText(/Only the owner can resolve/)).toBeInTheDocument();
    expect(panel().queryByText(/Give the owner this request key/)).not.toBeInTheDocument();
  });

  it("resolves a key with no attempt row, and retries an unknown outcome with the same key", async () => {
    api.post
      .mockRejectedValueOnce({ response: { status: 503, data: { code: "LEDGER_RESOLVE_OUTCOME_UNKNOWN" } } })
      .mockResolvedValueOnce({
        status: 200,
        data: { data: { outcome: "voided", voidId: VOID_ID, voidedBy: "officer-1", voidedAt: "2026-10-20T09:15:00.000Z", voidedByThisRequest: false } },
      });
    renderPanel();
    await panel().findByText("No unconfirmed attempts");
    await resolveByKey(OWNER_KEY);
    expect(await panel().findByText(/couldn't confirm whether/)).toBeInTheDocument();
    // The key stays in the field, so the retry is the same request.
    expect(byKey()).toHaveValue(OWNER_KEY);
    fireEvent.click(panel().getByRole("button", { name: "Resolve this key" }));
    await confirmInDialog("Resolve request");
    expect(await panel().findByText("Already voided")).toBeInTheDocument();
    const [first, second] = resolvePosts();
    expect(second).toEqual(first);
  });

  it("clears only this organisation's matching record, and only after proof", async () => {
    await pendingLocally("org1", OWNER_KEY);
    await pendingLocally("org2", OWNER_KEY);
    api.post.mockResolvedValue({ status: 200, data: { data: { outcome: "committed", journal: committedJournal } } });
    renderPanel();
    await panel().findByText(/doesn't list this request as unconfirmed/);
    await resolveByKey(OWNER_KEY);
    expect(await panel().findByText("Posted")).toBeInTheDocument();
    expect(resolvePosts()[0][0]).toBe("/finance/org1/ledger/attempts/resolve");
    expect(readLedgerPostingIntents("org1")).toEqual({ kind: "none" });
    expect(readLedgerPostingIntents("org2").kind).toBe("pending");
  });
});

describe("an officer's key the server has no attempt for", () => {
  it("tells the officer to give the key to the owner", async () => {
    pages[FIRST_PAGE] = { items: [], nextCursor: null };
    await pendingLocally("org1", "key-local0001");
    api.post.mockRejectedValue({
      response: { status: 403, data: { error: "Only the owner can resolve another officer's attempt, or a key with no recorded attempt." } },
    });
    renderPanel();
    await resolveFirst();
    expect(
      await panel().findByText(/Give the owner this request key so they can resolve it: key-local0001/),
    ).toBeInTheDocument();
    expect(readLedgerPostingIntents("org1").kind).toBe("pending");
  });
});

import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import {
  beginLedgerWriteIntent,
  markLedgerWriteIntentUnresolved,
  readLedgerWriteIntent,
} from "helpers/ledgerWriteIntent";
import { LifecycleCallbacks, useLedgerLifecycleWrites } from "hooks/useLedgerLifecycle";
import { useOpeningBalanceWrites } from "hooks/useOpeningBalances";
import {
  INTENT_BLOCKED_MESSAGE,
  classifyIntentWriteFailure,
  useLedgerWriteIntent,
} from "hooks/useLedgerWriteIntent";
import { SubmitOpeningInput } from "components/finance/openingBalanceTypes";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<
  "get" | "post" | "put",
  jest.Mock
>;

/** A request the test settles by hand, to unmount or switch while it runs. */
const deferred = () => {
  let resolve: (value: unknown) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** An Axios response whose body is `{ data: status }`. */
const wire = (overrides: Record<string, unknown> = {}) => ({
  data: {
    data: {
      state: "active",
      currency: "NGN",
      openingBalancesVerified: true,
      postingEnabled: false,
      contractVersion: "f2-0.3",
      blockers: [],
      openingDate: "2026-09-01",
      lockedThrough: null,
      revision: 8,
      memberReceiptsEnabled: false,
      unconfirmedAttempts: 0,
      pendingProposal: null,
      activatedAt: "2026-09-02T09:00:00.000Z",
      gapWindowAttestedAt: null,
      ...overrides,
    },
  },
});

/** An Axios response whose body is `{ data: { proposal, status, ...extra } }`. */
const opening = (proposal: unknown, extra: Record<string, unknown> = {}) => ({
  data: { data: { proposal, status: wire().data.data, ...extra } },
});

const NETWORK_ERROR = { message: "Network Error", code: "ERR_NETWORK" };
const STALE_REVISION = {
  response: {
    status: 409,
    data: { error: "The ledger changed. Reload and try again." },
  },
};
const SUSPEND = { expectedLedgerRevision: 7, reason: "Treasurer handover" };
const PROPOSAL = {
  id: "p1",
  fingerprint: "f".repeat(64),
  kind: "initial" as const,
};
const SUBMIT: SubmitOpeningInput = {
  kind: "supplementary",
  asOfDate: "2026-09-01",
  expectedLedgerRevision: 7,
  evidence: "Bank statement",
  lines: [],
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const renderLifecycle = (organisationId = "org1") =>
  renderHook(({ org }) => useLedgerLifecycleWrites(org), {
    wrapper,
    initialProps: { org: organisationId },
  });

const ledgerInvalidations = (spy: jest.SpyInstance) =>
  spy.mock.calls.map(
    ([filters]) => (filters as { queryKey: unknown }).queryKey
  );

let invalidate: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  invalidate = jest.spyOn(queryClient, "invalidateQueries");
});

afterEach(() => invalidate.mockRestore());

describe("lifecycle writes outlive the screen that sent them", () => {
  it("clears the intent and reloads that organisation's ledger after an unmount", async () => {
    const request = deferred();
    api.post.mockReturnValue(request.promise);
    const onSuccess = jest.fn();
    const { result, unmount } = renderLifecycle();

    act(() => result.current.suspendLedger(SUSPEND, { onSuccess }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      inFlight: true,
    });

    unmount();
    await act(async () => request.resolve(wire({ state: "suspended" })));

    await waitFor(() =>
      expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" })
    );
    expect(ledgerInvalidations(invalidate)).toEqual([
      queryKeys.finance.ledger.root("org1"),
    ]);
  });

  it("latches an ambiguous failure after an unmount and still reloads", async () => {
    const request = deferred();
    api.put.mockReturnValue(request.promise);
    const { result, unmount } = renderLifecycle();

    act(() =>
      result.current.setPeriodLock({
        expectedLedgerRevision: 7,
        lockedThrough: "2026-10-01",
      })
    );
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => request.reject(NETWORK_ERROR));

    await waitFor(() =>
      expect(readLedgerWriteIntent("org1")).toMatchObject({
        kind: "pending",
        inFlight: false,
        intent: { action: "set-period-lock", state: "unresolved" },
      })
    );
    expect(ledgerInvalidations(invalidate)).toEqual([
      queryKeys.finance.ledger.root("org1"),
    ]);
  });

  type Writes = ReturnType<typeof useLedgerLifecycleWrites>;
  const LOCK = { expectedLedgerRevision: 7, lockedThrough: "2026-10-01" };
  it.each([
    ["a suspend answered with an active ledger", "post", wire(), (w: Writes, cb: LifecycleCallbacks) => w.suspendLedger(SUSPEND, cb)],
    ["a suspend answered with an unreadable body", "post", { data: { data: "suspended" } }, (w: Writes, cb: LifecycleCallbacks) => w.suspendLedger(SUSPEND, cb)],
    ["a suspend answered with no body", "post", { data: undefined }, (w: Writes, cb: LifecycleCallbacks) => w.suspendLedger(SUSPEND, cb)],
    ["a resume answered with a suspended ledger", "post", wire({ state: "suspended" }), (w: Writes, cb: LifecycleCallbacks) => w.resumeLedger(SUSPEND, cb)],
    ["a lock answered with another date", "put", wire({ lockedThrough: "2026-09-30" }), (w: Writes, cb: LifecycleCallbacks) => w.setPeriodLock(LOCK, cb)],
    ["an attestation answered as unattested", "post", wire(), (w: Writes, cb: LifecycleCallbacks) => w.attestGapWindow({ expectedLedgerRevision: 7, attestation: true }, cb)],
  ] as const)("never confirms %s", async (_label, method, body, send) => {
    const request = deferred();
    api[method].mockReturnValue(request.promise);
    const onSuccess = jest.fn();
    const onUnconfirmed = jest.fn();
    const onError = jest.fn();
    const { result } = renderLifecycle();

    act(() => send(result.current, { onSuccess, onUnconfirmed, onError }));
    let sentId = "";
    await waitFor(() => {
      const read = readLedgerWriteIntent("org1");
      expect(read).toMatchObject({ kind: "pending", inFlight: true });
      if (read.kind === "pending") sentId = read.intent.intentId;
    });
    await act(async () => request.resolve(body));

    await waitFor(() => expect(onUnconfirmed).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    // The same persisted intent, now unresolved; nothing resent.
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      inFlight: false,
      intent: { intentId: sentId, state: "unresolved" },
    });
    expect(api[method]).toHaveBeenCalledTimes(1);
    expect(ledgerInvalidations(invalidate)).toEqual([queryKeys.finance.ledger.root("org1")]);
  });

  it("reports an unconfirmed 2xx as an unknown failure to a screen without onUnconfirmed", async () => {
    api.post.mockResolvedValue(wire());
    const onSuccess = jest.fn();
    const onError = jest.fn();
    const { result } = renderLifecycle();

    act(() => result.current.suspendLedger(SUSPEND, { onSuccess, onError }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(classifyIntentWriteFailure(onError.mock.calls[0][0])).toEqual({
      kind: "unknown",
      response: wire().data,
    });
  });

  it("clears the intent on a refusal so the officer can correct and send again", async () => {
    api.post
      .mockRejectedValueOnce(STALE_REVISION)
      .mockResolvedValueOnce(wire({ state: "suspended" }));
    const onError = jest.fn();
    const { result } = renderLifecycle();

    act(() => result.current.suspendLedger(SUSPEND, { onError }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(classifyIntentWriteFailure(onError.mock.calls[0][0])).toEqual({
      kind: "refused",
      message: "The ledger changed. Reload and try again.",
    });
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });

    const onSuccess = jest.fn();
    act(() =>
      result.current.suspendLedger(
        { ...SUSPEND, expectedLedgerRevision: 8 },
        { onSuccess }
      )
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
  });

  it("never sends again after an ambiguous outcome until it is reconciled", async () => {
    api.post.mockRejectedValueOnce(NETWORK_ERROR);
    const { result } = renderHook(
      () => ({
        writes: useLedgerLifecycleWrites("org1"),
        intent: useLedgerWriteIntent("org1"),
      }),
      { wrapper }
    );

    const first = jest.fn();
    act(() => result.current.writes.suspendLedger(SUSPEND, { onError: first }));
    await waitFor(() => expect(first).toHaveBeenCalled());
    expect(classifyIntentWriteFailure(first.mock.calls[0][0])).toEqual({
      kind: "unknown",
      response: null,
    });
    expect(result.current.intent.blocked).toBe(true);

    const retry = jest.fn();
    act(() => result.current.writes.suspendLedger(SUSPEND, { onError: retry }));
    await waitFor(() => expect(retry).toHaveBeenCalled());
    expect(classifyIntentWriteFailure(retry.mock.calls[0][0])).toEqual({
      kind: "not-sent",
      message: INTENT_BLOCKED_MESSAGE,
    });
    expect(api.post).toHaveBeenCalledTimes(1);

    act(() => result.current.intent.acknowledge());
    expect(result.current.intent.blocked).toBe(false);
    api.post.mockResolvedValueOnce(wire({ state: "suspended" }));
    const after = jest.fn();
    act(() =>
      result.current.writes.suspendLedger(SUSPEND, { onSuccess: after })
    );
    await waitFor(() => expect(after).toHaveBeenCalled());
    // One request per deliberate send; nothing was replayed automatically.
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("sends a double submission once", async () => {
    const request = deferred();
    api.post.mockReturnValue(request.promise);
    const second = jest.fn();
    const { result } = renderLifecycle();

    act(() => {
      result.current.attestGapWindow({
        expectedLedgerRevision: 7,
        attestation: true,
      });
      result.current.attestGapWindow(
        { expectedLedgerRevision: 7, attestation: true },
        { onError: second }
      );
    });

    await waitFor(() => expect(second).toHaveBeenCalled());
    expect(classifyIntentWriteFailure(second.mock.calls[0][0]).kind).toBe(
      "not-sent"
    );
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () =>
      request.resolve(wire({ gapWindowAttestedAt: "2026-10-20T09:00:00.000Z" }))
    );
    await waitFor(() =>
      expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" })
    );
  });

  it("refuses to send when the browser can't store the safety record", async () => {
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    const onError = jest.fn();
    const { result } = renderLifecycle();

    act(() => result.current.resumeLedger(SUSPEND, { onError }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(classifyIntentWriteFailure(onError.mock.calls[0][0])).toMatchObject({
      kind: "not-sent",
      message: expect.stringMatching(/can't store the safety record/),
    });
    expect(api.post).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("keeps Org A's write, loading state and reload out of Org B", async () => {
    const request = deferred();
    api.post.mockReturnValueOnce(request.promise);
    const { result, rerender } = renderLifecycle("orgA");

    act(() => result.current.suspendLedger(SUSPEND));
    await waitFor(() => expect(result.current.isSuspending).toBe(true));

    rerender({ org: "orgB" });
    expect(result.current.isSuspending).toBe(false);
    expect(readLedgerWriteIntent("orgB")).toEqual({ kind: "none" });

    await act(async () => request.resolve(wire({ state: "suspended" })));
    await waitFor(() =>
      expect(readLedgerWriteIntent("orgA")).toEqual({ kind: "none" })
    );
    expect(api.post).toHaveBeenCalledWith(
      "/finance/orgA/ledger/suspend",
      SUSPEND
    );
    expect(ledgerInvalidations(invalidate)).toEqual([
      queryKeys.finance.ledger.root("orgA"),
    ]);
  });
});

describe("opening-balance writes outlive the screen that sent them", () => {
  const renderOpening = (organisationId = "org1") =>
    renderHook(() => useOpeningBalanceWrites(organisationId), { wrapper });

  it("clears a submit's intent and reloads after an unmount", async () => {
    const request = deferred();
    api.post.mockReturnValue(request.promise);
    const { result, unmount } = renderOpening();

    act(() => result.current.submitOpening(SUBMIT));
    await waitFor(() =>
      expect(readLedgerWriteIntent("org1")).toMatchObject({
        kind: "pending",
        inFlight: true,
        intent: { action: "submit-opening", kind: "supplementary" },
      })
    );
    unmount();
    await act(async () =>
      request.resolve(opening({ id: "p-new", kind: "supplementary", status: "submitted" }))
    );

    await waitFor(() =>
      expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" })
    );
    expect(api.post).toHaveBeenCalledWith(
      "/finance/org1/ledger/opening-balances",
      SUBMIT
    );
    expect(ledgerInvalidations(invalidate)).toEqual([
      queryKeys.finance.ledger.root("org1"),
    ]);
  });

  it("latches an ambiguous verify with the proposal it was about", async () => {
    const request = deferred();
    api.post.mockReturnValue(request.promise);
    const { result, unmount } = renderOpening();

    act(() =>
      result.current.verifyOpening(PROPOSAL, {
        expectedFingerprint: PROPOSAL.fingerprint,
        expectedLedgerRevision: 7,
        attestation: true,
      })
    );
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () =>
      request.reject({ response: { status: 502, data: {} } })
    );

    await waitFor(() =>
      expect(readLedgerWriteIntent("org1")).toMatchObject({
        kind: "pending",
        intent: {
          action: "verify-opening",
          proposalId: "p1",
          fingerprint: PROPOSAL.fingerprint,
          state: "unresolved",
        },
      })
    );
  });

  it.each([
    [
      "reject",
      (w: ReturnType<typeof useOpeningBalanceWrites>, cb: object) =>
        w.rejectOpening(PROPOSAL, "Wrong date", cb),
      { reason: "Wrong date" },
    ],
    [
      "withdraw",
      (w: ReturnType<typeof useOpeningBalanceWrites>, cb: object) =>
        w.withdrawOpening(PROPOSAL, cb),
      {},
    ],
  ])(
    "clears a refused %s so it can be sent again",
    async (name, send, body) => {
      api.post.mockRejectedValueOnce(STALE_REVISION);
      const onError = jest.fn();
      const { result } = renderOpening();

      act(() => send(result.current, { onError }));

      await waitFor(() => expect(onError).toHaveBeenCalled());
      expect(api.post).toHaveBeenCalledWith(
        `/finance/org1/ledger/opening-balances/p1/${name}`,
        body
      );
      expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" });
    }
  );

  type Writes = ReturnType<typeof useOpeningBalanceWrites>;
  type Cb = { onSuccess?: () => void; onError?: (error: unknown) => void };
  const VERIFY = { expectedFingerprint: PROPOSAL.fingerprint, expectedLedgerRevision: 7, attestation: true as const };
  const sends: Record<string, (w: Writes, cb: Cb) => void> = {
    submit: (w, cb) => w.submitOpening(SUBMIT, cb),
    verify: (w, cb) => w.verifyOpening(PROPOSAL, VERIFY, cb),
    reject: (w, cb) => w.rejectOpening(PROPOSAL, "Wrong date", cb),
    withdraw: (w, cb) => w.withdrawOpening(PROPOSAL, cb),
  };
  const done = (status: string) => ({ ...PROPOSAL, status });

  it.each([
    ["submit", "no proposal", opening(null)],
    ["submit", "an empty body", { data: {} }],
    ["submit", "no body", { data: undefined }],
    ["submit", "a proposal of another kind", opening({ id: "p-new", kind: "initial", status: "submitted" })],
    ["submit", "a proposal that isn't submitted", opening({ id: "p-new", kind: "supplementary", status: "rejected" })],
    ["verify", "a proposal still submitted", opening(done("submitted"))],
    ["verify", "another fingerprint", opening({ ...done("verified"), fingerprint: "e".repeat(64) })],
    ["verify", "another proposal", opening({ ...done("verified"), id: "p2" })],
    ["verify", "no proposal", { data: { data: { status: null, journal: null, replayed: true } } }],
    ["reject", "a withdrawn proposal", opening(done("withdrawn"))],
    ["reject", "another proposal", opening({ ...done("rejected"), id: "p2" })],
    ["withdraw", "a rejected proposal", opening(done("rejected"))],
    ["withdraw", "an unreadable proposal", { data: { data: { proposal: "withdrawn" } } }],
  ])("never confirms a %s answered with %s", async (action, _label, body) => {
    const request = deferred();
    api.post.mockReturnValue(request.promise);
    const onSuccess = jest.fn();
    const onError = jest.fn();
    const { result } = renderOpening();

    act(() => sends[action](result.current, { onSuccess, onError }));
    let sentId = "";
    await waitFor(() => {
      const read = readLedgerWriteIntent("org1");
      expect(read).toMatchObject({ kind: "pending", inFlight: true });
      if (read.kind === "pending") sentId = read.intent.intentId;
    });
    await act(async () => request.resolve(body));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(classifyIntentWriteFailure(onError.mock.calls[0][0]).kind).toBe("unknown");
    expect(readLedgerWriteIntent("org1")).toMatchObject({
      kind: "pending",
      inFlight: false,
      intent: { intentId: sentId, state: "unresolved" },
    });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(ledgerInvalidations(invalidate)).toEqual([queryKeys.finance.ledger.root("org1")]);
  });

  it.each([
    ["verify", opening(done("verified"), { status: null, journal: null, replayed: true })],
    ["reject", opening(done("rejected"))],
    ["withdraw", opening(done("withdrawn"))],
  ])("confirms a valid %s after its screen unmounts", async (action, body) => {
    const request = deferred();
    api.post.mockReturnValue(request.promise);
    const { result, unmount } = renderOpening();

    act(() => sends[action](result.current, {}));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => request.resolve(body));

    await waitFor(() => expect(readLedgerWriteIntent("org1")).toEqual({ kind: "none" }));
    expect(ledgerInvalidations(invalidate)).toEqual([queryKeys.finance.ledger.root("org1")]);
  });

  it("confirms a valid verify for the organisation that sent it after a switch", async () => {
    const request = deferred();
    api.post.mockReturnValueOnce(request.promise);
    const onSuccess = jest.fn();
    const { result, rerender } = renderHook(({ org }) => useOpeningBalanceWrites(org), {
      wrapper,
      initialProps: { org: "orgA" },
    });

    act(() => result.current.verifyOpening(PROPOSAL, VERIFY, { onSuccess }));
    await waitFor(() => expect(result.current.isVerifying).toBe(true));
    rerender({ org: "orgB" });
    expect(result.current.isVerifying).toBe(false);

    await act(async () => request.resolve(opening(done("verified"), { journal: null, replayed: false })));
    await waitFor(() => expect(readLedgerWriteIntent("orgA")).toEqual({ kind: "none" }));
    expect(readLedgerWriteIntent("orgB")).toEqual({ kind: "none" });
    expect(api.post).toHaveBeenCalledWith("/finance/orgA/ledger/opening-balances/p1/verify", VERIFY);
    expect(ledgerInvalidations(invalidate)).toEqual([queryKeys.finance.ledger.root("orgA")]);
  });

  it("shares one slot with lifecycle writes", async () => {
    const request = deferred();
    api.post.mockReturnValueOnce(request.promise);
    const onError = jest.fn();
    const { result } = renderHook(
      () => ({
        lifecycle: useLedgerLifecycleWrites("org1"),
        opening: useOpeningBalanceWrites("org1"),
      }),
      { wrapper }
    );

    act(() => result.current.lifecycle.suspendLedger(SUSPEND));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    act(() => result.current.opening.submitOpening(SUBMIT, { onError }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve(wire({ state: "suspended" })));
  });
});

describe("useLedgerWriteIntent", () => {
  it("won't acknowledge a write whose request is still running here", async () => {
    const request = deferred();
    api.post.mockReturnValue(request.promise);
    const { result } = renderHook(
      () => ({
        writes: useLedgerLifecycleWrites("org1"),
        intent: useLedgerWriteIntent("org1"),
      }),
      { wrapper }
    );

    act(() => result.current.writes.suspendLedger(SUSPEND));
    await waitFor(() =>
      expect(result.current.intent.read).toMatchObject({
        kind: "pending",
        inFlight: true,
      })
    );
    act(() => result.current.intent.acknowledge());
    expect(result.current.intent.blocked).toBe(true);

    await act(async () => request.reject(NETWORK_ERROR));
    // Settling updates the reader without a remount; now it can be reconciled.
    await waitFor(() =>
      expect(result.current.intent.read).toMatchObject({
        kind: "pending",
        inFlight: false,
      })
    );
    act(() => result.current.intent.acknowledge());
    expect(result.current.intent.blocked).toBe(false);
  });

  it("updates every reader of the slot, not only the one that changed it", () => {
    const { result: a } = renderHook(() => useLedgerWriteIntent("org1"), { wrapper });
    const { result: b } = renderHook(() => useLedgerWriteIntent("org1"), { wrapper });
    const { result: other } = renderHook(() => useLedgerWriteIntent("org2"), { wrapper });

    const intent = beginLedgerWriteIntent("org1", "resume-ledger");
    act(() => {
      markLedgerWriteIntentUnresolved(intent!);
    });
    expect(a.current.blocked).toBe(true);
    expect(b.current.blocked).toBe(true);

    act(() => a.current.acknowledge());
    expect(b.current.blocked).toBe(false);
    expect(other.current.blocked).toBe(false);
  });
});

import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { useWelfareFollowUps } from "hooks/useWelfareFollowUps";
import { WelfareFollowUp } from "components/welfare/followUps/types";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockedAxios = require("services/api").default;
const mockGet: jest.Mock = mockedAxios.get;
const mockPatch: jest.Mock = mockedAxios.patch;

const AS_OF = "2026-10-13";

const record = (
  organisationId: string,
  over: Partial<WelfareFollowUp> = {},
): WelfareFollowUp => ({
  id: `${organisationId}-f1`,
  organisationId,
  memberId: "m1",
  member: { id: "m1", name: "Ada Okafor" },
  recordDate: AS_OF,
  sourceType: "manual",
  sourceSignals: [],
  sourceAsOf: null,
  reason: "Bereavement",
  note: null,
  workflowStatus: "open",
  nextFollowUpDate: null,
  assignedTo: null,
  createdBy: null,
  updatedBy: null,
  closedAt: null,
  revision: 1,
  createdAt: "2026-10-13T10:00:00.000Z",
  updatedAt: "2026-10-13T10:00:00.000Z",
  ...over,
});

const listKey = (organisationId: string) =>
  queryKeys.welfare.followUps.list(organisationId, AS_OF);

const cachedRevision = (organisationId: string) =>
  queryClient.getQueryData<{ data: { followUps: WelfareFollowUp[] } }>(
    listKey(organisationId),
  )?.data.followUps[0].revision;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const deferred = () => {
  let resolve: (value: unknown) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  mockGet.mockImplementation((url: string) => {
    const org = String(url).includes("/org2/") ? "org2" : "org1";
    return Promise.resolve({
      data: {
        data: {
          summary: { open: 1, dueToday: 0, overdue: 0 },
          followUps: [record(org)],
        },
      },
    });
  });
});

const renderFollowUps = (organisationId = "org1") =>
  renderHook(
    ({ org }) => useWelfareFollowUps(org, { asOf: AS_OF }),
    { wrapper, initialProps: { org: organisationId } },
  );

describe("useWelfareFollowUps revision handling", () => {
  it("still reports a genuine conflict from another officer", async () => {
    const { result } = renderFollowUps();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const conflict = {
      response: {
        status: 409,
        data: { error: "Changed by someone else. Refresh and try again." },
      },
    };
    mockPatch.mockRejectedValueOnce(conflict);
    const onSuccess = jest.fn();
    const onError = jest.fn();

    act(() =>
      result.current.update(
        "org1-f1",
        { expectedRevision: 1, workflowStatus: "closed" },
        { onSuccess, onError },
      ),
    );

    await waitFor(() => expect(onError).toHaveBeenCalledWith(conflict));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(cachedRevision("org1")).toBe(1);
  });

  it("allows the next write once the previous one has settled", async () => {
    const { result } = renderFollowUps();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    mockPatch.mockRejectedValueOnce({ response: { status: 500 } });
    const onError = jest.fn();

    act(() =>
      result.current.update(
        "org1-f1",
        { expectedRevision: 1, note: "First" },
        { onError },
      ),
    );
    await waitFor(() => expect(onError).toHaveBeenCalled());

    mockPatch.mockResolvedValueOnce({
      data: { data: record("org1", { note: "Second", revision: 2 }) },
    });
    act(() =>
      result.current.update("org1-f1", { expectedRevision: 1, note: "Second" }),
    );
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2));
  });

  it("never rolls a newer cached revision back to an older reply", async () => {
    const { result } = renderFollowUps();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    queryClient.setQueryData(listKey("org1"), {
      data: {
        summary: { open: 1, dueToday: 0, overdue: 0 },
        followUps: [record("org1", { revision: 5 })],
      },
    });
    mockPatch.mockResolvedValueOnce({
      data: { data: record("org1", { revision: 2 }) },
    });
    const seenOnSuccess: Array<number | undefined> = [];

    act(() =>
      result.current.update(
        "org1-f1",
        { expectedRevision: 1, note: "x" },
        { onSuccess: () => seenOnSuccess.push(cachedRevision("org1")) },
      ),
    );

    await waitFor(() => expect(seenOnSuccess).toEqual([5]));
  });

  it("applies a reply that lands after an organisation switch to the sending organisation only", async () => {
    const { result, rerender } = renderFollowUps("org1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const reply = deferred();
    mockPatch.mockReturnValueOnce(reply.promise);

    act(() =>
      result.current.update("org1-f1", {
        expectedRevision: 1,
        workflowStatus: "closed",
      }),
    );
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(
        "/welfare/org1/follow-ups/org1-f1",
        { expectedRevision: 1, workflowStatus: "closed" },
      ),
    );

    rerender({ org: "org2" });
    await waitFor(() => expect(cachedRevision("org2")).toBe(1));
    const org2Calls = () =>
      mockGet.mock.calls.filter(([url]) => String(url).includes("/org2/"))
        .length;
    const org2CallsBefore = org2Calls();

    await act(async () =>
      reply.resolve({
        data: {
          data: record("org1", { workflowStatus: "closed", revision: 2 }),
        },
      }),
    );

    expect(cachedRevision("org1")).toBe(2);
    expect(cachedRevision("org2")).toBe(1);
    expect(
      queryClient.getQueryState(listKey("org1"))?.isInvalidated,
    ).toBe(true);
    expect(org2Calls()).toBe(org2CallsBefore);
  });
});

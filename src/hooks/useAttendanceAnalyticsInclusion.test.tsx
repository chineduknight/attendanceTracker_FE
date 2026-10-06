import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { useAttendanceAnalyticsInclusion } from "hooks/useAttendanceAnalyticsInclusion";
import {
  RESTORE_CHANGE,
  exclusionChange,
} from "helpers/attendanceAnalyticsInclusion";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), patch: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockPatch: jest.Mock = require("services/api").default.patch;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const renderInclusion = () =>
  renderHook(() => useAttendanceAnalyticsInclusion("orgA", "att1"), {
    wrapper,
  }).result;

const ROUTE = "/attendance/orgA/att1/analytics-inclusion";

describe("useAttendanceAnalyticsInclusion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    mockPatch.mockResolvedValue({ data: { data: {} } });
  });

  it("excludes with a trimmed reason on the org/attendance route", async () => {
    const result = renderInclusion();
    act(() => result.current.setInclusion(exclusionChange("  Incomplete  ")));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(ROUTE, {
        analyticsIncluded: false,
        reason: "Incomplete",
      })
    );
  });

  it("omits a blank reason", async () => {
    const result = renderInclusion();
    act(() => result.current.setInclusion(exclusionChange("   ")));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(ROUTE, {
        analyticsIncluded: false,
      })
    );
  });

  it("restores with analyticsIncluded only", async () => {
    const result = renderInclusion();
    act(() => result.current.setInclusion(RESTORE_CHANGE));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith(ROUTE, { analyticsIncluded: true })
    );
  });

  it("blocks a second submit while the first is in flight", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockPatch.mockReturnValue(new Promise((r) => (resolve = r)));
    const result = renderInclusion();
    act(() => {
      result.current.setInclusion(RESTORE_CHANGE);
      result.current.setInclusion(RESTORE_CHANGE);
    });
    await waitFor(() => expect(result.current.isSaving).toBe(true));
    expect(mockPatch).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ data: {} }));
    await waitFor(() => expect(result.current.isSaving).toBe(false));
    act(() => result.current.setInclusion(RESTORE_CHANGE));
    await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(2));
  });

  it("surfaces the backend error and invalidates nothing", async () => {
    mockPatch.mockRejectedValue({
      response: { status: 403, data: { error: "Not allowed" } },
    });
    queryClient.setQueryData(queryKeys.attendance("orgA", "att1"), {});
    const onSuccess = jest.fn();
    const result = renderInclusion();
    act(() => result.current.setInclusion(RESTORE_CHANGE, onSuccess));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not allowed"));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryState(queryKeys.attendance("orgA", "att1"))
        ?.isInvalidated
    ).toBe(false);
  });

  it("invalidates only the current organisation's attendance and analytics", async () => {
    const orgA = [
      queryKeys.attendance("orgA", "att1"),
      queryKeys.attendances("orgA"),
      queryKeys.analytics.organisation("orgA", "2026-10-01", "2026-10-31", ""),
      queryKeys.analytics.member("orgA", "m1", "2026-10-01", "2026-10-31"),
    ];
    const orgB = [
      queryKeys.attendance("orgB", "att1"),
      queryKeys.attendances("orgB"),
      queryKeys.analytics.organisation("orgB", "2026-10-01", "2026-10-31", ""),
      queryKeys.analytics.member("orgB", "m1", "2026-10-01", "2026-10-31"),
    ];
    [...orgA, ...orgB].forEach((key) => queryClient.setQueryData(key, {}));
    const onSuccess = jest.fn();

    const result = renderInclusion();
    act(() => result.current.setInclusion(RESTORE_CHANGE, onSuccess));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());

    const invalidated = (key: readonly unknown[]) =>
      queryClient.getQueryState(key)?.isInvalidated;
    orgA.forEach((key) => expect(invalidated(key)).toBe(true));
    orgB.forEach((key) => expect(invalidated(key)).toBe(false));
  });
});

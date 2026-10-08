import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { useManualAttendanceMember } from "hooks/useManualAttendanceMember";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockPost: jest.Mock = require("services/api").default.post;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockDelete: jest.Mock = require("services/api").default.delete;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const renderManual = () =>
  renderHook(() => useManualAttendanceMember("orgA", "att1"), { wrapper })
    .result;

const ADD = { memberId: "m9", status: "late", reason: "" };

describe("useManualAttendanceMember", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    mockPost.mockResolvedValue({ data: { data: {} } });
    mockDelete.mockResolvedValue({ data: { data: {} } });
  });

  it("posts only member, status and a trimmed reason", async () => {
    const result = renderManual();
    act(() =>
      result.current.addMember({ ...ADD, reason: " Joined the sectional " })
    );
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/attendance/orgA/att1/manual-members",
        { memberId: "m9", status: "late", reason: "Joined the sectional" }
      )
    );
  });

  it("deletes on the member's manual-members route", async () => {
    const result = renderManual();
    act(() => result.current.removeMember("m9"));
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(
        "/attendance/orgA/att1/manual-members/m9",
        { data: undefined }
      )
    );
  });

  it("blocks a second submit while the first is in flight", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mockPost.mockReturnValue(new Promise((r) => (resolve = r)));
    const result = renderManual();
    act(() => {
      result.current.addMember(ADD);
      result.current.addMember(ADD);
      result.current.removeMember("m9");
    });
    await waitFor(() => expect(result.current.isAdding).toBe(true));
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();

    await act(async () => resolve({ data: {} }));
    await waitFor(() => expect(result.current.isAdding).toBe(false));
    act(() => result.current.removeMember("m9"));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledTimes(1));
  });

  it("surfaces the backend error and invalidates nothing", async () => {
    mockPost.mockRejectedValue({
      response: { status: 422, data: { error: "Attendance edit limit reached" } },
    });
    queryClient.setQueryData(queryKeys.attendance("orgA", "att1"), {});
    const onSuccess = jest.fn();
    const result = renderManual();
    act(() => result.current.addMember(ADD, onSuccess));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Attendance edit limit reached")
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryState(queryKeys.attendance("orgA", "att1"))
        ?.isInvalidated
    ).toBe(false);
  });

  it.each([
    ["add", (r: ReturnType<typeof renderManual>, done: () => void) =>
      r.current.addMember(ADD, done)],
    ["remove", (r: ReturnType<typeof renderManual>, done: () => void) =>
      r.current.removeMember("m9", done)],
  ])(
    "%s invalidates only the current organisation's session, list, export and analytics",
    async (_label, act_) => {
      const orgA = [
        queryKeys.attendance("orgA", "att1"),
        queryKeys.attendances("orgA"),
        [...queryKeys.attendanceExport("orgA", "att1"), "all", "all"],
        queryKeys.analytics.organisation("orgA", "2026-10-01", "2026-10-31", ""),
        queryKeys.analytics.member("orgA", "m1", "2026-10-01", "2026-10-31"),
      ];
      const orgB = [
        queryKeys.attendance("orgB", "att1"),
        queryKeys.attendances("orgB"),
        [...queryKeys.attendanceExport("orgB", "att1"), "all", "all"],
        queryKeys.analytics.organisation("orgB", "2026-10-01", "2026-10-31", ""),
        queryKeys.analytics.member("orgB", "m1", "2026-10-01", "2026-10-31"),
      ];
      [...orgA, ...orgB].forEach((key) => queryClient.setQueryData(key, {}));
      const onSuccess = jest.fn();

      const result = renderManual();
      act(() => act_(result, onSuccess));
      await waitFor(() => expect(onSuccess).toHaveBeenCalled());

      const invalidated = (key: readonly unknown[]) =>
        queryClient.getQueryState(key)?.isInvalidated;
      orgA.forEach((key) => expect(invalidated(key)).toBe(true));
      orgB.forEach((key) => expect(invalidated(key)).toBe(false));
    }
  );
});

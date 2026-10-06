import { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { queryClient } from "services/api/apiHelper";
import {
  useAttendanceAvailabilityForDate,
  useAttendanceAvailabilityForMember,
  useAttendanceAvailabilityMutations,
} from "hooks/useAttendanceAvailability";

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
    delete: jest.fn(),
  },
}));

const mockGet: jest.Mock = require("services/api").default.get;
const mockPost: jest.Mock = require("services/api").default.post;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe("useAttendanceAvailabilityMutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  it("surfaces the backend overlap message through mutation error handling", async () => {
    mockPost.mockRejectedValue({
      response: {
        status: 422,
        data: {
          error: "This availability period overlaps an existing period.",
        },
      },
    });

    const { result } = renderHook(
      () => useAttendanceAvailabilityMutations("org-1"),
      { wrapper }
    );

    result.current.create({
      memberId: "member-1",
      startDate: "2026-12-01",
      endDate: "2026-12-02",
      reason: "Travel",
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This availability period overlaps an existing period."
      )
    );
  });
});

describe("availability list queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
    mockGet.mockResolvedValue({ data: { data: [] } });
  });

  it("sends memberId as a query param", async () => {
    renderHook(() => useAttendanceAvailabilityForMember("org-1", "member-1"), {
      wrapper,
    });

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        "/attendance/org-1/availability?memberId=member-1"
      )
    );
  });

  it("sends date as a query param", async () => {
    renderHook(() => useAttendanceAvailabilityForDate("org-1", "2026-12-01"), {
      wrapper,
    });

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        "/attendance/org-1/availability?date=2026-12-01"
      )
    );
  });
});

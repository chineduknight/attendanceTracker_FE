import { ReactNode } from "react";
import { format } from "date-fns";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { useWelfareBirthdays } from "hooks/useWelfareBirthdays";

jest.mock("services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mockGet: jest.Mock = require("services/api").default.get;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const birthdayUrls = () => mockGet.mock.calls.map(([url]) => String(url));

const range = (url: string) => {
  const params = new URL(url, "http://x").searchParams;
  return [params.get("startDate"), params.get("endDate")];
};

describe("useWelfareBirthdays", () => {
  beforeEach(() => {
    queryClient.clear();
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: { data: { members: [] } } });
  });

  it("anchors the range on the supplied asOf, not local today", async () => {
    // A review date that is not local today; today must not leak into the range.
    expect(format(new Date(), "yyyy-MM-dd")).not.toBe("2025-01-05");
    const { result } = renderHook(
      () => useWelfareBirthdays("org1", { enabled: true, asOf: "2025-01-05" }),
      { wrapper }
    );

    expect(result.current.fromDate).toBe("2025-01-05");
    expect(result.current.toDate).toBe("2025-01-12");
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(birthdayUrls()[0]).toContain(
      "/organisations/org1/members/birthday?"
    );
    expect(range(birthdayUrls()[0])).toEqual(["2025-01-05", "2025-01-12"]);
  });

  it("requests a new range when asOf changes", async () => {
    const { result, rerender } = renderHook(
      ({ asOf }) => useWelfareBirthdays("org1", { enabled: true, asOf }),
      { wrapper, initialProps: { asOf: "2026-10-08" } }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(range(birthdayUrls()[0])).toEqual(["2026-10-08", "2026-10-15"]);

    rerender({ asOf: "2026-10-20" });
    expect(result.current.fromDate).toBe("2026-10-20");
    expect(result.current.toDate).toBe("2026-10-27");
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(range(birthdayUrls()[1])).toEqual(["2026-10-20", "2026-10-27"]);
    await waitFor(() =>
      expect(
        queryClient.getQueryData(
          queryKeys.birthday.snapshot("org1", "2026-10-20", "2026-10-27")
        )
      ).toBeDefined()
    );
  });

  it("never returns another organisation's snapshot for the same range", async () => {
    queryClient.setQueryData(
      queryKeys.birthday.snapshot("org1", "2026-10-08", "2026-10-15"),
      { data: { members: [{ name: "Org A Person" }] } }
    );
    mockGet.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(
      () => useWelfareBirthdays("org2", { enabled: true, asOf: "2026-10-08" }),
      { wrapper }
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(birthdayUrls()[0]).toContain("/organisations/org2/");
    expect(result.current.members).toEqual([]);
  });

  it("makes no request while disabled", async () => {
    renderHook(
      () => useWelfareBirthdays("org1", { enabled: false, asOf: "2026-10-08" }),
      { wrapper }
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGet).not.toHaveBeenCalled();
  });
});

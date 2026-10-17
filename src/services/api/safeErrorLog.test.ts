import { safeResponseLessError } from "services/api/safeErrorLog";

describe("safeResponseLessError", () => {
  it("keeps only the transport code, never the request, headers or body", () => {
    const error = {
      code: "ERR_NETWORK",
      message: "Network Error at https://api.example.com/finance?token=super-secret",
      config: {
        url: "/finance/payments",
        headers: { Authorization: "Bearer super-secret" },
        data: '{"amount":5000,"memberId":"m1"}',
      },
      request: { responseURL: "https://api.example.com/finance/payments" },
    };

    const line = safeResponseLessError(error);

    expect(line).toBe("API request failed (ERR_NETWORK)");
    ["super-secret", "Bearer", "amount", "finance", "api.example.com", "m1"].forEach((secret) =>
      expect(line).not.toContain(secret),
    );
  });

  it("omits a missing or unsafe code", () => {
    expect(safeResponseLessError({})).toBe("API request failed");
    expect(safeResponseLessError(null)).toBe("API request failed");
    expect(safeResponseLessError({ code: "Bearer token" })).toBe("API request failed");
    expect(safeResponseLessError({ code: "x".repeat(41) })).toBe("API request failed");
    expect(safeResponseLessError({ code: 42 })).toBe("API request failed");
  });

  it("keeps a timeout code", () => {
    expect(safeResponseLessError({ code: "ECONNABORTED" })).toBe("API request failed (ECONNABORTED)");
  });
});

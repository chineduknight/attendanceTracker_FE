import {
  attachmentFileName,
  financialReportFailure,
  financialReportFileName,
  isFormatContentType,
  readFinancialReportErrorBody,
  resolveFinancialReportPeriod,
  toFinancialReportAvailability,
} from "helpers/financialReport";

const PERIOD = { from: "2026-09-01", to: "2026-09-30" };

const preview = (extra: Record<string, unknown> = {}) => ({
  organisation: { id: "org1", name: "Organisation A" },
  period: PERIOD,
  openingDate: "2026-06-01",
  provisional: false,
  dataState: "complete",
  issues: [],
  statement: { broughtForward: { totalKobo: 100 } },
  downloads: { xlsx: true, pdf: false },
  ...extra,
});

const httpError = (status: number) => Object.assign(new Error("failed"), { response: { status, data: {} } });

describe("resolveFinancialReportPeriod", () => {
  it("takes the server's resolved dates when the applied range is blank (server defaults)", () => {
    expect(resolveFinancialReportPeriod({ from: "", to: "" }, { from: "2026-06-01", to: "2026-10-23" })).toEqual({
      from: "2026-06-01",
      to: "2026-10-23",
    });
  });

  it("uses an explicit applied range only when the response echoes it", () => {
    expect(resolveFinancialReportPeriod(PERIOD, PERIOD)).toEqual(PERIOD);
    expect(resolveFinancialReportPeriod({ from: "2026-09-01", to: "" }, PERIOD)).toEqual(PERIOD);
    // A response for another period never stands in for this one.
    expect(resolveFinancialReportPeriod({ from: "2026-08-01", to: "" }, PERIOD)).toBeNull();
    expect(resolveFinancialReportPeriod({ from: "", to: "2026-09-15" }, PERIOD)).toBeNull();
  });

  it("gives nothing without a loaded period, or for an invalid one", () => {
    expect(resolveFinancialReportPeriod({ from: "", to: "" }, null)).toBeNull();
    expect(resolveFinancialReportPeriod({ from: "", to: "" }, { from: "", to: "2026-09-30" })).toBeNull();
    expect(resolveFinancialReportPeriod({ from: "", to: "" }, { from: "2026-02-30", to: "2026-03-01" })).toBeNull();
    expect(resolveFinancialReportPeriod({ from: "", to: "" }, { from: "01/09/2026", to: "2026-09-30" })).toBeNull();
    expect(resolveFinancialReportPeriod({ from: "", to: "" }, { from: "2026-09-30", to: "2026-09-01" })).toBeNull();
  });
});

describe("toFinancialReportAvailability", () => {
  it("reads readiness, issues and formats, not figures", () => {
    expect(toFinancialReportAvailability(preview(), PERIOD)).toEqual({
      period: PERIOD,
      dataState: "complete",
      provisional: false,
      issues: [],
      downloads: { xlsx: true, pdf: false },
    });
  });

  it("keeps provisional, incomplete and unavailable as sent", () => {
    expect(toFinancialReportAvailability(preview({ provisional: true }), PERIOD)?.provisional).toBe(true);
    const incomplete = toFinancialReportAvailability(
      preview({
        dataState: "incomplete",
        issues: [{ code: "REPORT_MONEY_ACCOUNT_UNKNOWN", message: "Cash box has no known balance.", accountId: "a" }],
      }),
      PERIOD,
    );
    expect(incomplete?.dataState).toBe("incomplete");
    expect(incomplete?.issues).toEqual([
      { code: "REPORT_MONEY_ACCOUNT_UNKNOWN", message: "Cash box has no known balance." },
    ]);
    expect(toFinancialReportAvailability(preview({ dataState: "unavailable" }), PERIOD)?.dataState).toBe(
      "unavailable",
    );
  });

  it("offers only formats the server marks exactly true", () => {
    expect(toFinancialReportAvailability(preview({ downloads: { xlsx: true, pdf: true } }), PERIOD)?.downloads).toEqual({
      xlsx: true,
      pdf: true,
    });
    expect(toFinancialReportAvailability(preview({ downloads: { xlsx: "yes" } }), PERIOD)?.downloads).toEqual({
      xlsx: false,
      pdf: false,
    });
  });

  it("refuses a response for another period", () => {
    expect(toFinancialReportAvailability(preview(), { from: "2026-09-01", to: "2026-09-15" })).toBeNull();
    expect(toFinancialReportAvailability(preview({ period: { from: "2026-08-01", to: "2026-09-30" } }), PERIOD)).toBeNull();
  });

  it.each([
    ["no body", null],
    ["an unknown data state", preview({ dataState: "partial" })],
    ["no data state", preview({ dataState: undefined })],
    ["no provisional flag", preview({ provisional: undefined })],
    ["no downloads", preview({ downloads: undefined })],
    ["no issues list", preview({ issues: undefined })],
    ["an issue without a message", preview({ issues: [{ code: "X" }] })],
    ["no period", preview({ period: undefined })],
  ])("fails closed with %s", (_label, body) => {
    expect(toFinancialReportAvailability(body, PERIOD)).toBeNull();
  });
});

describe("file names and types", () => {
  it("falls back to the documented name", () => {
    expect(financialReportFileName(PERIOD, "xlsx")).toBe("Financial_Report_2026-09-01_to_2026-09-30.xlsx");
    expect(financialReportFileName(PERIOD, "pdf")).toBe("Financial_Report_2026-09-01_to_2026-09-30.pdf");
  });

  it("uses a safe Content-Disposition name with the right extension", () => {
    expect(
      attachmentFileName('attachment; filename="Financial_Report_2026-09-01_to_2026-09-30.xlsx"', "xlsx"),
    ).toBe("Financial_Report_2026-09-01_to_2026-09-30.xlsx");
    expect(attachmentFileName("attachment; filename*=UTF-8''Report_A.pdf", "pdf")).toBe("Report_A.pdf");
    expect(attachmentFileName("attachment; filename=Report.pdf", "pdf")).toBe("Report.pdf");
  });

  it.each([
    ["no header", undefined],
    ["the wrong extension", 'attachment; filename="Report.pdf"'],
    ["a path", 'attachment; filename="../../Report.xlsx"'],
    ["a hidden file", 'attachment; filename=".Report.xlsx"'],
    ["spaces or other characters", 'attachment; filename="My Report.xlsx"'],
    ["bad encoding", "attachment; filename*=UTF-8''%E0%A4%A.xlsx"],
  ])("ignores a header with %s", (_label, header) => {
    expect(attachmentFileName(header, "xlsx")).toBeNull();
  });

  it("checks the Content-Type against the format", () => {
    expect(isFormatContentType("application/pdf", "pdf")).toBe(true);
    expect(isFormatContentType("Application/PDF; charset=binary", "pdf")).toBe(true);
    expect(
      isFormatContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"),
    ).toBe(true);
    expect(isFormatContentType("application/pdf", "xlsx")).toBe(false);
    expect(isFormatContentType("application/json; charset=utf-8", "pdf")).toBe(false);
    expect(isFormatContentType(undefined, "pdf")).toBe(false);
  });
});

describe("readFinancialReportErrorBody", () => {
  it("reads the JSON envelope out of a Blob", async () => {
    const blob = new Blob([JSON.stringify({ error: "Too busy.", code: "REPORT_BUSY" })], {
      type: "application/json",
    });
    await expect(readFinancialReportErrorBody(blob)).resolves.toEqual({ error: "Too busy.", code: "REPORT_BUSY" });
  });

  it("reads a plain object envelope", async () => {
    await expect(readFinancialReportErrorBody({ error: "No." })).resolves.toEqual({ error: "No.", code: null });
  });

  it.each([
    ["non-JSON text", new Blob(["<html>Bad gateway</html>"], { type: "text/html" })],
    ["an empty blob", new Blob([])],
    ["a JSON array", new Blob(["[1,2]"])],
    ["an oversized blob", new Blob(["x".repeat(70 * 1024)])],
    ["nothing", undefined],
  ])("gives null for %s, never throws", async (_label, data) => {
    await expect(readFinancialReportErrorBody(data)).resolves.toBeNull();
  });
});

describe("financialReportFailure", () => {
  const coded = (status: number, code: string, error: string | null = null) =>
    financialReportFailure(httpError(status), { error, code });

  it("prefers the server's text for known codes", () => {
    expect(coded(503, "REPORT_BUSY", "Too many reports.")).toEqual({
      message: "Too many reports.",
      code: "REPORT_BUSY",
      retryable: true,
    });
  });

  it.each([
    ["REPORT_INCOMPLETE", 422, false, /incomplete/],
    ["REPORT_UNAVAILABLE", 422, false, /isn't available/],
    ["REPORT_TOO_LARGE", 422, false, /too large/],
    ["REPORT_PDF_TOO_LARGE", 422, false, /Excel/],
    ["REPORT_PDF_DISABLED", 503, false, /Excel/],
    ["REPORT_PDF_TIMEOUT", 503, false, /Excel/],
    ["REPORT_BUSY", 503, true, /Try again/],
    ["REPORT_READ_TIMEOUT", 503, true, /Try again/],
    ["REPORT_INTEGRITY_FAILURE", 500, false, /consistency check.*report this to support/],
    ["REPORT_PDF_RENDER_FAILED", 500, true, /Excel/],
  ])("%s has its own copy and retry rule", (code, status, retryable, text) => {
    const failure = coded(status, code);
    expect(failure?.retryable).toBe(retryable);
    expect(failure?.message).toMatch(text);
  });

  it("adds the support note to the server's integrity text", () => {
    expect(coded(500, "REPORT_INTEGRITY_FAILURE", "Books failed a check.")?.message).toBe(
      "Books failed a check. Please report this to support.",
    );
  });

  it("says nothing for a 401 (the global interceptor signed out) or a cancelled request", () => {
    expect(financialReportFailure(httpError(401), { error: "Expired", code: null })).toBeNull();
    expect(financialReportFailure(Object.assign(new Error("canceled"), { code: "ERR_CANCELED" }), null)).toBeNull();
  });

  it("words 403, 404 and other statuses", () => {
    expect(financialReportFailure(httpError(403), null)).toEqual({
      message: "You don't have access to this organisation's financial reports.",
      code: null,
      retryable: false,
    });
    expect(financialReportFailure(httpError(404), { error: "Organisation not found.", code: null })?.message).toBe(
      "Organisation not found.",
    );
    expect(financialReportFailure(httpError(404), null)?.retryable).toBe(false);
    expect(financialReportFailure(httpError(422), { error: "from is required.", code: null })).toEqual({
      message: "from is required.",
      code: null,
      retryable: false,
    });
    expect(financialReportFailure(httpError(503), { error: "Try again.", code: null })?.retryable).toBe(true);
  });

  it("words network failures and timeouts as retryable", () => {
    expect(financialReportFailure(new Error("Network Error"), null)).toEqual({
      message: "Couldn't reach the server. Check your connection and try again.",
      code: null,
      retryable: true,
    });
    expect(
      financialReportFailure(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }), null)?.message,
    ).toMatch(/took too long/);
  });
});

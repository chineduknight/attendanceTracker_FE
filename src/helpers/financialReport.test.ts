import {
  attachmentFileName,
  defaultFinancialSummaryPeriod,
  financialReportFailure,
  financialReportFileName,
  isFormatContentType,
  readFinancialReportErrorBody,
  summaryPeriodIssue,
  toFinancialReportAvailability,
  toFinancialReportPreview,
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

describe("defaultFinancialSummaryPeriod", () => {
  it("defaults to the first of this month through today in Lagos", () => {
    expect(defaultFinancialSummaryPeriod("2026-10-23", "2026-09-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-23",
    });
    expect(defaultFinancialSummaryPeriod("2026-10-23", null)).toEqual({
      from: "2026-10-01",
      to: "2026-10-23",
    });
  });

  it("never starts before the ledger's verified opening date", () => {
    expect(defaultFinancialSummaryPeriod("2026-10-23", "2026-10-21")).toEqual({
      from: "2026-10-21",
      to: "2026-10-23",
    });
    expect(defaultFinancialSummaryPeriod("2026-10-23", "2026-10-01")).toEqual({
      from: "2026-10-01",
      to: "2026-10-23",
    });
  });

  it("ignores an unusable opening date rather than shifting the period", () => {
    expect(defaultFinancialSummaryPeriod("2026-10-23", "2026-02-30")).toEqual({
      from: "2026-10-01",
      to: "2026-10-23",
    });
  });
});

describe("summaryPeriodIssue", () => {
  it("accepts a period inside the books", () => {
    expect(summaryPeriodIssue("2026-10-01", "2026-10-23", "2026-10-23", "2026-09-01")).toBeNull();
    expect(summaryPeriodIssue("2026-09-01", "2026-09-30", "2026-10-23", null)).toBeNull();
  });

  it("keeps the general range rules", () => {
    expect(summaryPeriodIssue("2026-10-20", "2026-10-05", "2026-10-23", "2026-09-01")).toBe(
      "The From date can't be after the To date.",
    );
    expect(summaryPeriodIssue("2026-10-01", "2026-10-24", "2026-10-23", "2026-09-01")).toBe(
      "The To date can't be after today in Lagos.",
    );
  });

  it("refuses a period before the ledger's opening date", () => {
    expect(summaryPeriodIssue("2026-09-15", "2026-10-23", "2026-10-23", "2026-10-01")).toBe(
      "The period can't start before the books' opening date (1 Oct 2026).",
    );
    expect(summaryPeriodIssue("2026-09-01", "2026-09-20", "2026-10-23", "2026-10-01")).toBe(
      "The period can't start before the books' opening date (1 Oct 2026).",
    );
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

const fullPreview = (extra: Record<string, unknown> = {}) => ({
  organisation: { id: "org1", name: "Organisation A" },
  period: PERIOD,
  openingDate: "2026-06-01",
  lockedThrough: "2026-09-30",
  provisional: false,
  readAt: "2026-10-23T10:00:00.000Z",
  dataState: "complete",
  issues: [],
  excludedAccounts: [{ accountId: "old", name: "Old bank", reason: "never_opened" }],
  statement: {
    broughtForward: { asOf: "2026-08-31", basis: "balance", totalKobo: 17_000_000 },
    moneyReceived: {
      totalKobo: 500_000,
      groups: [
        {
          key: "receipts",
          label: "Receipts",
          count: 2,
          totalKobo: 500_000,
          categories: [
            { categoryAccountId: "donations", categoryName: "Donations", count: 1, totalKobo: 550_000 },
            { categoryAccountId: "raffle", categoryName: "Old raffle", count: 1, totalKobo: -50_000 },
            { categoryAccountId: "dues", categoryName: "Dues income", count: 0, totalKobo: 0 },
          ],
        },
        {
          key: "member_money",
          label: "Money received for members",
          count: 1,
          totalKobo: 300_000,
          categories: [{ categoryAccountId: null, categoryName: null, count: 1, totalKobo: 300_000 }],
        },
      ],
    },
    moneyPaid: {
      totalKobo: 20_000,
      groups: [
        {
          key: "expenses",
          label: "Expenses",
          count: 1,
          totalKobo: 20_000,
          categories: [{ categoryAccountId: "hall", categoryName: "Hall hire", count: 1, totalKobo: 20_000 }],
        },
      ],
    },
    broughtIntoBooks: { totalKobo: 0, count: 0, rows: [] },
    transfers: { totalMovedKobo: 40_000, count: 2, rows: [] },
    carriedForward: { asOf: PERIOD.to, totalKobo: 17_480_000 },
    grossBalanceKobo: 17_500_000,
  },
  accounts: [
    {
      accountId: "bank",
      name: "Main bank",
      kind: "bank",
      active: true,
      state: "in_books",
      broughtInOn: null,
      carriedForwardKobo: 12_000_000,
      bankName: "GTBank",
      accountNumberLast4: "0123",
    },
    {
      accountId: "cash",
      name: "Cash in hand",
      kind: "cash",
      active: true,
      state: "in_books",
      broughtInOn: null,
      carriedForwardKobo: 5_480_000,
      bankName: null,
      accountNumberLast4: null,
    },
    {
      accountId: "old",
      name: "Old bank",
      kind: "bank",
      active: false,
      state: "unknown",
      broughtInOn: null,
      carriedForwardKobo: null,
      bankName: null,
      accountNumberLast4: null,
    },
  ],
  reconciliation: {
    income: {},
    expense: {},
    surplusKobo: 0,
    bridge: {},
    allocations: {},
    memberMoney: { heldAtEndKobo: 300_000 },
  },
  downloads: { xlsx: true, pdf: false },
  ...extra,
});

describe("toFinancialReportPreview", () => {
  it("reads the statement, account rows and member money as sent", () => {
    const report = toFinancialReportPreview(fullPreview(), PERIOD);
    expect(report?.statement).toEqual({
      broughtForwardKobo: 17_000_000,
      broughtForwardAsOf: "2026-08-31",
      broughtForwardBasis: "balance",
      broughtInCount: 0,
      broughtInTotalKobo: 0,
      receivedGroups: [
        {
          key: "receipts",
          label: "Receipts",
          count: 2,
          totalKobo: 500_000,
          categories: [
            { accountId: "donations", name: "Donations", count: 1, amountKobo: 550_000 },
            { accountId: "raffle", name: "Old raffle", count: 1, amountKobo: -50_000 },
            { accountId: "dues", name: "Dues income", count: 0, amountKobo: 0 },
          ],
        },
        {
          key: "member_money",
          label: "Money received for members",
          count: 1,
          totalKobo: 300_000,
          categories: [{ accountId: null, name: null, count: 1, amountKobo: 300_000 }],
        },
      ],
      receivedTotalKobo: 500_000,
      paidGroups: [
        {
          key: "expenses",
          label: "Expenses",
          count: 1,
          totalKobo: 20_000,
          categories: [{ accountId: "hall", name: "Hall hire", count: 1, amountKobo: 20_000 }],
        },
      ],
      paidTotalKobo: 20_000,
      grossBalanceKobo: 17_500_000,
      carriedForwardKobo: 17_480_000,
      carriedForwardAsOf: PERIOD.to,
      transfersCount: 2,
      transfersTotalKobo: 40_000,
    });
    expect(report?.accounts?.map((row) => row.name)).toEqual(["Main bank", "Cash in hand", "Old bank"]);
    expect(report?.accounts?.[2].carriedForwardKobo).toBeNull();
    expect(report?.memberMoneyHeldAtEndKobo).toBe(300_000);
    expect(report?.excludedAccounts).toEqual([{ name: "Old bank", reason: "never_opened" }]);
    expect(report?.readAt).toBe("2026-10-23T10:00:00.000Z");
  });

  it("keeps an incomplete report's unknown totals as null, never zero", () => {
    const report = toFinancialReportPreview(
      fullPreview({
        dataState: "incomplete",
        statement: {
          ...fullPreview().statement,
          broughtForward: { ...fullPreview().statement.broughtForward, totalKobo: null },
          grossBalanceKobo: null,
          carriedForward: { ...fullPreview().statement.carriedForward, totalKobo: null },
        },
      }),
      PERIOD,
    );
    expect(report?.statement?.broughtForwardKobo).toBeNull();
    expect(report?.statement?.grossBalanceKobo).toBeNull();
    expect(report?.statement?.carriedForwardKobo).toBeNull();
  });

  it("accepts an unavailable report only with no figures at all", () => {
    const report = toFinancialReportPreview(
      fullPreview({
        dataState: "unavailable",
        issues: [{ code: "REPORT_BOOKS_NOT_LIVE", message: "The books are not open yet." }],
        statement: null,
        accounts: null,
        reconciliation: null,
      }),
      PERIOD,
    );
    expect(report?.statement).toBeNull();
    expect(report?.accounts).toBeNull();
    expect(report?.memberMoneyHeldAtEndKobo).toBeNull();
  });

  it.each([
    ["a missing statement", { statement: undefined }],
    ["a malformed carried-forward total", { statement: { ...fullPreview().statement, carriedForward: { asOf: PERIOD.to, totalKobo: "1" } } }],
    ["a malformed account row", { accounts: [{ accountId: "bank" }] }],
    ["no reconciliation", { reconciliation: undefined }],
    ["a malformed member-money balance", { reconciliation: { ...fullPreview().reconciliation, memberMoney: { heldAtEndKobo: "3" } } }],
  ])("fails closed with %s", (_label, change) => {
    expect(toFinancialReportPreview(fullPreview(change), PERIOD)).toBeNull();
  });

  it("fails closed on a malformed category rather than dropping it", () => {
    const statement = fullPreview().statement;
    const broken = fullPreview({
      statement: {
        ...statement,
        moneyReceived: {
          ...statement.moneyReceived,
          groups: [
            {
              ...statement.moneyReceived.groups[0],
              categories: [{ categoryAccountId: "donations", categoryName: "Donations", count: 1 }],
            },
          ],
        },
      },
    });
    expect(toFinancialReportPreview(broken, PERIOD)).toBeNull();
  });

  it("never accepts another period's answer", () => {
    expect(toFinancialReportPreview(fullPreview(), { from: "2026-09-01", to: "2026-09-15" })).toBeNull();
  });
});

describe("file names and types", () => {
  it("falls back to the documented name", () => {
    expect(financialReportFileName(PERIOD, "xlsx")).toBe("Financial_Report_2026-09-01_to_2026-09-30.xlsx");
    expect(financialReportFileName(PERIOD, "pdf")).toBe("Financial_Report_2026-09-01_to_2026-09-30.pdf");
  });

  it("suffixes only the category-only PDF, as the server does", () => {
    expect(financialReportFileName(PERIOD, "pdf", "transactions")).toBe(
      "Financial_Report_2026-09-01_to_2026-09-30.pdf",
    );
    expect(financialReportFileName(PERIOD, "pdf", "categories")).toBe(
      "Financial_Report_2026-09-01_to_2026-09-30_by_category.pdf",
    );
    expect(financialReportFileName(PERIOD, "pdf", "both")).toBe(
      "Financial_Report_2026-09-01_to_2026-09-30.pdf",
    );
    expect(financialReportFileName(PERIOD, "xlsx", "categories")).toBe(
      "Financial_Report_2026-09-01_to_2026-09-30.xlsx",
    );
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

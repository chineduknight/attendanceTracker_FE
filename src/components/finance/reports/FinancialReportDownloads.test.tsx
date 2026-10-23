import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, selectTab } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { toLedgerAccounts } from "helpers/ledger";
import { saveBlob } from "helpers/saveBlob";
import LedgerReportsPanel from "components/finance/reports/LedgerReportsPanel";
import { LedgerAccount } from "components/finance/ledgerTypes";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock("helpers/saveBlob", () => ({ saveBlob: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const BANK = { id: "b".repeat(24), name: "Bank account", class: "asset", subtype: "bank", currency: "NGN", active: true, openingVerified: true };
const ACCOUNTS = toLedgerAccounts([BANK]) as LedgerAccount[];

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };
/** Today in Lagos for these tests; the Summary then defaults to September. */
const TODAY = "2026-09-30";

const preview = (period: { from: string; to: string }, extra: Record<string, unknown> = {}) => ({
  organisation: { id: "org1", name: "Organisation A" },
  period,
  openingDate: "2026-09-01",
  lockedThrough: "2026-09-30",
  provisional: false,
  generatedBy: { userId: "officer-1", username: "Treasurer" },
  generatedAt: "2026-09-30T10:00:00.000Z",
  readAt: "2026-09-30T10:00:00.000Z",
  dataState: "complete",
  issues: [],
  excludedAccounts: [],
  statement: {
    broughtForward: { asOf: "2026-08-31", basis: "balance", totalKobo: 17000000 },
    moneyReceived: {
      totalKobo: 205000,
      groups: [
        {
          key: "receipts",
          label: "Receipts",
          count: 1,
          totalKobo: 205000,
          categories: [
            { categoryAccountId: "i".repeat(24), categoryName: "Donations", count: 1, totalKobo: 205000 },
          ],
          rows: [],
          rowsTruncated: false,
        },
        {
          key: "member_money",
          label: "Money received for members",
          count: 0,
          totalKobo: 0,
          categories: [],
          rows: [],
          rowsTruncated: false,
        },
      ],
    },
    moneyPaid: {
      totalKobo: 150000,
      groups: [
        { key: "expenses", label: "Expenses", count: 1, totalKobo: 150000, categories: [], rows: [], rowsTruncated: false },
        { key: "member_refunds", label: "Member money refunded", count: 0, totalKobo: 0, categories: [], rows: [], rowsTruncated: false },
      ],
    },
    broughtIntoBooks: { totalKobo: 0, count: 0, rows: [], rowsTruncated: false },
    transfers: { totalMovedKobo: 0, count: 0, rows: [], rowsTruncated: false },
    carriedForward: { asOf: period.to, totalKobo: 17480000 },
    grossBalanceKobo: 17500000,
  },
  accounts: [
    {
      accountId: BANK.id,
      name: BANK.name,
      kind: "bank",
      active: true,
      state: "in_books",
      broughtInOn: null,
      broughtForwardKobo: 0,
      receivedKobo: 0,
      paidKobo: 0,
      transfersInKobo: 0,
      transfersOutKobo: 0,
      broughtInKobo: 0,
      carriedForwardKobo: 17480000,
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
    memberMoney: null,
  },
  downloads: { xlsx: true, pdf: false },
  ...extra,
});

/** `from`/`to` of a request URL; "" when absent. */
const periodOf = (url: string) => {
  const search = new URLSearchParams(url.split("?")[1] ?? "");
  return { from: search.get("from") ?? "", to: search.get("to") ?? "" };
};

type Reply = unknown | Error | Promise<unknown>;

interface Routes {
  preview?: (url: string) => Reply;
  exportFile?: (url: string, config: Record<string, unknown>) => Reply;
}

const defaultRoutes: Required<Routes> = {
  preview: (url) => preview(periodOf(url)),
  exportFile: (url) => ({
    data: new Blob(["file"], { type: url.includes("format=pdf") ? "application/pdf" : XLSX }),
    headers: { "content-type": url.includes("format=pdf") ? "application/pdf" : XLSX },
  }),
};

const serve = (routes: Routes = {}) => {
  const route = { ...defaultRoutes, ...routes };
  api.get.mockImplementation((url: string, config: Record<string, unknown> = {}) => {
    const settle = (reply: Reply, wrap: boolean): Promise<unknown> =>
      Promise.resolve(reply).then((value) => {
        if (value instanceof Error) throw value;
        return wrap ? { data: { data: value } } : value;
      });
    if (url.includes("/ledger/reports/financial/export")) return settle(route.exportFile(url, config), false);
    if (url.includes("/ledger/reports/financial")) return settle(route.preview(url), true);
    if (url.includes("/ledger/balances")) return settle({ asOf: "2026-09-30", accounts: [], moneyTotalKobo: 0 }, true);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
};

const httpError = (status: number, body: Record<string, string>, asBlob = false) =>
  Object.assign(new Error(body.error ?? "failed"), {
    response: {
      status,
      data: asBlob ? new Blob([JSON.stringify(body)], { type: "application/json" }) : body,
    },
  });

const deferred = () => {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const setSession = (organisationId = "org1") =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: organisationId, isOwner: false, permissions: ["finance.view"] },
  });

const ui = (organisationId = "org1", downloads = true) => (
  <QueryClientProvider client={queryClient}>
    <LedgerReportsPanel
      organisationId={organisationId}
      accounts={ACCOUNTS}
      openingDate="2026-09-01"
      today={TODAY}
      enabled
      financialReportDownloads={downloads}
    />
  </QueryClientProvider>
);

const urls = () => api.get.mock.calls.map(([url]) => url as string);
const previewUrls = () => urls().filter((url) => url.includes("/reports/financial") && !url.includes("/export"));
const exportCalls = () =>
  api.get.mock.calls.filter(([url]) => (url as string).includes("/reports/financial/export"));

const openSummary = async (organisationId = "org1", downloads = true) => {
  const view = render(ui(organisationId, downloads));
  await selectTab(screen.getByRole("tab", { name: "Summary" }));
  // With downloads off there is no downloads section to wait for; the
  // statement itself is the marker. With a failed or unreadable preview the
  // statement is replaced by its error, but the downloads section stays.
  await screen.findByText(downloads ? "Financial Report Downloads" : "Financial Summary");
  return view;
};

/** The visible panel of one report tab (closed panels stay mounted). */
const tabPanel = (name: "Cashbook" | "Balances" | "Summary") =>
  screen.getByRole("tabpanel", { name });

/** Confirm the PDF layout dialog and wait for it to close. */
const confirmPdfDialog = async () => {
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

const downloadsRegion = () => screen.getByRole("region", { name: "Financial Report Downloads" });

const applyRange = (from: string, to: string) => {
  fireEvent.change(screen.getByLabelText("From"), { target: { value: from } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: to } });
  fireEvent.click(screen.getByRole("button", { name: "Show" }));
};

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  setSession();
  serve();
});

afterAll(() => {
  useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG });
});

describe("Financial Report downloads gate", () => {
  it("leaves the financial summary statement on show while the download gate is off", async () => {
    await openSummary("org1", false);
    expect(screen.getByText("Financial Summary")).toBeInTheDocument();
    expect(screen.getByText("1 Sep 2026 – 30 Sep 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();
    expect(screen.queryByText("Financial Report Downloads")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    // The statement itself still reads the preview for its figures.
    expect(previewUrls()).toHaveLength(1);
  });

  it("fetches nothing for the report from the Cashbook or Balances tabs", async () => {
    render(ui());
    await screen.findByText("Total income");
    await selectTab(screen.getByRole("tab", { name: "Balances" }));
    await waitFor(() => expect(urls()).toContain("/finance/org1/ledger/balances"));
    expect(urls().some((url) => url.includes("/cashbook"))).toBe(false);
    expect(within(tabPanel("Balances")).queryByText("Financial Report Downloads")).not.toBeInTheDocument();
  });
});

describe("Financial Report downloads period", () => {
  it("uses the summary's default month-to-date period", async () => {
    await openSummary();
    const region = downloadsRegion();
    expect(within(region).getByText(/Receipts and Payments Statement, account balances and reconciliation/)).toBeInTheDocument();
    expect(await within(region).findByRole("button", { name: "Download Excel" })).toBeEnabled();
    expect(within(region).getByText("Period: 1 Sep 2026 – 30 Sep 2026")).toBeInTheDocument();
    expect(previewUrls()).toEqual(["/finance/org1/ledger/reports/financial?from=2026-09-01&to=2026-09-30"]);
  });

  it("uses the applied dates, never unsubmitted drafts", async () => {
    await openSummary();
    await within(downloadsRegion()).findByRole("button", { name: "Download Excel" });

    // Drafted but not shown: nothing is asked for it.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-05" } });
    expect(previewUrls()).toEqual(["/finance/org1/ledger/reports/financial?from=2026-09-01&to=2026-09-30"]);

    applyRange("2026-09-05", "2026-09-15");
    await within(downloadsRegion()).findByText("Period: 5 Sep 2026 – 15 Sep 2026");
    await within(downloadsRegion()).findByRole("button", { name: "Download Excel" });
    expect(previewUrls()).toContain("/finance/org1/ledger/reports/financial?from=2026-09-05&to=2026-09-15");

    fireEvent.click(within(downloadsRegion()).getByRole("button", { name: "Download Excel" }));
    await within(downloadsRegion()).findByText("Saved Financial_Report_2026-09-05_to_2026-09-15.xlsx.");
    expect(exportCalls().map(([url]) => url)).toEqual([
      "/finance/org1/ledger/reports/financial/export?from=2026-09-05&to=2026-09-15&format=xlsx",
    ]);
  });

  it("shows a checking state while the preview loads, then the download", async () => {
    const pendingPreview = deferred();
    serve({ preview: () => pendingPreview.promise });
    render(ui());
    expect(
      await within(downloadsRegion()).findByText("Checking whether this report can be downloaded…"),
    ).toBeInTheDocument();
    expect(previewUrls()).toHaveLength(1);
    await act(async () => pendingPreview.resolve(preview(SEPTEMBER)));
    expect(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" })).toBeInTheDocument();
  });

  it("turns downloads off when the preview fails", async () => {
    serve({ preview: () => httpError(500, { error: "Server error." }) });
    render(ui());
    expect(await within(downloadsRegion()).findByText(/Couldn't check this report, so downloads are off\. Server error\./)).toBeInTheDocument();
    expect(within(downloadsRegion()).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
  });

  it("turns downloads off when the preview answers for other dates than were applied", async () => {
    await openSummary();
    serve({ preview: () => preview(SEPTEMBER) });
    applyRange("2026-09-05", "2026-09-15");
    expect(await within(downloadsRegion()).findByText(/wasn't in a shape this app understands/)).toBeInTheDocument();
    expect(within(downloadsRegion()).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    expect(previewUrls()).toContain("/finance/org1/ledger/reports/financial?from=2026-09-05&to=2026-09-15");
  });

  it("never offers a previous period's readiness while the new one loads, or a mismatched answer", async () => {
    await openSummary();
    await within(downloadsRegion()).findByRole("button", { name: "Download Excel" });

    const pending = deferred();
    serve({ preview: () => pending.promise });
    applyRange("2026-09-05", "2026-09-15");
    expect(
      await within(downloadsRegion()).findByText("Checking whether this report can be downloaded…"),
    ).toBeInTheDocument();
    expect(within(downloadsRegion()).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();

    // The server answers for September instead of the period asked for.
    await act(async () => pending.resolve(preview(SEPTEMBER)));
    expect(await within(downloadsRegion()).findByText(/wasn't in a shape this app understands/)).toBeInTheDocument();
    expect(within(downloadsRegion()).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
  });
});

describe("Financial Report downloads organisation scope", () => {
  it("scopes the preview and download to the organisation and never reuses another's", async () => {
    serve({ preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }) });
    const { unmount } = await openSummary("org1");
    await within(downloadsRegion()).findByRole("button", { name: "Download PDF" });
    unmount();

    setSession("org2");
    jest.clearAllMocks();
    serve();
    await openSummary("org2");
    expect(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" })).toBeInTheDocument();
    expect(within(downloadsRegion()).queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(previewUrls()).toEqual(["/finance/org2/ledger/reports/financial?from=2026-09-01&to=2026-09-30"]);
    expect(queryClient.getQueryData(queryKeys.finance.ledger.financialReport("org2", "2026-09-01", "2026-09-30"))).toBeDefined();

    fireEvent.click(within(downloadsRegion()).getByRole("button", { name: "Download Excel" }));
    await within(downloadsRegion()).findByText(/^Saved /);
    expect(exportCalls()).toHaveLength(1);
    expect(exportCalls()[0][0]).toMatch(/^\/finance\/org2\//);
  });

  it("is refreshed by that organisation's ledger writes only", async () => {
    await openSummary();
    await within(downloadsRegion()).findByRole("button", { name: "Download Excel" });
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.root("org2") });
    });
    expect(previewUrls()).toHaveLength(1);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.finance.ledger.root("org1") });
    });
    await waitFor(() => expect(previewUrls()).toHaveLength(2));
  });
});

describe("Financial Report downloads readiness", () => {
  it("hides the PDF when the server doesn't offer it", async () => {
    await openSummary();
    const region = downloadsRegion();
    expect(await within(region).findByRole("button", { name: "Download Excel" })).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
  });

  it("offers the PDF when the server does", async () => {
    serve({ preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }) });
    await openSummary();
    expect(await within(downloadsRegion()).findByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  });

  it("keeps a provisional complete report downloadable, and says it is provisional", async () => {
    serve({ preview: (url) => preview(periodOf(url), { provisional: true }) });
    await openSummary();
    const region = downloadsRegion();
    expect(await within(region).findByRole("button", { name: "Download Excel" })).toBeEnabled();
    expect(within(region).getByText("Provisional")).toBeInTheDocument();
    expect(within(region).getByText(/Figures may change until the period is locked/)).toBeInTheDocument();
  });

  it.each([
    [
      "incomplete",
      "Report incomplete",
      [{ code: "REPORT_MONEY_ACCOUNT_UNKNOWN", message: "Cash box has no known balance.", accountId: "a" }],
    ],
    [
      "unavailable",
      "Report unavailable",
      [{ code: "REPORT_PERIOD_BEFORE_OPENING", message: "The books open on 1 Jun 2026." }],
    ],
  ])("cannot download an %s report", async (dataState, title, issues) => {
    serve({ preview: (url) => preview(periodOf(url), { dataState, issues }) });
    await openSummary();
    const region = downloadsRegion();
    expect(await within(region).findByText(title)).toBeInTheDocument();
    expect(within(region).getByText(new RegExp(issues[0].message))).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();
    expect(within(region).queryByText(/₦/)).not.toBeInTheDocument();
  });

  it("offers nothing for an unrecognised preview, and lets the officer check again", async () => {
    serve({ preview: () => ({ period: SEPTEMBER, dataState: "complete" }) });
    await openSummary();
    const region = downloadsRegion();
    expect(await within(region).findByText(/wasn't in a shape this app understands/)).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /Download/ })).not.toBeInTheDocument();

    serve();
    fireEvent.click(within(region).getByRole("button", { name: "Try again" }));
    expect(await within(region).findByRole("button", { name: "Download Excel" })).toBeInTheDocument();
  });

  it("explains a failed preview; a busy server can be retried by hand", async () => {
    serve({ preview: () => httpError(503, { error: "Too many financial reports are being prepared right now.", code: "REPORT_BUSY" }) });
    await openSummary();
    const region = downloadsRegion();
    expect(await within(region).findByText(/Couldn't check this report, so downloads are off\. Too many financial reports/)).toBeInTheDocument();
    expect(previewUrls()).toHaveLength(1);
    expect(within(region).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("does not offer a retry when access is refused", async () => {
    serve({ preview: () => httpError(403, { error: "Forbidden" }) });
    await openSummary();
    const region = downloadsRegion();
    expect(await within(region).findByText(/You don't have access to this organisation's financial reports/)).toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});

describe("Financial Report downloads", () => {
  it("downloads the Excel workbook as an authenticated blob and names the file", async () => {
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" }));
    expect(await within(downloadsRegion()).findByText("Saved Financial_Report_2026-09-01_to_2026-09-30.xlsx.")).toBeInTheDocument();

    const [url, config] = exportCalls()[0];
    expect(url).toBe("/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=xlsx");
    expect(config).toMatchObject({ responseType: "blob" });
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Financial_Report_2026-09-01_to_2026-09-30.xlsx");
    // The Summary is still there, unchanged.
    expect(screen.getByText("Total income")).toBeInTheDocument();
  });

  it("asks for the PDF layout, then downloads the chosen one", async () => {
    serve({ preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }) });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download PDF" }));

    // Detailed transactions is the default; nothing is requested until the
    // officer confirms.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("radio", { name: /Detailed transactions/ })).toBeChecked();
    expect(exportCalls()).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await within(downloadsRegion()).findByText("Saved Financial_Report_2026-09-01_to_2026-09-30.pdf.");
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), "Financial_Report_2026-09-01_to_2026-09-30.pdf");
    expect(exportCalls()[0][0]).toBe(
      "/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=pdf&layout=transactions",
    );
  });

  it.each([
    ["Summary by category", "categories", "_by_category"],
    ["Both detailed and summary", "both", ""],
  ])("downloads the %s PDF with its layout and file name", async (option, layout, suffix) => {
    serve({ preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }) });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download PDF" }));
    const dialog = await screen.findByRole("dialog");
    const choice = within(dialog).getByRole("radio", { name: new RegExp(option) });
    // Ark radios settle asynchronously: flush before clicking, then wait.
    // An async act flushes Ark's controlled value into the dialog before the
    // confirm click; the native input alone would flip before React knows.
    await act(async () => {
      choice.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const fileName = `Financial_Report_2026-09-01_to_2026-09-30${suffix}.pdf`;
    await within(downloadsRegion()).findByText(`Saved ${fileName}.`);
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), fileName);
    expect(exportCalls()[0][0]).toBe(
      `/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=pdf&layout=${layout}`,
    );
  });

  it("never sends a layout with the Excel download", async () => {
    serve({ preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }) });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" }));
    await within(downloadsRegion()).findByText(/^Saved Financial_Report_2026-09-01_to_2026-09-30\.xlsx/);
    expect(exportCalls()[0][0]).toBe(
      "/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=xlsx",
    );
  });

  it("shows which download is preparing and blocks a second request", async () => {
    const file = deferred();
    serve({
      preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }),
      exportFile: () => file.promise,
    });
    await openSummary();
    const excel = await within(downloadsRegion()).findByRole("button", { name: "Download Excel" });
    fireEvent.click(excel);
    fireEvent.click(excel);

    const preparing = await within(downloadsRegion()).findByRole("button", { name: /Preparing Excel/ });
    expect(preparing).toBeDisabled();
    expect(within(downloadsRegion()).getByRole("button", { name: "Download PDF" })).toBeDisabled();
    fireEvent.click(within(downloadsRegion()).getByRole("button", { name: "Download PDF" }));
    expect(exportCalls()).toHaveLength(1);
    // The Summary stays on screen while the file is prepared.
    expect(screen.getByText("Total income")).toBeInTheDocument();

    await act(async () => file.resolve({ data: new Blob(["x"], { type: XLSX }), headers: { "content-type": XLSX } }));
    expect(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" })).toBeEnabled();
    expect(saveBlob).toHaveBeenCalledTimes(1);
  });

  it("shows a JSON refusal read out of the Blob, with a manual retry for a busy server", async () => {
    serve({
      exportFile: () =>
        httpError(503, { error: "Too many financial reports are being prepared right now. Try again in a few seconds.", code: "REPORT_BUSY" }, true),
    });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" }));
    const alert = await within(downloadsRegion()).findByRole("alert");
    expect(alert).toHaveTextContent("Too many financial reports are being prepared right now. Try again in a few seconds.");
    expect(saveBlob).not.toHaveBeenCalled();
    expect(exportCalls()).toHaveLength(1);

    serve();
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await within(downloadsRegion()).findByText(/^Saved /);
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(exportCalls()).toHaveLength(2);
    expect(within(downloadsRegion()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("treats the export as authoritative: a report that became incomplete is refused", async () => {
    serve({
      exportFile: () =>
        httpError(422, { error: "This report is incomplete, so it cannot be exported as a financial statement.", code: "REPORT_INCOMPLETE" }, true),
    });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" }));
    const alert = await within(downloadsRegion()).findByRole("alert");
    expect(alert).toHaveTextContent("This report is incomplete");
    expect(within(alert).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it("recommends Excel and stops offering the PDF when the server has it disabled", async () => {
    serve({
      preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }),
      exportFile: () =>
        httpError(503, { error: "PDF downloads of the financial report are not available on this server. Download the Excel workbook instead.", code: "REPORT_PDF_DISABLED" }, true),
    });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download PDF" }));
    await confirmPdfDialog();
    const alert = await within(downloadsRegion()).findByRole("alert");
    expect(alert).toHaveTextContent("Download the Excel workbook instead.");
    expect(within(downloadsRegion()).queryByRole("button", { name: "Download PDF" })).not.toBeInTheDocument();
    expect(within(downloadsRegion()).getByRole("button", { name: "Download Excel" })).toBeEnabled();
  });

  it("recommends Excel when the PDF is too large", async () => {
    serve({
      preview: (url) => preview(periodOf(url), { downloads: { xlsx: true, pdf: true } }),
      exportFile: () =>
        httpError(422, { error: "This report would print 640 rows; a PDF can hold at most 500. Choose a shorter period, or download the Excel workbook, which has no such limit.", code: "REPORT_PDF_TOO_LARGE" }, true),
    });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download PDF" }));
    await confirmPdfDialog();
    expect(await within(downloadsRegion()).findByRole("alert")).toHaveTextContent(/download the Excel workbook/);
    expect(within(downloadsRegion()).getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
  });

  it("explains a network failure and allows a retry", async () => {
    serve({ exportFile: () => new Error("Network Error") });
    await openSummary();
    fireEvent.click(await within(downloadsRegion()).findByRole("button", { name: "Download Excel" }));
    const alert = await within(downloadsRegion()).findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't reach the server. Check your connection and try again.");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

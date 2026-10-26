import { act, renderHook, waitFor } from "@testing-library/react";
import { AxiosRequestConfig } from "axios";
import axiosInstance from "services/api";
import useGlobalStore, { EMPTY_USER } from "zStore";
import {
  FINANCIAL_REPORT_EXPORT_TIMEOUT_MS,
  useFinancialReportDownload,
} from "hooks/useFinancialReportDownload";
import { saveBlob } from "helpers/saveBlob";

jest.mock("helpers/saveBlob", () => ({ saveBlob: jest.fn() }));
jest.mock("react-toastify", () => ({ toast: { error: jest.fn() } }));

const PERIOD = { from: "2026-09-01", to: "2026-09-30" };
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * The real shared instance (with its interceptors), with only the transport
 * replaced: what reaches the adapter is what would go on the wire.
 */
const adapter = jest.fn<Promise<unknown>, [AxiosRequestConfig]>();
const originalAdapter = axiosInstance.defaults.adapter;

const ok = (config: AxiosRequestConfig, data: unknown, headers: Record<string, string>) => ({
  data,
  status: 200,
  statusText: "OK",
  headers,
  config,
  request: {},
});

const refusal = (config: AxiosRequestConfig, status: number, body: Record<string, string>) =>
  Promise.reject(
    Object.assign(new Error(`Request failed with status code ${status}`), {
      config,
      isAxiosError: true,
      response: {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
        data: new Blob([JSON.stringify(body)], { type: "application/json" }),
        config,
      },
    }),
  );

beforeAll(() => {
  axiosInstance.defaults.adapter = adapter as unknown as typeof originalAdapter;
});

afterAll(() => {
  axiosInstance.defaults.adapter = originalAdapter;
  useGlobalStore.setState({ user: EMPTY_USER });
});

beforeEach(() => {
  useGlobalStore.setState({ user: { ...EMPTY_USER, id: "officer-1", token: "secret-token" } });
});

const render = (organisationId = "org1") =>
  renderHook(() => useFinancialReportDownload(organisationId, PERIOD));

describe("useFinancialReportDownload", () => {
  it("fetches the file through the authenticated instance, never with the token in the URL", async () => {
    adapter.mockImplementation(async (config) =>
      ok(config, new Blob(["xlsx-bytes"], { type: XLSX }), { "content-type": XLSX }),
    );
    const { result } = render();
    await act(() => result.current.download("xlsx"));

    expect(adapter).toHaveBeenCalledTimes(1);
    const config = adapter.mock.calls[0][0];
    expect(config.url).toBe(
      "/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=xlsx",
    );
    expect(config.url).not.toContain("secret-token");
    expect((config.headers as Record<string, string>).Authorization).toBe("Bearer secret-token");
    expect((config.headers as Record<string, string>).Accept).toBe(`${XLSX}, application/json`);
    expect(config.responseType).toBe("blob");
    expect(config.timeout).toBe(FINANCIAL_REPORT_EXPORT_TIMEOUT_MS);

    // Cross-origin, Content-Disposition is not readable: the documented name.
    expect(saveBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = (saveBlob as jest.Mock).mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect(name).toBe("Financial_Report_2026-09-01_to_2026-09-30.xlsx");
    expect(result.current.savedFileName).toBe(name);
    expect(result.current.active).toBeNull();
    expect(result.current.failure).toBeNull();
  });

  it("uses the server's file name when its header is readable", async () => {
    adapter.mockImplementation(async (config) =>
      ok(config, new Blob(["%PDF"], { type: "application/pdf" }), {
        "content-type": "application/pdf",
        "content-disposition": 'attachment; filename="Financial_Report_2026-09-01_to_2026-09-30.pdf"',
      }),
    );
    const { result } = render();
    await act(() => result.current.download("pdf"));
    expect(adapter.mock.calls[0][0].url).toBe(
      "/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=pdf&layout=transactions",
    );
    expect((saveBlob as jest.Mock).mock.calls[0][1]).toBe("Financial_Report_2026-09-01_to_2026-09-30.pdf");
  });

  it("sends the chosen layout only for the PDF, and names a category PDF as documented", async () => {
    adapter.mockImplementation(async (config) =>
      ok(config, new Blob(["%PDF"], { type: "application/pdf" }), { "content-type": "application/pdf" }),
    );
    const { result } = render();
    await act(() => result.current.download("pdf", "categories"));

    expect(adapter.mock.calls[0][0].url).toBe(
      "/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=pdf&layout=categories",
    );
    // Content-Disposition is not readable cross-origin: the documented suffix.
    expect((saveBlob as jest.Mock).mock.calls[0][1]).toBe(
      "Financial_Report_2026-09-01_to_2026-09-30_by_category.pdf",
    );
  });

  it("never sends a layout with the workbook", async () => {
    adapter.mockImplementation(async (config) =>
      ok(config, new Blob(["x"], { type: XLSX }), { "content-type": XLSX }),
    );
    const { result } = render();
    await act(() => result.current.download("xlsx", "categories"));
    expect(adapter.mock.calls[0][0].url).toBe(
      "/finance/org1/ledger/reports/financial/export?from=2026-09-01&to=2026-09-30&format=xlsx",
    );
  });

  it("scopes the request to the organisation", async () => {
    adapter.mockImplementation(async (config) =>
      ok(config, new Blob(["x"], { type: XLSX }), { "content-type": XLSX }),
    );
    const { result } = render("org2");
    await act(() => result.current.download("xlsx"));
    expect(adapter.mock.calls[0][0].url).toMatch(/^\/finance\/org2\/ledger\/reports\/financial\/export\?/);
  });

  it("saves nothing when the body is not the expected file", async () => {
    adapter.mockImplementation(async (config) =>
      ok(config, new Blob(['{"data":{}}'], { type: "application/json" }), { "content-type": "application/json" }),
    );
    const { result } = render();
    await act(() => result.current.download("xlsx"));
    expect(saveBlob).not.toHaveBeenCalled();
    expect(result.current.failure).toMatchObject({
      format: "xlsx",
      message: "The server didn't send an Excel file, so nothing was saved.",
      retryable: true,
    });
  });

  it("reads a JSON refusal out of the Blob", async () => {
    adapter.mockImplementation((config) =>
      refusal(config, 422, {
        error: "This report is incomplete, so it cannot be exported as a financial statement. Cash box has no known balance.",
        code: "REPORT_INCOMPLETE",
      }),
    );
    const { result } = render();
    await act(() => result.current.download("xlsx"));
    expect(saveBlob).not.toHaveBeenCalled();
    expect(result.current.failure).toEqual({
      format: "xlsx",
      layout: null,
      code: "REPORT_INCOMPLETE",
      retryable: false,
      message:
        "This report is incomplete, so it cannot be exported as a financial statement. Cash box has no known balance.",
    });
  });

  it("stops offering the PDF once the server says it is disabled", async () => {
    adapter.mockImplementation((config) =>
      refusal(config, 503, {
        error: "PDF downloads of the financial report are not available on this server. Download the Excel workbook instead.",
        code: "REPORT_PDF_DISABLED",
      }),
    );
    const { result } = render();
    await act(() => result.current.download("pdf"));
    expect(result.current.pdfRefused).toBe(true);
    expect(result.current.failure).toMatchObject({ code: "REPORT_PDF_DISABLED", retryable: false });
  });

  it("leaves a 401 to the global sign-out and shows nothing of its own", async () => {
    adapter.mockImplementation((config) => refusal(config, 401, { error: "Session expired." }));
    const { result } = render();
    await act(() => result.current.download("xlsx"));
    expect(useGlobalStore.getState().user).toEqual(EMPTY_USER);
    expect(result.current.failure).toBeNull();
    expect(result.current.active).toBeNull();
  });

  it("starts one request at a time", async () => {
    let finish: (value: unknown) => void = () => undefined;
    adapter.mockImplementation(
      (config) =>
        new Promise((resolve) => {
          finish = () => resolve(ok(config, new Blob(["x"], { type: XLSX }), { "content-type": XLSX }));
        }),
    );
    const { result } = render();
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.download("xlsx");
      void result.current.download("xlsx");
      void result.current.download("pdf");
    });
    await waitFor(() => expect(result.current.active).toBe("xlsx"));
    expect(adapter).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish(undefined);
      await first;
    });
    expect(result.current.active).toBeNull();
    expect(saveBlob).toHaveBeenCalledTimes(1);
  });

  it("cancels a download in flight when the screen goes away, and saves nothing", async () => {
    // The global interceptor logs the cancellation's sanitised code.
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    let finish: () => void = () => undefined;
    adapter.mockImplementation(
      (config) =>
        new Promise((resolve) => {
          finish = () => resolve(ok(config, new Blob(["x"], { type: XLSX }), { "content-type": XLSX }));
        }),
    );
    const { result, unmount } = render();
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.download("xlsx");
    });
    await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));
    unmount();
    expect(adapter.mock.calls[0][0].signal?.aborted).toBe(true);
    finish();
    await pending;
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

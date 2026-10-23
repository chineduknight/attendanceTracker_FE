/**
 * Financial Report v1 downloads (backend BE-1 preview, BE-2 Excel, BE-3 PDF).
 *
 * Pure helpers. The frontend never builds or recomputes the report: it only
 * decides which period to ask for, whether the server says the report can be
 * downloaded, what to call the file and how to word a refusal. Anything this
 * build cannot read fails closed (no download offered).
 */

import { ledgerHttpStatus } from "helpers/ledger";
import { isBusinessDate } from "helpers/openingBalances";

export type FinancialReportFormat = "xlsx" | "pdf";

export type FinancialReportDataState = "complete" | "incomplete" | "unavailable";

export interface FinancialReportPeriod {
  from: string;
  to: string;
}

export interface FinancialReportIssue {
  code: string | null;
  message: string;
}

/** What the preview says about downloading; its figures are not read. */
export interface FinancialReportAvailability {
  period: FinancialReportPeriod;
  dataState: FinancialReportDataState;
  provisional: boolean;
  issues: FinancialReportIssue[];
  /** Which formats this server offers (PDF is per environment). */
  downloads: Record<FinancialReportFormat, boolean>;
}

export const FINANCIAL_REPORT_FORMATS: Record<
  FinancialReportFormat,
  { label: string; contentType: string }
> = {
  xlsx: {
    label: "Excel",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pdf: { label: "PDF", contentType: "application/pdf" },
};

export const FINANCIAL_REPORT_FORMAT_ORDER: readonly FinancialReportFormat[] = ["xlsx", "pdf"];

const DATA_STATES: readonly FinancialReportDataState[] = ["complete", "incomplete", "unavailable"];

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/* ------------------------------------------------------------------ */
/* Period                                                             */
/* ------------------------------------------------------------------ */

/**
 * The period the Summary is showing, for its downloads. The Summary accepts
 * a blank From or To and the server fills it in (opening date / today), but
 * the Financial Report needs both, so the dates come from the Summary's own
 * response for the applied range: never a draft, never a browser guess.
 *
 * An applied end that is set must come back exactly; otherwise the response
 * is not for this range and null (no download) is returned. A future `to` is
 * left to the server (422): the device clock is not the server's.
 */
export const resolveFinancialReportPeriod = (
  applied: FinancialReportPeriod,
  shown: FinancialReportPeriod | null,
): FinancialReportPeriod | null => {
  if (!shown) return null;
  if ((applied.from && applied.from !== shown.from) || (applied.to && applied.to !== shown.to)) {
    return null;
  }
  if (!isBusinessDate(shown.from) || !isBusinessDate(shown.to) || shown.from > shown.to) return null;
  return { from: shown.from, to: shown.to };
};

/* ------------------------------------------------------------------ */
/* Preview                                                            */
/* ------------------------------------------------------------------ */

/**
 * Download readiness from the preview body, or null when unusable: an
 * unrecognised data state, a missing `downloads` or `provisional`, an issue
 * without a message, or a period other than the one requested (a response
 * for another period never answers for this one).
 */
export const toFinancialReportAvailability = (
  value: unknown,
  requested: FinancialReportPeriod,
): FinancialReportAvailability | null => {
  const raw = asRecord(value);
  const period = asRecord(raw?.period);
  const downloads = asRecord(raw?.downloads);
  if (!raw || !period || !downloads || !Array.isArray(raw.issues)) return null;
  if (period.from !== requested.from || period.to !== requested.to) return null;
  const dataState = DATA_STATES.find((state) => state === raw.dataState);
  if (!dataState || typeof raw.provisional !== "boolean") return null;
  const issues: FinancialReportIssue[] = [];
  for (const entry of raw.issues) {
    const issue = asRecord(entry);
    const message = asText(issue?.message);
    if (!issue || !message) return null;
    issues.push({ code: asText(issue.code), message });
  }
  return {
    period: { from: requested.from, to: requested.to },
    dataState,
    provisional: raw.provisional,
    issues,
    downloads: { xlsx: downloads.xlsx === true, pdf: downloads.pdf === true },
  };
};

/* ------------------------------------------------------------------ */
/* Files                                                              */
/* ------------------------------------------------------------------ */

/** The documented name, used when the server's header can't be read. */
export const financialReportFileName = (
  period: FinancialReportPeriod,
  format: FinancialReportFormat,
): string => `Financial_Report_${period.from}_to_${period.to}.${format}`;

const SAFE_FILE_NAME = /^[A-Za-z0-9][\w.-]{0,149}$/;

/**
 * The attachment name from a Content-Disposition header, or null. The header
 * is only readable same-origin or when CORS exposes it. Only a plain name
 * (letters, digits, `_ . -`) with the right extension is used, so a header
 * can never pick a path or another file type.
 */
export const attachmentFileName = (
  header: unknown,
  format: FinancialReportFormat,
): string | null => {
  if (typeof header !== "string") return null;
  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1];
  let name: string | undefined;
  try {
    name = encoded ? decodeURIComponent(encoded.trim()) : plain?.trim();
  } catch {
    name = undefined;
  }
  return name && SAFE_FILE_NAME.test(name) && name.endsWith(`.${format}`) ? name : null;
};

/** True when a response's Content-Type is the format's own type. */
export const isFormatContentType = (contentType: unknown, format: FinancialReportFormat): boolean =>
  typeof contentType === "string" &&
  contentType.split(";")[0].trim().toLowerCase() === FINANCIAL_REPORT_FORMATS[format].contentType;

/* ------------------------------------------------------------------ */
/* Refusals                                                           */
/* ------------------------------------------------------------------ */

export interface FinancialReportErrorBody {
  error: string | null;
  code: string | null;
}

/** A refusal is a small JSON envelope; anything bigger is not one. */
const MAX_ERROR_BODY_BYTES = 64 * 1024;

const readBlobText = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

const toErrorBody = (value: unknown): FinancialReportErrorBody | null => {
  const raw = asRecord(value);
  return raw ? { error: asText(raw.error), code: asText(raw.code) } : null;
};

/** The `{ error, code }` envelope of a failed JSON request (the preview). */
export const financialReportErrorBody = (error: unknown): FinancialReportErrorBody | null =>
  toErrorBody((error as { response?: { data?: unknown } } | null)?.response?.data);

/**
 * The `{ error, code }` envelope of a failed download. With
 * `responseType: "blob"` it arrives as a Blob and is read back out; a body
 * that is not small JSON gives null (never thrown).
 */
export const readFinancialReportErrorBody = async (
  data: unknown,
): Promise<FinancialReportErrorBody | null> => {
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    if (data.size === 0 || data.size > MAX_ERROR_BODY_BYTES) return null;
    try {
      return toErrorBody(JSON.parse(await readBlobText(data)));
    } catch {
      return null;
    }
  }
  return toErrorBody(data);
};

export interface FinancialReportFailure {
  message: string;
  code: string | null;
  /** A transient failure: offer a manual Try again (never retried automatically). */
  retryable: boolean;
}

const CODE_FAILURES: Record<string, { fallback: string; retryable: boolean; suffix?: string }> = {
  REPORT_INCOMPLETE: {
    fallback: "This report is incomplete, so it can't be downloaded as a financial statement.",
    retryable: false,
  },
  REPORT_UNAVAILABLE: {
    fallback: "This report isn't available for this period, so it can't be downloaded.",
    retryable: false,
  },
  REPORT_TOO_LARGE: {
    fallback: "This report is too large to prepare. Choose an earlier To date.",
    retryable: false,
  },
  REPORT_PDF_TOO_LARGE: {
    fallback: "This report is too long for a PDF. Download the Excel workbook instead, or choose a shorter period.",
    retryable: false,
  },
  REPORT_PDF_DISABLED: {
    fallback: "PDF downloads aren't available on this server. Download the Excel workbook instead.",
    retryable: false,
  },
  REPORT_PDF_TIMEOUT: {
    fallback: "The PDF couldn't be prepared in time. Download the Excel workbook instead, or choose a shorter period.",
    retryable: false,
  },
  REPORT_BUSY: {
    fallback: "Other reports are being prepared right now. Try again in a few seconds.",
    retryable: true,
  },
  REPORT_READ_TIMEOUT: {
    fallback: "The report took too long to read. Try again, or choose a shorter period.",
    retryable: true,
  },
  REPORT_INTEGRITY_FAILURE: {
    fallback: "The report couldn't be produced because the books failed a consistency check. Nothing was changed.",
    retryable: false,
    suffix: "Please report this to support.",
  },
  REPORT_PDF_RENDER_FAILED: {
    fallback: "The PDF couldn't be produced. Try again, or download the Excel workbook.",
    retryable: true,
  },
};

const isCancelled = (error: unknown) => {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  return code === "ERR_CANCELED" || name === "CanceledError";
};

/**
 * How to tell the officer a preview or download failed, or null when there
 * is nothing to say: a 401 (the global interceptor already signed them out)
 * or a request this screen cancelled. The server's own text is preferred;
 * a known `code` decides whether a retry can help.
 */
export const financialReportFailure = (
  error: unknown,
  body: FinancialReportErrorBody | null,
): FinancialReportFailure | null => {
  if (isCancelled(error)) return null;
  const status = ledgerHttpStatus(error);
  const code = body?.code ?? null;
  const serverText = body?.error ?? null;

  if (status === undefined) {
    const timedOut = (error as { code?: unknown } | null)?.code === "ECONNABORTED";
    return {
      message: timedOut
        ? "The server took too long to answer. Try again, or choose a shorter period."
        : "Couldn't reach the server. Check your connection and try again.",
      code: null,
      retryable: true,
    };
  }
  if (status === 401) return null;

  const known = code ? CODE_FAILURES[code] : undefined;
  if (known) {
    const message = serverText ?? known.fallback;
    return {
      message: known.suffix ? `${message} ${known.suffix}` : message,
      code,
      retryable: known.retryable,
    };
  }
  if (status === 403) {
    return {
      message: "You don't have access to this organisation's financial reports.",
      code,
      retryable: false,
    };
  }
  if (status === 404) {
    return {
      message: serverText ?? "This organisation's financial report couldn't be found.",
      code,
      retryable: false,
    };
  }
  if (status === 422) {
    return { message: serverText ?? "The server didn't accept this period.", code, retryable: false };
  }
  return {
    message: serverText ?? "The financial report couldn't be prepared.",
    code,
    retryable: status >= 500,
  };
};

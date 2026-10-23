/**
 * Financial Report v1 (backend BE-1 preview, BE-2 Excel, BE-3 PDF).
 *
 * Pure helpers. The Summary renders from the same preview the downloads use,
 * and the frontend never builds or recomputes the report: it decides which
 * period to ask for, checks that the figures it shows are the server's, says
 * whether the report can be downloaded, what to call the file and how to word
 * a refusal. Anything this build cannot read fails closed (no figures, no
 * download).
 */

import {
  FinancialReportAccountRow,
  FinancialReportAccountState,
  FinancialReportCategoryTotal,
  FinancialReportExcludedAccount,
  FinancialReportMoneyGroup,
  FinancialReportStatement,
} from "components/finance/ledgerReportTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { ledgerHttpStatus } from "helpers/ledger";
import { reportRangeIssue } from "helpers/ledgerReports";
import { isBusinessDate } from "helpers/openingBalances";

export type FinancialReportFormat = "xlsx" | "pdf";

/**
 * What a PDF may print: every transaction (the default), one line per
 * category, or both. Only the PDF takes a layout; the workbook is fixed.
 */
export type FinancialReportLayout = "transactions" | "categories" | "both";

export const FINANCIAL_REPORT_LAYOUTS: readonly {
  value: FinancialReportLayout;
  label: string;
  description: string;
}[] = [
  {
    value: "transactions",
    label: "Detailed transactions",
    description: "Every entry in the period.",
  },
  {
    value: "categories",
    label: "Summary by category",
    description: "One line per category with its total.",
  },
  {
    value: "both",
    label: "Both detailed and summary",
    description: "The transaction detail, then the summary by category.",
  },
];

export const isFinancialReportLayout = (value: unknown): value is FinancialReportLayout =>
  FINANCIAL_REPORT_LAYOUTS.some((layout) => layout.value === value);

export type FinancialReportDataState = "complete" | "incomplete" | "unavailable";

export interface FinancialReportPeriod {
  from: string;
  to: string;
}

export interface FinancialReportIssue {
  code: string | null;
  message: string;
}

/** The preview's state and download readiness (its figures are read separately). */
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

const isKobo = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);

const asBusinessDate = (value: unknown): string | null =>
  typeof value === "string" && isBusinessDate(value) ? value : null;

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
/* Preview figures                                                    */
/* ------------------------------------------------------------------ */

/**
 * Readiness plus the statement the Financial Report will print. Every figure
 * is the backend's: the frontend only checks that what arrived is usable, and
 * never derives a balance, total or closing from another figure.
 *
 * `statement` is null only for an `unavailable` report (the server sent no
 * figures at all). A `complete` or `incomplete` report whose statement cannot
 * be read fails closed (null), so no partly parsed figures are shown.
 */
export interface FinancialReportPreview extends FinancialReportAvailability {
  openingDate: string | null;
  lockedThrough: string | null;
  /** When the server read the books, ISO; shown as "figures as at". */
  readAt: string | null;
  statement: FinancialReportStatement | null;
  /** null only when the report is unavailable. */
  accounts: FinancialReportAccountRow[] | null;
  /** Held for members at period end; null without a member-money account. */
  memberMoneyHeldAtEndKobo: number | null;
  excludedAccounts: FinancialReportExcludedAccount[];
}

const ACCOUNT_STATES: readonly FinancialReportAccountState[] = ["in_books", "brought_in", "unknown"];

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Integer kobo, or null for a figure the server could not know. */
const asNullableKobo = (value: unknown): number | null | undefined => {
  if (value === null) return null;
  return isKobo(value) ? value : undefined;
};

const toFinancialReportCategory = (value: unknown): FinancialReportCategoryTotal | null => {
  const raw = asRecord(value);
  if (!raw || !isCount(raw.count) || !isKobo(raw.totalKobo)) return null;
  const accountId = raw.categoryAccountId === null ? null : asText(raw.categoryAccountId);
  if (raw.categoryAccountId !== null && accountId === null) return null;
  const name = raw.categoryName === null ? null : asText(raw.categoryName);
  if (raw.categoryName !== null && name === null) return null;
  return { accountId, name, count: raw.count, amountKobo: raw.totalKobo };
};

const toFinancialReportGroup = (value: unknown): FinancialReportMoneyGroup | null => {
  const raw = asRecord(value);
  const key = asText(raw?.key);
  if (!raw || !key || !isCount(raw.count) || !isKobo(raw.totalKobo) || !Array.isArray(raw.categories)) {
    return null;
  }
  const categories: FinancialReportCategoryTotal[] = [];
  for (const entry of raw.categories) {
    const category = toFinancialReportCategory(entry);
    if (!category) return null;
    categories.push(category);
  }
  return {
    key,
    label: asText(raw.label) ?? key,
    count: raw.count,
    totalKobo: raw.totalKobo,
    categories,
  };
};

const toFinancialReportGroups = (value: unknown): FinancialReportMoneyGroup[] | null => {
  if (!Array.isArray(value)) return null;
  const groups: FinancialReportMoneyGroup[] = [];
  for (const entry of value) {
    const group = toFinancialReportGroup(entry);
    if (!group) return null;
    groups.push(group);
  }
  return groups;
};

const toFinancialReportStatement = (
  value: unknown,
  appliedTo: string,
): FinancialReportStatement | null => {
  const raw = asRecord(value);
  const broughtForward = asRecord(raw?.broughtForward);
  const carriedForward = asRecord(raw?.carriedForward);
  const received = asRecord(raw?.moneyReceived);
  const paid = asRecord(raw?.moneyPaid);
  const broughtIn = asRecord(raw?.broughtIntoBooks);
  const transfers = asRecord(raw?.transfers);
  if (!raw || !broughtForward || !carriedForward || !received || !paid || !broughtIn || !transfers) {
    return null;
  }
  const broughtForwardKobo = asNullableKobo(broughtForward.totalKobo);
  const grossBalanceKobo = asNullableKobo(raw.grossBalanceKobo);
  const carriedForwardKobo = asNullableKobo(carriedForward.totalKobo);
  if (
    broughtForwardKobo === undefined ||
    grossBalanceKobo === undefined ||
    carriedForwardKobo === undefined
  ) {
    return null;
  }
  if (
    !isKobo(received.totalKobo) ||
    !isKobo(paid.totalKobo) ||
    !isKobo(broughtIn.totalKobo) ||
    !isCount(broughtIn.count) ||
    !isKobo(transfers.totalMovedKobo) ||
    !isCount(transfers.count)
  ) {
    return null;
  }
  const receivedGroups = toFinancialReportGroups(received.groups);
  const paidGroups = toFinancialReportGroups(paid.groups);
  if (!receivedGroups || !paidGroups) return null;
  const basis =
    broughtForward.basis === "verified_opening" || broughtForward.basis === "balance"
      ? broughtForward.basis
      : null;
  return {
    broughtForwardKobo,
    broughtForwardAsOf: asBusinessDate(broughtForward.asOf),
    broughtForwardBasis: basis,
    broughtInCount: broughtIn.count,
    broughtInTotalKobo: broughtIn.totalKobo,
    receivedGroups,
    receivedTotalKobo: received.totalKobo,
    paidGroups,
    paidTotalKobo: paid.totalKobo,
    grossBalanceKobo,
    carriedForwardKobo,
    // The server echoes the period's end; the applied end is the fallback.
    carriedForwardAsOf: asBusinessDate(carriedForward.asOf) ?? appliedTo,
    transfersCount: transfers.count,
    transfersTotalKobo: transfers.totalMovedKobo,
  };
};

const toFinancialReportAccount = (value: unknown): FinancialReportAccountRow | null => {
  const raw = asRecord(value);
  if (!raw) return null;
  const accountId = asText(raw.accountId);
  const name = asText(raw.name);
  const kind = raw.kind === "cash" || raw.kind === "bank" ? raw.kind : null;
  const state = ACCOUNT_STATES.find((known) => known === raw.state);
  const carriedForwardKobo = asNullableKobo(raw.carriedForwardKobo);
  if (
    !accountId ||
    !name ||
    !kind ||
    !state ||
    typeof raw.active !== "boolean" ||
    carriedForwardKobo === undefined
  ) {
    return null;
  }
  const broughtInOn = raw.broughtInOn == null ? null : asBusinessDate(raw.broughtInOn);
  if (raw.broughtInOn != null && !broughtInOn) return null;
  return {
    accountId,
    name,
    kind,
    active: raw.active,
    state,
    carriedForwardKobo,
    broughtInOn,
    bankName: asText(raw.bankName),
    accountNumberLast4: asText(raw.accountNumberLast4),
  };
};

const toExcludedAccounts = (value: unknown): FinancialReportExcludedAccount[] => {
  if (!Array.isArray(value)) return [];
  const excluded: FinancialReportExcludedAccount[] = [];
  for (const entry of value) {
    const raw = asRecord(entry);
    const name = asText(raw?.name);
    if (!name) continue;
    const reason =
      raw?.reason === "never_opened" || raw?.reason === "not_yet_in_books" ? raw.reason : null;
    excluded.push({ name, reason });
  }
  return excluded;
};

/**
 * The preview body, or null when it is not a usable answer for this exact
 * period. Readiness comes first (the same checks as the download gate), then
 * the statement and account rows. An `unavailable` report legitimately
 * carries no figures; a `complete` or `incomplete` one must carry all of its
 * statement and account rows, or the whole preview fails closed.
 */
export const toFinancialReportPreview = (
  value: unknown,
  requested: FinancialReportPeriod,
): FinancialReportPreview | null => {
  const availability = toFinancialReportAvailability(value, requested);
  if (!availability) return null;
  const raw = asRecord(value) as Record<string, unknown>;
  const openingDate = raw.openingDate == null ? null : asBusinessDate(raw.openingDate);
  const lockedThrough = raw.lockedThrough == null ? null : asBusinessDate(raw.lockedThrough);
  const readAt = asText(raw.readAt);
  const excludedAccounts = toExcludedAccounts(raw.excludedAccounts);
  const header = { ...availability, openingDate, lockedThrough, readAt, excludedAccounts };

  if (availability.dataState === "unavailable") {
    return {
      ...header,
      statement: null,
      accounts: null,
      memberMoneyHeldAtEndKobo: null,
    };
  }

  const statement = toFinancialReportStatement(raw.statement, requested.to);
  if (!statement || !Array.isArray(raw.accounts)) return null;
  const accounts: FinancialReportAccountRow[] = [];
  for (const entry of raw.accounts) {
    const account = toFinancialReportAccount(entry);
    if (!account) return null;
    accounts.push(account);
  }

  const reconciliation = asRecord(raw.reconciliation);
  if (!reconciliation) return null;
  const memberMoney = reconciliation.memberMoney === null ? null : asRecord(reconciliation.memberMoney);
  let memberMoneyHeldAtEndKobo: number | null = null;
  if (memberMoney) {
    if (!isKobo(memberMoney.heldAtEndKobo)) return null;
    memberMoneyHeldAtEndKobo = memberMoney.heldAtEndKobo;
  } else if (reconciliation.memberMoney !== null) {
    return null;
  }

  return { ...header, statement, accounts, memberMoneyHeldAtEndKobo };
};

/* ------------------------------------------------------------------ */
/* Period                                                             */
/* ------------------------------------------------------------------ */

/**
 * The Summary's opening period: the first of this calendar month to today,
 * both in Lagos, but never before the ledger's verified opening date. The
 * server still refuses a period before its own opening date; this only
 * keeps the first request inside the books.
 */
export const defaultFinancialSummaryPeriod = (
  today: string,
  openingDate: string | null,
): FinancialReportPeriod => {
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = openingDate && isBusinessDate(openingDate) && openingDate > monthStart ? openingDate : monthStart;
  return { from, to: today };
};

/**
 * Why a chosen Summary period would be refused, or null. The general range
 * rules come first, then the books' own opening date: the server is still
 * authoritative (422).
 */
export const summaryPeriodIssue = (
  from: string,
  to: string,
  today: string,
  openingDate: string | null,
): string | null => {
  const range = reportRangeIssue(from, to, today);
  if (range) return range;
  if (!openingDate || !isBusinessDate(openingDate)) return null;
  // From ≤ To is already checked, so this also covers a period entirely
  // before the books opened.
  if (from && from < openingDate) {
    return `The period can't start before the books' opening date (${formatBusinessDate(openingDate)}).`;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Files                                                              */
/* ------------------------------------------------------------------ */

/** The documented name, used when the server's header can't be read. */
export const financialReportFileName = (
  period: FinancialReportPeriod,
  format: FinancialReportFormat,
  layout?: FinancialReportLayout,
): string => {
  // The server suffixes only the category-only PDF; "both" keeps its name.
  const suffix = format === "pdf" && layout === "categories" ? "_by_category" : "";
  return `Financial_Report_${period.from}_to_${period.to}${suffix}.${format}`;
};

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

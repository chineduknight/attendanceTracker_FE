import { useCallback, useEffect, useRef, useState } from "react";
import axiosInstance from "services/api";
import { financeRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import { reportQuery } from "helpers/ledgerReports";
import {
  attachmentFileName,
  FINANCIAL_REPORT_FORMATS,
  financialReportFailure,
  FinancialReportFailure,
  financialReportFileName,
  FinancialReportFormat,
  FinancialReportPeriod,
  isFormatContentType,
  readFinancialReportErrorBody,
} from "helpers/financialReport";
import { saveBlob } from "helpers/saveBlob";

/**
 * Generous on purpose: on a small server (Render Free) the workbook is read
 * from one snapshot and written in full before the first byte is sent, and a
 * cold start comes first. The server's own read limit is 20 s.
 */
export const FINANCIAL_REPORT_EXPORT_TIMEOUT_MS = 120_000;

export type FinancialReportDownloadFailure = FinancialReportFailure & {
  format: FinancialReportFormat;
};

/**
 * One Financial Report download at a time, for one organisation and period.
 *
 * The file is fetched through the shared Axios instance, so the bearer token
 * goes in its header (never the URL) and a 401 signs out as everywhere else.
 * The server stays authoritative: the books may have changed since the
 * preview, so its refusal is shown as sent. Leaving the screen cancels a
 * request in flight, so an earlier organisation's or period's file is never
 * saved after a switch.
 */
export const useFinancialReportDownload = (
  organisationId: string,
  period: FinancialReportPeriod,
) => {
  const [active, setActive] = useState<FinancialReportFormat | null>(null);
  const [failure, setFailure] = useState<FinancialReportDownloadFailure | null>(null);
  const [savedFileName, setSavedFileName] = useState<string | null>(null);
  // REPORT_PDF_DISABLED is not transient: once refused, the PDF is not offered again.
  const [pdfRefused, setPdfRefused] = useState(false);
  // A ref, not state: a second click in the same tick must not start a second request.
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const { from, to } = period;

  const download = useCallback(
    async (format: FinancialReportFormat) => {
      if (inFlight.current) return;
      inFlight.current = true;
      const abort = new AbortController();
      controller.current = abort;
      setActive(format);
      setFailure(null);
      setSavedFileName(null);
      const { contentType, label } = FINANCIAL_REPORT_FORMATS[format];
      const url =
        convertParamsToString(financeRequest.LEDGER_FINANCIAL_REPORT_EXPORT, { organisationId }) +
        reportQuery({ from, to, format });
      try {
        const response = await axiosInstance.get(url, {
          responseType: "blob",
          timeout: FINANCIAL_REPORT_EXPORT_TIMEOUT_MS,
          signal: abort.signal,
          headers: { Accept: `${contentType}, application/json` },
        });
        if (abort.signal.aborted) return;
        const blob: unknown = response.data;
        if (
          !(blob instanceof Blob) ||
          blob.size === 0 ||
          !isFormatContentType(response.headers?.["content-type"] ?? blob.type, format)
        ) {
          setFailure({
            format,
            code: null,
            retryable: true,
            message: `The server didn't send ${format === "xlsx" ? "an" : "a"} ${label} file, so nothing was saved.`,
          });
          return;
        }
        const fileName =
          attachmentFileName(response.headers?.["content-disposition"], format) ??
          financialReportFileName({ from, to }, format);
        saveBlob(blob, fileName);
        setSavedFileName(fileName);
      } catch (error) {
        if (abort.signal.aborted) return;
        const body = await readFinancialReportErrorBody(
          (error as { response?: { data?: unknown } } | null)?.response?.data,
        );
        if (abort.signal.aborted) return;
        const failed = financialReportFailure(error, body);
        if (failed?.code === "REPORT_PDF_DISABLED") setPdfRefused(true);
        if (failed) setFailure({ ...failed, format });
      } finally {
        inFlight.current = false;
        if (!abort.signal.aborted) setActive(null);
      }
    },
    [organisationId, from, to],
  );

  return { download, active, failure, savedFileName, pdfRefused };
};

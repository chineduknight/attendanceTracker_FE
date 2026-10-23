import { useId } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa";
import {
  FINANCIAL_REPORT_FORMAT_ORDER,
  FINANCIAL_REPORT_FORMATS,
  financialReportFailure,
  FinancialReportFormat,
  FinancialReportPeriod,
  financialReportErrorBody,
} from "helpers/financialReport";
import { formatReportPeriod } from "helpers/ledgerReports";
import { useFinancialReportAvailability } from "hooks/useLedgerReports";
import { useFinancialReportDownload } from "hooks/useFinancialReportDownload";
import { ReportNotice } from "components/finance/reports/ReportParts";

export const FINANCIAL_REPORT_DOWNLOADS_NOTE =
  "The Financial Report includes a Receipts and Payments Statement, account balances and reconciliation.";

const FORMAT_ICONS: Record<FinancialReportFormat, JSX.Element> = {
  xlsx: <FaFileExcel aria-hidden />,
  pdf: <FaFilePdf aria-hidden />,
};

const FORMAT_PALETTES: Record<FinancialReportFormat, string> = { xlsx: "green", pdf: "red" };

const StatusLine = ({ children }: { children: string }) => (
  <Text role="status" fontSize="sm" color="fg.muted">
    {children}
  </Text>
);

const Failure = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <Box role="alert" borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3}>
    <Text fontSize="sm">{message}</Text>
    {onRetry && (
      <Button size="sm" variant="outline" minH="44px" mt={2} onClick={onRetry}>
        Try again
      </Button>
    )}
  </Box>
);

/**
 * Readiness and downloads for one known organisation and period. Mounted
 * per organisation and period (keyed by the parent), so a preview, a
 * refusal or a download in flight never carries over to another.
 */
const PeriodDownloads = ({
  organisationId,
  period,
}: {
  organisationId: string;
  period: FinancialReportPeriod;
}) => {
  const availability = useFinancialReportAvailability(organisationId, period);
  const { download, active, failure, savedFileName, pdfRefused } = useFinancialReportDownload(
    organisationId,
    period,
  );

  const body = (() => {
    if (availability.isLoading) {
      return <StatusLine>Checking whether this report can be downloaded…</StatusLine>;
    }
    if (availability.isError) {
      const failed = financialReportFailure(availability.error, financialReportErrorBody(availability.error));
      return (
        <Failure
          message={`Couldn't check this report, so downloads are off. ${failed?.message ?? ""}`.trim()}
          onRetry={failed?.retryable === false ? undefined : () => availability.refetch()}
        />
      );
    }
    const report = availability.report;
    if (!report) {
      return (
        <Failure
          message="The server's answer wasn't in a shape this app understands, so downloads are off."
          onRetry={() => availability.refetch()}
        />
      );
    }
    if (report.dataState !== "complete") {
      const lead =
        report.dataState === "incomplete"
          ? "Some cash or bank balances aren't known for this period, so the Financial Report can't be downloaded as a statement."
          : "The Financial Report isn't available for this period.";
      return (
        <ReportNotice
          tone="warning"
          title={report.dataState === "incomplete" ? "Report incomplete" : "Report unavailable"}
        >
          {[lead, ...report.issues.map((issue) => issue.message)].join(" ")}
        </ReportNotice>
      );
    }
    const formats = FINANCIAL_REPORT_FORMAT_ORDER.filter(
      (format) => report.downloads[format] && !(format === "pdf" && pdfRefused),
    );
    return (
      <Stack gap={3}>
        {report.provisional && (
          <Text fontSize="xs" color="fg.muted">
            <Badge colorPalette="orange" variant="subtle" me={2}>
              Provisional
            </Badge>
            Figures may change until the period is locked. The download says so.
          </Text>
        )}
        {formats.length === 0 ? (
          <StatusLine>This server doesn't offer Financial Report downloads.</StatusLine>
        ) : (
          <Flex gap={2} wrap="wrap">
            {formats.map((format) => {
              const { label } = FINANCIAL_REPORT_FORMATS[format];
              return (
                <Button
                  key={format}
                  variant="outline"
                  colorPalette={FORMAT_PALETTES[format]}
                  minH="44px"
                  flex={{ base: "1 1 9rem", sm: "0 0 auto" }}
                  loading={active === format}
                  loadingText={`Preparing ${label}…`}
                  disabled={active !== null}
                  onClick={() => download(format)}
                >
                  {FORMAT_ICONS[format]}
                  {`Download ${label}`}
                </Button>
              );
            })}
          </Flex>
        )}
        {failure && (
          <Failure
            message={failure.message}
            onRetry={failure.retryable ? () => download(failure.format) : undefined}
          />
        )}
        {savedFileName && <StatusLine>{`Saved ${savedFileName}.`}</StatusLine>}
      </Stack>
    );
  })();

  return (
    <Stack gap={2}>
      <Text fontSize="sm" fontWeight="medium">
        {`Period: ${formatReportPeriod(period.from, period.to)}`}
      </Text>
      {body}
    </Stack>
  );
};

/**
 * Financial Report v1 downloads on the Summary report: the server's Excel
 * workbook and (where the server offers it) PDF for the period the Summary is
 * showing. Nothing is previewed or recalculated here; only a `complete`
 * report is offered, and the server checks again on download.
 */
const FinancialReportDownloads = ({
  organisationId,
  period,
  waiting,
}: {
  organisationId: string;
  /** The Summary's resolved period; null when it isn't known reliably. */
  period: FinancialReportPeriod | null;
  /** True while the Summary is loading its period. */
  waiting: boolean;
}) => {
  const headingId = useId();
  return (
    <Box
      as="section"
      aria-labelledby={headingId}
      borderWidth="1px"
      borderColor="border"
      borderRadius="lg"
      bg="bg.panel"
      px={{ base: 3, md: 4 }}
      py={3}
    >
      <Text as="h4" id={headingId} fontSize="sm" fontWeight="semibold">
        Financial Report Downloads
      </Text>
      <Text fontSize="xs" color="fg.muted" mb={3}>
        {FINANCIAL_REPORT_DOWNLOADS_NOTE}
      </Text>
      {period ? (
        <PeriodDownloads
          key={`${organisationId}:${period.from}:${period.to}`}
          organisationId={organisationId}
          period={period}
        />
      ) : (
        <StatusLine>
          {waiting
            ? "Downloads will be ready once the summary period has loaded."
            : "The report period couldn't be confirmed, so downloads are off. Load the summary again to try."}
        </StatusLine>
      )}
    </Box>
  );
};

export default FinancialReportDownloads;

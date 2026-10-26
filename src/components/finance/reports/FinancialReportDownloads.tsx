import { useId, useState } from "react";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  Flex,
  Portal,
  RadioGroup,
  Stack,
  Text,
} from "@chakra-ui/react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa";
import {
  FINANCIAL_REPORT_FORMAT_ORDER,
  FINANCIAL_REPORT_FORMATS,
  FINANCIAL_REPORT_LAYOUTS,
  financialReportFailure,
  FinancialReportFormat,
  FinancialReportLayout,
  FinancialReportPeriod,
  FinancialReportPreview,
  financialReportErrorBody,
  isFinancialReportLayout,
} from "helpers/financialReport";
import { formatReportPeriod } from "helpers/ledgerReports";
import { ReportQueryState } from "hooks/useLedgerReports";
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
 * The PDF layout chooser. Only the PDF takes a layout; the workbook is fixed.
 * A small, keyboard-operable dialog so the choice is deliberate.
 */
const PdfLayoutDialog = ({
  open,
  layout,
  busy,
  onLayoutChange,
  onConfirm,
  onClose,
}: {
  open: boolean;
  layout: FinancialReportLayout;
  busy: boolean;
  onLayoutChange: (layout: FinancialReportLayout) => void;
  onConfirm: () => void;
  onClose: () => void;
}) => (
  <Dialog.Root
    open={open}
    placement="center"
    onOpenChange={(details) => {
      if (!details.open) onClose();
    }}
  >
    <Portal>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content mx={4}>
          <Dialog.Header>
            <Dialog.Title>Download PDF</Dialog.Title>
          </Dialog.Header>
          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" minW="44px" minH="44px" />
          </Dialog.CloseTrigger>
          <Dialog.Body>
            <RadioGroup.Root
              name="financial-report-pdf-layout"
              value={layout}
              onValueChange={({ value }) => {
                if (isFinancialReportLayout(value)) onLayoutChange(value);
              }}
            >
              <RadioGroup.Label mb={2}>What the PDF should contain</RadioGroup.Label>
              <Stack gap={2}>
                {FINANCIAL_REPORT_LAYOUTS.map((option) => (
                  <RadioGroup.Item
                    key={option.value}
                    value={option.value}
                    alignItems="flex-start"
                    minH="44px"
                    borderWidth="1px"
                    borderColor="border"
                    rounded="md"
                    p={3}
                  >
                    <RadioGroup.ItemHiddenInput />
                    <RadioGroup.ItemIndicator mt="0.5" />
                    <RadioGroup.ItemText>
                      <Text as="span" display="block" fontWeight="medium">
                        {option.label}
                      </Text>
                      <Text as="span" display="block" fontSize="sm" color="fg.muted">
                        {option.description}
                      </Text>
                    </RadioGroup.ItemText>
                  </RadioGroup.Item>
                ))}
              </Stack>
            </RadioGroup.Root>
          </Dialog.Body>
          <Dialog.Footer gap={3}>
            <Button variant="outline" colorPalette="gray" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="solid" colorPalette="red" onClick={onConfirm} disabled={busy}>
              <FaFilePdf aria-hidden />
              Download PDF
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Portal>
  </Dialog.Root>
);

/**
 * Downloads for one known organisation and period. Mounted per organisation
 * and period (keyed by the parent), so a refusal or a download in flight
 * never carries over to another. The preview (and so the readiness shown
 * here) is the Summary's own query: one request answers both.
 */
const PeriodDownloads = ({
  organisationId,
  period,
  report,
}: {
  organisationId: string;
  period: FinancialReportPeriod;
  report: FinancialReportPreview;
}) => {
  const { download, active, failure, savedFileName, pdfRefused } = useFinancialReportDownload(
    organisationId,
    period,
  );
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfLayout, setPdfLayout] = useState<FinancialReportLayout>("transactions");

  const closePdfDialog = () => setPdfDialogOpen(false);
  const confirmPdf = () => {
    setPdfDialogOpen(false);
    download("pdf", pdfLayout);
  };

  const body = (() => {
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
                  onClick={() => {
                    if (format === "pdf") {
                      setPdfLayout("transactions");
                      setPdfDialogOpen(true);
                    } else {
                      download(format);
                    }
                  }}
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
            onRetry={
              failure.retryable
                ? () => download(failure.format, failure.layout ?? undefined)
                : undefined
            }
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
      <PdfLayoutDialog
        open={pdfDialogOpen}
        layout={pdfLayout}
        busy={active !== null}
        onLayoutChange={setPdfLayout}
        onConfirm={confirmPdf}
        onClose={closePdfDialog}
      />
    </Stack>
  );
};

/**
 * Financial Report v1 downloads on the Summary report: the server's Excel
 * workbook and (where the server offers it) PDF for the applied period.
 * Nothing is previewed or recalculated here; only a `complete` report is
 * offered, and the server checks again on download.
 */
const FinancialReportDownloads = ({
  organisationId,
  period,
  query,
}: {
  organisationId: string;
  /** The applied Summary period (never an unsubmitted draft). */
  period: FinancialReportPeriod;
  /** The Summary's own Financial Report preview, shared so it is read once. */
  query: ReportQueryState<FinancialReportPreview>;
}) => {
  const headingId = useId();
  const failed = query.isError
    ? financialReportFailure(query.error, financialReportErrorBody(query.error))
    : null;
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
      {query.isLoading ? (
        <StatusLine>Checking whether this report can be downloaded…</StatusLine>
      ) : query.isError ? (
        <Failure
          message={`Couldn't check this report, so downloads are off. ${failed?.message ?? ""}`.trim()}
          onRetry={failed?.retryable === false ? undefined : () => query.refetch()}
        />
      ) : !query.report ? (
        <Failure
          message="The server's answer wasn't in a shape this app understands, so downloads are off."
          onRetry={() => query.refetch()}
        />
      ) : (
        <PeriodDownloads
          key={`${organisationId}:${period.from}:${period.to}`}
          organisationId={organisationId}
          period={period}
          report={query.report}
        />
      )}
    </Box>
  );
};

export default FinancialReportDownloads;

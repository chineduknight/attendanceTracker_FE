import { useId, useState } from "react";
import { Box, Tabs, Text } from "@chakra-ui/react";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { FINANCIAL_REPORT_DOWNLOADS_UI_ENABLED, LEDGER_REPORTS_UI_ENABLED } from "config/ledgerReports";
import { usePermissions } from "rbac/usePermissions";
import BalancesReport from "components/finance/reports/BalancesReport";
import CashbookReport, { CashbookView, INITIAL_CASHBOOK_VIEW } from "components/finance/reports/CashbookReport";
import SummaryReport from "components/finance/reports/SummaryReport";

const REPORTS = [
  { value: "cashbook", label: "Cashbook" },
  { value: "balances", label: "Balances" },
  { value: "summary", label: "Summary" },
] as const;

type ReportTab = (typeof REPORTS)[number]["value"];

/**
 * F2B-4 read-only reports (RFC v0.3 §5.5, §8.4): an account's cashbook,
 * balances as of a day and a financial summary. Gated by its own release
 * switch and `finance.view` (not `finance.manage`); it never posts.
 *
 * Reports are read whatever the ledger state: while suspended or with
 * writes off the server still answers, and before the books are live it
 * reports every balance as unknown, which is shown as such.
 *
 * Only the open report is mounted, so only it fetches and only it refreshes
 * after a ledger write. Each report's applied filters live here, so they
 * survive switching tabs.
 */
const LedgerReportsPanel = ({
  organisationId,
  accounts,
  enabled = LEDGER_REPORTS_UI_ENABLED,
  financialReportDownloads = FINANCIAL_REPORT_DOWNLOADS_UI_ENABLED,
}: {
  organisationId: string;
  accounts: LedgerAccount[] | null;
  enabled?: boolean;
  /** Financial Report v1 downloads on the Summary report. */
  financialReportDownloads?: boolean;
}) => {
  const headingId = useId();
  const canView = usePermissions().has("finance.view");
  const [tab, setTab] = useState<ReportTab>("cashbook");
  const [cashbookView, setCashbookView] = useState<CashbookView>(INITIAL_CASHBOOK_VIEW);
  const [balancesAsOf, setBalancesAsOf] = useState("");
  const [summaryRange, setSummaryRange] = useState({ from: "", to: "" });
  if (!enabled || !canView) return null;

  return (
    <Box as="section" aria-labelledby={headingId}>
      <Text as="h3" id={headingId} fontSize="md" fontWeight="semibold" mb={2}>
        Reports
      </Text>
      <Tabs.Root
        value={tab}
        onValueChange={({ value }) => setTab(value as ReportTab)}
        variant="line"
        colorPalette="teal"
        lazyMount
        unmountOnExit
      >
        <Tabs.List mb={3}>
          {REPORTS.map((report) => (
            <Tabs.Trigger key={report.value} value={report.value} minH="44px">
              {report.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="cashbook" p={0}>
          <CashbookReport
            organisationId={organisationId}
            accounts={accounts}
            view={cashbookView}
            onViewChange={setCashbookView}
          />
        </Tabs.Content>
        <Tabs.Content value="balances" p={0}>
          <BalancesReport
            organisationId={organisationId}
            accounts={accounts}
            asOf={balancesAsOf}
            onAsOfChange={setBalancesAsOf}
          />
        </Tabs.Content>
        <Tabs.Content value="summary" p={0}>
          <SummaryReport
            organisationId={organisationId}
            range={summaryRange}
            onRangeChange={setSummaryRange}
            downloadsEnabled={financialReportDownloads}
          />
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
};

export default LedgerReportsPanel;

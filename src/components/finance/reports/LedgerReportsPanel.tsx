import { useState } from "react";
import { Box, Tabs } from "@chakra-ui/react";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { FINANCIAL_REPORT_DOWNLOADS_UI_ENABLED, LEDGER_REPORTS_UI_ENABLED } from "config/ledgerReports";
import { defaultFinancialSummaryPeriod } from "helpers/financialReport";
import { todayInLagos } from "helpers/openingBalances";
import { usePermissions } from "rbac/usePermissions";
import BalancesReport from "components/finance/reports/BalancesReport";
import CashbookReport, { CashbookView, INITIAL_CASHBOOK_VIEW } from "components/finance/reports/CashbookReport";
import SummaryReport from "components/finance/reports/SummaryReport";

const REPORTS = [
  { value: "summary", label: "Summary" },
  { value: "cashbook", label: "Cashbook" },
  { value: "balances", label: "Balances" },
] as const;

type ReportTab = (typeof REPORTS)[number]["value"];

/**
 * The report tabs, keyed by organisation by their parent: an organisation
 * switch can never leave another tenant's tab, filters or dates on screen.
 */
const ReportsTabs = ({
  organisationId,
  accounts,
  openingDate,
  today,
  financialReportDownloads,
}: {
  organisationId: string;
  accounts: LedgerAccount[] | null;
  openingDate: string | null;
  today: string;
  financialReportDownloads: boolean;
}) => {
  const [tab, setTab] = useState<ReportTab>("summary");
  const [cashbookView, setCashbookView] = useState<CashbookView>(INITIAL_CASHBOOK_VIEW);
  const [balancesAsOf, setBalancesAsOf] = useState("");
  // The Summary's applied period, held here so it survives switching tabs.
  const [summaryRange, setSummaryRange] = useState(() =>
    defaultFinancialSummaryPeriod(today, openingDate),
  );

  return (
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
      <Tabs.Content value="summary" p={0}>
        <SummaryReport
          organisationId={organisationId}
          openingDate={openingDate}
          today={today}
          range={summaryRange}
          onRangeChange={setSummaryRange}
          downloadsEnabled={financialReportDownloads}
        />
      </Tabs.Content>
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
    </Tabs.Root>
  );
};

/**
 * F2B-4 read-only reports (RFC v0.3 §5.5, §8.4): the Financial Summary
 * (default), an account's cashbook and balances as of a day. Gated by its own
 * release switch and `finance.view` (not `finance.manage`); it never posts.
 *
 * Reports are read whatever the ledger state: while suspended or with
 * writes off the server still answers, and before the books are live the
 * Financial Report says so, which is shown as such.
 *
 * Only the open report is mounted, so only it fetches and only it refreshes
 * after a ledger write. Each report's applied filters live in `ReportsTabs`,
 * so they survive switching tabs.
 */
const LedgerReportsPanel = ({
  organisationId,
  accounts,
  openingDate = null,
  enabled = LEDGER_REPORTS_UI_ENABLED,
  financialReportDownloads = FINANCIAL_REPORT_DOWNLOADS_UI_ENABLED,
  today = todayInLagos(),
}: {
  organisationId: string;
  accounts: LedgerAccount[] | null;
  /** The ledger's verified opening date, so the Summary never asks for earlier. */
  openingDate?: string | null;
  enabled?: boolean;
  /** Financial Report v1 downloads on the Summary report. */
  financialReportDownloads?: boolean;
  /** Today in Lagos; a prop so tests do not depend on the clock. */
  today?: string;
}) => {
  const canView = usePermissions().has("finance.view");
  if (!enabled || !canView) return null;

  return (
    <Box as="section" aria-label="Reports">
      <ReportsTabs
        key={organisationId}
        organisationId={organisationId}
        accounts={accounts}
        openingDate={openingDate}
        today={today}
        financialReportDownloads={financialReportDownloads}
      />
    </Box>
  );
};

export default LedgerReportsPanel;

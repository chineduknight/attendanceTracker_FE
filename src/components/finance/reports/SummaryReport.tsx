import { ReactNode, useState } from "react";
import { Box, Button, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { DateField } from "components/ui/date-field";
import { MemberMoneySummary } from "components/finance/ledgerReportTypes";
import { MEMBER_MONEY_SUMMARY_NOTE } from "helpers/ledgerReports";
import { formatKobo } from "helpers/financeConstants";
import { summaryPeriodIssue } from "helpers/financialReport";
import { useFinancialReportPreview } from "hooks/useLedgerReports";
import { FigureRow, ReportGate } from "components/finance/reports/ReportParts";
import FinancialReportDownloads from "components/finance/reports/FinancialReportDownloads";
import FinancialSummaryStatement from "components/finance/reports/FinancialSummaryStatement";

const Panel = ({ children }: { children: ReactNode }) => (
  <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" px={{ base: 3, md: 5 }} py={2}>
    {children}
  </Box>
);

/**
 * Member money in the server's own identity. Each figure is shown with the
 * operator it carries in that identity; none is derived from the others.
 */
export const MemberMoneySection = ({ memberMoney }: { memberMoney: MemberMoneySummary | null }) => (
  <Box as="section" aria-label="Member money held">
    <Text as="h5" fontSize="sm" fontWeight="semibold" mb={1}>
      Member money held
    </Text>
    {memberMoney === null ? (
      <Text fontSize="sm" color="fg.muted">
        This organisation has no member money account.
      </Text>
    ) : (
      <Panel>
        <FigureRow label="Held at start" value={formatKobo(memberMoney.heldAtStartKobo)} />
        <FigureRow label="+ Opening member money" value={formatKobo(memberMoney.openingKobo)} />
        <FigureRow label="+ Received" value={formatKobo(memberMoney.receivedKobo)} />
        <FigureRow label="− Refunded" value={formatKobo(memberMoney.refundedKobo)} />
        <FigureRow label="− Allocated to dues and levies" value={formatKobo(memberMoney.allocatedKobo)} />
        <FigureRow label="+ Reversals" value={formatKobo(memberMoney.reversalsKobo)} />
        <FigureRow label="+ Other movements" value={formatKobo(memberMoney.otherKobo)} />
        <Box borderTopWidth="1px" borderColor="border.muted" mt={1}>
          <FigureRow strong label="= Held at end" value={formatKobo(memberMoney.heldAtEndKobo)} />
        </Box>
      </Panel>
    )}
    <Text fontSize="xs" color="fg.muted" mt={1}>
      {MEMBER_MONEY_SUMMARY_NOTE}
    </Text>
  </Box>
);

/**
 * The organisation's financial position for one applied period, in the
 * Financial Report PDF's order and with the PDF's figures (BE-1 preview).
 * The frontend never computes a balance, total or closing.
 *
 * The opening period is month-to-date in Lagos, clamped to the ledger's
 * verified opening date, and the dates always show in the fields themselves.
 * Editing them only changes what is shown after Show; the downloads below
 * therefore always follow the applied period, never an unsubmitted draft.
 */
const SummaryReport = ({
  organisationId,
  openingDate,
  today,
  range,
  onRangeChange,
  downloadsEnabled,
}: {
  organisationId: string;
  /** The ledger's verified opening date; null while the books are not live. */
  openingDate: string | null;
  /** Today in Lagos (YYYY-MM-DD); a prop so tests do not depend on the clock. */
  today: string;
  /** The applied period, held by the panel so it survives tab switches. */
  range: { from: string; to: string };
  onRangeChange: (range: { from: string; to: string }) => void;
  /** Financial Report v1 downloads (config/ledgerReports). */
  downloadsEnabled: boolean;
}) => {
  const [draft, setDraft] = useState(range);
  const issue = summaryPeriodIssue(draft.from, draft.to, today, openingDate);
  const query = useFinancialReportPreview(organisationId, range);

  return (
    <Stack gap={4}>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 10rem" invalid={Boolean(issue)}>
          <Field.Label>From</Field.Label>
          <DateField
            value={draft.from}
            min={openingDate ?? undefined}
            max={today}
            range={{ role: "start", start: draft.from, end: draft.to }}
            onChange={(from) => setDraft((current) => ({ ...current, from }))}
          />
        </Field.Root>
        <Field.Root flex="1 1 10rem" invalid={Boolean(issue)}>
          <Field.Label>To</Field.Label>
          <DateField
            value={draft.to}
            min={openingDate ?? undefined}
            max={today}
            range={{ role: "end", start: draft.from, end: draft.to }}
            onChange={(to) => setDraft((current) => ({ ...current, to }))}
          />
        </Field.Root>
        <Button
          minH="44px"
          disabled={Boolean(issue) || (draft.from === range.from && draft.to === range.to)}
          onClick={() => onRangeChange(draft)}
        >
          Show
        </Button>
      </Flex>
      {issue && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {issue}
        </Text>
      )}
      <ReportGate query={query} name="financial summary">
        {(report) => <FinancialSummaryStatement report={report} />}
      </ReportGate>
      {downloadsEnabled && (
        <FinancialReportDownloads
          organisationId={organisationId}
          // The applied period, never the draft above.
          period={range}
          query={query}
        />
      )}
    </Stack>
  );
};

export default SummaryReport;

import { ReactNode, useState } from "react";
import { Badge, Box, Button, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { DateField } from "components/ui/date-field";
import {
  MemberMoneySummary,
  SummaryReport as SummaryReportData,
  SummarySection,
} from "components/finance/ledgerReportTypes";
import {
  formatReportKobo,
  formatReportPeriod,
  MEMBER_MONEY_SUMMARY_NOTE,
  reportRangeIssue,
  SUMMARY_CATEGORIES_NOTE,
  SUMMARY_UNKNOWN_NOTE,
} from "helpers/ledgerReports";
import { formatKobo } from "helpers/financeConstants";
import { todayInLagos } from "helpers/openingBalances";
import { useLedgerSummary } from "hooks/useLedgerReports";
import { FigureRow, ReportGate, ReportNotice } from "components/finance/reports/ReportParts";

const Panel = ({ children }: { children: ReactNode }) => (
  <Box borderWidth="1px" borderColor="border" borderRadius="lg" bg="bg.panel" px={{ base: 3, md: 5 }} py={2}>
    {children}
  </Box>
);

const CategorySection = ({
  title,
  totalLabel,
  section,
}: {
  title: string;
  totalLabel: string;
  section: SummarySection;
}) => (
  <Box as="section" aria-label={title}>
    <Text as="h5" fontSize="sm" fontWeight="semibold" mb={1}>
      {title}
    </Text>
    {section.categories.length > 0 && (
      <GroupedList aria-label={`${title} categories`} mb={2}>
        {section.categories.map((category) => (
          <GroupedListItem key={category.accountId}>
            <Flex justify="space-between" align="baseline" gap={3} wrap="wrap">
              <Flex gap={2} align="center" minW={0} wrap="wrap">
                <Text fontSize="sm">{category.name}</Text>
                {category.active === false && (
                  <Badge colorPalette="gray" variant="subtle">
                    Inactive
                  </Badge>
                )}
              </Flex>
              <Text fontSize="sm" flexShrink={0} css={{ fontVariantNumeric: "tabular-nums" }}>
                {formatKobo(category.amountKobo)}
              </Text>
            </Flex>
          </GroupedListItem>
        ))}
      </GroupedList>
    )}
    <Panel>
      <FigureRow strong label={totalLabel} value={formatKobo(section.totalKobo)} />
    </Panel>
  </Box>
);

/**
 * Member money in the server's own identity. Each figure is shown with the
 * operator it carries in that identity; none is derived from the others.
 */
const MemberMoneySection = ({ memberMoney }: { memberMoney: MemberMoneySummary | null }) => (
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

const SummaryView = ({ report }: { report: SummaryReportData }) => (
  <Stack gap={4}>
    <Text fontWeight="semibold">{formatReportPeriod(report.from, report.to)}</Text>
    {report.summaryState === "unknown" ? (
      <ReportNotice title="Figures not known yet" tone="warning">
        {SUMMARY_UNKNOWN_NOTE}
      </ReportNotice>
    ) : (
      <>
        <CategorySection title="Income" totalLabel="Total income" section={report.income} />
        <CategorySection title="Expenses" totalLabel="Total expenses" section={report.expense} />
        <Panel>
          <FigureRow strong label="Net (income less expenses)" value={formatReportKobo(report.netKobo)} />
        </Panel>
        <Text fontSize="xs" color="fg.muted">
          {SUMMARY_CATEGORIES_NOTE}
        </Text>
        <MemberMoneySection memberMoney={report.memberMoney} />
      </>
    )}
  </Stack>
);

/**
 * Income and expenses by category over a period, and member money held
 * reported apart (RFC v0.3 §8.4). Every total is the server's.
 */
const SummaryReport = ({
  organisationId,
  range,
  onRangeChange,
}: {
  organisationId: string;
  /** The applied period, held by the panel; "" for either end asks for the server's default (opening date / today). */
  range: { from: string; to: string };
  onRangeChange: (range: { from: string; to: string }) => void;
}) => {
  const [draft, setDraft] = useState(range);
  const today = todayInLagos();
  const issue = reportRangeIssue(draft.from, draft.to, today);
  const query = useLedgerSummary(organisationId, range.from, range.to, true);

  return (
    <Stack gap={4}>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 10rem" invalid={Boolean(issue)}>
          <Field.Label>From</Field.Label>
          <DateField
            value={draft.from}
            max={today}
            clearable
            placeholder="Opening date"
            range={{ role: "start", start: draft.from, end: draft.to }}
            onChange={(from) => setDraft((current) => ({ ...current, from }))}
          />
        </Field.Root>
        <Field.Root flex="1 1 10rem" invalid={Boolean(issue)}>
          <Field.Label>To</Field.Label>
          <DateField
            value={draft.to}
            max={today}
            clearable
            placeholder="Today"
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
        {(report) => <SummaryView report={report} />}
      </ReportGate>
    </Stack>
  );
};

export default SummaryReport;

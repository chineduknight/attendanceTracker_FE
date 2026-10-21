import { ReactNode, useEffect, useState } from "react";
import { Box, Button, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { GroupedList } from "components/GroupedList";
import { DateField } from "components/ui/date-field";
import { ReconciliationPosition, ReconciliationSummary } from "components/finance/ledgerReconciliationTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  CURRENT_F0_NOTE,
  IDENTITIES_FALLBACK_MESSAGE,
  INCOMPLETE_TOTALS_NOTE,
  LEDGER_FIGURES_NOTE,
  UNLINKED_LABEL,
  identityLabel,
  koboOrUnknown,
  snapshotText,
} from "helpers/ledgerReconciliation";
import { reportRangeIssue } from "helpers/ledgerReports";
import { todayInLagos } from "helpers/openingBalances";
import { useReconciliationSummary } from "hooks/useLedgerReconciliation";
import { LedgerNames } from "hooks/useLedgerNames";
import { FigureRow, ReportNotice } from "components/finance/reports/ReportParts";
import { MemberMoneySection } from "components/finance/reports/SummaryReport";
import {
  PositionCard,
  ReadAt,
  ReconciliationGate,
  SourceCard,
  UnlinkedExplainer,
} from "components/finance/reconciliation/ReconciliationParts";
import { minAgeIssue } from "components/finance/reconciliation/SourcesReport";

export interface ReconciliationSummaryView {
  from: string;
  to: string;
  /** "" = the server's default (30 days). */
  minAgeDays: string;
}

export const INITIAL_SUMMARY_VIEW: ReconciliationSummaryView = { from: "", to: "", minAgeDays: "" };

const Heading = ({ children }: { children: string }) => (
  <Text as="h5" fontSize="sm" fontWeight="semibold" mb={1}>
    {children}
  </Text>
);

const Panel = ({ children }: { children: ReactNode }) => (
  <Box borderWidth="1px" borderColor="border" borderRadius="md" px={3} py={1}>
    {children}
  </Box>
);

const capped = (shown: number, count: number) =>
  shown < count ? `Showing the first ${shown} of ${count}.` : null;

/** The server's ledger identities. A disagreement is never called a violation. */
const Identities = ({ identities }: { identities: ReconciliationSummary["identities"] }) => (
  <Box as="section" aria-label="Consistency checks">
    <Heading>Consistency checks</Heading>
    {identities.consistent ? (
      <Text fontSize="sm" color="fg.muted">
        {`All ${identities.checks.length} checks agree on this read.`}
      </Text>
    ) : (
      <ReportNotice tone="warning" title="These figures don't agree">
        {identities.message ?? IDENTITIES_FALLBACK_MESSAGE}
      </ReportNotice>
    )}
    <Box as="details" mt={1}>
      <Text as="summary" fontSize="sm" cursor="pointer">
        Show the checks
      </Text>
      <Stack gap={1} mt={1}>
        {identities.checks.map((check) => (
          <Text key={check.name} fontSize="sm" color="fg.muted">
            {`${check.consistent ? "Agrees" : "Doesn't agree"}: ${identityLabel(check.name)} (${formatKobo(
              check.leftKobo,
            )} and ${formatKobo(check.rightKobo)})`}
          </Text>
        ))}
      </Stack>
    </Box>
  </Box>
);

const PositionTotalsSection = ({ positions }: { positions: ReconciliationSummary["positions"] }) => {
  const incomplete = positions.recordedTotalState === "incomplete";
  return (
    <Box as="section" aria-label="Positions">
      <Heading>Positions (Finance, current)</Heading>
      <Text fontSize="xs" color="fg.muted" mb={1}>
        {CURRENT_F0_NOTE}
      </Text>
      {incomplete && (
        <ReportNotice tone="warning" title="Totals are incomplete">
          {`${INCOMPLETE_TOTALS_NOTE} Unknown: ${positions.unknownPositions}. Ambiguous: ${positions.ambiguousPositions}.`}
        </ReportNotice>
      )}
      <Panel>
        <FigureRow label="Positions" value={String(positions.positionCount)} />
        <FigureRow label="Recorded, all positions" value={koboOrUnknown(positions.recordedTotalKobo)} />
        <FigureRow label="Linked to allocations, all positions" value={koboOrUnknown(positions.linkedTotalKobo)} />
        <FigureRow label={`${UNLINKED_LABEL}, all positions`} value={koboOrUnknown(positions.unlinkedTotalKobo)} />
        <FigureRow label="Over-linked, all positions" value={koboOrUnknown(positions.overLinkedTotalKobo)} />
        <FigureRow label="Allocated (ledger), all positions" value={formatKobo(positions.allocatedTotalKobo)} strong />
      </Panel>
      {incomplete && (
        <Box mt={2}>
          <Text fontSize="sm" fontWeight="semibold">{`Over known positions only (${positions.knownPositions.count})`}</Text>
          <Panel>
            <FigureRow label="Recorded" value={formatKobo(positions.knownPositions.recordedKobo)} />
            <FigureRow label="Allocated" value={formatKobo(positions.knownPositions.allocatedKobo)} />
            <FigureRow label="Linked" value={formatKobo(positions.knownPositions.linkedKobo)} />
            <FigureRow label={UNLINKED_LABEL} value={formatKobo(positions.knownPositions.unlinkedKobo)} />
            <FigureRow label="Over-linked" value={formatKobo(positions.knownPositions.overLinkedKobo)} />
          </Panel>
          <FigureRow
            label="Allocated to positions with an unknown or ambiguous value"
            value={formatKobo(positions.allocatedOnUnknownKobo)}
          />
        </Box>
      )}
      <UnlinkedExplainer />
    </Box>
  );
};

const FlowsSection = ({ summary }: { summary: ReconciliationSummary }) => {
  const { flows } = summary;
  return (
    <Box as="section" aria-label="Movements in the period">
      <Heading>{`Movements, ${formatBusinessDate(summary.from)} to ${formatBusinessDate(summary.to)} (ledger)`}</Heading>
      {flows.flowState === "unknown" ? (
        <ReportNotice title="Not known for this period">
          The ledger wasn't live for this period, so its movements are unknown. Finance has no dated movements to show instead.
        </ReportNotice>
      ) : (
        <Stack gap={3}>
          <Panel>
            <FigureRow label="Allocated" value={koboOrUnknown(flows.allocationsKobo)} />
            <FigureRow label="− Allocation reversals" value={koboOrUnknown(flows.allocationReversalsKobo)} />
            <FigureRow label="= Net allocated" value={koboOrUnknown(flows.netAllocatedKobo)} strong />
            <FigureRow label="Member dues and levy income" value={koboOrUnknown(flows.memberIncomeKobo)} strong />
          </Panel>
          <MemberMoneySection memberMoney={flows.memberMoney} />
        </Stack>
      )}
    </Box>
  );
};

const PositionList = ({
  title,
  list,
  names,
  empty,
  onShowAllocations,
}: {
  title: string;
  list: { count: number; items: ReconciliationPosition[] };
  names: LedgerNames;
  empty: string;
  onShowAllocations?: (position: ReconciliationPosition) => void;
}) => (
  <Box as="section" aria-label={title}>
    <Heading>{`${title} (${list.count})`}</Heading>
    {list.count === 0 ? (
      <Text fontSize="sm" color="fg.muted">
        {empty}
      </Text>
    ) : (
      <Stack gap={2}>
        <GroupedList aria-label={title}>
          {list.items.map((position) => (
            <PositionCard
              key={`${position.obligationId}-${position.memberId}`}
              position={position}
              names={names}
              actions={
                onShowAllocations && position.allocatedKobo > 0 ? (
                  <Button alignSelf="flex-start" size="sm" variant="outline" minH="44px" onClick={() => onShowAllocations(position)}>
                    Show its allocations
                  </Button>
                ) : null
              }
            />
          ))}
        </GroupedList>
        {capped(list.items.length, list.count) && (
          <Text fontSize="xs" color="fg.muted">
            {`${capped(list.items.length, list.count)} Use Positions with a review flag filter to see the rest.`}
          </Text>
        )}
      </Stack>
    )}
  </Box>
);

/**
 * F3-4 `GET /reconciliation/summary`: current ledger balances, current F0
 * position totals, ledger movements over a window, the server's consistency
 * checks and the review lists. Each block says which kind of figure it is.
 */
const ReconciliationSummaryReport = ({
  organisationId,
  names,
  view,
  onViewChange,
  onShowAllocations,
}: {
  organisationId: string;
  names: LedgerNames;
  view: ReconciliationSummaryView;
  onViewChange: (view: ReconciliationSummaryView) => void;
  onShowAllocations?: (position: ReconciliationPosition) => void;
}) => {
  const today = todayInLagos();
  const [draft, setDraft] = useState(view);
  useEffect(() => setDraft(view), [view]);
  const issue = reportRangeIssue(draft.from, draft.to, today) ?? minAgeIssue(draft.minAgeDays);
  const query = useReconciliationSummary(organisationId, view, true);
  const unchanged = draft.from === view.from && draft.to === view.to && draft.minAgeDays === view.minAgeDays;

  return (
    <Stack gap={4}>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 10rem" invalid={Boolean(reportRangeIssue(draft.from, draft.to, today))}>
          <Field.Label>Movements from</Field.Label>
          <DateField
            value={draft.from}
            max={today}
            clearable
            placeholder="Opening date"
            range={{ role: "start", start: draft.from, end: draft.to }}
            onChange={(from) => setDraft((current) => ({ ...current, from }))}
          />
        </Field.Root>
        <Field.Root flex="1 1 10rem" invalid={Boolean(reportRangeIssue(draft.from, draft.to, today))}>
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
        <Field.Root flex="1 1 8rem" invalid={Boolean(minAgeIssue(draft.minAgeDays))}>
          <Field.Label>Open sources older than (days)</Field.Label>
          <Input
            inputMode="numeric"
            value={draft.minAgeDays}
            placeholder="30"
            onChange={(event) => setDraft((current) => ({ ...current, minAgeDays: event.target.value.trim() }))}
          />
        </Field.Root>
        <Button minH="44px" disabled={Boolean(issue) || unchanged} onClick={() => onViewChange(draft)}>
          Show
        </Button>
      </Flex>
      {issue && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {issue}
        </Text>
      )}

      <ReconciliationGate query={query} name="reconciliation summary">
        {(summary) => (
          <Stack gap={5}>
            <Stack gap={1}>
              <ReadAt readAt={summary.readAt} />
              <Text fontSize="xs" color="fg.muted">
                {snapshotText(summary.snapshot)}
              </Text>
            </Stack>
            <Identities identities={summary.identities} />

            <Box as="section" aria-label="Member money and income now">
              <Heading>Member money and income now (ledger, current)</Heading>
              <Text fontSize="xs" color="fg.muted" mb={1}>
                {LEDGER_FIGURES_NOTE}
              </Text>
              <Panel>
                <FigureRow label="Held for members (holding balance)" value={formatKobo(summary.balances.holdingBalanceKobo)} strong />
                <FigureRow label={`Sources (${summary.balances.sources.count}): received`} value={formatKobo(summary.balances.sources.effectiveKobo)} />
                <FigureRow label="Refunded" value={formatKobo(summary.balances.sources.refundedKobo)} />
                <FigureRow label="Allocated" value={formatKobo(summary.balances.sources.allocatedKobo)} />
                <FigureRow label="Still held" value={formatKobo(summary.balances.sources.remainingKobo)} />
              </Panel>
              <Panel>
                <FigureRow label="Member dues income" value={formatKobo(summary.balances.memberIncome.duesKobo)} />
                <FigureRow label="Member levy income" value={formatKobo(summary.balances.memberIncome.levyKobo)} />
                <FigureRow label="Member income in total" value={formatKobo(summary.balances.memberIncome.totalKobo)} strong />
              </Panel>
            </Box>

            <PositionTotalsSection positions={summary.positions} />
            <FlowsSection summary={summary} />

            <Box as="section" aria-label="Open sources">
              <Heading>{`Still holding money, ${summary.lists.openSources.minAgeDays} days old or more (${summary.lists.openSources.count})`}</Heading>
              {summary.lists.openSources.count === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  No source that old still holds money.
                </Text>
              ) : (
                <Stack gap={2}>
                  <GroupedList aria-label="Old open sources">
                    {summary.lists.openSources.items.map((source) => (
                      <SourceCard key={source.id} source={source} names={names} />
                    ))}
                  </GroupedList>
                  {capped(summary.lists.openSources.items.length, summary.lists.openSources.count) && (
                    <Text fontSize="xs" color="fg.muted">
                      {capped(summary.lists.openSources.items.length, summary.lists.openSources.count)}
                    </Text>
                  )}
                </Stack>
              )}
            </Box>
            <PositionList
              title="Over-linked positions"
              list={summary.lists.overLinkedPositions}
              names={names}
              empty="No position has more allocated than Finance records."
              onShowAllocations={onShowAllocations}
            />
            <PositionList
              title="Positions needing review"
              list={summary.lists.positionsNeedingReview}
              names={names}
              empty="Every position has a usable Finance value."
              onShowAllocations={onShowAllocations}
            />
          </Stack>
        )}
      </ReconciliationGate>
    </Stack>
  );
};

export default ReconciliationSummaryReport;

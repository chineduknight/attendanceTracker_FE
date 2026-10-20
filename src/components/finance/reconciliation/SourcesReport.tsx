import { useEffect, useState } from "react";
import { Box, Button, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { GroupedList } from "components/GroupedList";
import { DateField } from "components/ui/date-field";
import { EmptyState } from "components/ui/states";
import { OptionSelect } from "components/ui/themed-select";
import {
  AllocationSuggestion,
  ReconciliationSourceRow,
} from "components/finance/ledgerReconciliationTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  LEDGER_FIGURES_NOTE,
  OBLIGATION_KIND_LABELS,
  SUGGESTIONS_NOTE,
  SUGGESTIONS_OMITTED_NOTE,
  readAtText,
} from "helpers/ledgerReconciliation";
import { asOfIssue } from "helpers/ledgerReports";
import { todayInLagos } from "helpers/openingBalances";
import { useReconciliationSources } from "hooks/useLedgerReconciliation";
import { LedgerNames } from "hooks/useLedgerNames";
import { ReportNotice } from "components/finance/reports/ReportParts";
import {
  Pager,
  ReadAt,
  ReconciliationGate,
  SourceCard,
} from "components/finance/reconciliation/ReconciliationParts";

export interface SourcesView {
  /** "" = today (the only date that carries suggestions). */
  asOf: string;
  open: "" | "true";
  minAgeDays: string;
  cursors: string[];
}

export const INITIAL_SOURCES_VIEW: SourcesView = { asOf: "", open: "true", minAgeDays: "", cursors: [""] };

const OPEN_OPTIONS = [
  { value: "true", label: "Still holding money" },
  { value: "all", label: "All sources" },
];

const MIN_AGE = /^(?:0|[1-9]\d{0,4})$/;

export const minAgeIssue = (value: string) =>
  value === "" || (MIN_AGE.test(value) && Number(value) <= 36500)
    ? null
    : "Enter a whole number of days from 0 to 36500.";

const HINT_LABELS: Record<string, string> = { member: "member", obligation: "obligation", purpose: "purpose" };

const Suggestions = ({
  source,
  list,
  names,
  onAllocate,
}: {
  source: ReconciliationSourceRow;
  list: AllocationSuggestion[];
  names: LedgerNames;
  onAllocate?: (source: ReconciliationSourceRow, suggestion: AllocationSuggestion | null) => void;
}) => (
  <Box borderWidth="1px" borderStyle="dashed" borderColor="border" borderRadius="md" p={2}>
    <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb={1}>
      Suggestions from current Finance values
    </Text>
    <Stack gap={2}>
      {list.map((suggestion) => (
        <Flex
          key={`${suggestion.memberId}-${suggestion.obligationId}`}
          justify="space-between"
          align="center"
          gap={2}
          wrap="wrap"
        >
          <Stack gap={0} minW={0}>
            <Text fontSize="sm">{`${names.memberName(suggestion.memberId)} · ${names.obligationName(suggestion.obligationId)}${
              suggestion.obligationType ? ` (${OBLIGATION_KIND_LABELS[suggestion.obligationType].toLowerCase()})` : ""
            }`}</Text>
            <Text fontSize="xs" color="fg.muted">
              {`${formatKobo(suggestion.unlinkedKobo)} recorded, not linked · matches the ${suggestion.matchedHints
                .map((hint) => HINT_LABELS[hint])
                .join(", ")} hint`}
            </Text>
          </Stack>
          {onAllocate && (
            <Button size="sm" variant="outline" minH="44px" onClick={() => onAllocate(source, suggestion)}>
              Start allocation
            </Button>
          )}
        </Flex>
      ))}
    </Stack>
  </Box>
);

/**
 * F3-4 `GET /reconciliation/sources`: member money as the ledger held it at
 * the end of `asOf`, oldest first, with its age. Ledger figures only. The
 * current-F0 suggestions are a separate block, shown only for today.
 */
const SourcesReport = ({
  organisationId,
  names,
  view,
  onViewChange,
  onAllocate,
}: {
  organisationId: string;
  names: LedgerNames;
  view: SourcesView;
  onViewChange: (view: SourcesView) => void;
  /** Present only when this officer can post allocations here. */
  onAllocate?: (source: ReconciliationSourceRow, suggestion: AllocationSuggestion | null) => void;
}) => {
  const today = todayInLagos();
  const [draft, setDraft] = useState({ asOf: view.asOf, minAgeDays: view.minAgeDays });
  useEffect(() => setDraft({ asOf: view.asOf, minAgeDays: view.minAgeDays }), [view.asOf, view.minAgeDays]);
  const issue = asOfIssue(draft.asOf, today) ?? minAgeIssue(draft.minAgeDays);
  const query = useReconciliationSources(
    organisationId,
    {
      asOf: view.asOf,
      open: view.open,
      minAgeDays: view.minAgeDays,
      cursor: view.cursors[view.cursors.length - 1],
    },
    true,
  );
  const apply = (change: Partial<SourcesView>) => onViewChange({ ...view, ...change, cursors: [""] });

  return (
    <Stack gap={4}>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 10rem" invalid={Boolean(asOfIssue(draft.asOf, today))}>
          <Field.Label>As of the end of</Field.Label>
          <DateField
            value={draft.asOf}
            max={today}
            clearable
            placeholder="Today"
            onChange={(asOf) => setDraft((current) => ({ ...current, asOf }))}
          />
        </Field.Root>
        <Field.Root flex="1 1 8rem" invalid={Boolean(minAgeIssue(draft.minAgeDays))}>
          <Field.Label>At least this many days old</Field.Label>
          <Input
            inputMode="numeric"
            value={draft.minAgeDays}
            placeholder="Any age"
            onChange={(event) => setDraft((current) => ({ ...current, minAgeDays: event.target.value.trim() }))}
          />
        </Field.Root>
        <Button
          minH="44px"
          disabled={Boolean(issue) || (draft.asOf === view.asOf && draft.minAgeDays === view.minAgeDays)}
          onClick={() => apply(draft)}
        >
          Show
        </Button>
      </Flex>
      <Field.Root maxW="20rem">
        <Field.Label>Sources</Field.Label>
        <OptionSelect
          value={view.open === "true" ? "true" : "all"}
          options={OPEN_OPTIONS}
          onChange={(value) => apply({ open: value === "true" ? "true" : "" })}
        />
      </Field.Root>
      {issue && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {issue}
        </Text>
      )}
      <Text fontSize="sm" color="fg.muted">
        {LEDGER_FIGURES_NOTE}
      </Text>

      <ReconciliationGate query={query} name="unallocated member money">
        {(report) => {
          const historical = report.suggestionsOmitted === "historical_as_of";
          return (
            <Stack gap={3}>
              <ReadAt readAt={report.readAt} />
              <Text fontSize="sm" fontWeight="semibold">
                {`Ledger balances at the end of ${formatBusinessDate(report.asOf)}`}
              </Text>
              {historical ? (
                <ReportNotice title="Showing a past date">
                  {`Amounts are what each source held at the end of ${formatBusinessDate(report.asOf)}; ages are counted to that day. ${SUGGESTIONS_OMITTED_NOTE}`}
                </ReportNotice>
              ) : (
                report.suggestions && (
                  <Text fontSize="xs" color="fg.muted">
                    {`${SUGGESTIONS_NOTE} ${readAtText(report.suggestions.readAt)}.`}
                  </Text>
                )
              )}
              {report.items.length === 0 ? (
                <EmptyState
                  title="No member money matches"
                  description={
                    view.open === "true"
                      ? "No source still holds money with these filters."
                      : "No member receipts or opening member money match these filters."
                  }
                />
              ) : (
                <GroupedList aria-label="Member money sources">
                  {report.items.map((source) => {
                    const list = historical ? [] : report.suggestions?.bySource[source.number] ?? [];
                    // Only a current report can start an allocation: a past
                    // day's balances are not what the source holds now.
                    const canStart = Boolean(onAllocate) && !historical && source.remainingKobo > 0;
                    return (
                      <SourceCard key={source.id} source={source} names={names}>
                        {list.length > 0 && (
                          <Suggestions
                            source={source}
                            list={list}
                            names={names}
                            onAllocate={canStart ? onAllocate : undefined}
                          />
                        )}
                        {canStart && (
                          <Button
                            alignSelf="flex-start"
                            size="sm"
                            variant="ghost"
                            minH="44px"
                            onClick={() => onAllocate?.(source, null)}
                          >
                            {`Allocate from ${source.number}`}
                          </Button>
                        )}
                      </SourceCard>
                    );
                  })}
                </GroupedList>
              )}
              <Pager
                cursors={view.cursors}
                nextCursor={report.nextCursor}
                isFetching={query.isFetching}
                onChange={(cursors) => onViewChange({ ...view, cursors })}
              />
            </Stack>
          );
        }}
      </ReconciliationGate>
    </Stack>
  );
};

export default SourcesReport;

import { useEffect, useState } from "react";
import { Badge, Button, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { DateField } from "components/ui/date-field";
import { EmptyState } from "components/ui/states";
import { OptionSelect } from "components/ui/themed-select";
import { AllocationHistoryItem } from "components/finance/ledgerReconciliationTypes";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatKobo } from "helpers/financeConstants";
import {
  ALLOCATION_STATE_LABELS,
  OBLIGATION_KIND_LABELS,
  SOURCE_KIND_LABELS,
} from "helpers/ledgerReconciliation";
import { reportRangeIssue } from "helpers/ledgerReports";
import { formatLagosTimestamp, todayInLagos } from "helpers/openingBalances";
import { AllocationHistoryParams, useAllocationHistory } from "hooks/useLedgerReconciliation";
import { LedgerNames } from "hooks/useLedgerNames";
import { Pager, ReadAt, ReconciliationGate } from "components/finance/reconciliation/ReconciliationParts";

/** What the history shows; held by the panel so it survives a tab switch. */
export interface AllocationHistoryView {
  sourceId: string;
  /** Display only, for the source chip ("M-000012"). */
  sourceNumber: string;
  memberId: string;
  obligationId: string;
  from: string;
  to: string;
  /** Cursors of the pages visited; the last is the page shown ("" = first). */
  cursors: string[];
  /** An allocation to point out (e.g. one just posted). */
  highlightJournalId: string;
}

export const INITIAL_ALLOCATION_HISTORY_VIEW: AllocationHistoryView = {
  sourceId: "",
  sourceNumber: "",
  memberId: "",
  obligationId: "",
  from: "",
  to: "",
  cursors: [""],
  highlightJournalId: "",
};

const MISMATCH_LABELS: Record<string, string> = {
  member: "member",
  obligation: "obligation",
  purpose: "purpose",
};

const AllocationRow = ({
  item,
  names,
  highlighted,
  onOpenJournal,
}: {
  item: AllocationHistoryItem;
  names: LedgerNames;
  highlighted: boolean;
  onOpenJournal?: (journalId: string) => void;
}) => {
  const { journal } = item;
  return (
    <GroupedListItem>
      <Stack gap={1} borderLeftWidth={highlighted ? "3px" : 0} borderColor="teal.solid" pl={highlighted ? 2 : 0}>
        <Flex justify="space-between" align="flex-start" gap={2} wrap="wrap">
          <Stack gap={0.5} minW={0}>
            <Flex gap={2} align="center" wrap="wrap">
              <Text fontWeight="semibold">{item.number}</Text>
              <Badge colorPalette={item.state === "live" ? "green" : "gray"} variant="subtle">
                {ALLOCATION_STATE_LABELS[item.state]}
              </Badge>
              {highlighted && (
                <Badge colorPalette="teal" variant="subtle">
                  Just posted
                </Badge>
              )}
            </Flex>
            <Text fontSize="sm">{`${names.memberName(item.memberId)} · ${names.obligationName(item.obligationId)}`}</Text>
            <Text fontSize="sm" color="fg.muted">
              {`${OBLIGATION_KIND_LABELS[item.obligationType]} income · from ${item.source.number} (${SOURCE_KIND_LABELS[
                item.source.kind
              ].toLowerCase()})`}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {`Income date ${journal.businessDate ? formatBusinessDate(journal.businessDate) : "unknown"}${
                journal.postedByName ? ` · posted by ${journal.postedByName}` : ""
              }${journal.postedAt ? ` · ${formatLagosTimestamp(journal.postedAt) ?? ""}` : ""}`}
            </Text>
            {item.confirmedMismatches.length > 0 && (
              <Text fontSize="sm" color="fg.muted">
                {`Confirmed despite a different ${item.confirmedMismatches
                  .map((mismatch) => MISMATCH_LABELS[mismatch] ?? mismatch)
                  .join(", ")} hint on the source`}
              </Text>
            )}
            {item.reversal && (
              <Text fontSize="sm" color="fg.muted">
                {`Reversed${item.reversal.businessDate ? ` on ${formatBusinessDate(item.reversal.businessDate)}` : ""}. The allocation is kept; the reversal undoes it.`}
              </Text>
            )}
            {journal.reference && <Text fontSize="sm" color="fg.muted">{`Reference: ${journal.reference}`}</Text>}
          </Stack>
          <Stack gap={1} align="flex-end">
            <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
              {formatKobo(journal.totalKobo as number)}
            </Text>
            {onOpenJournal && (
              <Button
                size="sm"
                variant="outline"
                minH="44px"
                aria-label={`Details of allocation ${item.number}`}
                onClick={() => onOpenJournal(journal.id)}
              >
                Details
              </Button>
            )}
          </Stack>
        </Flex>
      </Stack>
    </GroupedListItem>
  );
};

/**
 * F3-4 `GET /allocations`: allocation journals newest first, each with its
 * live/reversed state as of `readAt`. Read-only. Details (and, where this
 * build may offer it, the reversal) open in Reversals.
 */
const AllocationHistory = ({
  organisationId,
  names,
  view,
  onViewChange,
  onOpenJournal,
}: {
  organisationId: string;
  names: LedgerNames;
  view: AllocationHistoryView;
  onViewChange: (view: AllocationHistoryView) => void;
  onOpenJournal?: (journalId: string) => void;
}) => {
  const today = todayInLagos();
  const [draft, setDraft] = useState({ from: view.from, to: view.to });
  // A filter applied from elsewhere (e.g. "view in history") replaces the draft.
  useEffect(() => setDraft({ from: view.from, to: view.to }), [view.from, view.to]);
  const issue = reportRangeIssue(draft.from, draft.to, today);
  const cursor = view.cursors[view.cursors.length - 1];
  const params: AllocationHistoryParams = {
    sourceId: view.sourceId,
    memberId: view.memberId,
    obligationId: view.obligationId,
    from: view.from,
    to: view.to,
    cursor,
  };
  const query = useAllocationHistory(organisationId, params, true);
  // Every filter change starts again at the first page.
  const apply = (change: Partial<AllocationHistoryView>) =>
    onViewChange({ ...view, ...change, cursors: [""], highlightJournalId: "" });
  const filtered =
    Boolean(view.sourceId || view.memberId || view.obligationId || view.from || view.to);

  return (
    <Stack gap={4}>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 12rem">
          <Field.Label>Obligation</Field.Label>
          <OptionSelect
            value={view.obligationId}
            options={names.obligationOptions}
            placeholder="All obligations"
            onChange={(obligationId) => apply({ obligationId })}
            onClear={() => apply({ obligationId: "" })}
          />
        </Field.Root>
        <Field.Root flex="1 1 12rem">
          <Field.Label>Member</Field.Label>
          <OptionSelect
            value={view.memberId}
            options={names.memberOptions}
            placeholder={names.memberOptions.length ? "All members" : "Choose an obligation first"}
            onChange={(memberId) => apply({ memberId })}
            onClear={() => apply({ memberId: "" })}
          />
        </Field.Root>
      </Flex>
      <Flex gap={3} wrap="wrap" align="flex-end">
        <Field.Root flex="1 1 10rem" invalid={Boolean(issue)}>
          <Field.Label>Income date from</Field.Label>
          <DateField
            value={draft.from}
            max={today}
            clearable
            placeholder="Earliest"
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
            placeholder="Latest"
            range={{ role: "end", start: draft.from, end: draft.to }}
            onChange={(to) => setDraft((current) => ({ ...current, to }))}
          />
        </Field.Root>
        <Button
          minH="44px"
          disabled={Boolean(issue) || (draft.from === view.from && draft.to === view.to)}
          onClick={() => apply(draft)}
        >
          Show
        </Button>
      </Flex>
      {issue && (
        <Text role="alert" fontSize="sm" color="fg.error">
          {issue}
        </Text>
      )}
      {view.sourceId && (
        <Flex gap={2} align="center" wrap="wrap">
          <Badge variant="subtle">{`Source ${view.sourceNumber || view.sourceId}`}</Badge>
          <Button size="sm" variant="ghost" onClick={() => apply({ sourceId: "", sourceNumber: "" })}>
            Remove source filter
          </Button>
        </Flex>
      )}
      {filtered && (
        <Button
          alignSelf="flex-start"
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft({ from: "", to: "" });
            onViewChange({ ...INITIAL_ALLOCATION_HISTORY_VIEW });
          }}
        >
          Clear all filters
        </Button>
      )}

      <ReconciliationGate query={query} name="allocation history">
        {(page) => (
          <Stack gap={3}>
            <ReadAt readAt={page.readAt} />
            {page.items.length === 0 ? (
              <EmptyState
                title={filtered ? "No allocations match these filters" : "No allocations yet"}
                description={
                  filtered
                    ? "Change or clear the filters to see other allocations."
                    : "Allocations link held member money to a member's dues or levy and appear here."
                }
              />
            ) : (
              <GroupedList aria-label="Allocations">
                {page.items.map((item) => (
                  <AllocationRow
                    key={item.journal.id}
                    item={item}
                    names={names}
                    highlighted={item.journal.id === view.highlightJournalId}
                    onOpenJournal={onOpenJournal}
                  />
                ))}
              </GroupedList>
            )}
            <Pager
              cursors={view.cursors}
              nextCursor={page.nextCursor}
              isFetching={query.isFetching}
              onChange={(cursors) => onViewChange({ ...view, cursors })}
            />
            {!onOpenJournal && (
              <Text fontSize="xs" color="fg.muted">
                Entry details and reversals open in Reversals, which isn't shown in this build.
              </Text>
            )}
          </Stack>
        )}
      </ReconciliationGate>
    </Stack>
  );
};

export default AllocationHistory;

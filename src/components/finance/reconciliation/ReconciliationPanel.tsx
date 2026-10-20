import { useEffect, useId, useRef, useState } from "react";
import { Box, Tabs, Text } from "@chakra-ui/react";
import { LEDGER_F3_RECONCILIATION_UI_ENABLED } from "config/ledgerF3Reconciliation";
import {
  AllocationStart,
  AllocationSuggestion,
  ReconciliationPosition,
  ReconciliationSourceRow,
} from "components/finance/ledgerReconciliationTypes";
import { useLedgerNames } from "hooks/useLedgerNames";
import { usePermissions } from "rbac/usePermissions";
import AllocationHistory, {
  AllocationHistoryView,
  INITIAL_ALLOCATION_HISTORY_VIEW,
} from "components/finance/reconciliation/AllocationHistory";
import PositionsReport, {
  INITIAL_POSITIONS_VIEW,
  PositionsView,
} from "components/finance/reconciliation/PositionsReport";
import ReconciliationSummaryReport, {
  INITIAL_SUMMARY_VIEW,
  ReconciliationSummaryView,
} from "components/finance/reconciliation/ReconciliationSummaryReport";
import SourcesReport, { INITIAL_SOURCES_VIEW, SourcesView } from "components/finance/reconciliation/SourcesReport";

const TABS = [
  { value: "summary", label: "Summary" },
  { value: "sources", label: "Unallocated money" },
  { value: "positions", label: "Positions" },
  { value: "allocations", label: "Allocations" },
] as const;

export type ReconciliationTab = (typeof TABS)[number]["value"];

/** A request from elsewhere in Books to show the allocation history, filtered. */
export interface ReconciliationFocus {
  tab: ReconciliationTab;
  history?: Partial<AllocationHistoryView>;
  /** Distinguishes two identical requests. */
  nonce: number;
}

/**
 * F3B member-money reconciliation (F3 RFC v0.3 §10–§12): read-only,
 * `finance.view`, its own gate. Every figure is the server's. Ledger figures
 * and current F0 figures are labelled apart and never combined, and every
 * report shows when it was read.
 *
 * Only the open tab is mounted, so only it fetches. Each tab's applied
 * filters live here, so they survive a tab switch.
 */
const ReconciliationPanel = ({
  organisationId,
  focus,
  onOpenJournal,
  onAllocate,
  enabled = LEDGER_F3_RECONCILIATION_UI_ENABLED,
}: {
  organisationId: string;
  focus?: ReconciliationFocus | null;
  /** Opens a journal's details in Reversals (absent when Reversals is hidden). */
  onOpenJournal?: (journalId: string) => void;
  /** Starts the allocation wizard (absent when this officer can't post one here). */
  onAllocate?: (start: Omit<AllocationStart, "nonce">) => void;
  enabled?: boolean;
}) => {
  const headingId = useId();
  const sectionRef = useRef<HTMLDivElement>(null);
  const canView = usePermissions().has("finance.view");
  const [tab, setTab] = useState<ReconciliationTab>("summary");
  const [summaryView, setSummaryView] = useState<ReconciliationSummaryView>(INITIAL_SUMMARY_VIEW);
  const [sourcesView, setSourcesView] = useState<SourcesView>(INITIAL_SOURCES_VIEW);
  const [positionsView, setPositionsView] = useState<PositionsView>(INITIAL_POSITIONS_VIEW);
  const [historyView, setHistoryView] = useState<AllocationHistoryView>(INITIAL_ALLOCATION_HISTORY_VIEW);
  const showing = enabled && canView;
  // Member names for the obligation a filter names (compliance rows work
  // with finance.view alone).
  const filterObligation =
    tab === "positions" ? positionsView.obligationId : tab === "allocations" ? historyView.obligationId : "";
  const names = useLedgerNames(organisationId, { enabled: showing, complianceObligationId: filterObligation });

  const lastFocus = useRef<number | null>(null);
  useEffect(() => {
    if (!focus || focus.nonce === lastFocus.current) return;
    lastFocus.current = focus.nonce;
    setTab(focus.tab);
    if (focus.history) {
      setHistoryView({ ...INITIAL_ALLOCATION_HISTORY_VIEW, ...focus.history, cursors: [""] });
    }
    sectionRef.current?.scrollIntoView?.({ block: "start" });
  }, [focus]);

  if (!showing) return null;

  const showAllocationsOf = (position: ReconciliationPosition) => {
    setHistoryView({
      ...INITIAL_ALLOCATION_HISTORY_VIEW,
      memberId: position.memberId,
      obligationId: position.obligationId,
    });
    setTab("allocations");
  };

  const allocateFrom = onAllocate
    ? (source: ReconciliationSourceRow, suggestion: AllocationSuggestion | null) =>
        onAllocate({
          sourceId: source.id,
          sourceNumber: source.number,
          memberId: suggestion?.memberId ?? "",
          obligationId: suggestion?.obligationId ?? "",
        })
    : undefined;

  return (
    <Box as="section" aria-labelledby={headingId} ref={sectionRef}>
      <Text as="h2" id={headingId} fontSize="lg" fontWeight="semibold" mb={2}>
        Member money reconciliation
      </Text>
      <Text fontSize="sm" color="fg.muted" mb={3}>
        How held member money has been allocated to dues and levies, and how that compares
        with what Finance records now. These reports only read; nothing here changes the
        books or Finance.
      </Text>
      <Tabs.Root
        value={tab}
        onValueChange={({ value }) => setTab(value as ReconciliationTab)}
        variant="line"
        colorPalette="teal"
        lazyMount
        unmountOnExit
      >
        <Tabs.List mb={3} overflowX="auto">
          {TABS.map((entry) => (
            <Tabs.Trigger key={entry.value} value={entry.value} minH="44px">
              {entry.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="summary" p={0}>
          <ReconciliationSummaryReport
            organisationId={organisationId}
            names={names}
            view={summaryView}
            onViewChange={setSummaryView}
            onShowAllocations={showAllocationsOf}
          />
        </Tabs.Content>
        <Tabs.Content value="sources" p={0}>
          <SourcesReport
            organisationId={organisationId}
            names={names}
            view={sourcesView}
            onViewChange={setSourcesView}
            onAllocate={allocateFrom}
          />
        </Tabs.Content>
        <Tabs.Content value="positions" p={0}>
          <PositionsReport
            organisationId={organisationId}
            names={names}
            view={positionsView}
            onViewChange={setPositionsView}
            onShowAllocations={showAllocationsOf}
          />
        </Tabs.Content>
        <Tabs.Content value="allocations" p={0}>
          <AllocationHistory
            organisationId={organisationId}
            names={names}
            view={historyView}
            onViewChange={setHistoryView}
            onOpenJournal={onOpenJournal}
          />
        </Tabs.Content>
      </Tabs.Root>
    </Box>
  );
};

export default ReconciliationPanel;

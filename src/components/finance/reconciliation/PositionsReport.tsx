import { Button, Field, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedList } from "components/GroupedList";
import { EmptyState } from "components/ui/states";
import { OptionSelect } from "components/ui/themed-select";
import { POSITION_FLAGS, ReconciliationPosition } from "components/finance/ledgerReconciliationTypes";
import {
  CURRENT_F0_NOTE,
  POSITION_FLAG_TEXT,
  snapshotText,
} from "helpers/ledgerReconciliation";
import { usePositions } from "hooks/useLedgerReconciliation";
import { LedgerNames } from "hooks/useLedgerNames";
import { ReportNotice } from "components/finance/reports/ReportParts";
import {
  Pager,
  PositionCard,
  ReadAt,
  ReconciliationGate,
  UnlinkedExplainer,
} from "components/finance/reconciliation/ReconciliationParts";

export interface PositionsView {
  obligationId: string;
  memberId: string;
  flag: string;
  cursors: string[];
}

export const INITIAL_POSITIONS_VIEW: PositionsView = { obligationId: "", memberId: "", flag: "", cursors: [""] };

const FLAG_OPTIONS = POSITION_FLAGS.map((flag) => ({ value: flag, label: POSITION_FLAG_TEXT[flag].label }));

/**
 * F3-4 `GET /reconciliation/positions`: every F0 position as it is NOW,
 * beside what the ledger has allocated to it. There is no date filter: F0
 * keeps no history (`asOf` is refused by the server).
 */
const PositionsReport = ({
  organisationId,
  names,
  view,
  onViewChange,
  onShowAllocations,
}: {
  organisationId: string;
  names: LedgerNames;
  view: PositionsView;
  onViewChange: (view: PositionsView) => void;
  onShowAllocations: (position: ReconciliationPosition) => void;
}) => {
  const query = usePositions(
    organisationId,
    {
      obligationId: view.obligationId,
      memberId: view.memberId,
      flag: view.flag,
      cursor: view.cursors[view.cursors.length - 1],
    },
    true,
  );
  const apply = (change: Partial<PositionsView>) => onViewChange({ ...view, ...change, cursors: [""] });
  const filtered = Boolean(view.obligationId || view.memberId || view.flag);

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
        <Field.Root flex="1 1 12rem">
          <Field.Label>Review flag</Field.Label>
          <OptionSelect
            value={view.flag}
            options={FLAG_OPTIONS}
            placeholder="Any"
            onChange={(flag) => apply({ flag })}
            onClear={() => apply({ flag: "" })}
          />
        </Field.Root>
      </Flex>
      {filtered && (
        <Button alignSelf="flex-start" size="sm" variant="ghost" onClick={() => onViewChange({ ...INITIAL_POSITIONS_VIEW })}>
          Clear all filters
        </Button>
      )}
      <ReportNotice title="Current values only">{CURRENT_F0_NOTE}</ReportNotice>
      <UnlinkedExplainer />

      <ReconciliationGate query={query} name="positions">
        {(report) => (
          <Stack gap={3}>
            <ReadAt readAt={report.readAt} />
            <Text fontSize="xs" color="fg.muted">
              {snapshotText(report.snapshot)}
            </Text>
            {report.items.length === 0 ? (
              <EmptyState
                title={filtered ? "No positions match these filters" : "No positions yet"}
                description={
                  filtered
                    ? "Change or clear the filters to see other positions."
                    : "A position appears for every payment recorded in Finance and every member and obligation an allocation names."
                }
              />
            ) : (
              <GroupedList aria-label="Positions">
                {report.items.map((position) => (
                  <PositionCard
                    key={`${position.obligationId}-${position.memberId}`}
                    position={position}
                    names={names}
                    actions={
                      position.allocatedKobo > 0 ? (
                        <Button
                          alignSelf="flex-start"
                          size="sm"
                          variant="outline"
                          minH="44px"
                          onClick={() => onShowAllocations(position)}
                        >
                          Show its allocations
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </GroupedList>
            )}
            <Pager
              cursors={view.cursors}
              nextCursor={report.nextCursor}
              isFetching={query.isFetching}
              onChange={(cursors) => onViewChange({ ...view, cursors })}
            />
          </Stack>
        )}
      </ReconciliationGate>
    </Stack>
  );
};

export default PositionsReport;

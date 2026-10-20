import { ReactNode } from "react";
import { Badge, Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { GroupedListItem } from "components/GroupedList";
import { EmptyState } from "components/ui/states";
import {
  ReconciliationPosition,
  ReconciliationSourceRow,
} from "components/finance/ledgerReconciliationTypes";
import { MEMBER_MONEY_PURPOSE_LABELS } from "components/finance/ledgerPostingTypes";
import { formatKobo } from "helpers/financeConstants";
import { ledgerApiFailure } from "helpers/ledgerSetup";
import {
  GAP_WINDOW_NOTE,
  OBLIGATION_KIND_LABELS,
  RECORDED_STATE_TEXT,
  SOURCE_KIND_LABELS,
  TRANSACTIONS_UNAVAILABLE_NOTE,
  UNLINKED_EXPLAINER,
  UNLINKED_LABEL,
  ageText,
  flagExplanation,
  flagLabel,
  koboOrUnknown,
  readAtText,
  sourceDateText,
} from "helpers/ledgerReconciliation";
import { formatBusinessDate } from "helpers/financeCompliance";
import { formatLagosTimestamp } from "helpers/openingBalances";
import { ReportQueryState } from "hooks/useLedgerReports";
import { LedgerNames } from "hooks/useLedgerNames";
import { FigureRow, ReportGate } from "components/finance/reports/ReportParts";

/**
 * `ReportGate` plus the reconciliation reads' own refusal: without database
 * transactions the server reads nothing (503 LEDGER_TRANSACTIONS_UNAVAILABLE),
 * which is not something a retry fixes.
 */
export const ReconciliationGate = <T,>({
  query,
  name,
  children,
}: {
  query: ReportQueryState<T>;
  name: string;
  children: (report: T) => ReactNode;
}) => {
  if (query.isError && !query.hasData) {
    const failure = ledgerApiFailure(query.error);
    if (failure.status === 503 && failure.code === "LEDGER_TRANSACTIONS_UNAVAILABLE") {
      return <EmptyState title={`The ${name} isn't available on this server`} description={TRANSACTIONS_UNAVAILABLE_NOTE} />;
    }
  }
  return (
    <ReportGate query={query} name={name}>
      {children}
    </ReportGate>
  );
};

export const ReadAt = ({ readAt }: { readAt: string }) => (
  <Text fontSize="xs" color="fg.muted">
    {readAtText(readAt)}
  </Text>
);

/** Previous / next over a stack of visited cursors ("" is the first page). */
export const Pager = ({
  cursors,
  nextCursor,
  isFetching,
  onChange,
}: {
  cursors: string[];
  nextCursor: string | null;
  isFetching: boolean;
  onChange: (cursors: string[]) => void;
}) => (
  <Flex justify="space-between" align="center" gap={2} wrap="wrap">
    <Button variant="outline" minH="44px" disabled={cursors.length === 1} onClick={() => onChange(cursors.slice(0, -1))}>
      Previous page
    </Button>
    <Text fontSize="sm" color="fg.muted">{`Page ${cursors.length}`}</Text>
    <Button
      variant="outline"
      minH="44px"
      disabled={nextCursor === null || isFetching}
      onClick={() => nextCursor && onChange([...cursors, nextCursor])}
    >
      Next page
    </Button>
  </Flex>
);

export const FlagBadges = ({ flags }: { flags: string[] }) =>
  flags.length ? (
    <Flex gap={1} wrap="wrap">
      {flags.map((flag) => (
        <Badge key={flag} colorPalette="orange" variant="subtle">
          {flagLabel(flag)}
        </Badge>
      ))}
    </Flex>
  ) : null;

/** One position: current F0 figures beside ledger allocations, never mixed. */
export const PositionCard = ({
  position,
  names,
  actions,
}: {
  position: ReconciliationPosition;
  names: LedgerNames;
  actions?: ReactNode;
}) => {
  const known = position.recordedState === "known";
  const snapshot = position.snapshot;
  return (
    <GroupedListItem>
      <Stack gap={2}>
        <Flex justify="space-between" align="flex-start" gap={2} wrap="wrap">
          <Stack gap={0.5} minW={0}>
            <Text fontWeight="semibold">{names.memberName(position.memberId)}</Text>
            <Text fontSize="sm" color="fg.muted">
              {`${names.obligationName(position.obligationId)}${
                position.obligationType ? ` · ${OBLIGATION_KIND_LABELS[position.obligationType]}` : ""
              }`}
            </Text>
          </Stack>
          {!known && (
            <Badge colorPalette="yellow" variant="subtle">
              {position.recordedState === "ambiguous" ? "Ambiguous" : "Unknown"}
            </Badge>
          )}
        </Flex>
        <FlagBadges flags={position.flags} />
        <Box>
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
            Finance (current)
          </Text>
          <FigureRow label="Recorded" value={koboOrUnknown(position.recordedKobo)} hint={known ? undefined : RECORDED_STATE_TEXT[position.recordedState]} />
          <FigureRow label="Linked to allocations" value={koboOrUnknown(position.linkedKobo)} />
          <FigureRow label={UNLINKED_LABEL} value={koboOrUnknown(position.unlinkedKobo)} />
          <FigureRow label="Over-linked" value={koboOrUnknown(position.overLinkedKobo)} />
          <FigureRow label="Applied under the current start date" value={koboOrUnknown(position.appliedKobo)} />
          <FigureRow label="Unapplied credit" value={koboOrUnknown(position.creditKobo)} />
        </Box>
        <Box>
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
            Ledger
          </Text>
          <FigureRow label="Allocated" value={formatKobo(position.allocatedKobo)} strong />
        </Box>
        {snapshot && (
          <Box>
            <Text fontSize="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
              {`Snapshot (${formatLagosTimestamp(snapshot.takenAt) ?? snapshot.takenAt})`}
            </Text>
            {snapshot.snapshotState === "absent" ? (
              <Text fontSize="sm" color="fg.muted">
                This position didn't exist at the snapshot (recorded ₦0 then).
              </Text>
            ) : (
              <FigureRow label="Recorded at the snapshot" value={koboOrUnknown(snapshot.recordedKobo)} />
            )}
            <FigureRow label="Recorded after snapshot" value={koboOrUnknown(snapshot.recordedAfterSnapshotKobo)} />
            {snapshot.explainingSources.length > 0 && (
              <Stack gap={1} mt={1}>
                <Text fontSize="xs" color="fg.muted">
                  {GAP_WINDOW_NOTE}
                </Text>
                {snapshot.explainingSources.map((source) => (
                  <Text key={source.id} fontSize="sm">
                    {`${source.number} · ${SOURCE_KIND_LABELS[source.kind]} · ${formatBusinessDate(
                      source.businessDate,
                    )} · ${formatKobo(source.allocatedKobo)} allocated`}
                  </Text>
                ))}
              </Stack>
            )}
          </Box>
        )}
        {position.flags.length > 0 && (
          <Stack gap={1}>
            {position.flags.map((flag) => (
              <Text key={flag} fontSize="sm" color="fg.muted">
                <Text as="span" fontWeight="semibold">{`${flagLabel(flag)}: `}</Text>
                {flagExplanation(flag)}
              </Text>
            ))}
          </Stack>
        )}
        {actions}
      </Stack>
    </GroupedListItem>
  );
};

export const UnlinkedExplainer = () => (
  <Text fontSize="xs" color="fg.muted">
    {`${UNLINKED_LABEL}: ${UNLINKED_EXPLAINER}`}
  </Text>
);

/** One source of member money, as the ledger held it at the report date. */
export const SourceCard = ({
  source,
  names,
  children,
}: {
  source: ReconciliationSourceRow;
  names: LedgerNames;
  children?: ReactNode;
}) => {
  const hints = [
    source.hints.memberId ? `member ${names.memberName(source.hints.memberId)}` : null,
    source.hints.obligationId ? `obligation ${names.obligationName(source.hints.obligationId)}` : null,
    source.hints.purpose ? `purpose ${MEMBER_MONEY_PURPOSE_LABELS[source.hints.purpose].toLowerCase()}` : null,
  ].filter(Boolean);
  return (
    <GroupedListItem>
      <Stack gap={2}>
        <Flex justify="space-between" align="flex-start" gap={2} wrap="wrap">
          <Stack gap={0.5} minW={0}>
            <Flex gap={2} align="center" wrap="wrap">
              <Text fontWeight="semibold">{source.number}</Text>
              <Badge variant="subtle">{SOURCE_KIND_LABELS[source.kind]}</Badge>
            </Flex>
            <Text fontSize="sm">{source.payerName ?? "Payer not recorded"}</Text>
            <Text fontSize="sm" color="fg.muted">
              {`${sourceDateText(source)} · ${ageText(source.ageDays)} old`}
            </Text>
            <Text fontSize="sm" color="fg.muted">
              {hints.length ? `Hints: ${hints.join(", ")}` : "No hints recorded"}
            </Text>
          </Stack>
          <Text fontWeight="semibold" css={{ fontVariantNumeric: "tabular-nums" }}>
            {`${formatKobo(source.remainingKobo)} available`}
          </Text>
        </Flex>
        <Text fontSize="sm" color="fg.muted">
          {[
            `${formatKobo(source.effectiveKobo)} received`,
            `${formatKobo(source.refundedKobo)} refunded`,
            `${formatKobo(source.allocatedKobo)} allocated`,
          ].join(" · ")}
        </Text>
        {children}
      </Stack>
    </GroupedListItem>
  );
};

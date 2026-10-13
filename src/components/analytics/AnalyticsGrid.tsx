import { Badge, Box, Table } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import {
  ATTENDANCE_BEHAVIORS,
  AttendanceStatusConfig,
  BEHAVIOR_META,
} from "helpers/attendanceStatuses";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { BehaviorCounts } from "components/analytics/AnalyticsMemberList";

const DAY_HEADER_FORMAT = "EEE d, MMM"; // e.g. "Tue 3, Jul"

// rotate narrow column headers so single-letter cells don't waste width.
// applied to an inner span (not the th) so the cell stays in normal writing
// mode and can center the label horizontally over its column.
const VERTICAL_LABEL_SX = {
  display: "inline-block",
  writingMode: "vertical-rl",
  transform: "rotate(180deg)",
  whiteSpace: "nowrap",
} as const;

// SN and Name stay put while the session columns scroll under them. They
// need the panel background, or scrolled cells show through.
const SN_WIDTH = "2.75rem";
const pinned = (left: string) =>
  ({ position: "sticky", left, zIndex: 1, bg: "bg.panel" }) as const;

// extract the yyyy-MM-dd suffix from a date column key and render it compactly
const formatDayHeader = (key: string) => {
  const isoDate = key.match(/\d{4}-\d{2}-\d{2}$/)?.[0];
  return isoDate ? format(parseISO(isoDate), DAY_HEADER_FORMAT) : key;
};

// A member with no cell for a session was not on its roster — neither present
// nor absent, so it is neutral rather than a status of its own.
const NOT_ON_ROSTER = (session: string) =>
  `Not applicable: not on this ${lowerTerm(session)} roster`;

export interface AnalyticsGridRow {
  memberId?: string;
  name: string;
  counts: BehaviorCounts;
  /** Session column key → stored status key; missing means N/A. */
  cells: Record<string, string | undefined>;
}

interface AnalyticsGridProps {
  rows: AnalyticsGridRow[];
  dateKeys: string[];
  statuses: AttendanceStatusConfig;
  onOpen: (memberId: string) => void;
}

const AnalyticsGrid = ({ rows, dateKeys, statuses, onOpen }: AnalyticsGridProps) => {
  const terms = useTerms();
  return (
    <Box
      overflowX="auto"
      bg="bg.panel"
      borderWidth="1px"
      borderColor="border"
      borderRadius="lg"
    >
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader textAlign="end" w={SN_WIDTH} minW={SN_WIDTH} {...pinned("0")}>
              SN
            </Table.ColumnHeader>
            <Table.ColumnHeader {...pinned(SN_WIDTH)} borderRightWidth="1px">
              Name
            </Table.ColumnHeader>
            {ATTENDANCE_BEHAVIORS.map((behavior) => (
              <Table.ColumnHeader key={behavior} textAlign="center" verticalAlign="bottom">
                <Box as="span" css={VERTICAL_LABEL_SX}>
                  {BEHAVIOR_META[behavior].label}
                </Box>
              </Table.ColumnHeader>
            ))}
            {dateKeys.map((d) => (
              <Table.ColumnHeader key={d} textAlign="center" verticalAlign="bottom">
                <Box as="span" css={VERTICAL_LABEL_SX}>
                  {formatDayHeader(d)}
                </Box>
              </Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, index) => {
            const open = row.memberId ? () => onOpen(row.memberId!) : undefined;
            return (
              <Table.Row
                key={row.memberId ?? `${row.name}-${index}`}
                h="44px"
                onClick={open}
                cursor={open ? "pointer" : "default"}
                _hover={open ? { "& > td": { bg: "bg.muted" } } : undefined}
                title={open ? `View ${lowerTerm(terms.memberSingular)} analytics` : undefined}
                role={open ? "button" : undefined}
                tabIndex={open ? 0 : undefined}
                onKeyDown={(e) => {
                  if (open && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    open();
                  }
                }}
              >
                <Table.Cell textAlign="end" color="fg.muted" {...pinned("0")}>
                  {index + 1}
                </Table.Cell>
                <Table.Cell
                  {...pinned(SN_WIDTH)}
                  borderRightWidth="1px"
                  whiteSpace="nowrap"
                  maxW={{ base: "9rem", md: "16rem" }}
                  overflow="hidden"
                  textOverflow="ellipsis"
                >
                  {row.name}
                </Table.Cell>

                {ATTENDANCE_BEHAVIORS.map((behavior) => (
                  <Table.Cell key={behavior} textAlign="center">
                    <Badge colorPalette={BEHAVIOR_META[behavior].color}>
                      {row.counts[behavior]}
                    </Badge>
                  </Table.Cell>
                ))}

                {dateKeys.map((d) => {
                  const key = row.cells[d];
                  if (!key) {
                    return (
                      <Table.Cell key={d} textAlign="center">
                        <Badge
                          role="img"
                          aria-label={NOT_ON_ROSTER(terms.attendanceSingular)}
                          title={NOT_ON_ROSTER(terms.attendanceSingular)}
                        >
                          N/A
                        </Badge>
                      </Table.Cell>
                    );
                  }
                  const status = statuses.resolve(key);
                  return (
                    <Table.Cell key={d} textAlign="center">
                      <Badge colorPalette={status.color} title={status.label}>
                        {status.shortLabel}
                      </Badge>
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
};

export default AnalyticsGrid;

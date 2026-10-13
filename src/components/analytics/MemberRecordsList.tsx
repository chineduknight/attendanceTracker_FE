import React, { useMemo, useState } from "react";
import { Badge, Box, Button, Flex, Text } from "@chakra-ui/react";
import { FaChevronDown, FaChevronRight, FaPen } from "react-icons/fa";
import { MemberRecord } from "components/analytics/memberAnalyticsTypes";
import { AttendanceStatusConfig } from "helpers/attendanceStatuses";
import { formatSessionDate } from "helpers/sessionDate";
import { useTerms } from "hooks/useOrgPresentation";

/** Months open on arrival; older ones start collapsed. */
const OPEN_MONTHS = 2;
/** Months listed before "Show N more months". */
const SHOWN_MONTHS = 6;

interface MonthGroup {
  /** YYYY-MM, which sorts newest-first as a string. */
  key: string;
  records: MemberRecord[];
}

/** Records by calendar month, newest month first, rows newest first. */
export const groupRecordsByMonth = (records: MemberRecord[]): MonthGroup[] => {
  const byMonth = new Map<string, MemberRecord[]>();
  [...records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((record) => {
      const key = formatSessionDate(record.date, "yyyy-MM");
      byMonth.set(key, [...(byMonth.get(key) ?? []), record]);
    });
  return Array.from(byMonth, ([key, items]) => ({ key, records: items }));
};

interface MemberRecordsListProps {
  records: MemberRecord[];
  statuses: AttendanceStatusConfig;
}

/**
 * The member's stored records as compact rows (date · session · status ·
 * edited), grouped by month so a year of history doesn't fill the page.
 * Month counts are of the records loaded here, not recomputed analytics.
 */
const MemberRecordsList: React.FC<MemberRecordsListProps> = ({ records, statuses }) => {
  const terms = useTerms();
  const groups = useMemo(() => groupRecordsByMonth(records), [records]);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? groups : groups.slice(0, SHOWN_MONTHS);
  const hidden = groups.length - visible.length;
  // "records", not the attendance term: "7 attendance" reads wrong when the
  // organisation's plural is "Attendance".
  const recordWord = (n: number) => `${n} ${n === 1 ? "record" : "records"}`;

  const toggle = (key: string) =>
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Box bg="bg.panel" borderRadius="lg" borderWidth="1px" borderColor="border" overflow="hidden">
      <Text fontSize="sm" fontWeight="semibold" px={4} pt={4} pb={2}>
        {`${terms.attendanceSingular} records`}
      </Text>
      {visible.map((group, index) => {
        // A month is open by default when it is one of the newest; a tap flips it.
        const open = (index < OPEN_MONTHS) !== toggled.has(group.key);
        const panelId = `records-${group.key}`;
        return (
          <Box key={group.key} borderTopWidth="1px" borderColor="border.muted">
            <Box
              as="button"
              w="100%"
              minH="44px"
              px={4}
              display="flex"
              alignItems="center"
              gap={2}
              textAlign="start"
              bg="bg.muted"
              _hover={{ bg: "bg.emphasized" }}
              _focusVisible={{ outline: "2px solid", outlineColor: "blue.focusRing", outlineOffset: "-2px" }}
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(group.key)}
            >
              <Box color="fg.muted" aria-hidden="true">
                {open ? <FaChevronDown /> : <FaChevronRight />}
              </Box>
              <Text fontWeight="semibold" flex="1">
                {formatSessionDate(`${group.key}-01`, "MMMM yyyy")}
              </Text>
              <Text fontSize="sm" color="fg.muted">{recordWord(group.records.length)}</Text>
            </Box>
            {open && (
              <Box id={panelId} as="ul" listStyleType="none">
                {group.records.map((record) => {
                  const status = statuses.resolve(record.status);
                  const edited = record.hasBeenUpdated
                    ? record.editCount
                      ? `Edited ${record.editCount}×`
                      : "Edited"
                    : null;
                  return (
                    <Flex
                      as="li"
                      key={record.attendanceId}
                      align="center"
                      gap={3}
                      minH="44px"
                      px={4}
                      py={1}
                      borderTopWidth="1px"
                      borderColor="border.muted"
                    >
                      <Text
                        w="3.25rem" flexShrink={0} fontSize="sm" color="fg.muted"
                        fontVariantNumeric="tabular-nums"
                      >
                        {formatSessionDate(record.date, "EEE d")}
                      </Text>
                      {/* Two lines before truncating: a phone row leaves the name ~130px. */}
                      <Text flex="1" minW={0} lineClamp={2} fontSize="sm" title={record.sessionName}>
                        {record.sessionName}
                      </Text>
                      {edited && (
                        <Box color="purple.fg" flexShrink={0} title={edited}>
                          <FaPen aria-hidden="true" size="0.75em" />
                          <Text srOnly>{edited}</Text>
                        </Box>
                      )}
                      <Badge colorPalette={status.color} flexShrink={0}>
                        {status.label}
                      </Badge>
                    </Flex>
                  );
                })}
              </Box>
            )}
          </Box>
        );
      })}
      {hidden > 0 && (
        <Box borderTopWidth="1px" borderColor="border.muted" p={2}>
          <Button variant="ghost" w="100%" minH="44px" onClick={() => setShowAll(true)}>
            {`Show ${hidden} more ${hidden === 1 ? "month" : "months"}`}
          </Button>
        </Box>
      )}
    </Box>
  );
};

export default MemberRecordsList;

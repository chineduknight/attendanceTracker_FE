import { Box, Flex, Text } from "@chakra-ui/react";
import { FaChevronRight } from "react-icons/fa";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import {
  ATTENDANCE_BEHAVIORS,
  AttendanceBehavior,
  BEHAVIOR_META,
  solidColor,
} from "helpers/attendanceStatuses";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";

export type BehaviorCounts = Record<AttendanceBehavior, number>;

export interface AnalyticsListRow {
  memberId?: string;
  name: string;
  /** Position in the backend's ranking; kept when the list is searched. */
  rank: number;
  counts: BehaviorCounts;
}

interface AnalyticsMemberListProps {
  /** In the backend's ranking order. */
  rows: AnalyticsListRow[];
  onOpen: (memberId: string) => void;
  /** The member last opened from this report: marked so the officer can find their place. */
  lastOpenedId?: string | null;
}

/**
 * The phone view of organisation analytics: one row per member in the
 * backend's order, with the backend's Present / Excused / Absent totals and a
 * bar split in the same proportions. No rate is computed here: the bar only
 * shows the counts the backend returned. A member with no counts was on no
 * included roster in the range (every cell N/A), which is not absence.
 */
const AnalyticsMemberList = ({ rows, onOpen, lastOpenedId }: AnalyticsMemberListProps) => {
  const terms = useTerms();
  const session = lowerTerm(terms.attendanceSingular);
  return (
    <GroupedList>
      {rows.map((row) => {
        const total = ATTENDANCE_BEHAVIORS.reduce((sum, b) => sum + row.counts[b], 0);
        const summary = ATTENDANCE_BEHAVIORS.map(
          (b) => `${BEHAVIOR_META[b].label} ${row.counts[b]}`,
        ).join(", ");
        const body = (
          <Flex align="center" gap={3} minH="44px">
            <Text
              w="2ch" flexShrink={0} textAlign="end" fontSize="sm"
              color="fg.muted" fontVariantNumeric="tabular-nums"
            >
              {row.rank}
            </Text>
            <Box flex="1" minW={0}>
              <Text fontWeight="semibold" lineClamp={1}>{row.name}</Text>
              {total === 0 ? (
                <Text fontSize="sm" color="fg.muted">{`Not on any ${session} roster`}</Text>
              ) : (
                <>
                  <Flex gap={3} fontSize="sm" fontVariantNumeric="tabular-nums" aria-hidden="true">
                    {ATTENDANCE_BEHAVIORS.map((b) => (
                      <Text key={b} color={`${BEHAVIOR_META[b].color}.fg`}>
                        {`${BEHAVIOR_META[b].label[0]} ${row.counts[b]}`}
                      </Text>
                    ))}
                  </Flex>
                  <Flex h="6px" mt={1} borderRadius="full" overflow="hidden" bg="bg.muted" aria-hidden="true">
                    {ATTENDANCE_BEHAVIORS.map((b) =>
                      row.counts[b] > 0 ? (
                        <Box
                          key={b}
                          data-behavior={b}
                          w={`${(row.counts[b] / total) * 100}%`}
                          bg={solidColor(BEHAVIOR_META[b].color)}
                        />
                      ) : null,
                    )}
                  </Flex>
                  {/* The letters and bar are visual; this is what is read out. */}
                  <Text srOnly>{summary}</Text>
                </>
              )}
            </Box>
            {row.memberId && (
              <Box color="fg.muted" flexShrink={0} aria-hidden="true">
                <FaChevronRight />
              </Box>
            )}
          </Flex>
        );
        const isLastOpened = Boolean(row.memberId) && row.memberId === lastOpenedId;
        return (
          <GroupedListItem key={row.memberId ?? `${row.name}-${row.rank}`} px={0} py={0}>
            {row.memberId ? (
              <Box
                as="button"
                data-member-id={row.memberId}
                aria-current={isLastOpened || undefined}
                bg={isLastOpened ? "blue.subtle" : undefined}
                w="100%"
                textAlign="start"
                px={4}
                py={2}
                cursor="pointer"
                _hover={{ bg: "bg.muted" }}
                _focusVisible={{ outline: "2px solid", outlineColor: "blue.focusRing", outlineOffset: "-2px" }}
                onClick={() => onOpen(row.memberId!)}
                aria-label={`${row.name}: ${total === 0 ? `not on any ${session} roster` : summary}. View ${lowerTerm(terms.memberSingular)} analytics`}
              >
                {body}
              </Box>
            ) : (
              <Box px={4} py={2}>{body}</Box>
            )}
          </GroupedListItem>
        );
      })}
    </GroupedList>
  );
};

export default AnalyticsMemberList;

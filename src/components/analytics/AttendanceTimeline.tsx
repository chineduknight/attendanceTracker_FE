import React from "react";
import { Box, Flex, Text, Tooltip, Wrap, WrapItem } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import { MemberVerdict } from "components/analytics/memberAnalyticsTypes";
import { AttendanceStatusConfig, solidColor } from "helpers/attendanceStatuses";
import { FULL_DATE_FORMAT } from "components/analytics/dateFormats";

const groupByMonth = (verdicts: MemberVerdict[]) => {
  const sorted = [...verdicts].sort((a, b) => a.date.localeCompare(b.date));
  const groups: { label: string; items: MemberVerdict[] }[] = [];
  sorted.forEach((verdict) => {
    const label = format(parseISO(verdict.date), "MMM yyyy");
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(verdict);
    else groups.push({ label, items: [verdict] });
  });
  return groups;
};

interface AttendanceTimelineProps {
  verdicts: MemberVerdict[];
  statuses: AttendanceStatusConfig;
}

const AttendanceTimeline: React.FC<AttendanceTimelineProps> = ({ verdicts, statuses }) => {
  const groups = groupByMonth(verdicts);
  const legend = statuses.legendFor(verdicts.map((verdict) => verdict.status));
  return (
    <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.200" p={4}>
      <Text fontSize="sm" fontWeight="semibold" mb={3}>Attendance history</Text>
      {groups.map((group) => (
        <Box key={group.label} mb={3}>
          <Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="wider" mb={1}>
            {group.label}
          </Text>
          <Wrap spacing="4px">
            {group.items.map((verdict, index) => {
              const status = statuses.resolve(verdict.status);
              return (
                <WrapItem key={`${verdict.date}-${verdict.status}-${index}`}>
                  <Tooltip
                    label={`${format(parseISO(verdict.date), FULL_DATE_FORMAT)} · ${status.label}`}
                  >
                    <Box
                      data-cell="verdict" data-status={verdict.status}
                      w="16px" h="16px" borderRadius="4px"
                      bg={solidColor(status.color)}
                    />
                  </Tooltip>
                </WrapItem>
              );
            })}
          </Wrap>
        </Box>
      ))}
      <Flex gap={4} mt={2} fontSize="xs" color="gray.600" flexWrap="wrap">
        {legend.map((status) => (
          <Flex key={status.key} align="center" gap={1}>
            <Box w="12px" h="12px" borderRadius="3px" bg={solidColor(status.color)} />
            <Text>{status.label}</Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
};

export default AttendanceTimeline;

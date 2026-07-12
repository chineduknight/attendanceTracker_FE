import React from "react";
import { Box, Flex, Text, Tooltip, Wrap, WrapItem } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import { MemberVerdict } from "components/analytics/memberAnalyticsTypes";
import { getStatusMeta, STATUS_META, AttendanceStatus } from "components/analytics/statusMeta";

const cellColor = (status: AttendanceStatus) => `${getStatusMeta(status).color}.500`;

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

const AttendanceTimeline: React.FC<{ verdicts: MemberVerdict[] }> = ({ verdicts }) => {
  const groups = groupByMonth(verdicts);
  return (
    <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.200" p={4}>
      <Text fontSize="sm" fontWeight="semibold" mb={3}>Attendance history</Text>
      {groups.map((group) => (
        <Box key={group.label} mb={3}>
          <Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="wider" mb={1}>
            {group.label}
          </Text>
          <Wrap spacing="4px">
            {group.items.map((verdict, index) => (
              <WrapItem key={`${verdict.date}-${verdict.status}-${index}`}>
                <Tooltip
                  label={`${format(parseISO(verdict.date), "MMM d, yyyy")} · ${getStatusMeta(verdict.status).full}`}
                >
                  <Box
                    data-cell="verdict" w="16px" h="16px" borderRadius="4px"
                    bg={cellColor(verdict.status)}
                  />
                </Tooltip>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      ))}
      <Flex gap={4} mt={2} fontSize="xs" color="gray.600" flexWrap="wrap">
        {(Object.keys(STATUS_META) as AttendanceStatus[]).map((status) => (
          <Flex key={status} align="center" gap={1}>
            <Box w="12px" h="12px" borderRadius="3px" bg={cellColor(status)} />
            <Text>{STATUS_META[status].full}</Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
};

export default AttendanceTimeline;

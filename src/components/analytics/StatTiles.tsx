import React from "react";
import { SimpleGrid, Box, Text } from "@chakra-ui/react";
import {
  ATTENDANCE_BEHAVIORS,
  BEHAVIOR_META,
  solidColor,
} from "helpers/attendanceStatuses";
import { BehaviorCounts } from "components/analytics/memberAnalyticsTypes";

interface StatTilesProps {
  behaviorCounts: BehaviorCounts;
  totalSessions: number;
}

// Behavior buckets are semantic (Present / Excused / Absent), not the
// organisation's configured labels.
const StatTiles: React.FC<StatTilesProps> = ({ behaviorCounts, totalSessions }) => {
  const tiles = [
    ...ATTENDANCE_BEHAVIORS.map((behavior) => ({
      key: behavior,
      label: BEHAVIOR_META[behavior].label,
      bg: solidColor(BEHAVIOR_META[behavior].color),
      value: behaviorCounts[behavior] ?? 0,
    })),
    { key: "totalSessions", label: "Total Sessions", bg: "blue.500", value: totalSessions },
  ];
  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
      {tiles.map((tile) => (
        <Box key={tile.key} bg={tile.bg} color="white" borderRadius="12px" p={4} textAlign="center">
          <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" opacity={0.9}>
            {tile.label}
          </Text>
          <Text fontSize="2xl" fontWeight="bold">{tile.value}</Text>
        </Box>
      ))}
    </SimpleGrid>
  );
};

export default StatTiles;

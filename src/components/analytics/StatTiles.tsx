import React from "react";
import { SimpleGrid, Box, Text } from "@chakra-ui/react";
import { ATTENDANCE_BEHAVIORS, BEHAVIOR_META } from "helpers/attendanceStatuses";
import { BehaviorCounts } from "components/analytics/memberAnalyticsTypes";
import { useTerms } from "hooks/useOrgPresentation";

interface StatTilesProps {
  behaviorCounts: BehaviorCounts;
  totalSessions: number;
}

// Behavior buckets are semantic (Present / Excused / Absent), not the
// organisation's configured labels.
const StatTiles: React.FC<StatTilesProps> = ({ behaviorCounts, totalSessions }) => {
  const terms = useTerms();
  const tiles = [
    ...ATTENDANCE_BEHAVIORS.map((behavior) => ({
      key: behavior,
      label: BEHAVIOR_META[behavior].label,
      palette: BEHAVIOR_META[behavior].color,
      value: behaviorCounts[behavior] ?? 0,
    })),
    {
      key: "totalSessions",
      label: `Total ${terms.attendancePlural}`,
      palette: "blue",
      value: totalSessions,
    },
  ];
  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
      {tiles.map((tile) => (
        // The palette's solid fill and its contrast text: readable in both
        // modes (the theme keeps every white-text .solid at 4.5:1+).
        <Box
          key={tile.key}
          colorPalette={tile.palette}
          bg="colorPalette.solid"
          color="colorPalette.contrast"
          borderRadius="12px"
          p={4}
          textAlign="center"
        >
          <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider">
            {tile.label}
          </Text>
          <Text fontSize="2xl" fontWeight="bold">{tile.value}</Text>
        </Box>
      ))}
    </SimpleGrid>
  );
};

export default StatTiles;

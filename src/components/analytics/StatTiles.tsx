import React from "react";
import { SimpleGrid, Box, Text } from "@chakra-ui/react";

interface StatTilesProps {
  present: number;
  absent: number;
  apology: number;
  totalSessions: number;
}

const TILES: { key: keyof StatTilesProps; label: string; bg: string }[] = [
  { key: "present", label: "Present", bg: "green.500" },
  { key: "absent", label: "Absent", bg: "red.500" },
  { key: "apology", label: "Apology", bg: "orange.500" },
  { key: "totalSessions", label: "Total Sessions", bg: "blue.500" },
];

const StatTiles: React.FC<StatTilesProps> = (props) => (
  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
    {TILES.map((tile) => (
      <Box key={tile.key} bg={tile.bg} color="white" borderRadius="12px" p={4} textAlign="center">
        <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" opacity={0.9}>
          {tile.label}
        </Text>
        <Text fontSize="2xl" fontWeight="bold">{props[tile.key]}</Text>
      </Box>
    ))}
  </SimpleGrid>
);

export default StatTiles;

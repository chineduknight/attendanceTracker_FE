import { Button, SimpleGrid, Text, useColorModeValue } from "@chakra-ui/react";
import { BirthdayPreset } from "helpers/birthday";

export interface BirthdaySummary {
  /** Null while loading or after a failure — never a fake zero. */
  today: number | null;
  next7: number | null;
  next30: number | null;
}

interface BirthdaySummaryCardsProps {
  summary: BirthdaySummary;
  activePreset: BirthdayPreset | "custom";
  onSelect: (preset: BirthdayPreset) => void;
}

const CARDS: Array<{
  preset: BirthdayPreset;
  label: string;
  key: keyof BirthdaySummary;
}> = [
  { preset: "today", label: "Today", key: "today" },
  { preset: "next7", label: "Next 7 Days", key: "next7" },
  { preset: "next30", label: "Next 30 Days", key: "next30" },
];

/**
 * Proactive snapshot counts derived from ONE next-30-days dataset (never
 * three separate queries). Clicking a card switches the active list range;
 * labels are text, so meaning never relies on colour.
 */
const BirthdaySummaryCards = ({
  summary,
  activePreset,
  onSelect,
}: BirthdaySummaryCardsProps) => {
  const cardBg = useColorModeValue("white", "gray.700");
  return (
    <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={3}>
      {CARDS.map(({ preset, label, key }) => {
        const active = activePreset === preset;
        return (
          <Button
            key={preset}
            onClick={() => onSelect(preset)}
            aria-pressed={active}
            variant="outline"
            borderColor={active ? "pink.400" : undefined}
            bg={cardBg}
            justifyContent="space-between"
            height="auto"
            py={3}
            px={4}
            whiteSpace="normal"
          >
            <Text fontWeight="semibold">{label}</Text>
            <Text fontSize="2xl" fontWeight="bold" ml={3}>
              {summary[key] ?? "–"}
            </Text>
          </Button>
        );
      })}
    </SimpleGrid>
  );
};

export default BirthdaySummaryCards;

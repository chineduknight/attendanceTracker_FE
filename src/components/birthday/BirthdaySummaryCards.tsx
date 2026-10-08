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
 * labels are text, so meaning never relies on colour. Tiles stay three-up on
 * mobile; `column-reverse` shows the count first while keeping the label
 * first in DOM order so the accessible name still starts with it.
 */
const BirthdaySummaryCards = ({
  summary,
  activePreset,
  onSelect,
}: BirthdaySummaryCardsProps) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const labelColor = useColorModeValue("gray.600", "gray.300");
  return (
    <SimpleGrid columns={3} spacing={{ base: 2, md: 4 }}>
      {CARDS.map(({ preset, label, key }) => {
        const active = activePreset === preset;
        return (
          <Button
            key={preset}
            onClick={() => onSelect(preset)}
            aria-pressed={active}
            variant="outline"
            borderColor={active ? "pink.400" : undefined}
            borderWidth={active ? "2px" : "1px"}
            bg={cardBg}
            flexDirection="column-reverse"
            alignItems="flex-start"
            height="auto"
            py={{ base: 2, md: 4 }}
            px={{ base: 3, md: 5 }}
            whiteSpace="normal"
          >
            <Text
              fontSize={{ base: "xs", md: "md" }}
              fontWeight="medium"
              color={labelColor}
            >
              {label}
            </Text>
            <Text
              fontSize={{ base: "xl", md: "3xl" }}
              fontWeight="bold"
              lineHeight="short"
            >
              {summary[key] ?? "–"}
            </Text>
          </Button>
        );
      })}
    </SimpleGrid>
  );
};

export default BirthdaySummaryCards;

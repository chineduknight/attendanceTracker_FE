import { SimpleGrid } from "@chakra-ui/react";
import StatTile from "components/StatTile";
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
 * three separate queries). Clicking a card switches the active list range.
 * Tiles stay three-up on mobile.
 */
const BirthdaySummaryCards = ({
  summary,
  activePreset,
  onSelect,
}: BirthdaySummaryCardsProps) => (
  <SimpleGrid columns={3} spacing={{ base: 2, md: 4 }}>
    {CARDS.map(({ preset, label, key }) => (
      <StatTile
        key={preset}
        label={label}
        value={summary[key]}
        accent="pink.400"
        isPressed={activePreset === preset}
        onClick={() => onSelect(preset)}
      />
    ))}
  </SimpleGrid>
);

export default BirthdaySummaryCards;

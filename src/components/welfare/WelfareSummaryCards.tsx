import { Grid, GridItem } from "@chakra-ui/react";
import { IconType } from "react-icons";
import {
  FaBirthdayCake,
  FaCalendarCheck,
  FaHeart,
  FaSmile,
  FaUmbrellaBeach,
} from "react-icons/fa";
import StatTile from "components/StatTile";
import { WelfareOverview } from "components/welfare/welfareTypes";
import {
  jumpToWelfareSection,
  WelfareSectionKey,
} from "components/welfare/welfareSections";

interface WelfareSummaryCardsProps {
  summary: WelfareOverview["summary"];
  /**
   * Only present once birthdays are permitted, configured and loaded — a
   * failed birthday query must never look like "0 birthdays".
   */
  birthdayCount?: number | null;
}

interface Tile {
  section: WelfareSectionKey;
  label: string;
  value: number;
  icon: IconType;
  accent: string;
}

/**
 * Counts come straight from the backend summary — never recomputed here.
 * Each tile jumps to its section. Two-up on phones; an odd last tile spans
 * the row instead of sitting alone in half of it.
 */
const WelfareSummaryCards = ({
  summary,
  birthdayCount,
}: WelfareSummaryCardsProps) => {
  const tiles: Tile[] = [
    {
      section: "attention",
      label: "Needs Check-in",
      value: summary.attention,
      icon: FaHeart,
      accent: "orange.500",
    },
    {
      section: "encouragement",
      label: "Encouragement",
      value: summary.encouragement,
      icon: FaSmile,
      accent: "green.500",
    },
    {
      section: "currentlyAway",
      label: "Currently Away",
      value: summary.currentlyAway,
      icon: FaUmbrellaBeach,
      accent: "blue.500",
    },
    {
      section: "returningSoon",
      label: "Returning Soon",
      value: summary.returningSoon,
      icon: FaCalendarCheck,
      accent: "teal.500",
    },
  ];
  if (birthdayCount != null) {
    tiles.push({
      section: "birthdays",
      label: "Upcoming Birthdays",
      value: birthdayCount,
      icon: FaBirthdayCake,
      accent: "pink.500",
    });
  }
  const hasOddLast = tiles.length % 2 === 1;

  return (
    <Grid
      templateColumns={{
        base: "repeat(2, 1fr)",
        md: `repeat(${tiles.length}, 1fr)`,
      }}
      gap={{ base: 2, md: 3 }}
    >
      {tiles.map(({ section, ...tile }, index) => (
        <GridItem
          key={section}
          colSpan={{
            base: hasOddLast && index === tiles.length - 1 ? 2 : 1,
            md: 1,
          }}
        >
          <StatTile
            {...tile}
            tone="solid"
            onClick={() => jumpToWelfareSection(section)}
          />
        </GridItem>
      ))}
    </Grid>
  );
};

export default WelfareSummaryCards;

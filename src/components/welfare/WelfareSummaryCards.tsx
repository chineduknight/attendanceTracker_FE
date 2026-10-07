import { Box, Flex, SimpleGrid, Text } from "@chakra-ui/react";
import { IconType } from "react-icons";
import {
  FaBirthdayCake,
  FaCalendarCheck,
  FaHeart,
  FaSmile,
  FaUmbrellaBeach,
} from "react-icons/fa";
import { WelfareOverview } from "components/welfare/welfareTypes";

interface WelfareSummaryCardsProps {
  summary: WelfareOverview["summary"];
  /**
   * Only present once birthdays are permitted, configured and loaded — a
   * failed birthday query must never look like "0 birthdays".
   */
  birthdayCount?: number | null;
}

interface SummaryCardProps {
  label: string;
  value: number;
  icon: IconType;
  bg: string;
}

const SummaryCard = ({ label, value, icon: Icon, bg }: SummaryCardProps) => (
  <Box bg={bg} color="white" borderRadius="12px" p={4} role="group" aria-label={label}>
    <Flex align="center" gap={2} mb={1}>
      <Icon aria-hidden="true" />
      <Text fontSize="sm" fontWeight="semibold">
        {label}
      </Text>
    </Flex>
    <Text fontSize="2xl" fontWeight="bold">
      {value}
    </Text>
  </Box>
);

/** Counts come straight from the backend summary — never recomputed here. */
const WelfareSummaryCards = ({
  summary,
  birthdayCount,
}: WelfareSummaryCardsProps) => (
  <SimpleGrid
    columns={{ base: 2, md: birthdayCount == null ? 4 : 5 }}
    spacing={3}
  >
    <SummaryCard
      label="Needs Check-in"
      value={summary.attention}
      icon={FaHeart}
      bg="orange.500"
    />
    <SummaryCard
      label="Encouragement"
      value={summary.encouragement}
      icon={FaSmile}
      bg="green.500"
    />
    <SummaryCard
      label="Currently Away"
      value={summary.currentlyAway}
      icon={FaUmbrellaBeach}
      bg="blue.500"
    />
    <SummaryCard
      label="Returning Soon"
      value={summary.returningSoon}
      icon={FaCalendarCheck}
      bg="teal.500"
    />
    {birthdayCount != null && (
      <SummaryCard
        label="Birthdays This Week"
        value={birthdayCount}
        icon={FaBirthdayCake}
        bg="pink.500"
      />
    )}
  </SimpleGrid>
);

export default WelfareSummaryCards;

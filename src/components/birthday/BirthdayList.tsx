import { Box, Flex, Text } from "@chakra-ui/react";
import { useColorModeValue } from "../ui/color-mode";
import { GroupedList, GroupedListItem } from "components/GroupedList";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import {
  birthdayDisplayDate,
  birthdayOccurrenceInRange,
  birthdayRelativeLabel,
  BirthdayMember,
  BirthdayRange,
} from "helpers/birthday";

interface BirthdayListProps {
  members: BirthdayMember[];
  range: BirthdayRange;
  /** The local business date used for Today/Tomorrow/In N days labels. */
  asOf: string;
  /**
   * Today/Tomorrow/In N days labels and the today accent. Defaults on; the
   * Welfare snapshot turns it off for a review range that began in the past.
   */
  showRelativeLabels?: boolean;
  emptyState: string;
}

/**
 * Name, birthday date and relative timing — never age, birth year or
 * "turning" wording. Rows come from the backend sorted; occurrence dates
 * prefer Phase 7B metadata and fall back to the centralized legacy parser.
 * One grouped list with dividers keeps rows dense on mobile; today's
 * birthdays get an accent plus the visible "Today" text, never colour alone.
 */
const BirthdayList = ({
  members,
  range,
  asOf,
  showRelativeLabels = true,
  emptyState,
}: BirthdayListProps) => {
  const terms = useTerms();
  const todayBg = useColorModeValue("pink.50", "whiteAlpha.100");

  if (members.length === 0) {
    return <Text color="gray.500">{emptyState}</Text>;
  }

  return (
    <GroupedList>
      {members.map((member, index) => {
        const occurrence = birthdayOccurrenceInRange(member, range);
        const display = occurrence
          ? birthdayDisplayDate(occurrence)
          : member.dob ?? "";
        const relative =
          showRelativeLabels && occurrence
            ? birthdayRelativeLabel(occurrence, asOf)
            : null;
        const isToday = showRelativeLabels && occurrence === asOf;
        return (
          <GroupedListItem
            key={member._id ?? `${member.name ?? "member"}-${index}`}
            bg={isToday ? todayBg : undefined}
            borderLeftWidth="3px"
            borderLeftColor={isToday ? "pink.400" : "transparent"}
          >
            <Flex align="center" justify="space-between" gap={3}>
              <Text
                fontWeight="semibold"
                fontSize={{ base: "sm", md: "md" }}
                lineClamp={1}
                minW={0}
              >
                {isToday && (
                  <Box as="span" aria-hidden="true" mr={1}>
                    🎂
                  </Box>
                )}
                {member.name ??
                  `Unknown ${lowerTerm(terms.memberSingular)}`}
              </Text>
              <Flex
                direction={{ base: "column", md: "row" }}
                align={{ base: "flex-end", md: "center" }}
                gap={{ base: 0, md: 3 }}
                flexShrink={0}
              >
                <Text fontSize={{ base: "sm", md: "md" }}>{display}</Text>
                {relative && (
                  <Text
                    fontSize={{ base: "xs", md: "sm" }}
                    color={isToday ? "pink.500" : "gray.500"}
                    fontWeight={isToday ? "semibold" : "normal"}
                  >
                    {relative}
                  </Text>
                )}
              </Flex>
            </Flex>
          </GroupedListItem>
        );
      })}
    </GroupedList>
  );
};

export default BirthdayList;

import {
  Box,
  Flex,
  List,
  ListItem,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
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
  emptyState,
}: BirthdayListProps) => {
  const cardBg = useColorModeValue("white", "gray.700");
  const todayBg = useColorModeValue("pink.50", "whiteAlpha.100");
  const dividerColor = useColorModeValue("gray.100", "gray.600");

  if (members.length === 0) {
    return <Text color="gray.500">{emptyState}</Text>;
  }

  return (
    <List borderWidth="1px" borderRadius="lg" bg={cardBg} overflow="hidden">
      {members.map((member, index) => {
        const occurrence = birthdayOccurrenceInRange(member, range);
        const display = occurrence
          ? birthdayDisplayDate(occurrence)
          : member.dob ?? "";
        const relative = occurrence
          ? birthdayRelativeLabel(occurrence, asOf)
          : null;
        const isToday = occurrence === asOf;
        return (
          <ListItem
            key={member._id ?? `${member.name ?? "member"}-${index}`}
            px={{ base: 3, md: 5 }}
            py={{ base: 2, md: 3 }}
            bg={isToday ? todayBg : undefined}
            borderLeftWidth="3px"
            borderLeftColor={isToday ? "pink.400" : "transparent"}
            borderTopWidth={index === 0 ? 0 : "1px"}
            borderTopColor={dividerColor}
          >
            <Flex align="center" justify="space-between" gap={3}>
              <Text
                fontWeight="semibold"
                fontSize={{ base: "sm", md: "md" }}
                noOfLines={1}
                minW={0}
              >
                {isToday && (
                  <Box as="span" aria-hidden="true" mr={1}>
                    🎂
                  </Box>
                )}
                {member.name ?? ""}
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
          </ListItem>
        );
      })}
    </List>
  );
};

export default BirthdayList;

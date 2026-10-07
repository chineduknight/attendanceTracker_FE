import {
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
 */
const BirthdayList = ({
  members,
  range,
  asOf,
  emptyState,
}: BirthdayListProps) => {
  const cardBg = useColorModeValue("white", "gray.700");

  if (members.length === 0) {
    return <Text color="gray.500">{emptyState}</Text>;
  }

  return (
    <List spacing={2}>
      {members.map((member, index) => {
        const occurrence = birthdayOccurrenceInRange(member, range);
        const display = occurrence
          ? birthdayDisplayDate(occurrence)
          : member.dob ?? "";
        const relative = occurrence
          ? birthdayRelativeLabel(occurrence, asOf)
          : null;
        return (
          <ListItem
            key={member._id ?? `${member.name ?? "member"}-${index}`}
            borderWidth="1px"
            borderRadius="lg"
            p={3}
            bg={cardBg}
          >
            <Flex align="center" justify="space-between" gap={2} wrap="wrap">
              <Text fontWeight="semibold">{member.name ?? ""}</Text>
              <Flex align="center" gap={2} wrap="wrap">
                <Text>{display}</Text>
                {relative && (
                  <Text fontSize="sm" color="gray.500">
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

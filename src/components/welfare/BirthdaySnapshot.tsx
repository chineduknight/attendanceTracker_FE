import {
  Box,
  Heading,
  List,
  ListItem,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import {
  birthdayDisplayDate,
  birthdayOccurrenceInRange,
  birthdayRelativeLabel,
  BirthdayMember,
  BirthdayRange,
} from "helpers/birthday";
import { WELFARE_BIRTHDAY_SNAPSHOT_DAYS } from "hooks/useWelfareBirthdays";

interface BirthdaySnapshotProps {
  members: BirthdayMember[];
  range: BirthdayRange;
  /** Local business date for Today/Tomorrow labels. */
  asOf: string;
  isFetching: boolean;
  isError: boolean;
}

/**
 * Reuses the existing Birthday API for today through the next 7 days. When
 * Phase 7B `birthdayOccurrence` metadata is present it is calendar truth;
 * otherwise the shared legacy parser anchors the member's dob to this range —
 * no duplicate DOB parsing lives here. A failure is shown locally and never
 * breaks the rest of Welfare.
 */
const BirthdaySnapshot = ({
  members,
  range,
  asOf,
  isFetching,
  isError,
}: BirthdaySnapshotProps) => {
  const terms = useTerms();
  const cardBg = useColorModeValue("white", "gray.700");

  return (
    <Box as="section" aria-label="Upcoming Birthdays" mt={8}>
      <Heading size="md" mb={1}>
        Upcoming Birthdays
      </Heading>
      <Text fontSize="sm" color="gray.500" mb={3}>
        {`Today through the next ${WELFARE_BIRTHDAY_SNAPSHOT_DAYS} days`}
      </Text>
      {isError && members.length === 0 ? (
        <Text color="gray.500">Birthday data is unavailable right now.</Text>
      ) : isFetching && members.length === 0 ? (
        <Text color="gray.500">Loading birthdays...</Text>
      ) : members.length === 0 ? (
        <Text color="gray.500">
          {`No birthdays in the next ${WELFARE_BIRTHDAY_SNAPSHOT_DAYS} days.`}
        </Text>
      ) : (
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
                <Text>
                  {`${member.name ?? `Unknown ${lowerTerm(terms.memberSingular)}`} — ${display}${
                    relative ? ` (${relative})` : ""
                  }`}
                </Text>
              </ListItem>
            );
          })}
        </List>
      )}
    </Box>
  );
};

export default BirthdaySnapshot;

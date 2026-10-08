import { Box, Heading, Text } from "@chakra-ui/react";
import BirthdayList from "components/birthday/BirthdayList";
import { BirthdayMember, BirthdayRange } from "helpers/birthday";
import { WELFARE_BIRTHDAY_SNAPSHOT_DAYS } from "hooks/useWelfareBirthdays";
import { sectionTargetProps } from "components/welfare/welfareSections";

interface BirthdaySnapshotProps {
  members: BirthdayMember[];
  range: BirthdayRange;
  /** Local business date for Today/Tomorrow labels. */
  asOf: string;
  isFetching: boolean;
  isError: boolean;
}

/**
 * Reuses the existing Birthday API for today through the next 7 days, and
 * the Birthday page's own list so occurrence dates (Phase 7B metadata, or
 * the shared legacy parser) are rendered one way everywhere. A failure is
 * shown locally and never breaks the rest of Welfare.
 */
const BirthdaySnapshot = ({
  members,
  range,
  asOf,
  isFetching,
  isError,
}: BirthdaySnapshotProps) => (
  <Box
    as="section"
    aria-label="Upcoming Birthdays"
    mt={8}
    {...sectionTargetProps("birthdays")}
  >
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
    ) : (
      <BirthdayList
        members={members}
        range={range}
        asOf={asOf}
        emptyState={`No birthdays in the next ${WELFARE_BIRTHDAY_SNAPSHOT_DAYS} days.`}
      />
    )}
  </Box>
);

export default BirthdaySnapshot;

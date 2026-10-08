import { Box, Heading, Text } from "@chakra-ui/react";
import BirthdayList from "components/birthday/BirthdayList";
import {
  BirthdayMember,
  BirthdayRange,
  formatBirthdayRangeDate,
} from "helpers/birthday";
import { sectionTargetProps } from "components/welfare/welfareSections";

interface BirthdaySnapshotProps {
  members: BirthdayMember[];
  /** The review range: selected review date through review date + 7. */
  range: BirthdayRange;
  /**
   * Local business today for Today/Tomorrow labels. Deliberately not the
   * review date: a past review must never call an old birthday "Today".
   */
  today: string;
  isFetching: boolean;
  isError: boolean;
}

/**
 * Reuses the existing Birthday API for the selected review range, and the
 * Birthday page's own list so occurrence dates (Phase 7B metadata, or the
 * shared legacy parser) are rendered one way everywhere. A failure is shown
 * locally and never breaks the rest of Welfare.
 */
const BirthdaySnapshot = ({
  members,
  range,
  today,
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
      {`${formatBirthdayRangeDate(range.fromDate)} – ${formatBirthdayRangeDate(
        range.toDate
      )}`}
    </Text>
    {isError && members.length === 0 ? (
      <Text color="gray.500">Birthday data is unavailable right now.</Text>
    ) : isFetching && members.length === 0 ? (
      <Text color="gray.500">Loading birthdays...</Text>
    ) : (
      <BirthdayList
        members={members}
        range={range}
        asOf={today}
        emptyState="No birthdays in this review range."
      />
    )}
  </Box>
);

export default BirthdaySnapshot;

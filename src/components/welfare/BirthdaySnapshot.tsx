import { Box, Heading, Text } from "@chakra-ui/react";
import BirthdayList from "components/birthday/BirthdayList";
import {
  BirthdayMember,
  BirthdayRange,
  formatBirthdayRangeDate,
} from "helpers/birthday";
import { WelfareBirthdayPresentation } from "helpers/welfareReview";
import { sectionTargetProps } from "components/welfare/welfareSections";

interface BirthdaySnapshotProps {
  members: BirthdayMember[];
  /** The review range: selected review date through review date + 7. */
  range: BirthdayRange;
  /** Real local business today; anchors Today/Tomorrow labels only. */
  today: string;
  /** Shared with the summary tile so both always use the same wording. */
  presentation: WelfareBirthdayPresentation;
  isFetching: boolean;
  isError: boolean;
}

/**
 * Reuses the existing Birthday API for the selected review range, and the
 * Birthday page's own list so occurrence dates (Phase 7B metadata, or the
 * shared legacy parser) are rendered one way everywhere. A range that began
 * before today is still shown in full (it is part of the review), just
 * without relative wording. A failure is shown locally and never breaks the
 * rest of Welfare.
 */
const BirthdaySnapshot = ({
  members,
  range,
  today,
  presentation,
  isFetching,
  isError,
}: BirthdaySnapshotProps) => (
  <Box
    as="section"
    aria-label={presentation.label}
    mt={8}
    {...sectionTargetProps("birthdays")}
  >
    <Heading size="md" mb={1}>
      {presentation.label}
    </Heading>
    <Text fontSize="sm" color="fg.muted" mb={3}>
      {`${formatBirthdayRangeDate(range.fromDate)} – ${formatBirthdayRangeDate(
        range.toDate
      )}`}
    </Text>
    {isError && members.length === 0 ? (
      <Text color="fg.muted">Birthday data is unavailable right now.</Text>
    ) : isFetching && members.length === 0 ? (
      <Text color="fg.muted">Loading birthdays...</Text>
    ) : (
      <BirthdayList
        members={members}
        range={range}
        asOf={today}
        showRelativeLabels={presentation.isUpcoming}
        emptyState="No birthdays in this review range."
      />
    )}
  </Box>
);

export default BirthdaySnapshot;

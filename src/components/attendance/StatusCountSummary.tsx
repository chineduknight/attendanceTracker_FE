import { Badge, Flex } from "@chakra-ui/react";
import { StatusCount } from "helpers/attendanceStatuses";

/**
 * Per-status tally as compact pills, e.g. `Present: 12` `Late: 3`. Full labels
 * stay visible because custom statuses' short codes are not self-explanatory.
 */
const StatusCountSummary = ({ counts }: { counts: StatusCount[] }) => (
  <Flex mt="3" gap={2} flexWrap="wrap">
    {counts.map(({ status, count }) => (
      <Badge
        key={status.key || status.label}
        colorScheme={status.color}
        variant="subtle"
        textTransform="none"
        fontWeight="normal"
        fontSize="sm"
        px={2}
        py={0.5}
        borderRadius="full"
      >
        {status.label}: <strong>{count}</strong>
      </Badge>
    ))}
  </Flex>
);

/** One-line plain-text version for confirmation dialogs. */
export const formatStatusCounts = (counts: StatusCount[]): string =>
  counts.map(({ status, count }) => `${status.label}: ${count}`).join(" · ");

export default StatusCountSummary;

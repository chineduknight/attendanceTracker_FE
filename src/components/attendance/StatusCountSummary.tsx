import { Badge, Flex, Text } from "@chakra-ui/react";
import { StatusCount } from "helpers/attendanceStatuses";

/** Per-status tally, e.g. `Present 12 · Late 3 · Absent 4`. */
const StatusCountSummary = ({ counts }: { counts: StatusCount[] }) => (
  <Flex mt="2" gap={3} flexWrap="wrap" justifyContent="space-between">
    {counts.map(({ status, count }) => (
      <Flex key={status.key || status.label} align="center" gap={1}>
        <Badge colorScheme={status.color}>{status.shortLabel}</Badge>
        <Text>
          {status.label}: <strong>{count}</strong>
        </Text>
      </Flex>
    ))}
  </Flex>
);

/** One-line plain-text version for confirmation dialogs. */
export const formatStatusCounts = (counts: StatusCount[]): string =>
  counts.map(({ status, count }) => `${status.label}: ${count}`).join(" · ");

export default StatusCountSummary;

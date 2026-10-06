import { Flex, Text } from "@chakra-ui/react";
import { useTerms } from "hooks/useOrgPresentation";
import { AnalyticsSessionSummary } from "helpers/attendanceAnalyticsInclusion";

/**
 * Raw-session disclosure from the backend. Never derived from table columns:
 * collapse-by-day merges sessions, and excluded sessions have no column.
 */
const SessionSummary = ({ summary }: { summary: AnalyticsSessionSummary }) => {
  const terms = useTerms();
  return (
    <Flex gap={4} flexWrap="wrap" fontSize="sm" mb={3}>
      <Text>{`${terms.attendancePlural} recorded: ${summary.recorded}`}</Text>
      <Text>{`Included in analytics: ${summary.included}`}</Text>
      <Text>{`Excluded: ${summary.excluded}`}</Text>
    </Flex>
  );
};

export default SessionSummary;

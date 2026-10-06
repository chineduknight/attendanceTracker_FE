import { Alert, AlertDescription, AlertIcon, Box, Text } from "@chakra-ui/react";
import {
  AttendanceEligibilityRule,
  summarizeEligibilityRules,
} from "helpers/attendanceEligibility";

interface ExpectedRosterSummaryProps {
  /** e.g. "Expected roster: 10 members". */
  title: string;
  rules: readonly AttendanceEligibilityRule[];
  /** The stored rules no longer fit the current member model. */
  isOutdated?: boolean;
}

/** Read-only "who was expected" line for a session's roster. */
const ExpectedRosterSummary = ({
  title,
  rules,
  isOutdated = false,
}: ExpectedRosterSummaryProps) => (
  <Box mt="3">
    <Text fontWeight="bold">{title}</Text>
    {rules.length > 0 && (
      <Text fontSize="sm" color="gray.500">
        {summarizeEligibilityRules(rules)}
      </Text>
    )}
    {isOutdated && (
      // Informational, so announced politely rather than as an alert.
      <Alert status="info" role="status" mt={2} borderRadius="md" fontSize="sm">
        <AlertIcon />
        <AlertDescription>
          Eligibility rule has changed since this session was created. The roster
          below is the historical snapshot.
        </AlertDescription>
      </Alert>
    )}
  </Box>
);

export default ExpectedRosterSummary;

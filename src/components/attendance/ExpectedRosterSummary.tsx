import { Alert, AlertDescription, AlertIcon, Box, Text } from "@chakra-ui/react";
import {
  AttendanceEligibilityRule,
  summarizeEligibilityRules,
} from "helpers/attendanceEligibility";

interface ExpectedRosterSummaryProps {
  /** e.g. "Expected roster: 10 members" — never including manual additions. */
  title: string;
  rules: readonly AttendanceEligibilityRule[];
  /** The stored rules no longer fit the current member model. */
  isOutdated?: boolean;
  /** Current display label for a rule's storage key. */
  labelFor?: (field: string) => string;
  /** Members added manually to this session only; hidden while zero. */
  manualCount?: number;
  /** Expected plus manual — the whole session roster. */
  rosterCount?: number;
}

/**
 * Read-only "who was expected" line for a session's roster. Manual additions
 * are counted separately so they never inflate the expected roster.
 */
const ExpectedRosterSummary = ({
  title,
  rules,
  isOutdated = false,
  labelFor,
  manualCount = 0,
  rosterCount,
}: ExpectedRosterSummaryProps) => (
  <Box mt="3">
    <Text fontWeight="bold">{title}</Text>
    {manualCount > 0 && (
      <>
        <Text fontSize="sm">{`Added manually: ${manualCount}`}</Text>
        {rosterCount !== undefined && (
          <Text fontSize="sm">{`Session roster: ${rosterCount}`}</Text>
        )}
      </>
    )}
    {rules.length > 0 && (
      <Text fontSize="sm" color="gray.500">
        {summarizeEligibilityRules(rules, labelFor)}
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

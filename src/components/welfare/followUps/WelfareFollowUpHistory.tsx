import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { followUpDateLabel } from "components/welfare/followUps/followUpPresentation";
import { WelfareFollowUp } from "components/welfare/followUps/types";

interface WelfareFollowUpHistoryProps {
  /** Already limited by the section; rendered in backend (recent) order. */
  records: WelfareFollowUp[];
  canManage: boolean;
  isSaving?: boolean;
  onReopen: (record: WelfareFollowUp) => void;
}

/**
 * Compact recent closed records (§19). Closed records are informational —
 * a one-off interaction was already saved closed and must not feel like a
 * "problem" waiting to be resolved. Reopen stays available for manage users.
 */
const WelfareFollowUpHistory = ({
  records,
  canManage,
  isSaving = false,
  onReopen,
}: WelfareFollowUpHistoryProps) => {
  const terms = useTerms();

  if (records.length === 0) {
    return <Text color="gray.500">No follow-up history yet.</Text>;
  }

  return (
    <Stack spacing={2}>
      {records.map((record) => (
        <Box key={record.id} borderWidth="1px" borderRadius="md" px={3} py={2}>
          <Flex align="center" justify="space-between" gap={2}>
            <Text fontSize="sm" fontWeight="semibold">
              {followUpDateLabel(record.recordDate)}
            </Text>
            {canManage && (
              <Button
                size={{ base: "sm", md: "xs" }}
                variant="outline"
                flexShrink={0}
                onClick={() => onReopen(record)}
                isDisabled={isSaving}
              >
                Reopen follow-up
              </Button>
            )}
          </Flex>
          <Text fontWeight="medium">
            {record.member?.name ??
              `Unknown ${lowerTerm(terms.memberSingular)}`}
          </Text>
          <Text fontSize="sm">{record.reason}</Text>
          <Text fontSize="xs" color="gray.500">
            {record.createdBy?.name
              ? `Logged by ${record.createdBy.name}`
              : "Logged by unknown user"}
          </Text>
        </Box>
      ))}
    </Stack>
  );
};

export default WelfareFollowUpHistory;

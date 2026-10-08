import { useMemo } from "react";
import { Badge, Box, Drawer, Flex, Stack, Text, Portal } from "@chakra-ui/react";
import { useTerms } from "hooks/useOrgPresentation";
import { useWelfareFollowUps } from "hooks/useWelfareFollowUps";
import { lowerTerm } from "helpers/organisationPresentation";
import { followUpDateLabel } from "components/welfare/followUps/followUpPresentation";

export interface WelfareFollowUpMemberHistoryRequest {
  organisationId: string;
  memberId: string;
  memberName: string | null;
}

interface WelfareFollowUpMemberHistoryProps {
  request: WelfareFollowUpMemberHistoryRequest;
  onClose: () => void;
}

/**
 * Lightweight per-member history (§27) — all follow-up sources, newest first.
 * Deliberately not a member profile page: it reads the same tenant-scoped
 * follow-up endpoint filtered by memberId.
 */
const WelfareFollowUpMemberHistory = ({
  request,
  onClose,
}: WelfareFollowUpMemberHistoryProps) => {
  const terms = useTerms();
  const { followUps, isLoading, isError } = useWelfareFollowUps(
    request.organisationId,
    { memberId: request.memberId, enabled: true },
  );

  // "Newest first" for the history panel: the list endpoint orders open-first
  // for the overview, so re-order by record date for this view only.
  const ordered = useMemo(
    () =>
      [...followUps].sort((a, b) => {
        const byDate = String(b.recordDate).localeCompare(String(a.recordDate));
        if (byDate !== 0) return byDate;
        return String(b.createdAt ?? "").localeCompare(
          String(a.createdAt ?? ""),
        );
      }),
    [followUps],
  );

  const memberName = request.memberName ?? `member ${request.memberId}`;

  return (
    <Drawer.Root
      open
      placement='end'
      size={{ base: "full", md: "md" }}
      onOpenChange={e => {
        if (!e.open) {
          onClose();
        }
      }}
    >
      <Portal>

        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.CloseTrigger />
            <Drawer.Header>Follow-up history</Drawer.Header>
            <Drawer.Body>
              <Text fontWeight="semibold" mb={4}>
                {memberName}
              </Text>

              {isLoading && <Text color="gray.500">Loading history...</Text>}
              {!isLoading && isError && (
                <Text color="red.500">
                  Follow-up history could not be loaded right now.
                </Text>
              )}
              {!isLoading && !isError && ordered.length === 0 && (
                <Text color="gray.500">{`No follow-ups recorded for this ${lowerTerm(
                  terms.memberSingular,
                )} yet.`}</Text>
              )}

              <Stack gap={3}>
                {ordered.map((record) => (
                  <Box
                    key={record.id}
                    borderWidth="1px"
                    borderRadius="md"
                    px={3}
                    py={2}
                  >
                    <Flex align="center" justify="space-between" gap={2} mb={1}>
                      <Text fontSize="sm" fontWeight="semibold">
                        {followUpDateLabel(record.recordDate)}
                      </Text>
                      <Badge
                        colorPalette={
                          record.workflowStatus === "open" ? "green" : "gray"
                        }
                      >
                        {record.workflowStatus === "open" ? "Open" : "Closed"}
                      </Badge>
                    </Flex>
                    <Text fontWeight="medium">{record.reason}</Text>
                    {record.note && (
                      <Text fontSize="sm" color="gray.600" mt={1}>
                        {record.note}
                      </Text>
                    )}
                    <Text fontSize="xs" color="gray.500" mt={1}>
                      {record.createdBy?.name
                        ? `Logged by ${record.createdBy.name}`
                        : "Logged by unknown user"}
                    </Text>
                  </Box>
                ))}
              </Stack>
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>

      </Portal>
    </Drawer.Root>
  );
};

export default WelfareFollowUpMemberHistory;

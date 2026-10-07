import { Box, Button, Flex, Heading, SimpleGrid, Text } from "@chakra-ui/react";
import { FaPlus } from "react-icons/fa";
import {
  WelfareFollowUp,
  WelfareFollowUpSummary,
} from "components/welfare/followUps/types";
import WelfareFollowUpCard from "components/welfare/followUps/WelfareFollowUpCard";
import WelfareFollowUpHistory from "components/welfare/followUps/WelfareFollowUpHistory";

/** Purely presentational cap: the newest closed records stay visible. */
const RECENT_HISTORY_LIMIT = 5;

interface WelfareFollowUpSectionProps {
  /** Backend summary — undefined until the list loads; never faked as zero. */
  summary?: WelfareFollowUpSummary;
  records: WelfareFollowUp[];
  asOf: string;
  isLoading: boolean;
  isError: boolean;
  /** Edit / close / reopen — welfare.view + welfare.manage. */
  canManage: boolean;
  /**
   * Manual "+ Add welfare follow-up" — also needs members.view because the
   * member picker reads the canonical member list. Insight-based follow-ups
   * know their member already and do not depend on this.
   */
  canCreateManualFollowUp: boolean;
  isSaving?: boolean;
  onAdd: () => void;
  onEdit: (record: WelfareFollowUp) => void;
  onCloseRecord: (record: WelfareFollowUp) => void;
  onReopen: (record: WelfareFollowUp) => void;
  onViewHistory: (record: WelfareFollowUp) => void;
}

const FollowUpStat = ({ label, value }: { label: string; value: number }) => (
  <Box
    borderWidth="1px"
    borderRadius="md"
    px={4}
    py={2}
    role="group"
    aria-label={label}
  >
    <Text fontSize="sm" color="gray.500">
      {label}
    </Text>
    <Text fontSize="xl" fontWeight="bold">
      {value}
    </Text>
  </Box>
);

/**
 * Phase 7C follow-up log (§8). Additive to the 7A insights below it, and
 * deliberately independent: a follow-up failure shows an error instead of
 * zero counts, and never blocks the rest of Welfare.
 */
const WelfareFollowUpSection = ({
  summary,
  records,
  asOf,
  isLoading,
  isError,
  canManage,
  canCreateManualFollowUp,
  isSaving = false,
  onAdd,
  onEdit,
  onCloseRecord,
  onReopen,
  onViewHistory,
}: WelfareFollowUpSectionProps) => {
  const openRecords = records.filter(
    (record) => record.workflowStatus === "open",
  );
  const closedRecords = records
    .filter((record) => record.workflowStatus === "closed")
    .slice(0, RECENT_HISTORY_LIMIT);

  return (
    <Box as="section" aria-label="Follow-ups" mt={8}>
      <Heading size="md" mb={3}>
        Follow-ups
      </Heading>

      {isLoading && <Text color="gray.500">Loading follow-ups...</Text>}

      {!isLoading && (isError || !summary) && (
        <Text color="red.500">
          Follow-up data could not be loaded right now.
        </Text>
      )}

      {!isLoading && summary && (
        <>
          <Flex gap={3} wrap="wrap" mb={4}>
            <FollowUpStat label="Open" value={summary.open} />
            <FollowUpStat label="Due Today" value={summary.dueToday} />
            <FollowUpStat label="Overdue" value={summary.overdue} />
          </Flex>

          {canCreateManualFollowUp && (
            <Button
              size="sm"
              leftIcon={<FaPlus aria-hidden="true" />}
              onClick={onAdd}
              isDisabled={isSaving}
              mb={5}
            >
              Add welfare follow-up
            </Button>
          )}

          <Heading size="sm" mb={2}>
            Open follow-ups
          </Heading>
          {openRecords.length === 0 ? (
            <Text color="gray.500">No open follow-ups.</Text>
          ) : (
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
              {openRecords.map((record) => (
                <WelfareFollowUpCard
                  key={record.id}
                  record={record}
                  asOf={asOf}
                  canManage={canManage}
                  isSaving={isSaving}
                  onEdit={onEdit}
                  onCloseRecord={onCloseRecord}
                  onViewHistory={onViewHistory}
                />
              ))}
            </SimpleGrid>
          )}

          <Heading size="sm" mt={6} mb={2}>
            Recent follow-up history
          </Heading>
          <WelfareFollowUpHistory
            records={closedRecords}
            canManage={canManage}
            isSaving={isSaving}
            onReopen={onReopen}
          />
        </>
      )}
    </Box>
  );
};

export default WelfareFollowUpSection;

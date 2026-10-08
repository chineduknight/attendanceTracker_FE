import { Badge, Box, Button, Flex, HStack, Heading, Text } from "@chakra-ui/react";
import { useColorModeValue } from "../../ui/color-mode";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import {
  followUpDateLabel,
  followUpDueLabel,
  followUpNoteExcerpt,
} from "components/welfare/followUps/followUpPresentation";
import { WelfareFollowUp } from "components/welfare/followUps/types";

/** Phone-sized tap targets; compact on wider screens. */
const ACTION_SIZE = { base: "sm", md: "xs" };

interface WelfareFollowUpCardProps {
  record: WelfareFollowUp;
  /** Business date the due state is read against, same as the list query. */
  asOf: string;
  canManage: boolean;
  isSaving?: boolean;
  onEdit: (record: WelfareFollowUp) => void;
  onCloseRecord: (record: WelfareFollowUp) => void;
  onViewHistory: (record: WelfareFollowUp) => void;
}

/**
 * One open follow-up (§17). Compact and text-first: the due state is always a
 * label (never colour alone), the note is a short excerpt, and edit/close are
 * manage-only while member history stays readable for welfare.view.
 */
const WelfareFollowUpCard = ({
  record,
  asOf,
  canManage,
  isSaving = false,
  onEdit,
  onCloseRecord,
  onViewHistory,
}: WelfareFollowUpCardProps) => {
  const terms = useTerms();
  const cardBg = useColorModeValue("white", "gray.700");
  const memberName =
    record.member?.name ?? `Unknown ${lowerTerm(terms.memberSingular)}`;
  const dueLabel = followUpDueLabel(record, asOf);
  const dueColor =
    dueLabel === "Overdue"
      ? "red.500"
      : dueLabel === "Due today"
      ? "orange.500"
      : "gray.500";
  const noteExcerpt = followUpNoteExcerpt(record.note);

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      p={{ base: 3, md: 4 }}
      bg={cardBg}
      role="group"
      aria-label={record.reason}
    >
      <Flex align="flex-start" justify="space-between" gap={2} mb={1}>
        <Heading size="sm" minW={0} overflowWrap="anywhere">
          {memberName}
        </Heading>
        <Badge colorPalette="green" flexShrink={0}>
          Open
        </Badge>
      </Flex>

      <Text fontWeight="medium" mb={1}>
        {record.reason}
      </Text>
      <Text fontSize="sm" color={dueColor} mb={2}>
        {dueLabel}
      </Text>

      <Text fontSize="sm" mb={1}>
        {record.assignedTo
          ? `Assigned to: ${record.assignedTo.name ?? "Unknown user"}`
          : "Unassigned"}
      </Text>

      {noteExcerpt && (
        <Text fontSize="sm" color="gray.500" mb={2}>
          {noteExcerpt}
        </Text>
      )}

      <Text fontSize="xs" color="gray.500">
        {record.createdBy?.name
          ? `Recorded by ${record.createdBy.name}`
          : "Recorded by unknown user"}
      </Text>
      <Text fontSize="xs" color="gray.500" mb={3}>
        {`Record date: ${followUpDateLabel(record.recordDate)}`}
      </Text>

      <HStack gap={2} wrap="wrap">
        {canManage && (
          <Button
            size={ACTION_SIZE}
            onClick={() => onEdit(record)}
            disabled={isSaving}
          >
            Edit
          </Button>
        )}
        {canManage && (
          <Button
            size={ACTION_SIZE}
            variant="outline"
            onClick={() => onCloseRecord(record)}
            disabled={isSaving}
          >
            Close follow-up
          </Button>
        )}
        {/* Ghost, not link: a link-variant button has no padding and is
            too small a tap target on phones. */}
        <Button
          size={ACTION_SIZE}
          variant="ghost"
          onClick={() => onViewHistory(record)}
          disabled={isSaving}
        >
          Member history
        </Button>
      </HStack>
    </Box>
  );
};

export default WelfareFollowUpCard;

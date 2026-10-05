import { Button, Flex } from "@chakra-ui/react";
import { FaUndo } from "react-icons/fa";
import { AttendanceStatusDefinition } from "helpers/attendanceStatuses";

interface VisibleBulkActionsProps {
  /** Members the current search shows — the only ones a bulk action touches. */
  visibleCount: number;
  /** The quick-mark status, or null in Cycle mode (Apply is then hidden). */
  selectedStatus: AttendanceStatusDefinition | null;
  defaultStatus: AttendanceStatusDefinition;
  canUndo: boolean;
  onApply: () => void;
  onReset: () => void;
  onUndo: () => void;
}

/**
 * Bulk actions over the visible (search-filtered) members. Every label names
 * how many members it affects so the blast radius is obvious before tapping.
 */
const VisibleBulkActions = ({
  visibleCount,
  selectedStatus,
  defaultStatus,
  canUndo,
  onApply,
  onReset,
  onUndo,
}: VisibleBulkActionsProps) => (
  <Flex mt="3" gap={2} flexWrap="wrap">
    {selectedStatus && (
      <Button
        size="sm"
        minH="40px"
        colorScheme={selectedStatus.color}
        isDisabled={visibleCount === 0}
        onClick={onApply}
      >
        {`Apply ${selectedStatus.label} to ${visibleCount} visible`}
      </Button>
    )}
    <Button
      size="sm"
      minH="40px"
      variant="outline"
      isDisabled={visibleCount === 0}
      onClick={onReset}
    >
      {`Reset ${visibleCount} visible to ${defaultStatus.label}`}
    </Button>
    {canUndo && (
      <Button
        size="sm"
        minH="40px"
        variant="ghost"
        leftIcon={<FaUndo aria-hidden />}
        onClick={onUndo}
      >
        Undo bulk change
      </Button>
    )}
  </Flex>
);

export default VisibleBulkActions;

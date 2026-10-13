import { Button, Flex } from "@chakra-ui/react";
import { FaUndo } from "react-icons/fa";
import { AttendanceStatusDefinition } from "helpers/attendanceStatuses";

interface VisibleBulkActionsProps {
  /**
   * Visible (search-filtered) members each action would change — the only
   * ones it touches. Members who may not take a status are not counted.
   */
  applyCount: number;
  resetCount: number;
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
  applyCount,
  resetCount,
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
        minH="44px"
        colorPalette={selectedStatus.color}
        disabled={applyCount === 0}
        onClick={onApply}
      >
        {`Apply ${selectedStatus.label} to ${applyCount} visible`}
      </Button>
    )}
    <Button
      size="sm"
      minH="44px"
      variant="outline"
      disabled={resetCount === 0}
      onClick={onReset}
    >
      {`Reset ${resetCount} visible to ${defaultStatus.label}`}
    </Button>
    {canUndo && (
      <Button size="sm" minH="44px" variant="ghost" onClick={onUndo}><FaUndo aria-hidden />Undo bulk change
              </Button>
    )}
  </Flex>
);

export default VisibleBulkActions;

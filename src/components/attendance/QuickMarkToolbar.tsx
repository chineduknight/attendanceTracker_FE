import { ReactElement } from "react";
import { Button, Flex, Text } from "@chakra-ui/react";
import { FaCheck, FaSyncAlt } from "react-icons/fa";
import { AttendanceStatusDefinition } from "helpers/attendanceStatuses";

/** `null` is Cycle mode; otherwise the active status key every tap assigns. */
export type QuickMarkMode = string | null;

interface QuickMarkToolbarProps {
  /** Active statuses only — inactive statuses are never offered as a mode. */
  statuses: readonly AttendanceStatusDefinition[];
  mode: QuickMarkMode;
  onModeChange: (mode: QuickMarkMode) => void;
}

interface ModeChipProps {
  label: string;
  colorScheme?: string;
  /** Shown while unselected; a selected chip always shows a tick. */
  idleIcon?: ReactElement;
  isSelected: boolean;
  onClick: () => void;
}

/** The selected chip is solid, ticked and `aria-pressed` — never color alone. */
const ModeChip = ({
  label,
  colorScheme,
  idleIcon,
  isSelected,
  onClick,
}: ModeChipProps) => (
  <Button
    size="sm"
    minH="44px"
    flexShrink={0}
    borderWidth="2px"
    colorScheme={colorScheme}
    variant={isSelected ? "solid" : "outline"}
    leftIcon={isSelected ? <FaCheck aria-hidden /> : idleIcon}
    aria-pressed={isSelected}
    onClick={onClick}
  >
    {label}
  </Button>
);

/**
 * Chooses what tapping a member does: Cycle advances through the active
 * statuses as before, while a status chip assigns exactly that status.
 */
const QuickMarkToolbar = ({ statuses, mode, onModeChange }: QuickMarkToolbarProps) => (
  <Flex direction="column" gap={1} mt="4">
    <Text fontSize="sm" color="gray.500" id="quick-mark-label">
      Tap a member to
    </Text>
    <Flex
      role="group"
      aria-labelledby="quick-mark-label"
      gap={2}
      overflowX="auto"
      pb={1}
    >
      <ModeChip
        label="Cycle"
        idleIcon={<FaSyncAlt aria-hidden />}
        isSelected={mode === null}
        onClick={() => onModeChange(null)}
      />
      {statuses.map((status) => (
        <ModeChip
          key={status.key}
          label={status.label}
          colorScheme={status.color}
          isSelected={mode === status.key}
          onClick={() => onModeChange(status.key)}
        />
      ))}
    </Flex>
  </Flex>
);

export default QuickMarkToolbar;

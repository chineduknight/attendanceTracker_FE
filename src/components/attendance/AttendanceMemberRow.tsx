import { memo, ReactNode } from "react";
import { Badge, Box, Button, Flex, Text } from "@chakra-ui/react";
import {
  AttendanceStatusDefinition,
  solidColor,
} from "helpers/attendanceStatuses";

interface AttendanceMemberRowProps {
  memberId: string;
  name: string;
  status: AttendanceStatusDefinition;
  /** Makes the row tappable (marking); omitted for read-only views. */
  onToggle?: (memberId: string) => void;
  /** Added manually to this session only — provenance, not a status. */
  isManual?: boolean;
  /** Secondary detail under the row, e.g. a manual addition's reason. */
  note?: string;
  /** A control beside the row (never nested inside the tappable button). */
  accessory?: ReactNode;
}

export const MANUAL_BADGE_LABEL = "Added manually";

/**
 * One member's attendance row. The default status renders unfilled so the
 * rows a marker has already touched stand out; every other status fills with
 * its configured color and names itself in a badge.
 */
const AttendanceMemberRow = ({
  memberId,
  name,
  status,
  onToggle,
  isManual = false,
  note,
  accessory,
}: AttendanceMemberRowProps) => {
  const isFilled = !status.isDefault;
  const row = (
    <Button
      as={onToggle ? "button" : "div"}
      variant="unstyled"
      onClick={onToggle ? () => onToggle(memberId) : undefined}
      display="block"
      w="full"
      h="auto"
      minH="40px"
      px="3"
      border="1px solid"
      borderColor={isFilled ? solidColor(status.color) : "green"}
      bg={isFilled ? solidColor(status.color) : undefined}
      color={isFilled ? "white" : undefined}
      cursor={onToggle ? "pointer" : "default"}
    >
      <Flex align="center" justify="space-between" gap={2} minH="38px">
        <Text flex="1" textAlign="center" noOfLines={1}>
          {name}
        </Text>
        <Badge
          title={status.label}
          colorScheme={status.color}
          variant={isFilled ? "solid" : "subtle"}
          bg={isFilled ? "whiteAlpha.300" : undefined}
        >
          {status.label}
        </Badge>
        {isManual && (
          <Badge
            colorScheme="purple"
            variant="outline"
            bg={isFilled ? "white" : undefined}
          >
            {MANUAL_BADGE_LABEL}
          </Badge>
        )}
      </Flex>
    </Button>
  );
  return (
    <Box mt="3">
      {accessory ? (
        <Flex align="center" gap={2}>
          <Box flex="1" minW={0}>
            {row}
          </Box>
          {accessory}
        </Flex>
      ) : (
        row
      )}
      {note && (
        <Text fontSize="xs" color="gray.500" mt={1} px={1}>
          {note}
        </Text>
      )}
    </Box>
  );
};

export default memo(AttendanceMemberRow);

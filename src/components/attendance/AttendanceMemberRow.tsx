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
      onClick={onToggle ? () => onToggle(memberId) : undefined}
      display="block"
      w="full"
      h="auto"
      minH="44px"
      pl="4"
      pr="2"
      border="1px solid"
      borderColor={isFilled ? solidColor(status.color) : "green"}
      bg={isFilled ? solidColor(status.color) : undefined}
      color={isFilled ? "white" : undefined}
      cursor={onToggle ? "pointer" : "default"}
      unstyled
    >
      {/* Names lead on the left so a long roster scans like a list; the
          status sits in its own non-shrinking slot so a long name truncates
          instead of running into it. */}
      <Flex align="center" gap={3} minH="42px">
        <Text flex="1" minW={0} textAlign="left" lineClamp={1}>
          {name}
        </Text>
        <Flex flexShrink={0} align="center" gap={1}>
          {/* Untouched rows share the default status, so its badge stays
              quiet; marked rows name their status on the filled row. */}
          <Badge
            title={status.label}
            colorPalette={isFilled ? status.color : "gray"}
            variant={isFilled ? "solid" : "subtle"}
            bg={isFilled ? "whiteAlpha.300" : undefined}
            fontWeight={isFilled ? "bold" : "medium"}
          >
            {status.label}
          </Badge>
          {isManual && (
            <Badge
              colorPalette="purple"
              variant="outline"
              bg={isFilled ? "white" : undefined}
            >
              {MANUAL_BADGE_LABEL}
            </Badge>
          )}
        </Flex>
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

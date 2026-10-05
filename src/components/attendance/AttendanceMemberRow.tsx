import { memo } from "react";
import { Badge, Button, Flex, Text } from "@chakra-ui/react";
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
}

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
}: AttendanceMemberRowProps) => {
  const isFilled = !status.isDefault;
  return (
    <Button
      as={onToggle ? "button" : "div"}
      variant="unstyled"
      onClick={onToggle ? () => onToggle(memberId) : undefined}
      display="block"
      w="full"
      h="auto"
      minH="40px"
      mt="3"
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
      </Flex>
    </Button>
  );
};

export default memo(AttendanceMemberRow);

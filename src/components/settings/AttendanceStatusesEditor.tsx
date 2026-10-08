import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  IconButton,
  Input,
  ListItem,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  UnorderedList,
} from "@chakra-ui/react";
import { FaArrowDown, FaArrowUp, FaTrash } from "react-icons/fa";
import {
  ATTENDANCE_BEHAVIORS,
  ATTENDANCE_STATUS_COLORS,
  AttendanceBehavior,
  AttendanceStatusColor,
  BEHAVIOR_META,
  behaviorDescription,
} from "helpers/attendanceStatuses";
import {
  createStatusRow,
  MAX_ATTENDANCE_STATUSES,
  MAX_STATUS_LABEL_LENGTH,
  MAX_STATUS_SHORT_LABEL_LENGTH,
  moveStatusRow,
  setDefaultStatus,
  StatusRow,
} from "helpers/attendanceStatusSettings";
import { useTerms } from "hooks/useOrgPresentation";

interface AttendanceStatusesEditorProps {
  rows: StatusRow[];
  onChange: (rows: StatusRow[]) => void;
  errors: string[];
  isReadOnly: boolean;
}

const AttendanceStatusesEditor = ({
  rows,
  onChange,
  errors,
  isReadOnly,
}: AttendanceStatusesEditorProps) => {
  const terms = useTerms();
  const [newLabel, setNewLabel] = useState("");

  const updateRow = (key: string, patch: Partial<StatusRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    if (!newLabel.trim()) return;
    onChange([...rows, createStatusRow(newLabel, rows)]);
    setNewLabel("");
  };

  return (
    <Stack spacing={3} as="section" aria-labelledby="attendance-statuses-heading">
      <Heading id="attendance-statuses-heading" size="sm">
        {`${terms.attendanceSingular} statuses`}
      </Heading>
      <Text fontSize="sm" color="gray.600">
        {`${terms.memberPlural} are marked with these statuses, in this order. Each status has a behavior that decides how analytics treat it:`}
      </Text>
      <UnorderedList fontSize="sm" color="gray.600" spacing={1}>
        {ATTENDANCE_BEHAVIORS.map((behavior) => (
          <ListItem key={behavior}>
            <strong>{BEHAVIOR_META[behavior].label}:</strong>{" "}
            {behaviorDescription(behavior, terms.attendanceSingular)}
          </ListItem>
        ))}
      </UnorderedList>

      {rows.map((row, index) => (
        <Box
          key={row.key}
          data-testid={`status-row-${row.key}`}
          borderWidth="1px"
          borderRadius="md"
          p={3}
          opacity={row.active ? 1 : 0.6}
        >
          <Flex justify="space-between" align="center" mb={2} gap={2}>
            <Flex align="center" gap={2} minW={0}>
              <Badge colorScheme={row.color}>{row.shortLabel || "?"}</Badge>
              <Text fontSize="xs" color="gray.500" noOfLines={1}>
                key: {row.key}
              </Text>
            </Flex>
            <Flex gap={1}>
              <IconButton
                aria-label={`Move ${row.label} up`}
                icon={<FaArrowUp />}
                size="xs"
                isDisabled={isReadOnly || index === 0}
                onClick={() => onChange(moveStatusRow(rows, index, -1))}
              />
              <IconButton
                aria-label={`Move ${row.label} down`}
                icon={<FaArrowDown />}
                size="xs"
                isDisabled={isReadOnly || index === rows.length - 1}
                onClick={() => onChange(moveStatusRow(rows, index, 1))}
              />
              {!row.persisted && !isReadOnly && (
                <IconButton
                  aria-label={`Remove ${row.label}`}
                  icon={<FaTrash />}
                  size="xs"
                  colorScheme="red"
                  variant="ghost"
                  onClick={() =>
                    onChange(rows.filter((other) => other.key !== row.key))
                  }
                />
              )}
            </Flex>
          </Flex>

          <Flex gap={2} flexWrap="wrap">
            <FormControl flex="2 1 140px">
              <FormLabel fontSize="xs" mb={1}>
                Label
              </FormLabel>
              <Input
                size="sm"
                maxLength={MAX_STATUS_LABEL_LENGTH}
                value={row.label}
                isReadOnly={isReadOnly}
                onChange={(e) => updateRow(row.key, { label: e.target.value })}
              />
            </FormControl>
            <FormControl flex="1 1 70px">
              <FormLabel fontSize="xs" mb={1}>
                Short label
              </FormLabel>
              <Input
                size="sm"
                maxLength={MAX_STATUS_SHORT_LABEL_LENGTH}
                value={row.shortLabel}
                isReadOnly={isReadOnly}
                onChange={(e) =>
                  updateRow(row.key, { shortLabel: e.target.value })
                }
              />
            </FormControl>
            <FormControl flex="1 1 100px">
              <FormLabel fontSize="xs" mb={1}>
                Color
              </FormLabel>
              <Select
                size="sm"
                value={row.color}
                isDisabled={isReadOnly}
                onChange={(e) =>
                  updateRow(row.key, {
                    color: e.target.value as AttendanceStatusColor,
                  })
                }
              >
                {ATTENDANCE_STATUS_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {color}
                  </option>
                ))}
              </Select>
            </FormControl>
            <FormControl flex="1 1 110px">
              <FormLabel fontSize="xs" mb={1}>
                Behavior
              </FormLabel>
              <Select
                size="sm"
                value={row.behavior}
                // Analytics history depends on it, so it is fixed once saved.
                isDisabled={isReadOnly || row.persisted}
                onChange={(e) =>
                  updateRow(row.key, {
                    behavior: e.target.value as AttendanceBehavior,
                  })
                }
              >
                {ATTENDANCE_BEHAVIORS.map((behavior) => (
                  <option key={behavior} value={behavior}>
                    {BEHAVIOR_META[behavior].label}
                  </option>
                ))}
              </Select>
            </FormControl>
          </Flex>

          <Flex gap={6} mt={2}>
            <FormControl display="flex" alignItems="center" w="auto">
              <FormLabel fontSize="sm" mb={0} htmlFor={`active-${row.key}`}>
                Active
              </FormLabel>
              <Switch
                id={`active-${row.key}`}
                isChecked={row.active}
                isDisabled={isReadOnly}
                onChange={(e) =>
                  updateRow(row.key, { active: e.target.checked })
                }
              />
            </FormControl>
            <Radio
              name="default-attendance-status"
              value={row.key}
              isChecked={row.isDefault}
              isDisabled={isReadOnly}
              onChange={() => onChange(setDefaultStatus(rows, row.key))}
            >
              <Text fontSize="sm">Default</Text>
            </Radio>
          </Flex>
        </Box>
      ))}

      {!isReadOnly && (
        <Flex gap={2}>
          <Input
            size="sm"
            placeholder="New status label, e.g. Late"
            aria-label="New status label"
            maxLength={MAX_STATUS_LABEL_LENGTH}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRow();
              }
            }}
          />
          <Button
            size="sm"
            onClick={addRow}
            isDisabled={!newLabel.trim() || rows.length >= MAX_ATTENDANCE_STATUSES}
          >
            Add status
          </Button>
        </Flex>
      )}
      <Text fontSize="xs" color="gray.500">
        Saved statuses can be deactivated but not deleted, so past sessions keep
        their meaning. New marking sessions start at the default status.
      </Text>

      {errors.length > 0 && (
        <UnorderedList
          role="alert"
          fontSize="sm"
          color="red.500"
          spacing={1}
          ml={4}
        >
          {errors.map((error) => (
            <ListItem key={error}>{error}</ListItem>
          ))}
        </UnorderedList>
      )}
    </Stack>
  );
};

export default AttendanceStatusesEditor;

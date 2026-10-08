import { useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Heading,
  IconButton,
  Input,
  Radio,
  NativeSelect,
  Stack,
  Switch,
  Text,
  Field,
  List,
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
    <Stack gap={3} as="section" aria-labelledby="attendance-statuses-heading">
      <Heading id="attendance-statuses-heading" size="sm">
        {`${terms.attendanceSingular} statuses`}
      </Heading>
      <Text fontSize="sm" color="gray.600">
        {`${terms.memberPlural} are marked with these statuses, in this order. Each status has a behavior that decides how analytics treat it:`}
      </Text>
      <List.Root as='ul' fontSize="sm" color="gray.600" gap={1}>
        {ATTENDANCE_BEHAVIORS.map((behavior) => (
          <List.Item key={behavior}>
            <strong>{BEHAVIOR_META[behavior].label}:</strong>{" "}
            {behaviorDescription(behavior, terms.attendanceSingular)}
          </List.Item>
        ))}
      </List.Root>

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
              <Badge colorPalette={row.color}>{row.shortLabel || "?"}</Badge>
              <Text fontSize="xs" color="gray.500" lineClamp={1}>
                key: {row.key}
              </Text>
            </Flex>
            <Flex gap={1}>
              <IconButton
                aria-label={`Move ${row.label} up`}
                size="xs"
                disabled={isReadOnly || index === 0}
                onClick={() => onChange(moveStatusRow(rows, index, -1))}><FaArrowUp /></IconButton>
              <IconButton
                aria-label={`Move ${row.label} down`}
                size="xs"
                disabled={isReadOnly || index === rows.length - 1}
                onClick={() => onChange(moveStatusRow(rows, index, 1))}><FaArrowDown /></IconButton>
              {!row.persisted && !isReadOnly && (
                <IconButton
                  aria-label={`Remove ${row.label}`}
                  size="xs"
                  colorPalette="red"
                  variant="ghost"
                  onClick={() =>
                    onChange(rows.filter((other) => other.key !== row.key))
                  }><FaTrash /></IconButton>
              )}
            </Flex>
          </Flex>

          <Flex gap={2} flexWrap="wrap">
            <Field.Root flex="2 1 140px">
              <Field.Label fontSize="xs" mb={1}>
                Label
              </Field.Label>
              <Input
                size="sm"
                maxLength={MAX_STATUS_LABEL_LENGTH}
                value={row.label}
                readOnly={isReadOnly}
                onChange={(e) => updateRow(row.key, { label: e.target.value })}
              />
            </Field.Root>
            <Field.Root flex="1 1 70px">
              <Field.Label fontSize="xs" mb={1}>
                Short label
              </Field.Label>
              <Input
                size="sm"
                maxLength={MAX_STATUS_SHORT_LABEL_LENGTH}
                value={row.shortLabel}
                readOnly={isReadOnly}
                onChange={(e) =>
                  updateRow(row.key, { shortLabel: e.target.value })
                }
              />
            </Field.Root>
            <Field.Root flex="1 1 100px">
              <Field.Label fontSize="xs" mb={1}>
                Color
              </Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field
                  size="sm"
                  value={row.color}
                  disabled={isReadOnly}
                  onValueChange={(e) =>
                    updateRow(row.key, {
                      color: e.target.value as AttendanceStatusColor,
                    })
                  }>
                  {ATTENDANCE_STATUS_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            <Field.Root flex="1 1 110px">
              <Field.Label fontSize="xs" mb={1}>
                Behavior
              </Field.Label>
              <NativeSelect.Root>
                <NativeSelect.Field
                  size="sm"
                  value={row.behavior}
                  disabled={isReadOnly || row.persisted}
                  onValueChange={(e) =>
                    updateRow(row.key, {
                      behavior: e.target.value as AttendanceBehavior,
                    })
                  }>
                  {ATTENDANCE_BEHAVIORS.map((behavior) => (
                    <option key={behavior} value={behavior}>
                      {BEHAVIOR_META[behavior].label}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
          </Flex>

          <Flex gap={6} mt={2}>
            <Field.Root display="flex" alignItems="center" w="auto">
              <Field.Label fontSize="sm" mb={0} htmlFor={`active-${row.key}`}>
                Active
              </Field.Label>
              <Switch
                id={`active-${row.key}`}
                checked={row.active}
                disabled={isReadOnly}
                onValueChange={(e) =>
                  updateRow(row.key, { active: e.target.checked })
                }
              />
            </Field.Root>
            <Radio
              name="default-attendance-status"
              value={row.key}
              checked={row.isDefault}
              disabled={isReadOnly}
              onValueChange={() => onChange(setDefaultStatus(rows, row.key))}
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
            disabled={!newLabel.trim() || rows.length >= MAX_ATTENDANCE_STATUSES}
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
        <List.Root as='ul' role="alert" fontSize="sm" color="red.500" gap={1} ml={4}>
          {errors.map((error) => (
            <List.Item key={error}>{error}</List.Item>
          ))}
        </List.Root>
      )}
    </Stack>
  );
};

export default AttendanceStatusesEditor;

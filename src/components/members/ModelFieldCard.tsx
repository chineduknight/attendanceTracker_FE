import { Badge, Box, Button, Checkbox, Flex, Input, NativeSelect, Stack, Text, Field } from "@chakra-ui/react";
import { FaLock, FaTimesCircle } from "react-icons/fa";
import { MEMBER_FIELD_TYPES } from "helpers/memberFields";
import { EditorField, FieldErrors } from "helpers/memberModelEditor";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface ModelFieldCardProps {
  field: EditorField;
  errors?: FieldErrors;
  onChange: (patch: Partial<EditorField>) => void;
  /** Only unsaved fields can be removed. */
  onRemove?: () => void;
}

const ModelFieldCard = ({ field, errors, onChange, onRemove }: ModelFieldCardProps) => {
  const terms = useTerms();
  const keyHelp = `Internal key is used by stored ${lowerTerm(
    terms.memberSingular,
  )} records and eligibility rules and cannot be renamed after saving.`;
  const saved = field.persisted;
  const isPinned = field.pinned;
  const id = field.reactKey;
  const keyLocked = saved || isPinned;
  return (
    <Stack gap={3} borderWidth="1px" borderRadius="md" p={4}>
      <Flex align="center" justify="space-between" gap={2}>
        <Flex align="center" gap={2} minW={0}>
          <Text fontWeight="bold" lineClamp={1}>
            {field.label.trim() || "New field"}
          </Text>
          <Badge colorPalette={saved ? "gray" : "green"}>{saved ? "Saved" : "New"}</Badge>
        </Flex>
        {onRemove ? (
          <Button size="sm" variant='plain' colorPalette="red" onClick={onRemove}><FaTimesCircle aria-hidden />Remove
                      </Button>
        ) : (
          saved && (
            <Flex align="center" gap={1} color="gray.500" fontSize="xs">
              <FaLock aria-hidden />
              <Text>Saved fields can't be removed yet</Text>
            </Flex>
          )
        )}
      </Flex>

      <Field.Root id={`${id}-label`} required invalid={Boolean(errors?.label)}>
        <Field.Label mb="1">Display label</Field.Label>
        <Input
          value={field.label}
          placeholder="e.g. Voice Part"
          onValueChange={(e) => onChange({ label: e.target.value })}
        />
        <Field.ErrorText>{errors?.label}</Field.ErrorText>
      </Field.Root>

      <Field.Root id={`${id}-key`} required invalid={Boolean(errors?.name)}>
        <Field.Label mb="1">Internal field key</Field.Label>
        <Input
          value={field.name}
          placeholder="e.g. voice_part"
          readOnly={keyLocked}
          bg={keyLocked ? "blackAlpha.50" : undefined}
          onValueChange={(e) => onChange({ name: e.target.value, keyEdited: true })}
        />
        {errors?.name ? (
          <Field.ErrorText>{errors.name}</Field.ErrorText>
        ) : (
          <Field.HelperText>{keyHelp}</Field.HelperText>
        )}
      </Field.Root>

      <Field.Root id={`${id}-type`}>
        <Field.Label mb="1">Field type</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            value={field.type}
            disabled={keyLocked}
            onValueChange={(e) => onChange({ type: e.target.value })}>
            {MEMBER_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        {saved && !isPinned && (
          <Field.HelperText>A saved field's type can't be changed.</Field.HelperText>
        )}
      </Field.Root>

      {field.type === "option" && (
        <Field.Root id={`${id}-options`} required invalid={Boolean(errors?.options)}>
          <Field.Label mb="1">Options</Field.Label>
          <Input
            value={field.optionsText}
            placeholder="Soprano, Alto, Tenor, Bass"
            onValueChange={(e) =>
              onChange({ optionsText: e.target.value, optionsEdited: true })
            }
          />
          {errors?.options ? (
            <Field.ErrorText>{errors.options}</Field.ErrorText>
          ) : (
            <Field.HelperText>Separate options with commas.</Field.HelperText>
          )}
        </Field.Root>
      )}

      <Box>
        <Checkbox.Root
          disabled={isPinned}
          onCheckedChange={(e) => onChange({ required: e.target.checked })}
          checked={field.required}
        ><Checkbox.HiddenInput /><Checkbox.Control><Checkbox.Indicator /></Checkbox.Control><Checkbox.Label>Required
                    </Checkbox.Label></Checkbox.Root>
      </Box>
    </Stack>
  );
};

export default ModelFieldCard;

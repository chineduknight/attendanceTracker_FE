import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  Select,
  Stack,
  Text,
} from "@chakra-ui/react";
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
    <Stack spacing={3} borderWidth="1px" borderRadius="md" p={4}>
      <Flex align="center" justify="space-between" gap={2}>
        <Flex align="center" gap={2} minW={0}>
          <Text fontWeight="bold" noOfLines={1}>
            {field.label.trim() || "New field"}
          </Text>
          <Badge colorScheme={saved ? "gray" : "green"}>{saved ? "Saved" : "New"}</Badge>
        </Flex>
        {onRemove ? (
          <Button
            size="sm"
            variant="link"
            colorScheme="red"
            leftIcon={<FaTimesCircle aria-hidden />}
            onClick={onRemove}
          >
            Remove
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

      <FormControl id={`${id}-label`} isRequired isInvalid={Boolean(errors?.label)}>
        <FormLabel mb="1">Display label</FormLabel>
        <Input
          value={field.label}
          placeholder="e.g. Voice Part"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <FormErrorMessage>{errors?.label}</FormErrorMessage>
      </FormControl>

      <FormControl id={`${id}-key`} isRequired isInvalid={Boolean(errors?.name)}>
        <FormLabel mb="1">Internal field key</FormLabel>
        <Input
          value={field.name}
          placeholder="e.g. voice_part"
          isReadOnly={keyLocked}
          bg={keyLocked ? "blackAlpha.50" : undefined}
          onChange={(e) => onChange({ name: e.target.value, keyEdited: true })}
        />
        {errors?.name ? (
          <FormErrorMessage>{errors.name}</FormErrorMessage>
        ) : (
          <FormHelperText>{keyHelp}</FormHelperText>
        )}
      </FormControl>

      <FormControl id={`${id}-type`}>
        <FormLabel mb="1">Field type</FormLabel>
        <Select
          value={field.type}
          isDisabled={keyLocked}
          onChange={(e) => onChange({ type: e.target.value })}
        >
          {MEMBER_FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
        {saved && !isPinned && (
          <FormHelperText>A saved field's type can't be changed.</FormHelperText>
        )}
      </FormControl>

      {field.type === "option" && (
        <FormControl id={`${id}-options`} isRequired isInvalid={Boolean(errors?.options)}>
          <FormLabel mb="1">Options</FormLabel>
          <Input
            value={field.optionsText}
            placeholder="Soprano, Alto, Tenor, Bass"
            onChange={(e) =>
              onChange({ optionsText: e.target.value, optionsEdited: true })
            }
          />
          {errors?.options ? (
            <FormErrorMessage>{errors.options}</FormErrorMessage>
          ) : (
            <FormHelperText>Separate options with commas.</FormHelperText>
          )}
        </FormControl>
      )}

      <Box>
        <Checkbox
          isChecked={field.required}
          isDisabled={isPinned}
          onChange={(e) => onChange({ required: e.target.checked })}
        >
          Required
        </Checkbox>
      </Box>
    </Stack>
  );
};

export default ModelFieldCard;

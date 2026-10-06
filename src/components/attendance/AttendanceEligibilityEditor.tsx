import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import ReactSelect, { MultiValue } from "react-select";
import { capitalizeFirstLetter } from "helpers/stringManipulations";
import {
  AttendanceEligibilityRule,
  EligibilityField,
  setRuleValues,
  summarizeEligibilityRules,
} from "helpers/attendanceEligibility";

type ValueOption = { value: string; label: string };

/** Load state of the member model the fields come from. */
export type MemberFieldsStatus = "loading" | "error" | "ready";

interface AttendanceEligibilityEditorProps {
  /** Option-type member fields only. */
  fields: readonly EligibilityField[];
  fieldsStatus: MemberFieldsStatus;
  rules: AttendanceEligibilityRule[];
  onChange: (rules: AttendanceEligibilityRule[]) => void;
  /** Members matching `rules`, or null while the roster is unknown. */
  expectedCount: number | null;
  totalCount: number;
}

const toOption = (value: string): ValueOption => ({
  value,
  label: capitalizeFirstLetter(value),
});

/**
 * Chooses who is expected at a new session from the organisation's option
 * fields. The preview count is advisory; the backend resolves the roster.
 */
const AttendanceEligibilityEditor = ({
  fields,
  fieldsStatus,
  rules,
  onChange,
  expectedCount,
  totalCount,
}: AttendanceEligibilityEditorProps) => {
  const selectedValues = (field: string) =>
    rules.find((rule) => rule.field === field)?.values ?? [];

  return (
    <Stack spacing={3} borderWidth="1px" borderRadius="md" p={3}>
      <Box aria-live="polite">
        <Text fontWeight="bold">
          {expectedCount === null
            ? "Expected members: counting…"
            : `Expected members: ${expectedCount} of ${totalCount}`}
        </Text>
        <Text fontSize="sm" color="gray.500">
          {rules.length
            ? summarizeEligibilityRules(rules)
            : "Everyone is expected"}
        </Text>
        {expectedCount === 0 && (
          <Text fontSize="sm" color="red.500" mt={1}>
            {rules.length
              ? "No members match these eligibility rules."
              : "This organisation has no members yet."}
          </Text>
        )}
      </Box>

      {fieldsStatus === "loading" ? (
        <Text fontSize="sm" color="gray.500">
          Loading member fields…
        </Text>
      ) : fieldsStatus === "error" ? (
        <Text fontSize="sm" color="red.500">
          Member fields could not be loaded, so everyone is expected.
        </Text>
      ) : fields.length === 0 ? (
        <Text fontSize="sm" color="gray.500">
          Add option fields to the member model to limit who is expected.
        </Text>
      ) : (
        <>
          {fields.map((field) => {
            const label = capitalizeFirstLetter(field.name);
            const options = field.options.map(toOption);
            const selected = selectedValues(field.name);
            return (
              <Box key={field.name}>
                <Text fontSize="sm" fontWeight="bold" mb={1}>
                  {label}
                </Text>
                <ReactSelect
                  isMulti
                  aria-label={`${label} eligibility`}
                  placeholder={`Any ${label.toLowerCase()}`}
                  options={options}
                  value={options.filter((o) => selected.includes(o.value))}
                  closeMenuOnSelect={false}
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                  onChange={(picked: MultiValue<ValueOption>) =>
                    onChange(
                      setRuleValues(
                        rules,
                        field.name,
                        picked.map((o) => o.value),
                      ),
                    )
                  }
                />
              </Box>
            );
          })}
          <Text fontSize="xs" color="gray.500">
            Within a field, any selected value may match. Across fields, all
            selected fields must match.
          </Text>
          {rules.length > 0 && (
            <Flex>
              <Button size="sm" variant="outline" onClick={() => onChange([])}>
                Clear eligibility
              </Button>
            </Flex>
          )}
        </>
      )}
    </Stack>
  );
};

export default AttendanceEligibilityEditor;

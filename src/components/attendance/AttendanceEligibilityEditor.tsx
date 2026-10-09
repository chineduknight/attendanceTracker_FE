import { useMemo } from "react";
import { Box, Button, Flex, Stack, Text } from "@chakra-ui/react";
import { MultiValue } from "react-select";
import { ThemedSelect } from "components/ui/themed-select";
import { capitalizeFirstLetter } from "helpers/stringManipulations";
import { memberFieldLabeler } from "helpers/memberFields";
import {
  AttendanceEligibilityRule,
  EligibilityField,
  setRuleValues,
  summarizeEligibilityRules,
} from "helpers/attendanceEligibility";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

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
  const terms = useTerms();
  const members = lowerTerm(terms.memberPlural);
  const labelFor = useMemo(() => memberFieldLabeler(fields), [fields]);
  // Labels needn't be unique, so a repeated label is disambiguated by its key.
  const repeatedLabels = useMemo(() => {
    const counts = new Map<string, number>();
    fields.forEach((f) => counts.set(f.label, (counts.get(f.label) ?? 0) + 1));
    return new Set(Array.from(counts).filter(([, n]) => n > 1).map(([label]) => label));
  }, [fields]);
  // Stored rules use lowercased field names and may differ in option casing.
  const selectedValues = (field: string) =>
    (
      rules.find((rule) => rule.field.toLowerCase() === field.toLowerCase())
        ?.values ?? []
    ).map((value) => value.toLowerCase());

  // Edit an applied template's rule in place rather than adding a duplicate.
  const storedFieldName = (field: string) =>
    rules.find((rule) => rule.field.toLowerCase() === field.toLowerCase())
      ?.field ?? field;

  return (
    <Stack gap={3} borderWidth="1px" borderRadius="md" p={3}>
      <Box aria-live="polite">
        <Text fontWeight="bold">
          {expectedCount === null
            ? `Expected ${members}: counting…`
            : `Expected ${members}: ${expectedCount} of ${totalCount}`}
        </Text>
        <Text fontSize="sm" color="gray.500">
          {rules.length
            ? summarizeEligibilityRules(rules, labelFor)
            : "Everyone is expected"}
        </Text>
        {expectedCount === 0 && (
          <Text fontSize="sm" color="red.500" mt={1}>
            {rules.length
              ? `No ${members} match these eligibility rules.`
              : `This organisation has no ${members} yet.`}
          </Text>
        )}
      </Box>

      {fieldsStatus === "loading" ? (
        <Text fontSize="sm" color="gray.500">
          {`Loading ${lowerTerm(terms.memberSingular)} fields…`}
        </Text>
      ) : fieldsStatus === "error" ? (
        <Text fontSize="sm" color="red.500">
          {`${terms.memberSingular} fields could not be loaded, so everyone is expected.`}
        </Text>
      ) : fields.length === 0 ? (
        <Text fontSize="sm" color="gray.500">
          {`Add option fields to the ${lowerTerm(
            terms.memberSingular,
          )} model to limit who is expected.`}
        </Text>
      ) : (
        <>
          {fields.map((field) => {
            // Shown as the field's label; the rule is still keyed by `field.name`.
            const label = field.label;
            const options = field.options.map(toOption);
            const selected = selectedValues(field.name);
            return (
              <Box key={field.name}>
                <Text fontSize="sm" fontWeight="bold" mb={1}>
                  {label}
                </Text>
                <ThemedSelect
                  isMulti
                  aria-label={`${
                    repeatedLabels.has(label) ? `${label} (${field.name})` : label
                  } eligibility`}
                  placeholder={`Any ${label.toLowerCase()}`}
                  options={options}
                  value={options.filter((o) =>
                    selected.includes(o.value.toLowerCase())
                  )}
                  closeMenuOnSelect={false}
                  onChange={(picked: MultiValue<ValueOption>) =>
                    onChange(
                      setRuleValues(
                        rules,
                        storedFieldName(field.name),
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
              <Button size="sm" minH="44px" variant="outline" onClick={() => onChange([])}>
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

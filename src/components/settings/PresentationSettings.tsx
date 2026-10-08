import { Box, Heading, Input, SimpleGrid, Stack, Text, Field } from "@chakra-ui/react";
import { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { FormSwitch } from "components/ui/switch";
import { OrgSettingsForm } from "helpers/orgPayloads";
import {
  FEATURE_LABELS,
  OPTIONAL_FEATURES,
  TERM_GROUPS,
  termError,
} from "helpers/organisationPresentation";

interface PresentationSettingsProps {
  register: UseFormRegister<OrgSettingsForm>;
  errors: FieldErrors<OrgSettingsForm>;
  /** `settings.view` without `settings.manage`. */
  isReadOnly: boolean;
}

const validateTerm = (value: string) => termError(value) ?? true;

/** Organisation terminology: display words only, never API fields. */
export const TerminologySettings = ({ register, errors, isReadOnly }: PresentationSettingsProps) => (
  <Stack gap={3}>
    <Box>
      <Heading size="sm">Terminology</Heading>
      <Text fontSize="sm" color="gray.500">
        These labels change what officers see. They do not rename stored data or API fields.
      </Text>
    </Box>
    {TERM_GROUPS.map(({ title, singular, plural }) => (
      <SimpleGrid key={title} columns={{ base: 1, sm: 2 }} gap={3}>
        {[
          { key: singular, label: `${title} singular` },
          { key: plural, label: `${title} plural` },
        ].map(({ key, label }) => (
          <Field.Root key={key} invalid={Boolean(errors.terminology?.[key])} required>
            <Field.Label mb="1">{label}</Field.Label>
            <Input
              readOnly={isReadOnly}
              {...register(`terminology.${key}`, { validate: validateTerm })}
            />
            <Field.ErrorText>{errors.terminology?.[key]?.message}</Field.ErrorText>
          </Field.Root>
        ))}
      </SimpleGrid>
    ))}
  </Stack>
);

/** Optional modules shown in this organisation's navigation. */
interface FeatureVisibilitySettingsProps {
  control: Control<OrgSettingsForm>;
  /** `settings.view` without `settings.manage`. */
  isReadOnly: boolean;
}

export const FeatureVisibilitySettings = ({ control, isReadOnly }: FeatureVisibilitySettingsProps) => (
  <Stack gap={3}>
    <Box>
      <Heading size="sm">Visible modules</Heading>
      <Text fontSize="sm" color="gray.500">
        Hidden modules are removed from this organisation's navigation. Permissions are unchanged.
      </Text>
    </Box>
    {OPTIONAL_FEATURES.map((feature) => (
      <Field.Root key={feature} display="flex" alignItems="center" justifyContent="space-between">
        <Field.Label htmlFor={`feature-${feature}`} mb="0">
          {FEATURE_LABELS[feature]}
        </Field.Label>
        <FormSwitch
          id={`feature-${feature}`}
          disabled={isReadOnly}
          control={control}
          name={`featureVisibility.${feature}`}
        />
      </Field.Root>
    ))}
  </Stack>
);

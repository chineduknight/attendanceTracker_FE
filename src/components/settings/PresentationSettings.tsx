import {
  Box,
  FormControl,
  FormErrorMessage,
  FormLabel,
  Heading,
  Input,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { FieldErrors, UseFormRegister } from "react-hook-form";
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
  <Stack spacing={3}>
    <Box>
      <Heading size="sm">Terminology</Heading>
      <Text fontSize="sm" color="gray.500">
        These labels change what officers see. They do not rename stored data or API fields.
      </Text>
    </Box>
    {TERM_GROUPS.map(({ title, singular, plural }) => (
      <SimpleGrid key={title} columns={{ base: 1, sm: 2 }} spacing={3}>
        {[
          { key: singular, label: `${title} singular` },
          { key: plural, label: `${title} plural` },
        ].map(({ key, label }) => (
          <FormControl key={key} isInvalid={Boolean(errors.terminology?.[key])} isRequired>
            <FormLabel mb="1">{label}</FormLabel>
            <Input
              isReadOnly={isReadOnly}
              {...register(`terminology.${key}`, { validate: validateTerm })}
            />
            <FormErrorMessage>{errors.terminology?.[key]?.message}</FormErrorMessage>
          </FormControl>
        ))}
      </SimpleGrid>
    ))}
  </Stack>
);

/** Optional modules shown in this organisation's navigation. */
export const FeatureVisibilitySettings = ({ register, isReadOnly }: PresentationSettingsProps) => (
  <Stack spacing={3}>
    <Box>
      <Heading size="sm">Visible modules</Heading>
      <Text fontSize="sm" color="gray.500">
        Hidden modules are removed from this organisation's navigation. Permissions are unchanged.
      </Text>
    </Box>
    {OPTIONAL_FEATURES.map((feature) => (
      <FormControl key={feature} display="flex" alignItems="center" justifyContent="space-between">
        <FormLabel htmlFor={`feature-${feature}`} mb="0">
          {FEATURE_LABELS[feature]}
        </FormLabel>
        <Switch
          id={`feature-${feature}`}
          isDisabled={isReadOnly}
          {...register(`featureVisibility.${feature}`)}
        />
      </FormControl>
    ))}
  </Stack>
);

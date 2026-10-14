import { Box, Heading, RadioGroup, Stack, Text } from "@chakra-ui/react";
import { Control, useController } from "react-hook-form";
import { OrgSettingsForm } from "helpers/orgPayloads";
import {
  ATTENDANCE_SHARE_TEMPLATE_OPTIONS,
  isAttendanceShareTemplate,
} from "helpers/attendanceShareTemplate";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

interface AttendanceShareTemplateSettingsProps {
  control: Control<OrgSettingsForm>;
  /** `settings.view` without `settings.manage`. */
  isReadOnly: boolean;
}

/**
 * The layout of the WhatsApp message shared from View Attendance. Wording
 * only: it never changes the figures or any stored record.
 */
const AttendanceShareTemplateSettings = ({
  control,
  isReadOnly,
}: AttendanceShareTemplateSettingsProps) => {
  const terms = useTerms();
  const { field } = useController({ control, name: "attendanceShareTemplate" });

  return (
    <Stack gap={3}>
      <Box>
        <Heading size="sm">{`${terms.attendanceSingular} sharing`}</Heading>
        <Text fontSize="sm" color="fg.muted">
          {`How the message shared from a saved ${lowerTerm(
            terms.attendanceSingular,
          )} is worded. The counts are the same in both.`}
        </Text>
      </Box>
      <RadioGroup.Root
        name={field.name}
        value={field.value}
        disabled={isReadOnly}
        onValueChange={({ value }) => {
          if (isAttendanceShareTemplate(value)) field.onChange(value);
        }}
      >
        <RadioGroup.Label mb={2}>Sharing template</RadioGroup.Label>
        <Stack gap={2}>
          {ATTENDANCE_SHARE_TEMPLATE_OPTIONS.map(({ value, label, description }) => (
            <RadioGroup.Item
              key={value}
              value={value}
              alignItems="flex-start"
              minH="44px"
              borderWidth="1px"
              borderColor="border"
              rounded="md"
              p={3}
            >
              <RadioGroup.ItemHiddenInput onBlur={field.onBlur} />
              <RadioGroup.ItemIndicator mt="0.5" />
              <RadioGroup.ItemText>
                <Text as="span" display="block" fontWeight="medium">
                  {label}
                </Text>
                <Text as="span" display="block" fontSize="sm" color="fg.muted">
                  {description}
                </Text>
              </RadioGroup.ItemText>
            </RadioGroup.Item>
          ))}
        </Stack>
      </RadioGroup.Root>
    </Stack>
  );
};

export default AttendanceShareTemplateSettings;

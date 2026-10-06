import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Select,
  Stack,
  Text,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { toast } from "react-toastify";
import { CategoryType } from "hooks/useCategories";
import { useAttendanceTemplates } from "hooks/useAttendanceTemplates";
import {
  AttendanceTemplate,
  isStale,
  templateFieldsError,
  templateStaleness,
  TemplateStaleness,
  toTemplateFields,
} from "helpers/attendanceTemplates";
import {
  AttendanceEligibilityRule,
  MemberModelField,
} from "helpers/attendanceEligibility";
import { AttendanceDetails } from "components/attendance/AttendanceDetailsForm";

/** The details a template fills in — everything except the date. */
export type TemplateDetails = Omit<AttendanceDetails, "date">;

/** What applying a template fills in on Create Attendance. */
export interface AppliedTemplate {
  details: TemplateDetails;
  eligibilityRules: AttendanceEligibilityRule[];
}

interface AttendanceTemplatePickerProps {
  organisationId: string;
  /** Current form values; the source for Save as / Update template. */
  details: AttendanceDetails;
  eligibilityRules: AttendanceEligibilityRule[];
  categories: CategoryType[];
  memberFields: MemberModelField[];
  /** Staleness is only judged once the category tree and member model are known. */
  setupLoaded: boolean;
  /** Categories or member fields failed to load, so no template can be applied. */
  setupFailed: boolean;
  onApply: (applied: AppliedTemplate) => void;
}

const toApplied = (template: AttendanceTemplate): AppliedTemplate => ({
  details: {
    name: template.name,
    categoryId: template.categoryId ?? "",
    subCategoryId: template.subCategoryId ?? "",
  },
  eligibilityRules: template.eligibilityRules,
});

const staleReason = ({ category, eligibility }: TemplateStaleness): string =>
  [
    ...(category ? ["Its category or sub-category no longer exists."] : []),
    ...eligibility,
  ].join(" ");

/**
 * Picks, saves, updates and deletes the organisation's attendance templates.
 * A template fills name, category placement and eligibility rules; the date
 * stays with the session being created. Templates that no longer fit the
 * organisation's categories or member model stay visible as "Needs update"
 * and cannot be applied until repaired — never silently widened to Everyone.
 */
const AttendanceTemplatePicker = ({
  organisationId,
  details,
  eligibilityRules,
  categories,
  memberFields,
  setupLoaded,
  setupFailed,
  onApply,
}: AttendanceTemplatePickerProps) => {
  const { templates, isLoading, isError, create, update, remove, isSaving } =
    useAttendanceTemplates(organisationId);
  const [selectedId, setSelectedId] = useState("");

  const stalenessById = useMemo(() => {
    const stale = new Map<string, TemplateStaleness>();
    if (!setupLoaded) return stale;
    templates.forEach((template) => {
      const staleness = templateStaleness(template, categories, memberFields);
      if (isStale(staleness)) stale.set(template.id, staleness);
    });
    return stale;
  }, [templates, categories, memberFields, setupLoaded]);
  const selected = templates.find((template) => template.id === selectedId);
  const selectedStaleness = selected ? stalenessById.get(selected.id) : undefined;
  const canApply = Boolean(selected) && setupLoaded && !selectedStaleness;

  const apply = (template: AttendanceTemplate) => onApply(toApplied(template));

  const onSelect = (id: string) => {
    setSelectedId(id);
    const template = templates.find((t) => t.id === id);
    if (template && setupLoaded && !stalenessById.has(id)) apply(template);
  };

  /** Validates the current form values for saving over `excludeId` (or new). */
  const validFields = (excludeId?: string) => {
    const fields = toTemplateFields(details, eligibilityRules);
    const error = templateFieldsError(fields, templates, excludeId);
    if (error) {
      toast.error(error);
      return null;
    }
    return fields;
  };

  const onSaveAsNew = () => {
    const fields = validFields();
    if (!fields) return;
    create(fields, {
      onSuccess: (template) => {
        toast.success(`Saved "${template.name}" as a template`);
        setSelectedId(template.id);
      },
    });
  };

  const onUpdate = () => {
    if (!selected) return;
    const fields = validFields(selected.id);
    if (!fields) return;
    update(selected.id, fields, {
      onSuccess: (template) => toast.success(`Updated "${template.name}"`),
    });
  };

  const onDelete = () => {
    if (!selected) return;
    const deletedId = selected.id;
    confirmAlert({
      title: "Delete template",
      message: `Delete the "${selected.name}" template? The details you have entered stay as they are.`,
      buttons: [
        {
          label: "Yes",
          className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () =>
            remove(deletedId, {
              onSuccess: () => {
                toast.success("Template deleted");
                setSelectedId((current) =>
                  current === deletedId ? "" : current
                );
              },
            }),
        },
        {
          label: "No",
          className: "confirm-alert-button confirm-alert-button-no",
        },
      ],
    });
  };

  return (
    <Stack spacing={3}>
      <FormControl id="attendanceTemplate">
        {isError ? (
          <Text fontSize="sm" color="red.500">
            Templates could not be loaded. You can still fill in the details
            below.
          </Text>
        ) : templates.length === 0 && !isLoading ? (
          <Text fontSize="sm" color="gray.500">
            No templates yet. Fill in the details below and save them as a
            template to reuse them next time.
          </Text>
        ) : (
          <>
            <FormLabel mb="0">Template</FormLabel>
            <Select
              placeholder={
                isLoading ? "Loading templates…" : "Choose a template"
              }
              // A template deleted elsewhere drops out of the list; show no selection.
              value={selected?.id ?? ""}
              isDisabled={isLoading || isSaving}
              onChange={(e) => onSelect(e.target.value)}
            >
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {stalenessById.has(template.id)
                    ? `${template.name} (Needs update)`
                    : template.name}
                </option>
              ))}
            </Select>
          </>
        )}
        {selected && setupFailed && (
          <FormHelperText color="red.500">
            Templates can't be applied until categories and member fields load.
          </FormHelperText>
        )}
        {selectedStaleness && (
          <FormHelperText>
            <Badge colorScheme="orange" mr={2}>
              Needs update
            </Badge>
            {staleReason(selectedStaleness)} Fix it below, then update the
            template.
          </FormHelperText>
        )}
      </FormControl>

      <Flex gap={2} flexWrap="wrap">
        {selected && (
          <>
            <Button
              size="sm"
              variant="outline"
              colorScheme="blue"
              onClick={() => apply(selected)}
              isDisabled={!canApply}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onUpdate}
              isDisabled={isSaving}
            >
              Update template
            </Button>
            <Button
              size="sm"
              variant="outline"
              colorScheme="red"
              onClick={onDelete}
              isDisabled={isSaving}
            >
              Delete template
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={onSaveAsNew}
          isDisabled={isLoading || isSaving}
        >
          Save as template
        </Button>
      </Flex>
    </Stack>
  );
};

export default AttendanceTemplatePicker;

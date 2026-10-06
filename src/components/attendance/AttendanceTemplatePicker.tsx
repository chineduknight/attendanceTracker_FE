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
  usesEligibility,
} from "helpers/attendanceTemplates";
import {
  AttendanceEligibilityRule,
  MemberModelField,
} from "helpers/attendanceEligibility";
import { AttendanceDetails } from "components/attendance/AttendanceDetailsForm";
import { useTerms } from "hooks/useOrgPresentation";
import {
  lowerTerm,
  OrganisationTerminology,
} from "helpers/organisationPresentation";

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
  /**
   * The organisation's eligibility setting. Off, templates with rules stay
   * listed but cannot be applied or overwritten — never silently widened.
   */
  eligibilityEnabled: boolean;
  categories: CategoryType[];
  memberFields: MemberModelField[];
  /** Staleness is only judged once the category tree and member model are known. */
  setupLoaded: boolean;
  /** Setup data failed to load, so no template can be applied. */
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

const staleReason = (
  { category, eligibility }: TemplateStaleness,
  terms: OrganisationTerminology,
): string =>
  [
    ...(category
      ? [
          `Its ${lowerTerm(terms.categorySingular)} or ${lowerTerm(
            terms.subCategorySingular,
          )} no longer exists.`,
        ]
      : []),
    ...eligibility,
  ].join(" ");

/**
 * Picks, saves, updates and deletes the organisation's attendance templates.
 * A template fills name, category placement and eligibility rules; the date
 * stays with the session being created. Templates that no longer fit the
 * organisation's categories or member model stay visible as "Needs update"
 * and cannot be applied until repaired — never silently widened to Everyone.
 * Likewise, while eligibility is off a template with rules is shown as
 * requiring eligibility and is neither applied nor updated; its stored rules
 * are untouched and it works again once eligibility is re-enabled.
 */
const AttendanceTemplatePicker = ({
  organisationId,
  details,
  eligibilityRules,
  eligibilityEnabled,
  categories,
  memberFields,
  setupLoaded,
  setupFailed,
  onApply,
}: AttendanceTemplatePickerProps) => {
  const terms = useTerms();
  const { templates, isLoading, isError, create, update, remove, isSaving } =
    useAttendanceTemplates(organisationId);
  const [selectedId, setSelectedId] = useState("");

  const needsEligibility = (template: AttendanceTemplate) =>
    !eligibilityEnabled && usesEligibility(template);

  const stalenessById = useMemo(() => {
    const stale = new Map<string, TemplateStaleness>();
    if (!setupLoaded) return stale;
    templates.forEach((template) => {
      // Unavailable for another reason; its rules are not judged while off.
      if (!eligibilityEnabled && usesEligibility(template)) return;
      const staleness = templateStaleness(template, categories, memberFields, terms);
      if (isStale(staleness)) stale.set(template.id, staleness);
    });
    return stale;
  }, [templates, categories, memberFields, setupLoaded, eligibilityEnabled, terms]);
  const selected = templates.find((template) => template.id === selectedId);
  const selectedStaleness = selected ? stalenessById.get(selected.id) : undefined;
  const selectedNeedsEligibility = Boolean(selected && needsEligibility(selected));
  const canApply =
    Boolean(selected) && setupLoaded && !selectedStaleness && !selectedNeedsEligibility;

  const apply = (template: AttendanceTemplate) => onApply(toApplied(template));

  const onSelect = (id: string) => {
    setSelectedId(id);
    const template = templates.find((t) => t.id === id);
    if (
      template &&
      setupLoaded &&
      !stalenessById.has(id) &&
      !needsEligibility(template)
    ) {
      apply(template);
    }
  };

  /** Validates the current form values for saving over `excludeId` (or new). */
  const validFields = (excludeId?: string) => {
    const fields = toTemplateFields(details, eligibilityRules);
    const error = templateFieldsError(fields, templates, excludeId, terms);
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
    // The form has no rules while off; saving would widen the template.
    if (!selected || selectedNeedsEligibility) return;
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
                  {needsEligibility(template)
                    ? `${template.name} (Requires eligibility)`
                    : stalenessById.has(template.id)
                      ? `${template.name} (Needs update)`
                      : template.name}
                </option>
              ))}
            </Select>
          </>
        )}
        {selected && setupFailed && (
          <FormHelperText color="red.500">
            {eligibilityEnabled
              ? `Templates can't be applied until ${lowerTerm(
                  terms.categoryPlural,
                )} and ${lowerTerm(terms.memberSingular)} fields load.`
              : `Templates can't be applied until ${lowerTerm(
                  terms.categoryPlural,
                )} load.`}
          </FormHelperText>
        )}
        {selectedNeedsEligibility && (
          <FormHelperText>
            <Badge colorScheme="purple" mr={2}>
              Requires eligibility
            </Badge>
            {`Uses ${lowerTerm(
              terms.attendanceSingular,
            )} eligibility. Enable eligibility in Organisation Settings to use this template.`}
          </FormHelperText>
        )}
        {selectedStaleness && (
          <FormHelperText>
            <Badge colorScheme="orange" mr={2}>
              Needs update
            </Badge>
            {staleReason(selectedStaleness, terms)} Fix it below, then update the
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
              isDisabled={isSaving || selectedNeedsEligibility}
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

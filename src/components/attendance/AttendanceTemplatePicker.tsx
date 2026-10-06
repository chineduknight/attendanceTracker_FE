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
  AttendanceTemplateFields,
  isTemplateStale,
  templateFieldsError,
  toTemplateFields,
} from "helpers/attendanceTemplates";
import { AttendanceDetails } from "components/attendance/AttendanceDetailsForm";

/** The details a template fills in — everything except the date. */
export type TemplateDetails = Omit<AttendanceDetails, "date">;

interface AttendanceTemplatePickerProps {
  organisationId: string;
  /** Current form values; the source for Save as / Update template. */
  details: AttendanceDetails;
  categories: CategoryType[];
  /** Staleness is only judged once the category tree is known. */
  categoriesLoaded: boolean;
  onApply: (details: TemplateDetails) => void;
}

const toDetails = (template: AttendanceTemplateFields): TemplateDetails => ({
  name: template.name,
  categoryId: template.categoryId ?? "",
  subCategoryId: template.subCategoryId ?? "",
});

/**
 * Picks, saves, updates and deletes the organisation's attendance templates.
 * A template only ever fills name/category/sub-category; the date stays with
 * the session being created. Templates whose category placement no longer
 * exists stay visible as "Needs update" and cannot be applied until repaired.
 */
const AttendanceTemplatePicker = ({
  organisationId,
  details,
  categories,
  categoriesLoaded,
  onApply,
}: AttendanceTemplatePickerProps) => {
  const { templates, isLoading, isError, create, update, remove, isSaving } =
    useAttendanceTemplates(organisationId);
  const [selectedId, setSelectedId] = useState("");

  const staleIds = useMemo(
    () =>
      new Set(
        categoriesLoaded
          ? templates
              .filter((template) => isTemplateStale(template, categories))
              .map((template) => template.id)
          : []
      ),
    [templates, categories, categoriesLoaded]
  );
  const selected = templates.find((template) => template.id === selectedId);
  const isSelectedStale = selected ? staleIds.has(selected.id) : false;
  const canApply = Boolean(selected) && categoriesLoaded && !isSelectedStale;

  const apply = (template: AttendanceTemplate) => onApply(toDetails(template));

  const onSelect = (id: string) => {
    setSelectedId(id);
    const template = templates.find((t) => t.id === id);
    if (template && categoriesLoaded && !staleIds.has(id)) apply(template);
  };

  /** Validates the current form values for saving over `excludeId` (or new). */
  const validFields = (excludeId?: string) => {
    const fields = toTemplateFields(details);
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
                  {staleIds.has(template.id)
                    ? `${template.name} (Needs update)`
                    : template.name}
                </option>
              ))}
            </Select>
          </>
        )}
        {isSelectedStale && (
          <FormHelperText>
            <Badge colorScheme="orange" mr={2}>
              Needs update
            </Badge>
            Its category or sub-category no longer exists. Choose current ones
            below, then update the template.
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

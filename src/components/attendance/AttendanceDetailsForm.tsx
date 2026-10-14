import { Input, Stack, Field } from "@chakra-ui/react";
import { OptionSelect } from "components/ui/themed-select";
import { DateField, todayValue } from "components/ui/date-field";
import { CategoryType } from "hooks/useCategories";
import { useTerms } from "hooks/useOrgPresentation";

export interface AttendanceDetails {
  name: string;
  categoryId: string;
  subCategoryId: string;
  date: string; // YYYY-MM-DD
}

interface AttendanceDetailsFormProps {
  value: AttendanceDetails;
  onChange: (next: AttendanceDetails) => void;
  categories: CategoryType[];
}

const AttendanceDetailsForm = ({
  value,
  onChange,
  categories,
}: AttendanceDetailsFormProps) => {
  const terms = useTerms();
  const subCategories =
    categories.find((c) => c.id === value.categoryId)?.subCategories ?? [];
  // Sessions are recorded for today or the past, never the future. The cap is
  // the user's LOCAL calendar day; DateField enforces it for typed dates too.

  return (
    <Stack gap={4}>
      <Field.Root id="name" required>
        <Field.Label mb="0">Name</Field.Label>
        <Input
          type="text"
          placeholder={`${terms.attendanceSingular} Name`}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </Field.Root>

      <Field.Root id="category">
        <Field.Label mb="0">{terms.categorySingular}</Field.Label>
        <OptionSelect
          placeholder="Select option"
          options={categories.map((category) => ({
            value: category.id,
            label: category.name,
          }))}
          value={value.categoryId}
          // Changing the category invalidates any previously chosen sub-category.
          onChange={(categoryId) =>
            onChange({ ...value, categoryId, subCategoryId: "" })
          }
          onClear={() => onChange({ ...value, categoryId: "", subCategoryId: "" })}
        />
      </Field.Root>

      <Field.Root id="subCategory" disabled={subCategories.length === 0}>
        <Field.Label mb="0">{terms.subCategorySingular}</Field.Label>
        <OptionSelect
          placeholder="Select option"
          options={subCategories.map((sub) => ({ value: sub.id, label: sub.name }))}
          value={value.subCategoryId}
          onChange={(subCategoryId) => onChange({ ...value, subCategoryId })}
          onClear={() => onChange({ ...value, subCategoryId: "" })}
        />
      </Field.Root>

      <Field.Root id="date" required>
        <Field.Label mb="0">Date</Field.Label>
        <DateField
          value={value.date}
          onChange={(date) => onChange({ ...value, date })}
          max={todayValue()}
        />
      </Field.Root>
    </Stack>
  );
};

export default AttendanceDetailsForm;

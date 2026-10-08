import { Input, NativeSelect, Stack, Field } from "@chakra-ui/react";
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
        <NativeSelect.Root>
          <NativeSelect.Field
            placeholder="Select option"
            value={value.categoryId}
            onChange={(e) =>
              // Changing the category invalidates any previously chosen sub-category.
              onChange({ ...value, categoryId: e.target.value, subCategoryId: "" })
            }>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      <Field.Root id="subCategory" disabled={subCategories.length === 0}>
        <Field.Label mb="0">{terms.subCategorySingular}</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field
            placeholder="Select option"
            value={value.subCategoryId}
            onChange={(e) => onChange({ ...value, subCategoryId: e.target.value })}>
            {subCategories.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
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

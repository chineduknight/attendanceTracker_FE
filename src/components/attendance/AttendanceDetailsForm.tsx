import { FormControl, FormLabel, Input, Select, Stack } from "@chakra-ui/react";
import { CategoryType } from "hooks/useCategories";

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
  const subCategories =
    categories.find((c) => c.id === value.categoryId)?.subCategories ?? [];
  // Cap at the user's LOCAL calendar day. toISOString() would use the UTC day,
  // which is already "tomorrow" for evening users in timezones behind UTC.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <Stack spacing={4}>
      <FormControl id="name" isRequired>
        <FormLabel mb="0">Name</FormLabel>
        <Input
          type="text"
          placeholder="Attendance Name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </FormControl>

      <FormControl id="category">
        <FormLabel mb="0">Category</FormLabel>
        <Select
          placeholder="Select option"
          value={value.categoryId}
          onChange={(e) =>
            // Changing the category invalidates any previously chosen sub-category.
            onChange({ ...value, categoryId: e.target.value, subCategoryId: "" })
          }
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </FormControl>

      <FormControl id="subCategory">
        <FormLabel mb="0">Sub Category</FormLabel>
        <Select
          placeholder="Select option"
          value={value.subCategoryId}
          isDisabled={subCategories.length === 0}
          onChange={(e) => onChange({ ...value, subCategoryId: e.target.value })}
        >
          {subCategories.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </Select>
      </FormControl>

      <FormControl id="date" isRequired>
        <FormLabel mb="0">Date</FormLabel>
        <Input
          type="date"
          max={today}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </FormControl>
    </Stack>
  );
};

export default AttendanceDetailsForm;

import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Select,
  Stack,
} from "@chakra-ui/react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format, isValid, parseISO } from "date-fns";
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
  // the user's LOCAL calendar day; the picker enforces it for typed dates too,
  // which a native <input type="date" max> does not (and iOS ignores max).
  const today = new Date();
  const selectedDate = value.date ? parseISO(value.date) : null;

  return (
    <Stack spacing={4}>
      <FormControl id="name" isRequired>
        <FormLabel mb="0">Name</FormLabel>
        <Input
          type="text"
          placeholder={`${terms.attendanceSingular} Name`}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </FormControl>

      <FormControl id="category">
        <FormLabel mb="0">{terms.categorySingular}</FormLabel>
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
        <FormLabel mb="0">{terms.subCategorySingular}</FormLabel>
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
        <Box sx={{ ".react-datepicker-wrapper": { width: "100%" } }}>
          <DatePicker
            selected={selectedDate && isValid(selectedDate) ? selectedDate : null}
            onChange={(date: Date | null) =>
              onChange({ ...value, date: date ? format(date, "yyyy-MM-dd") : "" })
            }
            maxDate={today}
            dateFormat="MMM d, yyyy"
            placeholderText="Select date"
            customInput={<Input />}
          />
        </Box>
      </FormControl>
    </Stack>
  );
};

export default AttendanceDetailsForm;

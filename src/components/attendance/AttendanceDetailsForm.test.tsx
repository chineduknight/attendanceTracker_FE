import { render, screen, fireEvent } from "@testing-library/react";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";
import { CategoryType } from "hooks/useCategories";

const categories: CategoryType[] = [
  {
    id: "c1",
    name: "Sunday Service",
    status: "active",
    subCategories: [
      { id: "s1", name: "First Mass", status: "active", parentCategoryId: "c1" },
      { id: "s2", name: "Second Mass", status: "active", parentCategoryId: "c1" },
    ],
  },
  { id: "c2", name: "Weekday", status: "active", subCategories: [] },
];

const base: AttendanceDetails = { name: "", categoryId: "", subCategoryId: "", date: "" };

it("renders all four fields", () => {
  render(<AttendanceDetailsForm value={base} onChange={() => {}} categories={categories} />);
  // Name and Date are required, so Chakra appends a "*" indicator to the
  // accessible label — match with a regex rather than the exact string.
  expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
  expect(screen.getByLabelText("Category")).toBeInTheDocument();
  expect(screen.getByLabelText("Sub Category")).toBeInTheDocument();
  expect(screen.getByLabelText(/Date/)).toBeInTheDocument();
});

it("shows sub-categories of the selected category", () => {
  render(
    <AttendanceDetailsForm
      value={{ ...base, categoryId: "c1" }}
      onChange={() => {}}
      categories={categories}
    />,
  );
  expect(screen.getByRole("option", { name: "First Mass" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Second Mass" })).toBeInTheDocument();
});

it("clears the sub-category when the category changes", () => {
  const onChange = jest.fn();
  render(
    <AttendanceDetailsForm
      value={{ ...base, categoryId: "c1", subCategoryId: "s1" }}
      onChange={onChange}
      categories={categories}
    />,
  );
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "c2" } });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ categoryId: "c2", subCategoryId: "" }),
  );
});

it("emits name edits", () => {
  const onChange = jest.fn();
  render(<AttendanceDetailsForm value={base} onChange={onChange} categories={categories} />);
  fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "First Mass" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "First Mass" }));
});

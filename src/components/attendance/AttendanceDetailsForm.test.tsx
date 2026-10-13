import { act, screen, fireEvent } from "@testing-library/react";
import { render } from "test-utils/render";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";
import { CategoryType } from "hooks/useCategories";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { DEFAULT_TERMINOLOGY } from "helpers/organisationPresentation";

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
  {
    id: "c2",
    name: "Weekday",
    status: "active",
    subCategories: [
      { id: "s3", name: "Weekday Mass", status: "active", parentCategoryId: "c2" },
    ],
  },
];

afterEach(() => act(() => useGlobalStore.setState({ organisation: EMPTY_ORG })));

const base: AttendanceDetails = { name: "", categoryId: "", subCategoryId: "", date: "" };

it("renders all four fields", () => {
  render(<AttendanceDetailsForm value={base} onChange={() => {}} categories={categories} />);
  // Name and Date are required, so Chakra appends a "*" indicator to the
  // accessible label — match with a regex rather than the exact string.
  expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
  expect(screen.getByLabelText("Category")).toBeInTheDocument();
  expect(screen.getByLabelText("Sub-category")).toBeInTheDocument();
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
  // Only the selected category's sub-categories show — not another category's.
  expect(
    screen.queryByRole("option", { name: "Weekday Mass" }),
  ).not.toBeInTheDocument();
});

it("shows no sub-category options when no category is selected", () => {
  render(<AttendanceDetailsForm value={base} onChange={() => {}} categories={categories} />);
  expect(
    screen.queryByRole("option", { name: "First Mass" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Weekday Mass" }),
  ).not.toBeInTheDocument();
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

it("labels category fields with the organisation's terms but keeps category ids", () => {
  useGlobalStore.setState({
    organisation: {
      ...EMPTY_ORG,
      terminology: {
        ...DEFAULT_TERMINOLOGY,
        categorySingular: "Activity",
        subCategorySingular: "Activity type",
      },
    },
  });
  const onChange = jest.fn();
  render(<AttendanceDetailsForm value={base} onChange={onChange} categories={categories} />);

  fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "c1" } });

  expect(screen.getByLabelText("Activity type")).toBeInTheDocument();
  expect(onChange).toHaveBeenCalledWith({ ...base, categoryId: "c1", subCategoryId: "" });
});


describe("date", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 8, 21, 30));
  });
  afterEach(() => jest.useRealTimers());

  it("emits the picked day as a local YYYY-MM-DD business date", () => {
    const onChange = jest.fn();
    render(<AttendanceDetailsForm value={base} onChange={onChange} categories={categories} />);
    fireEvent.change(screen.getByLabelText(/Date/), { target: { value: "Oct 7, 2026" } });
    expect(onChange).toHaveBeenCalledWith({ ...base, date: "2026-10-07" });
  });

  it("accepts today", () => {
    const onChange = jest.fn();
    render(<AttendanceDetailsForm value={base} onChange={onChange} categories={categories} />);
    fireEvent.change(screen.getByLabelText(/Date/), { target: { value: "Oct 8, 2026" } });
    expect(onChange).toHaveBeenCalledWith({ ...base, date: "2026-10-08" });
  });

  it("rejects a typed future date", () => {
    const onChange = jest.fn();
    render(<AttendanceDetailsForm value={base} onChange={onChange} categories={categories} />);
    fireEvent.change(screen.getByLabelText(/Date/), { target: { value: "Oct 9, 2026" } });
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-10-09" }),
    );
  });

  it("disables future days in the calendar", async () => {
    render(
      <AttendanceDetailsForm
        value={{ ...base, date: "2026-10-08" }}
        onChange={() => {}}
        categories={categories}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Date/));
    // Let the calendar popper finish positioning inside act.
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByRole("option", { name: /October 9th, 2026/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("option", { name: /October 8th, 2026/ })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });
});

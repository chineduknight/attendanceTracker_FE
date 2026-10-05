import { CategoryType } from "hooks/useCategories";
import { AttendanceDetails } from "components/attendance/AttendanceDetailsForm";
import {
  AttendanceTemplate,
  isTemplateStale,
  templateFieldsError,
  toTemplateFields,
  TEMPLATE_NAME_MAX_LENGTH,
} from "helpers/attendanceTemplates";

const categories: CategoryType[] = [
  {
    id: "c1",
    name: "Rehearsal",
    status: "active",
    subCategories: [
      { id: "s1", name: "Choir", status: "active", parentCategoryId: "c1" },
    ],
  },
  { id: "c2", name: "Service", status: "active", subCategories: [] },
];

const template = (over: Partial<AttendanceTemplate>): AttendanceTemplate => ({
  id: "t1",
  organisationId: "org1",
  name: "Thursday Rehearsal",
  categoryId: null,
  subCategoryId: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...over,
});

describe("isTemplateStale", () => {
  it.each([
    ["no category placement", {}, false],
    ["an existing category", { categoryId: "c2" }, false],
    ["an existing category and sub-category", { categoryId: "c1", subCategoryId: "s1" }, false],
    ["a missing category", { categoryId: "gone" }, true],
    ["a missing sub-category", { categoryId: "c1", subCategoryId: "gone" }, true],
    ["a sub-category under another category", { categoryId: "c2", subCategoryId: "s1" }, true],
    ["a sub-category without a category", { subCategoryId: "s1" }, true],
  ])("with %s -> %s", (_label, over, stale) => {
    expect(isTemplateStale(template(over), categories)).toBe(stale);
  });
});

describe("toTemplateFields", () => {
  it("trims the name, maps blank selects to null and never carries the date", () => {
    const details: AttendanceDetails = {
      name: "  Thursday Rehearsal ",
      categoryId: "c1",
      subCategoryId: "",
      date: "2026-10-01",
    };
    const fields = toTemplateFields(details);
    expect(fields).toEqual({
      name: "Thursday Rehearsal",
      categoryId: "c1",
      subCategoryId: null,
    });
  });
});

describe("templateFieldsError", () => {
  const existing = [template({ id: "t1", name: "Thursday Rehearsal" })];
  const fields = (name: string) => ({ name, categoryId: null, subCategoryId: null });

  it("requires a name", () => {
    expect(templateFieldsError(fields(""), existing)).toMatch(/Enter an attendance name/);
  });

  it("caps the name length", () => {
    expect(
      templateFieldsError(fields("x".repeat(TEMPLATE_NAME_MAX_LENGTH + 1)), existing)
    ).toMatch(/at most/);
  });

  it("blocks a case-insensitive duplicate", () => {
    expect(templateFieldsError(fields("thursday rehearsal"), existing)).toMatch(
      /already exists/
    );
  });

  it("lets a template keep its own name on update", () => {
    expect(templateFieldsError(fields("Thursday Rehearsal"), existing, "t1")).toBeNull();
  });
});

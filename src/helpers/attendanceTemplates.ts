import type { CategoryType } from "hooks/useCategories";

/**
 * A reusable shortcut for the Create Attendance form. It only carries the
 * session name and its category placement — never a date, members, statuses
 * or eligibility — so it can never become a second source of attendance truth.
 */
export interface AttendanceTemplate {
  id: string;
  organisationId: string;
  name: string;
  categoryId: string | null;
  subCategoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The only fields a template create/update may send (the backend rejects others). */
export type AttendanceTemplateFields = Pick<
  AttendanceTemplate,
  "name" | "categoryId" | "subCategoryId"
>;

/** Mirrors the backend's validator. */
export const TEMPLATE_NAME_MAX_LENGTH = 80;

/** The template fields of a details form; blank selects mean "no category". */
export const toTemplateFields = (details: {
  name: string;
  categoryId: string;
  subCategoryId: string;
}): AttendanceTemplateFields => ({
  name: details.name.trim(),
  categoryId: details.categoryId || null,
  subCategoryId: details.subCategoryId || null,
});

/**
 * Whether a template's stored category placement no longer matches the
 * organisation's active category tree: the category or sub-category is gone,
 * or the sub-category has moved under another category.
 */
export const isTemplateStale = (
  template: AttendanceTemplateFields,
  categories: readonly CategoryType[],
): boolean => {
  const { categoryId, subCategoryId } = template;
  if (!categoryId) return Boolean(subCategoryId);
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return true;
  return Boolean(
    subCategoryId &&
      !category.subCategories.some((sub) => sub.id === subCategoryId),
  );
};

const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * The template, other than `excludeId`, whose name matches `name`
 * case-insensitively — the same rule the backend enforces.
 */
const findTemplateNamed = (
  templates: readonly AttendanceTemplate[],
  name: string,
  excludeId?: string,
): AttendanceTemplate | undefined =>
  templates.find(
    (template) =>
      template.id !== excludeId && nameKey(template.name) === nameKey(name),
  );

/**
 * Client-side validation for saving `fields` as a template; `null` when valid.
 * The backend stays authoritative — this only catches the obvious cases early.
 */
export const templateFieldsError = (
  fields: AttendanceTemplateFields,
  templates: readonly AttendanceTemplate[],
  excludeId?: string,
): string | null => {
  if (!fields.name) return "Enter an attendance name to save it as a template";
  if (fields.name.length > TEMPLATE_NAME_MAX_LENGTH) {
    return `Template names can be at most ${TEMPLATE_NAME_MAX_LENGTH} characters`;
  }
  if (findTemplateNamed(templates, fields.name, excludeId)) {
    return `A template named "${fields.name}" already exists`;
  }
  return null;
};

import type { CategoryType } from "hooks/useCategories";
import {
  AttendanceEligibilityRule,
  eligibilityIssues,
  MemberModelField,
  normalizeEligibilityRules,
} from "helpers/attendanceEligibility";

/**
 * A reusable shortcut for the Create Attendance form: the session name, its
 * category placement and who is expected. It never carries a date, members or
 * statuses, so it can never become a second source of attendance truth.
 */
export interface AttendanceTemplate {
  id: string;
  organisationId: string;
  name: string;
  categoryId: string | null;
  subCategoryId: string | null;
  eligibilityRules: AttendanceEligibilityRule[];
  createdAt: string;
  updatedAt: string;
}

/** The only fields a template create/update may send (the backend rejects others). */
export type AttendanceTemplateFields = Pick<
  AttendanceTemplate,
  "name" | "categoryId" | "subCategoryId" | "eligibilityRules"
>;

/** Mirrors the backend's validator. */
export const TEMPLATE_NAME_MAX_LENGTH = 80;

/** A template as the API returned it; older templates may lack rules. */
export type AttendanceTemplateResponse = Omit<AttendanceTemplate, "eligibilityRules"> & {
  eligibilityRules?: unknown;
};

/** Templates saved before eligibility existed mean Everyone (`[]`). */
export const normalizeTemplate = (
  template: AttendanceTemplateResponse,
): AttendanceTemplate => ({
  ...template,
  eligibilityRules: normalizeEligibilityRules(template.eligibilityRules),
});

/**
 * The template fields of the Create Attendance form. Blank selects mean "no
 * category", and rules are always sent explicitly — `[]` clears them.
 */
export const toTemplateFields = (
  details: { name: string; categoryId: string; subCategoryId: string },
  eligibilityRules: readonly AttendanceEligibilityRule[],
): AttendanceTemplateFields => ({
  name: details.name.trim(),
  categoryId: details.categoryId || null,
  subCategoryId: details.subCategoryId || null,
  eligibilityRules: normalizeEligibilityRules(eligibilityRules),
});

/**
 * Whether a template's stored category placement no longer matches the
 * organisation's active category tree: the category or sub-category is gone,
 * or the sub-category has moved under another category.
 */
export const isCategoryPlacementStale = (
  template: Pick<AttendanceTemplate, "categoryId" | "subCategoryId">,
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

/** Which parts of a template no longer fit the organisation's current setup. */
export interface TemplateStaleness {
  category: boolean;
  eligibility: boolean;
}

export const templateStaleness = (
  template: AttendanceTemplate,
  categories: readonly CategoryType[],
  modelFields: readonly MemberModelField[],
): TemplateStaleness => ({
  category: isCategoryPlacementStale(template, categories),
  eligibility: eligibilityIssues(template.eligibilityRules, modelFields).length > 0,
});

export const isStale = ({ category, eligibility }: TemplateStaleness) =>
  category || eligibility;

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

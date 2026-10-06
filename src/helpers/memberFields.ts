import { capitalizeFirstLetter } from "helpers/stringManipulations";

export const MEMBER_FIELD_TYPES = [
  "text",
  "email",
  "number",
  "tel",
  "checkbox",
  "date",
  "color",
  "option",
] as const;

export type MemberFieldType = (typeof MEMBER_FIELD_TYPES)[number];

/**
 * One configured member-model field. `name` is the storage key: member
 * documents, eligibility rules, filters and exports all use it, and it never
 * changes once saved. `label` is display-only; `_id` is the backend's stable
 * identity for a saved field. Older responses may carry neither.
 */
export interface MemberModelField {
  _id?: string;
  name: string;
  label?: string | null;
  type: string;
  options?: string[];
  required?: boolean;
}

/** Readable fallback for a key with no label, e.g. `date_of_birth` → `Date of birth`. */
export const fallbackFieldLabel = (name: string): string =>
  capitalizeFirstLetter(name.replace(/[_-]+/g, " ").trim());

/** What officers see for a field: its label, or a fallback from its key. */
export const displayMemberFieldLabel = (
  field: Pick<MemberModelField, "name" | "label">,
): string => field.label?.trim() || fallbackFieldLabel(field.name);

/**
 * Display label for a storage key, using the model when it knows the field.
 * Keys are compared case-insensitively, as the backend normalises them.
 */
export const memberFieldLabeler = (
  fields: readonly Pick<MemberModelField, "name" | "label">[],
) => {
  const byKey = new Map(
    fields.map((field) => [field.name.trim().toLowerCase(), field] as const),
  );
  return (key: string): string => {
    const field = byKey.get(key.trim().toLowerCase());
    return field ? displayMemberFieldLabel(field) : fallbackFieldLabel(key);
  };
};

import {
  displayMemberFieldLabel,
  fallbackFieldLabel,
  MemberModelField,
} from "helpers/memberFields";

/** The always-present member field: every member has a name. */
export const NAME_FIELD_KEY = "name";
export const FIELD_LABEL_MAX_LENGTH = 80;

/**
 * One field in the model editor. A saved field carries the backend's `_id`
 * and keeps its key and type; a new field is identified only by a client-side
 * React key, which is never sent to the backend.
 */
export interface EditorField {
  /** Stable React key: the saved `_id`, or a client-only draft id. */
  reactKey: string;
  /** Loaded from the backend: key and type are locked and it can't be removed. */
  persisted: boolean;
  /** Backend `_id` of a saved field (legacy records may lack one). */
  savedId: string | null;
  /** The `name` field: key, type and required flag are fixed. */
  pinned: boolean;
  name: string;
  label: string;
  type: string;
  required: boolean;
  /** Comma-separated option text, kept even if a new field's type changes. */
  optionsText: string;
  /** Options exactly as loaded; sent unchanged unless `optionsText` is edited. */
  savedOptions: string[] | null;
  optionsEdited: boolean;
  /** A new field's key follows its label until the officer edits the key. */
  keyEdited: boolean;
}

export type FieldErrors = Partial<Record<"label" | "name" | "options", string>>;

/** Payload entry for `POST /organisations/:id/model`. */
export interface ModelFieldPayload {
  _id?: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

let draftCounter = 0;
const nextDraftKey = () => `draft-${++draftCounter}`;

const normalizeKey = (name: string) => name.trim().toLowerCase();

export const newDraftField = (overrides: Partial<EditorField> = {}): EditorField => ({
  reactKey: nextDraftKey(),
  persisted: false,
  savedId: null,
  pinned: false,
  name: "",
  label: "",
  type: "text",
  required: false,
  optionsText: "",
  savedOptions: null,
  optionsEdited: false,
  keyEdited: false,
  ...overrides,
});

/** Editor state from the loaded model; a brand-new model starts with `name`. */
export const toEditorFields = (
  fields: readonly MemberModelField[] | null | undefined,
): EditorField[] =>
  fields?.length
    ? fields.map((field) => ({
        reactKey: field._id ?? nextDraftKey(),
        persisted: true,
        savedId: field._id ?? null,
        pinned: normalizeKey(field.name) === NAME_FIELD_KEY,
        name: field.name,
        label: displayMemberFieldLabel(field),
        type: field.type,
        required: Boolean(field.required),
        optionsText: (field.options ?? []).join(", "),
        savedOptions: field.options ? [...field.options] : null,
        optionsEdited: false,
        keyEdited: true,
      }))
    : [
        newDraftField({
          pinned: true,
          name: NAME_FIELD_KEY,
          label: fallbackFieldLabel(NAME_FIELD_KEY),
          required: true,
          keyEdited: true,
        }),
      ];

/** A storage key derived from a label, e.g. `Voice Part` → `voice_part`. */
export const keyFromLabel = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1");

export const parseOptions = (optionsText: string): string[] =>
  Array.from(
    new Set(
      optionsText
        .split(",")
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  );

/** The options a field will save: loaded ones verbatim unless edited. */
export const fieldOptions = (field: EditorField): string[] =>
  field.savedOptions && !field.optionsEdited
    ? field.savedOptions
    : parseOptions(field.optionsText);

// Mirrors the backend: server-owned member paths can never be field keys.
const RESERVED_KEYS = new Set(
  [
    "user",
    "memberId",
    "organisationId",
    "createdBy",
    "updatedBy",
    "createdAt",
    "updatedAt",
    "financialStartDate",
    "_id",
    "id",
    "__v",
    "__proto__",
    "constructor",
    "prototype",
  ].map(normalizeKey),
);
const SAFE_KEY = /^[a-z_][a-z0-9_]*$/;

/**
 * Local validation, keyed by `reactKey`. Saved keys are grandfathered (they
 * can't change here) and never carry key errors; the backend stays
 * authoritative.
 */
export const validateEditorFields = (
  fields: readonly EditorField[],
): Map<string, FieldErrors> => {
  const errors = new Map<string, FieldErrors>();
  const keyCounts = new Map<string, number>();
  fields.forEach((field) => {
    const key = normalizeKey(field.name);
    if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  });

  fields.forEach((field) => {
    const fieldErrors: FieldErrors = {};
    const label = field.label.trim();
    if (!label) fieldErrors.label = "Enter a display label.";
    else if (label.length > FIELD_LABEL_MAX_LENGTH) {
      fieldErrors.label = `Labels can be at most ${FIELD_LABEL_MAX_LENGTH} characters.`;
    }

    if (!field.persisted && !field.pinned) {
      const key = normalizeKey(field.name);
      if (!key) fieldErrors.name = "Enter an internal key.";
      else if (RESERVED_KEYS.has(key)) {
        fieldErrors.name = `"${key}" is reserved and can't be used.`;
      } else if (!SAFE_KEY.test(key)) {
        fieldErrors.name =
          "Use lowercase letters, numbers and underscores, not starting with a number.";
      } else if ((keyCounts.get(key) ?? 0) > 1) {
        fieldErrors.name = `Another field already uses the key "${key}".`;
      }
    }

    if (field.type === "option" && fieldOptions(field).length === 0) {
      fieldErrors.options = "Add at least one option, separated by commas.";
    }

    if (Object.keys(fieldErrors).length) errors.set(field.reactKey, fieldErrors);
  });
  return errors;
};

/**
 * The model payload: saved fields keep their `_id`, key and type; new fields
 * send no id, so the backend mints their persistent identity.
 */
export const toModelPayload = (fields: readonly EditorField[]): ModelFieldPayload[] =>
  fields.map((field) => ({
    ...(field.savedId ? { _id: field.savedId } : {}),
    name: field.persisted ? field.name : normalizeKey(field.name),
    label: field.label.trim(),
    type: field.type,
    required: field.required,
    ...(field.type === "option" ? { options: fieldOptions(field) } : {}),
  }));

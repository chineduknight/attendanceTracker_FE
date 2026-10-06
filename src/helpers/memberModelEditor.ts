import {
  displayMemberFieldLabel,
  fallbackFieldLabel,
  MemberFieldType,
  MemberModelField,
} from "helpers/memberFields";

/** The always-present first field: every member has a name. */
export const NAME_FIELD_KEY = "name";
export const FIELD_LABEL_MAX_LENGTH = 80;

/**
 * One field in the model editor. A saved field carries the backend's `_id`
 * and keeps its key and type; a new field has only a client-side `draftId`
 * (React key) that is never sent to the backend.
 */
export interface EditorField {
  /** Loaded from the backend: key and type are locked and it can't be removed. */
  persisted: boolean;
  /** Backend `_id` of a saved field (legacy records may lack one). */
  savedId: string | null;
  /** Client-only React key for an unsaved field. */
  draftId: string | null;
  name: string;
  label: string;
  type: MemberFieldType | string;
  required: boolean;
  /** Comma-separated option text, kept even if a new field's type changes. */
  optionsText: string;
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
const nextDraftId = () => `draft-${++draftCounter}`;

export const editorFieldKey = (field: EditorField): string =>
  field.savedId ?? (field.draftId as string);

export const isSavedField = (field: EditorField) => field.persisted;

/** The pinned `name` field: its key, type and required flag never change. */
export const isNameField = (field: EditorField, index: number) =>
  index === 0 && field.name === NAME_FIELD_KEY;

export const newDraftField = (
  overrides: Partial<EditorField> = {},
): EditorField => ({
  persisted: false,
  savedId: null,
  draftId: nextDraftId(),
  name: "",
  label: "",
  type: "text",
  required: false,
  optionsText: "",
  keyEdited: false,
  ...overrides,
});

/** Editor state from the loaded model; a brand-new model starts with `name`. */
export const toEditorFields = (
  fields: readonly MemberModelField[] | null | undefined,
): EditorField[] =>
  fields?.length
    ? fields.map((field) => ({
        persisted: true,
        savedId: field._id ?? null,
        draftId: field._id ? null : nextDraftId(),
        name: field.name,
        label: displayMemberFieldLabel(field),
        type: field.type,
        required: Boolean(field.required),
        optionsText: (field.options ?? []).join(", "),
        keyEdited: true,
      }))
    : [
        newDraftField({
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
  ].map((key) => key.toLowerCase()),
);
const SAFE_KEY = /^[a-z_][a-z0-9_]*$/;

const normalizeKey = (name: string) => name.trim().toLowerCase();

/**
 * Local validation, keyed by `editorFieldKey`. Saved keys are grandfathered
 * (they can't change here); the backend stays authoritative.
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

    const key = normalizeKey(field.name);
    if (!isSavedField(field)) {
      if (!key) fieldErrors.name = "Enter an internal key.";
      else if (RESERVED_KEYS.has(key)) {
        fieldErrors.name = `"${key}" is reserved and can't be used.`;
      } else if (!SAFE_KEY.test(key)) {
        fieldErrors.name =
          "Use lowercase letters, numbers and underscores, starting with a letter.";
      }
    }
    if (key && (keyCounts.get(key) ?? 0) > 1) {
      fieldErrors.name = `Another field already uses the key "${key}".`;
    }

    if (field.type === "option" && parseOptions(field.optionsText).length === 0) {
      fieldErrors.options = "Add at least one option, separated by commas.";
    }

    if (Object.keys(fieldErrors).length) errors.set(editorFieldKey(field), fieldErrors);
  });
  return errors;
};

/**
 * The model payload: saved fields keep their `_id`; new fields send none, so
 * the backend mints their persistent identity. `draftId` is never sent.
 */
export const toModelPayload = (fields: readonly EditorField[]): ModelFieldPayload[] =>
  fields.map((field) => ({
    ...(field.savedId ? { _id: field.savedId } : {}),
    name: isSavedField(field) ? field.name : normalizeKey(field.name),
    label: field.label.trim(),
    type: field.type,
    required: field.required,
    ...(field.type === "option" ? { options: parseOptions(field.optionsText) } : {}),
  }));

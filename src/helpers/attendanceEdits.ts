export interface EditableRecord {
  hasBeenUpdated?: boolean;
  editCount?: number;
  editsRemaining?: number;
  /** Set by the organisation to freeze every attendance edit. */
  editsLocked?: boolean;
}

/**
 * How many edits remain for an attendance record. Prefers the new
 * `editsRemaining` field; falls back to the legacy one-edit rule
 * (`hasBeenUpdated`) for responses that predate the multi-edit contract.
 */
export const resolveEditsRemaining = (record: EditableRecord): number => {
  if (typeof record.editsRemaining === "number") return record.editsRemaining;
  return record.hasBeenUpdated ? 0 : 1;
};

/** How many times the record has been edited (legacy fallback: 0 or 1). */
export const resolveEditCount = (record: EditableRecord): number => {
  if (typeof record.editCount === "number") return record.editCount;
  return record.hasBeenUpdated ? 1 : 0;
};

export const canEditAttendance = (record: EditableRecord): boolean =>
  resolveEditsRemaining(record) > 0;

/**
 * Whether the stored roster may still change (e.g. a manual add/remove). Only
 * a display hint: the backend stays authoritative, since another officer may
 * use the last edit after this screen loaded.
 */
export const canChangeStoredRoster = (record: EditableRecord): boolean =>
  !record.editsLocked && canEditAttendance(record);

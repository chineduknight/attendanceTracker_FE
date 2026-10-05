import { AttendanceStatusDefinition } from "helpers/attendanceStatuses";
import { StatusRow, toStatusDefinitions } from "helpers/attendanceStatusSettings";

export interface OrgSettingsForm {
  name: string;
  image: string;
  collapseAttendanceByDay: boolean;
  /** Raw input value; "" (or whitespace) means "use the deployment default". */
  maxAttendanceEdits: string;
}

export interface OrgUpdatePayload {
  name: string;
  image: string;
  collapseAttendanceByDay: boolean;
  maxAttendanceEdits: number | null;
  attendanceStatuses: AttendanceStatusDefinition[];
}

/**
 * Build the `PUT /organisations/:id` body. `name` and `image` are ALWAYS sent
 * — the BE 422s without `name`, and `image: ""` is how a cleared logo field
 * removes the logo (omitting it would leave the old logo in place).
 * A blank `maxAttendanceEdits` maps to `null` so the BE applies its default.
 * Attendance statuses travel in the same body so saving one setting never
 * wipes another.
 */
export const buildOrgUpdatePayload = (
  form: OrgSettingsForm,
  statusRows: readonly StatusRow[],
): OrgUpdatePayload => {
  const trimmedMax = form.maxAttendanceEdits.trim();
  return {
    name: form.name.trim(),
    image: form.image.trim(),
    collapseAttendanceByDay: form.collapseAttendanceByDay,
    maxAttendanceEdits: trimmedMax === "" ? null : Number(trimmedMax),
    attendanceStatuses: toStatusDefinitions(statusRows),
  };
};

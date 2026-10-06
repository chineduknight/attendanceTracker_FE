import { AttendanceStatusDefinition } from "helpers/attendanceStatuses";
import { StatusRow, toStatusDefinitions } from "helpers/attendanceStatusSettings";
import {
  OrganisationFeatureVisibility,
  OrganisationTerminology,
  TERM_KEYS,
} from "helpers/organisationPresentation";

export interface OrgSettingsForm {
  name: string;
  image: string;
  collapseAttendanceByDay: boolean;
  /** Raw input value; "" (or whitespace) means "use the deployment default". */
  maxAttendanceEdits: string;
  terminology: OrganisationTerminology;
  featureVisibility: OrganisationFeatureVisibility;
}

export interface OrgUpdatePayload {
  name: string;
  image: string;
  collapseAttendanceByDay: boolean;
  maxAttendanceEdits: number | null;
  attendanceStatuses: AttendanceStatusDefinition[];
  terminology: OrganisationTerminology;
  featureVisibility: OrganisationFeatureVisibility;
}

/**
 * Build the `PUT /organisations/:id` body. `name` and `image` are ALWAYS sent
 * — the BE 422s without `name`, and `image: ""` is how a cleared logo field
 * removes the logo (omitting it would leave the old logo in place).
 * A blank `maxAttendanceEdits` maps to `null` so the BE applies its default.
 * Attendance statuses, terminology and module visibility travel in the same
 * body — always complete, as the backend requires — so saving one setting
 * never wipes another.
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
    terminology: TERM_KEYS.reduce((terms, key) => {
      terms[key] = form.terminology[key].trim();
      return terms;
    }, {} as OrganisationTerminology),
    featureVisibility: {
      finance: form.featureVisibility.finance,
      birthdays: form.featureVisibility.birthdays,
      analytics: form.featureVisibility.analytics,
    },
  };
};

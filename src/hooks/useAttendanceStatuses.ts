import { useMemo } from "react";
import useGlobalStore from "zStore";
import {
  AttendanceStatusConfig,
  AttendanceStatusDefinition,
  createStatusConfig,
} from "helpers/attendanceStatuses";

/**
 * Attendance status configuration of the currently selected organisation.
 * Pass `definitions` from a response that carries its own effective config
 * (e.g. analytics) to prefer it over the selected organisation's copy.
 */
export function useAttendanceStatuses(
  definitions?: readonly AttendanceStatusDefinition[] | null,
): AttendanceStatusConfig {
  const selected = useGlobalStore((s) => s.organisation.attendanceStatuses);
  const effective = definitions?.length ? definitions : selected;
  return useMemo(() => createStatusConfig(effective), [effective]);
}

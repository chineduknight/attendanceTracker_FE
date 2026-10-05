import { useMemo } from "react";
import useGlobalStore from "zStore";
import {
  AttendanceStatusConfig,
  createStatusConfig,
} from "helpers/attendanceStatuses";

/** Attendance status configuration of the currently selected organisation. */
export function useAttendanceStatuses(): AttendanceStatusConfig {
  const definitions = useGlobalStore((s) => s.organisation.attendanceStatuses);
  return useMemo(() => createStatusConfig(definitions), [definitions]);
}

export type AttendanceStatus = "present" | "absent" | "apology";

export const STATUS_META: Record<
  AttendanceStatus,
  { color: string; short: string; full: string }
> = {
  present: { color: "green", short: "P", full: "Present" },
  absent: { color: "red", short: "A", full: "Absent" },
  apology: { color: "yellow", short: "AP", full: "Apology" },
};

export const EMPTY_STATUS_META = { color: "gray", short: "-", full: "No record" };

export const getStatusMeta = (status: string | undefined) =>
  STATUS_META[status as AttendanceStatus] ?? EMPTY_STATUS_META;

export interface AttendanceAvailability {
  id: string;
  organisationId: string;
  memberId: string;
  member?: {
    id: string;
    name: string;
  };
  startDate: string;
  endDate: string;
  reason?: string | null;
  createdBy?: unknown;
  updatedBy?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceAvailabilityFields {
  memberId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface AttendanceAvailabilityUpdateFields {
  startDate: string;
  endDate: string;
  reason?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isValidAvailabilityDate = (value: string): boolean => {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};

export const isAvailabilityActiveOn = (
  period: Pick<AttendanceAvailability, "startDate" | "endDate">,
  date: string
): boolean =>
  isValidAvailabilityDate(date) &&
  period.startDate <= date &&
  period.endDate >= date;

export const unavailableMemberIds = (
  periods: readonly AttendanceAvailability[]
): Set<string> => new Set(periods.map((period) => period.memberId));

export const filterAvailableMembers = <T extends Readonly<{ id: string }>>(
  members: readonly T[],
  unavailableIds: ReadonlySet<string>
): T[] => members.filter((member) => !unavailableIds.has(member.id));

export const sortAvailabilityPeriods = (
  periods: readonly AttendanceAvailability[]
): AttendanceAvailability[] =>
  [...periods].sort((a, b) => {
    const byStartDate = a.startDate.localeCompare(b.startDate);
    return byStartDate || a.endDate.localeCompare(b.endDate);
  });

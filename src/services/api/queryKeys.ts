export const queryKeys = {
  organisations: ["organisations"] as const,
  members: (organisationId: string) => ["members", organisationId] as const,
  member: (organisationId: string, memberId?: string) =>
    ["member", organisationId, memberId ?? ""] as const,
  memberModel: (organisationId: string) =>
    ["member-model", organisationId] as const,
  categories: (organisationId: string) =>
    ["categories", organisationId] as const,
  attendance: (organisationId: string, attendanceId?: string) =>
    ["attendance", organisationId, attendanceId ?? ""] as const,
};

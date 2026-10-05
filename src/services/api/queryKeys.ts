/**
 * Central React Query key factory.
 *
 * Every tenant-owned key includes the organisation id so caches, invalidations
 * and refetches can never bleed across organisations. Account-wide resources
 * (e.g. the permissions catalog, the organisation list) stay global.
 *
 * Keys are nested so a root key acts as a prefix for all of its
 * organisation-scoped children — pass that root to `invalidateQueries` to
 * invalidate a whole feature for one organisation only.
 */
export const queryKeys = {
  organisations: ["organisations"] as const,
  allOrganisations: ["all-organisations"] as const,
  organisation: (organisationId: string) =>
    ["organisation", organisationId] as const,
  members: (organisationId: string) => ["members", organisationId] as const,
  member: (organisationId: string, memberId?: string) =>
    ["member", organisationId, memberId ?? ""] as const,
  memberModel: (organisationId: string) =>
    ["member-model", organisationId] as const,
  categories: (organisationId: string) =>
    ["categories", organisationId] as const,
  attendance: (organisationId: string, attendanceId?: string) =>
    ["attendance", organisationId, attendanceId ?? ""] as const,
  attendances: (organisationId: string) =>
    ["attendances", organisationId] as const,
  attendanceTemplates: (organisationId: string) =>
    ["attendance-templates", organisationId] as const,

  finance: {
    obligations: (organisationId: string) =>
      ["finance", organisationId, "obligations"] as const,
    /** Prefix covering every compliance query for one organisation. */
    complianceRoot: (organisationId: string) =>
      ["finance", organisationId, "compliance"] as const,
    compliance: (organisationId: string, obligationId: string) =>
      ["finance", organisationId, "compliance", obligationId] as const,
    complianceExport: (
      organisationId: string,
      obligationId: string,
      format: "excel" | "pdf",
    ) =>
      [
        "finance",
        organisationId,
        "compliance",
        obligationId,
        "export",
        format,
      ] as const,
  },

  rbac: {
    officers: (organisationId: string) =>
      ["rbac", organisationId, "officers"] as const,
    roles: (organisationId: string) => ["rbac", organisationId, "roles"] as const,
    invites: (organisationId: string) =>
      ["rbac", organisationId, "invites"] as const,
  },

  // Account-wide: not owned by a single organisation.
  permissionsCatalog: ["permissions-catalog"] as const,
};

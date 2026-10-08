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
  /** Prefix for one session's Excel export, across every filter. */
  attendanceExport: (organisationId: string, attendanceId: string) =>
    ["export-excel", organisationId, attendanceId] as const,
  attendanceTemplates: (organisationId: string) =>
    ["attendance-templates", organisationId] as const,
  attendanceAvailability: {
    root: (organisationId: string) =>
      ["attendance-availability", organisationId] as const,
    member: (organisationId: string, memberId: string) =>
      ["attendance-availability", organisationId, "member", memberId] as const,
    date: (organisationId: string, date: string) =>
      ["attendance-availability", organisationId, "date", date] as const,
  },
  analytics: {
    /** Prefix covering every organisation analytics query for one org. */
    root: (organisationId: string) =>
      ["attendance-analytics", organisationId] as const,
    organisation: (
      organisationId: string,
      fromDate: string,
      toDate: string,
      statuses: string,
    ) =>
      [
        "attendance-analytics",
        organisationId,
        "organisation",
        fromDate,
        toDate,
        statuses,
      ] as const,
    /** Prefix covering every member analytics query for one org. */
    memberRoot: (organisationId: string) =>
      ["member-analytics", organisationId] as const,
    member: (
      organisationId: string,
      memberId: string,
      fromDate: string,
      toDate: string,
    ) =>
      ["member-analytics", organisationId, memberId, fromDate, toDate] as const,
  },

  welfare: {
    /** Prefix covering every Welfare query for one organisation. */
    root: (organisationId: string) => ["welfare", organisationId] as const,
    /**
     * Overview for one review date and member-status scope. Either changing is
     * a different population/horizon, so neither may reuse the other's result.
     * Empty string stands in for "all statuses" so the key stays stable.
     */
    overview: (organisationId: string, asOf: string, status?: string) =>
      ["welfare", organisationId, "overview", asOf, status ?? ""] as const,
    followUps: {
      /** Prefix covering every follow-up query for one organisation. */
      root: (organisationId: string) =>
        ["welfare", organisationId, "follow-ups"] as const,
      /**
       * Follow-up list for one business date and optional filters. Empty
       * string stands in for an absent filter so the key stays stable.
       */
      list: (
        organisationId: string,
        asOf: string,
        workflowStatus?: "open" | "closed",
        memberId?: string,
        assignedToUserId?: string,
      ) =>
        [
          "welfare",
          organisationId,
          "follow-ups",
          "list",
          asOf,
          workflowStatus ?? "",
          memberId ?? "",
          assignedToUserId ?? "",
        ] as const,
    },
  },

  birthday: {
    /** Prefix covering every Birthday query for one organisation. */
    root: (organisationId: string) => ["birthday", organisationId] as const,
    /** Birthday list for one full-date range and status selection. */
    list: (
      organisationId: string,
      startDate: string,
      endDate: string,
      statuses: string,
    ) =>
      [
        "birthday",
        organisationId,
        "list",
        startDate,
        endDate,
        statuses,
      ] as const,
    /** Welfare's next-7-days snapshot; tenant scoped like every org key. */
    snapshot: (organisationId: string, startDate: string, endDate: string) =>
      ["birthday", organisationId, "snapshot", startDate, endDate] as const,
    /** URL-returning export for the active range and status filter. */
    export: (
      organisationId: string,
      format: "excel" | "pdf",
      startDate: string,
      endDate: string,
      statuses: string,
    ) =>
      [
        "birthday",
        organisationId,
        "export",
        format,
        startDate,
        endDate,
        statuses,
      ] as const,
  },

  finance: {
    obligations: (organisationId: string) =>
      ["finance", organisationId, "obligations"] as const,
    /** Prefix covering every compliance query for one organisation. */
    complianceRoot: (organisationId: string) =>
      ["finance", organisationId, "compliance"] as const,
    /** `asOf` (YYYY-MM-DD) scopes the arrears figures to the officer's date. */
    compliance: (organisationId: string, obligationId: string, asOf?: string) =>
      asOf
        ? (["finance", organisationId, "compliance", obligationId, asOf] as const)
        : (["finance", organisationId, "compliance", obligationId] as const),
    complianceExport: (
      organisationId: string,
      obligationId: string,
      format: "excel" | "pdf",
      asOf?: string,
    ) =>
      [
        "finance",
        organisationId,
        "compliance",
        obligationId,
        "export",
        format,
        ...(asOf ? [asOf] : []),
      ] as const,
  },

  rbac: {
    officers: (organisationId: string) =>
      ["rbac", organisationId, "officers"] as const,
    roles: (organisationId: string) =>
      ["rbac", organisationId, "roles"] as const,
    invites: (organisationId: string) =>
      ["rbac", organisationId, "invites"] as const,
  },

  // Account-wide: not owned by a single organisation.
  permissionsCatalog: ["permissions-catalog"] as const,
};

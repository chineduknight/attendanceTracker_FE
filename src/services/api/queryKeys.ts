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
    ledger: {
      /** Prefix covering every read-only Books query for one organisation. */
      root: (organisationId: string) =>
        ["finance", organisationId, "ledger"] as const,
      status: (organisationId: string) =>
        ["finance", organisationId, "ledger", "status"] as const,
      accounts: (organisationId: string) =>
        ["finance", organisationId, "ledger", "accounts"] as const,
      journals: (organisationId: string) =>
        ["finance", organisationId, "ledger", "journals"] as const,
      /**
       * Books' paged, server-filtered journal list. Under `journals`, so every
       * ledger write that refreshes journals refreshes these pages too.
       */
      journalPages: (
        organisationId: string,
        filters: { sourceType: string; accountId: string; from: string; to: string },
        limit: number,
      ) => ["finance", organisationId, "ledger", "journals", "pages", filters, limit] as const,
      /** Prefix covering every opening-balance read for one organisation. */
      openingBalances: (organisationId: string) =>
        ["finance", organisationId, "ledger", "opening-balances"] as const,
      openingBalanceList: (organisationId: string) =>
        ["finance", organisationId, "ledger", "opening-balances", "list"] as const,
      effectiveOpenings: (organisationId: string) =>
        ["finance", organisationId, "ledger", "opening-balances", "effective"] as const,
      /** Lifecycle audit trail for one organisation (F2A-4 read). */
      audit: (organisationId: string) =>
        ["finance", organisationId, "ledger", "audit"] as const,
      /** Member-money sources still holding money (F2B-2 read). */
      openMemberMoney: (organisationId: string) =>
        ["finance", organisationId, "ledger", "member-money", "open"] as const,
      /** One journal's detail (F2A-4 read, used by F2B-3 reversals). */
      journal: (organisationId: string, journalId: string) =>
        ["finance", organisationId, "ledger", "journal", journalId] as const,
      /** The unresolved posting attempts this officer may see (F2B-3). */
      unresolvedAttempts: (organisationId: string) =>
        ["finance", organisationId, "ledger", "attempts", "unresolved"] as const,
      /**
       * F2B-4 reports. Every key sits under `root`, so each ledger write's
       * root invalidation (postings, reversals, openings, lifecycle) also
       * refreshes them, for that organisation only. Every report parameter is
       * part of the identity, so a page or window never answers for another.
       */
      reports: (organisationId: string) =>
        ["finance", organisationId, "ledger", "reports"] as const,
      cashbook: (
        organisationId: string,
        accountId: string,
        params: { from: string; to: string; limit: number; cursor: string },
      ) =>
        [
          "finance",
          organisationId,
          "ledger",
          "reports",
          "cashbook",
          accountId,
          params.from,
          params.to,
          params.limit,
          params.cursor,
        ] as const,
      balances: (organisationId: string, asOf: string) =>
        ["finance", organisationId, "ledger", "reports", "balances", asOf] as const,
      summary: (organisationId: string, from: string, to: string) =>
        ["finance", organisationId, "ledger", "reports", "summary", from, to] as const,
      /** Financial Report v1 readiness for one exact period (downloads only). */
      financialReport: (organisationId: string, from: string, to: string) =>
        ["finance", organisationId, "ledger", "reports", "financial", from, to] as const,
      /**
       * F3-4 allocation history. Under `root`, so every ledger write refreshes
       * it; every filter and the cursor are part of the identity.
       */
      allocations: (
        organisationId: string,
        params: {
          sourceId: string;
          memberId: string;
          obligationId: string;
          from: string;
          to: string;
          cursor: string;
        },
      ) =>
        [
          "finance",
          organisationId,
          "ledger",
          "allocations",
          params.sourceId,
          params.memberId,
          params.obligationId,
          params.from,
          params.to,
          params.cursor,
        ] as const,
      /**
       * F3-4 reconciliation reports. They read current F0 values too, so an
       * F0 collection or correction refreshes this prefix as well
       * (`invalidateFinance`), not only ledger writes.
       */
      reconciliation: (organisationId: string) =>
        ["finance", organisationId, "ledger", "reconciliation"] as const,
      reconciliationSources: (
        organisationId: string,
        params: { asOf: string; open: string; minAgeDays: string; cursor: string },
      ) =>
        [
          "finance",
          organisationId,
          "ledger",
          "reconciliation",
          "sources",
          params.asOf,
          params.open,
          params.minAgeDays,
          params.cursor,
        ] as const,
      reconciliationPositions: (
        organisationId: string,
        params: { obligationId: string; memberId: string; flag: string; cursor: string },
      ) =>
        [
          "finance",
          organisationId,
          "ledger",
          "reconciliation",
          "positions",
          params.obligationId,
          params.memberId,
          params.flag,
          params.cursor,
        ] as const,
      reconciliationSummary: (
        organisationId: string,
        params: { from: string; to: string; minAgeDays: string },
      ) =>
        [
          "finance",
          organisationId,
          "ledger",
          "reconciliation",
          "summary",
          params.from,
          params.to,
          params.minAgeDays,
        ] as const,
    },
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

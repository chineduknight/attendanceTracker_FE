export const authRequest = {
  LOGIN: "/users/login",
  GET_ME: "/users/me",
  SIGN_UP: "/users/signup",
  SET_EMAIL: "/users/me/email",
  UPDATE_PASSWORD: "/users/me/password",
  FORGOT_PASSWORD: "/users/forgot-password",
  RESET_PASSWORD: "/users/reset-password",
};

export const orgRequest = {
  ORGANISATION: "/organisations/:organisationId/members",
  CATEGORY: "/organisations/:organisationId/category",
  SUB_CATEGORY: "/organisations/:organisationId/sub-category",
  ORGANISATIONS: "/organisations",
  ORGANISATION_ONE: "/organisations/:id",
  MEMBERS: "/organisations/:organisationId/members",
  MEMBER_ONE: "/organisations/:organisationId/members/:id",
  DELETE_MEMBER: "/organisations/:organisationId/members/:id",
  CONFIG_MODEL: "/organisations/:organisationId/model",
  BIRTHDAY: "/organisations/:organisationId/members/birthday",
  BIRTHDAY_EXPORT_PDF:
    "/organisations/:organisationId/members/birthday/export/pdf",
  BIRTHDAY_EXPORT_EXCEL:
    "/organisations/:organisationId/members/birthday/export",
  // organisations/:organisationId/members
};

export const attendanceRequest = {
  ATTENDANCE: "/attendance",
  UPDATE_ATTENDANCE: "/attendance/:attendanceId",
  GET_ATTENDANCE: "/attendance/:organisationId/:id",
  DELETE_ATTENDANCE: "/attendance/:organisationId/:id",
  ALL_ATTENDANCE: "/attendance/:organisationId",
  ATTENDANCE_TEMPLATES: "/attendance/:organisationId/templates",
  ATTENDANCE_TEMPLATE: "/attendance/:organisationId/templates/:templateId",
  EXPORT: "/attendance/export/:organisationId/:id",
  ANALYTICS: "/attendance/:organisationId/analytics",
  ANALYTICS_EXPORT_EXCEL: "/attendance/:organisationId/analytics/export/excel",
  ANALYTICS_EXPORT_PDF: "/attendance/:organisationId/analytics/export/pdf",
  MEMBER_ANALYTICS: "/attendance/:organisationId/analytics/member/:memberId",
  MEMBER_ANALYTICS_EXPORT_EXCEL:
    "/attendance/:organisationId/analytics/member/:memberId/export/excel",
  MEMBER_ANALYTICS_EXPORT_PDF:
    "/attendance/:organisationId/analytics/member/:memberId/export/pdf",
  ATTENDANCE_AVAILABILITY: "/attendance/:organisationId/availability",
  ATTENDANCE_AVAILABILITY_ONE:
    "/attendance/:organisationId/availability/:availabilityId",
  ANALYTICS_INCLUSION: "/attendance/:organisationId/:id/analytics-inclusion",
  MANUAL_MEMBERS: "/attendance/:organisationId/:id/manual-members",
  MANUAL_MEMBER: "/attendance/:organisationId/:id/manual-members/:memberId",
};

export const welfareRequest = {
  OVERVIEW: "/welfare/:organisationId/overview",
  FOLLOW_UPS: "/welfare/:organisationId/follow-ups",
  FOLLOW_UP_ONE: "/welfare/:organisationId/follow-ups/:id",
};

export const financeRequest = {
  OBLIGATIONS: "/finance/obligations",
  LIST_OBLIGATIONS: "/finance/:organisationId/obligations",
  ONE_OBLIGATION: "/finance/:organisationId/obligations/:id",
  UPDATE_OBLIGATION: "/finance/obligations/:id",
  PAYMENTS: "/finance/payments",
  COMPLIANCE: "/finance/:organisationId/obligations/:id/compliance",
  COMPLIANCE_EXPORT_EXCEL:
    "/finance/:organisationId/obligations/:id/compliance/export/excel",
  COMPLIANCE_EXPORT_PDF:
    "/finance/:organisationId/obligations/:id/compliance/export/pdf",
  FINANCIAL_START_DATE: "/finance/members/:memberId/financial-start-date",
  BULK_FINANCIAL_START_DATE: "/finance/:organisationId/members/financial-start-date",
  // Read-only ledger foundation (F1). No write endpoints yet.
  LEDGER_STATUS: "/finance/:organisationId/ledger/status",
  LEDGER_ACCOUNTS: "/finance/:organisationId/ledger/accounts",
  LEDGER_JOURNALS: "/finance/:organisationId/ledger/journals",
  // F2A-2 ledger setup and chart of accounts (RFC v0.3 §8.1). Gated behind
  // config/ledgerSetup until the backend routes and F2 read shape are live.
  LEDGER_SETUP: "/finance/:organisationId/ledger/setup",
  LEDGER_SETTINGS: "/finance/:organisationId/ledger/settings",
  LEDGER_ACCOUNT: "/finance/:organisationId/ledger/accounts/:accountId",
  // F2A-3 opening balances and independent verification (RFC v0.3 §4.4–§4.5,
  // §8.1). Provisional until backend PR #40 is corrected and merged.
  LEDGER_OPENING_BALANCES: "/finance/:organisationId/ledger/opening-balances",
  LEDGER_OPENING_BALANCES_EFFECTIVE:
    "/finance/:organisationId/ledger/opening-balances/effective",
  LEDGER_OPENING_BALANCE_VERIFY:
    "/finance/:organisationId/ledger/opening-balances/:proposalId/verify",
  LEDGER_OPENING_BALANCE_REJECT:
    "/finance/:organisationId/ledger/opening-balances/:proposalId/reject",
  LEDGER_OPENING_BALANCE_WITHDRAW:
    "/finance/:organisationId/ledger/opening-balances/:proposalId/withdraw",
  // F2A-3 lifecycle (RFC v0.3 §4.2, §4.6, §4.7; D9, D12, D28). Suspend,
  // resume and period-lock are owner-only; the gap-window attestation needs
  // finance.manage. The audit read is the lifecycle trail (F2A-4 §8.1).
  LEDGER_SUSPEND: "/finance/:organisationId/ledger/suspend",
  LEDGER_RESUME: "/finance/:organisationId/ledger/resume",
  LEDGER_PERIOD_LOCK: "/finance/:organisationId/ledger/period-lock",
  LEDGER_GAP_WINDOW_ATTEST:
    "/finance/:organisationId/ledger/gap-window/attest",
  LEDGER_AUDIT: "/finance/:organisationId/ledger/audit",
};

export const rbacRequest = {
  PERMISSIONS: "/permissions",
  OFFICERS: "/organisations/:organisationId/officers",
  INVITE: "/organisations/:organisationId/officers/invite",
  INVITES: "/organisations/:organisationId/officers/invites",
  INVITE_ONE: "/organisations/:organisationId/officers/invites/:inviteId",
  OFFICER_ROLE: "/organisations/:organisationId/officers/:userId/role",
  OFFICER_PERMISSIONS:
    "/organisations/:organisationId/officers/:userId/permissions",
  OFFICER_ONE: "/organisations/:organisationId/officers/:userId",
  ROLES: "/organisations/:organisationId/roles",
  ROLE_ONE: "/organisations/:organisationId/roles/:roleId",
};

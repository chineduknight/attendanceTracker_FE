import { PermissionArea, PermissionKey } from "rbac/permissions";
import { PresentationText } from "config/presentationLabels";
import { lowerTerm } from "helpers/organisationPresentation";

/**
 * Display copy for the permission editor. Labels and descriptions follow the
 * organisation's terminology; the permission keys they describe never change.
 */
export const AREA_LABEL: Record<PermissionArea, PresentationText> = {
  attendance: (t) => t.attendancePlural,
  members: (t) => t.memberPlural,
  categories: (t) => t.categoryPlural,
  settings: "Org settings",
  finance: "Finance",
  officers: (t) => `${t.officerPlural} & roles`,
  welfare: "Welfare",
};

export const PERMISSION_COPY: Record<
  PermissionKey,
  { label: string; description: PresentationText }
> = {
  "attendance.view": {
    label: "View",
    description: (t) => `Read ${lowerTerm(t.attendancePlural)} & analytics`,
  },
  "attendance.manage": {
    label: "Manage",
    description: (t) => `Mark / edit / delete ${lowerTerm(t.attendancePlural)}`,
  },
  "members.view": {
    label: "View",
    description: (t) => `Read the ${lowerTerm(t.memberSingular)} list`,
  },
  "members.manage": {
    label: "Manage",
    description: (t) =>
      `Create / edit / delete ${lowerTerm(t.memberPlural)} & model`,
  },
  "categories.view": {
    label: "View",
    description: (t) => `Read ${lowerTerm(t.categoryPlural)}`,
  },
  "categories.manage": {
    label: "Manage",
    description: (t) => `Create / edit / delete ${lowerTerm(t.categoryPlural)}`,
  },
  "settings.view": { label: "View", description: "Read org settings" },
  "settings.manage": {
    label: "Manage",
    description: "Rename org, change settings",
  },
  "finance.view": {
    label: "View",
    description: "Read obligations & compliance",
  },
  "finance.manage": {
    label: "Manage",
    description: "Manage obligations, record payments",
  },
  "officers.view": {
    label: "View",
    description: (t) => `Read ${lowerTerm(t.officerPlural)}, roles & invites`,
  },
  "officers.manage": {
    label: "Manage",
    description: (t) =>
      `Invite/remove ${lowerTerm(t.officerPlural)}, edit roles`,
  },
  "welfare.view": {
    label: "View",
    description: "Read private Welfare follow-up records",
  },
  "welfare.manage": {
    label: "Manage",
    description: "Create, edit, close and archive welfare follow-ups",
  },
};

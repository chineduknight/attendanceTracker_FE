import { PermissionArea, PermissionKey } from "rbac/permissions";

export const AREA_LABEL: Record<PermissionArea, string> = {
  attendance: "Attendance",
  members: "Members",
  categories: "Categories",
  settings: "Org settings",
  finance: "Finance",
  officers: "Officers & roles",
};

export const PERMISSION_COPY: Record<
  PermissionKey,
  { label: string; description: string }
> = {
  "attendance.view": { label: "View", description: "Read sessions & analytics" },
  "attendance.manage": { label: "Manage", description: "Mark / edit / delete sessions" },
  "members.view": { label: "View", description: "Read the member list" },
  "members.manage": { label: "Manage", description: "Create / edit / delete members & model" },
  "categories.view": { label: "View", description: "Read categories" },
  "categories.manage": { label: "Manage", description: "Create / edit / delete categories" },
  "settings.view": { label: "View", description: "Read org settings" },
  "settings.manage": { label: "Manage", description: "Rename org, change settings" },
  "finance.view": { label: "View", description: "Read obligations & compliance" },
  "finance.manage": { label: "Manage", description: "Manage obligations, record payments" },
  "officers.view": { label: "View", description: "Read officers, roles & invites" },
  "officers.manage": { label: "Manage", description: "Invite/remove officers, edit roles" },
};

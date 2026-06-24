import { PermissionArea, PermissionKey } from "rbac/permissions";

export interface PermissionsCatalog {
  areas: PermissionArea[];
  permissions: PermissionKey[];
}

export interface Officer {
  userId: string;
  username: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: PermissionKey[];
}

export interface Role {
  id: string;
  organisationId: string;
  name: string;
  permissions: PermissionKey[];
  isSystem: boolean;
  status: string;
}

export interface Invite {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  createdAt: string;
}

export interface OrganisationSummary {
  id: string;
  name: string;
  image: string;
  owner: string;
  status: string;
  isOwner: boolean;
  roleName: string;
  permissions: PermissionKey[];
}

export interface MeResponse {
  id: string;
  username: string;
  email: string;
  needsEmail: boolean;
}

export type InviteResponse =
  | { invited: true }
  | { attached: true; userId: string };

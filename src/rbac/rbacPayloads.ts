import { PermissionKey } from "rbac/permissions";

export function buildOverridePayload(
  rolePermissions: PermissionKey[],
  selected: PermissionKey[]
): { grantedPermissions: PermissionKey[]; revokedPermissions: PermissionKey[] } {
  const role = new Set(rolePermissions);
  const sel = new Set(selected);
  return {
    grantedPermissions: selected.filter((p) => !role.has(p)),
    revokedPermissions: rolePermissions.filter((p) => !sel.has(p)),
  };
}

export function buildRolePayload(input: {
  name: string;
  permissions: PermissionKey[];
}): { name: string; permissions: PermissionKey[] } {
  return { name: input.name.trim(), permissions: input.permissions };
}

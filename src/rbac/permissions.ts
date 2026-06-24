export const PERMISSION_AREAS = [
  "attendance",
  "members",
  "categories",
  "settings",
  "finance",
  "officers",
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type PermissionAction = "view" | "manage";
export type PermissionKey = `${PermissionArea}.${PermissionAction}`;

const PERMISSION_ACTIONS: readonly PermissionAction[] = ["view", "manage"];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_AREAS.flatMap(
  (area) => PERMISSION_ACTIONS.map((action): PermissionKey => `${area}.${action}`)
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_SET.has(value);
}

export function splitPermission(key: PermissionKey): {
  area: PermissionArea;
  action: PermissionAction;
} {
  const [area, action] = key.split(".") as [PermissionArea, PermissionAction];
  return { area, action };
}

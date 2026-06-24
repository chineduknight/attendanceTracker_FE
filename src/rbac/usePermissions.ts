import { useMemo } from "react";
import useGlobalStore from "zStore";
import { PermissionKey } from "rbac/permissions";

export interface PermissionApi {
  isOwner: boolean;
  has: (k: PermissionKey) => boolean;
  hasAny: (...k: PermissionKey[]) => boolean;
  hasAll: (...k: PermissionKey[]) => boolean;
}

export function usePermissions(): PermissionApi {
  const organisation = useGlobalStore((s) => s.organisation);

  return useMemo<PermissionApi>(() => {
    const isOwner = !!organisation.isOwner;
    const set = new Set<PermissionKey>(organisation.permissions ?? []);
    const has = (k: PermissionKey) => isOwner || set.has(k);
    return {
      isOwner,
      has,
      hasAny: (...keys) => keys.some(has),
      hasAll: (...keys) => keys.every(has),
    };
  }, [organisation.isOwner, organisation.permissions]);
}

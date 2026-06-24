import { ReactNode } from "react";
import { usePermissions } from "rbac/usePermissions";
import { PermissionKey } from "rbac/permissions";

interface CanProps {
  perm?: PermissionKey;
  anyOf?: PermissionKey[];
  owner?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ perm, anyOf, owner, fallback = null, children }: CanProps) {
  const p = usePermissions();
  let allowed = false;
  if (owner) allowed = p.isOwner;
  else if (perm) allowed = p.has(perm);
  else if (anyOf) allowed = p.hasAny(...anyOf);
  return <>{allowed ? children : fallback}</>;
}

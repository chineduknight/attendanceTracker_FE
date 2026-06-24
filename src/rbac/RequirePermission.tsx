import { ReactNode, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "react-toastify";
import { usePermissions } from "rbac/usePermissions";
import { PermissionKey } from "rbac/permissions";
import { PROTECTED_PATHS } from "routes/pagePath";

interface RequirePermissionProps {
  perm: PermissionKey;
  children: ReactNode;
}

export function RequirePermission({ perm, children }: RequirePermissionProps) {
  const { has } = usePermissions();
  const allowed = has(perm);
  const toasted = useRef(false);

  useEffect(() => {
    if (!allowed && !toasted.current) {
      toasted.current = true;
      toast.error("You don't have access to that.");
    }
  }, [allowed]);

  if (!allowed) return <Navigate to={PROTECTED_PATHS.DASHBOARD} replace />;
  return <>{children}</>;
}

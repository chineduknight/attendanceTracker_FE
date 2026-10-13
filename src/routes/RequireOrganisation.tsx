import { ReactNode, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";
import { PROTECTED_PATHS } from "routes/pagePath";

/**
 * Organisation pages need a selected organisation. With none (it was just
 * deleted, the officer was removed from it elsewhere, or nothing was ever
 * chosen) send them to pick one, instead of an empty dashboard or a
 * misleading "no access" from the permission guard.
 */
export function RequireOrganisation({ children }: { children: ReactNode }) {
  const hasOrganisation = useGlobalStore((s) => Boolean(s.organisation.id));
  const toasted = useRef(false);

  useEffect(() => {
    if (!hasOrganisation && !toasted.current) {
      toasted.current = true;
      toast.info("Choose an organisation first.");
    }
  }, [hasOrganisation]);

  if (!hasOrganisation) return <Navigate to={PROTECTED_PATHS.ALL_ORG} replace />;
  return <>{children}</>;
}

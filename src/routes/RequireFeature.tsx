import { ReactNode, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "react-toastify";
import { OptionalFeature } from "helpers/organisationPresentation";
import { useOrgPresentation } from "hooks/useOrgPresentation";
import { PROTECTED_PATHS } from "routes/pagePath";

export const HIDDEN_FEATURE_MESSAGE = "This feature is hidden for this organisation.";

interface RequireFeatureProps {
  feature: OptionalFeature;
  children: ReactNode;
}

/**
 * Redirects a direct visit to a module the selected organisation hides. This
 * is presentation, not authorization: visible routes still go through RBAC.
 */
export function RequireFeature({ feature, children }: RequireFeatureProps) {
  const { isFeatureVisible } = useOrgPresentation();
  const visible = isFeatureVisible(feature);
  const notified = useRef(false);

  useEffect(() => {
    if (!visible && !notified.current) {
      notified.current = true;
      toast.info(HIDDEN_FEATURE_MESSAGE);
    }
  }, [visible]);

  if (!visible) return <Navigate to={PROTECTED_PATHS.DASHBOARD} replace />;
  return <>{children}</>;
}

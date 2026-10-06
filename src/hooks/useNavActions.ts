import { useMemo } from "react";
import { IconType } from "react-icons";
import { NAV_ACTIONS } from "config/navActions";
import { resolveText } from "config/presentationLabels";
import { useOrgPresentation } from "hooks/useOrgPresentation";
import { usePermissions } from "rbac/usePermissions";
import { PermissionKey } from "rbac/permissions";

export interface ResolvedNavAction {
  label: string;
  icon: IconType;
  colorScheme: string;
  path: string;
  perm: PermissionKey;
}

/**
 * The selected organisation's navigation, shared by the Dashboard and the
 * drawer: labels in its terminology, minus modules it hides, minus anything
 * the officer isn't permitted to use. Visibility never grants access.
 */
export function useNavActions(): ResolvedNavAction[] {
  const { terms, visibility } = useOrgPresentation();
  const { has } = usePermissions();
  return useMemo(
    () =>
      NAV_ACTIONS.filter(
        (action) => (!action.feature || visibility[action.feature]) && has(action.perm),
      ).map(({ label, icon, colorScheme, path, perm }) => ({
        label: resolveText(label, terms),
        icon,
        colorScheme,
        path,
        perm,
      })),
    [terms, visibility, has],
  );
}

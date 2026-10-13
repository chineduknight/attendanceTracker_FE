import { useMemo } from "react";
import { NAV_ACTIONS, NavAction } from "config/navActions";
import { resolveText } from "config/presentationLabels";
import { useOrgPresentation } from "hooks/useOrgPresentation";
import { usePermissions } from "rbac/usePermissions";

export type ResolvedNavAction = Omit<NavAction, "label" | "feature"> & { label: string };

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
      ).map(({ label, icon, palette, path, perm }) => ({
        label: resolveText(label, terms),
        icon,
        palette,
        path,
        perm,
      })),
    [terms, visibility, has],
  );
}

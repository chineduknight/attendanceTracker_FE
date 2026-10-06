import { useMemo } from "react";
import useGlobalStore from "zStore";
import {
  effectiveFeatureVisibility,
  effectiveTerminology,
  isFeatureVisible,
  OptionalFeature,
} from "helpers/organisationPresentation";

/** The selected organisation's effective terminology and module visibility. */
export function useOrgPresentation() {
  const terminology = useGlobalStore((s) => s.organisation.terminology);
  const featureVisibility = useGlobalStore((s) => s.organisation.featureVisibility);
  return useMemo(() => {
    const source = { terminology, featureVisibility };
    return {
      terms: effectiveTerminology(source),
      visibility: effectiveFeatureVisibility(source),
      isFeatureVisible: (feature: OptionalFeature) => isFeatureVisible(source, feature),
    };
  }, [terminology, featureVisibility]);
}

/** Shorthand for components that only need the words. */
export const useTerms = () => useOrgPresentation().terms;

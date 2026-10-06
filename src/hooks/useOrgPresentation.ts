import { useMemo } from "react";
import useGlobalStore from "zStore";
import {
  effectiveFeatureVisibility,
  effectiveTerminology,
  OptionalFeature,
} from "helpers/organisationPresentation";

/** The selected organisation's effective terminology and module visibility. */
export function useOrgPresentation() {
  const [terminology, featureVisibility] = useGlobalStore((s) => [
    s.organisation.terminology,
    s.organisation.featureVisibility,
  ]);
  return useMemo(() => {
    const visibility = effectiveFeatureVisibility({ featureVisibility });
    return {
      terms: effectiveTerminology({ terminology }),
      visibility,
      isFeatureVisible: (feature: OptionalFeature) => visibility[feature],
    };
  }, [terminology, featureVisibility]);
}

/** Shorthand for components that only need the words. */
export const useTerms = () => useOrgPresentation().terms;

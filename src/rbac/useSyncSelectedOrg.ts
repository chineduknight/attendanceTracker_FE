import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import useGlobalStore, { EMPTY_ORG, OrganisationType } from "zStore";
import { OrganisationSummary } from "rbac/types";

export function useSyncSelectedOrg(): { refresh: () => void } {
  const [organisation, updateOrganisation] = useGlobalStore((s) => [
    s.organisation,
    s.updateOrganisation,
  ]);

  const reconcile = (data: { data: OrganisationSummary[] }) => {
    if (!organisation.id) return;
    const fresh = data.data.find((o) => o.id === organisation.id);
    updateOrganisation((fresh as OrganisationType) ?? EMPTY_ORG);
  };

  // Shares the ["all-organisations"] key with Organisations.tsx — React Query dedupes the request; each observer's onSuccess still fires independently.
  const { refetch } = useQueryWrapper(
    ["all-organisations"],
    orgRequest.ORGANISATIONS,
    { onSuccess: reconcile, enabled: !!organisation.id }
  );

  return { refresh: () => void refetch() };
}

import { Tabs } from "@chakra-ui/react";
import PageContainer from "components/layout/PageContainer";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import OfficersTab from "components/officers/OfficersTab";
import PendingInvitesTab from "components/officers/PendingInvitesTab";
import RolesTab from "components/officers/RolesTab";
import { useTerms } from "hooks/useOrgPresentation";

interface ContentProps { organisationId: string; }

/**
 * Holds all officer/role tab and modal state. `OfficersRoles` remounts this
 * subtree when the organisation changes (via `key`), so an Organisation A
 * officer, role, invite or open modal can never stay actionable against
 * Organisation B.
 */
const OfficersRolesContent = ({ organisationId }: ContentProps) => {
  const terms = useTerms();
  return (
    <PageContainer width="content">
        <Tabs.Root defaultValue="officers" variant="enclosed" colorPalette="blue" fitted>
          <Tabs.List mb={3}>
            <Tabs.Trigger value="officers" minH="44px">{terms.officerPlural}</Tabs.Trigger>
            {/* "Invites" fits three tabs across a 320px phone. */}
            <Tabs.Trigger value="invites" minH="44px">Invites</Tabs.Trigger>
            <Tabs.Trigger value="roles" minH="44px">Roles</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="officers"><OfficersTab organisationId={organisationId} /></Tabs.Content>
          <Tabs.Content value="invites"><PendingInvitesTab organisationId={organisationId} /></Tabs.Content>
          <Tabs.Content value="roles"><RolesTab organisationId={organisationId} /></Tabs.Content>
        </Tabs.Root>
    </PageContainer>
  );
};

const OfficersRoles = () => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return (
    <RequirePermission perm="officers.view">
      <OfficersRolesContent key={organisation.id} organisationId={organisation.id} />
    </RequirePermission>
  );
};

export default OfficersRoles;

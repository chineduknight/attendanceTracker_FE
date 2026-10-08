import { Box, Tabs } from "@chakra-ui/react";
import { useColorModeValue } from "components/ui/color-mode";
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
    <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>
      <Box p={4}>
        <Tabs.Root defaultValue="officers" variant="enclosed" colorPalette="blue">
          <Tabs.List>
            <Tabs.Trigger value="officers">{terms.officerPlural}</Tabs.Trigger>
            <Tabs.Trigger value="invites">Pending Invites</Tabs.Trigger>
            <Tabs.Trigger value="roles">Roles</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="officers"><OfficersTab organisationId={organisationId} /></Tabs.Content>
          <Tabs.Content value="invites"><PendingInvitesTab organisationId={organisationId} /></Tabs.Content>
          <Tabs.Content value="roles"><RolesTab organisationId={organisationId} /></Tabs.Content>
        </Tabs.Root>
      </Box>
    </Box>
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

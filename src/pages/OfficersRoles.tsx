import {
  Box, Tabs, TabList, TabPanels, Tab, TabPanel, useColorModeValue,
} from "@chakra-ui/react";
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
        <Tabs variant="enclosed" colorScheme="blue">
          <TabList>
            <Tab>{terms.officerPlural}</Tab>
            <Tab>Pending Invites</Tab>
            <Tab>Roles</Tab>
          </TabList>
          <TabPanels>
            <TabPanel><OfficersTab organisationId={organisationId} /></TabPanel>
            <TabPanel><PendingInvitesTab organisationId={organisationId} /></TabPanel>
            <TabPanel><RolesTab organisationId={organisationId} /></TabPanel>
          </TabPanels>
        </Tabs>
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

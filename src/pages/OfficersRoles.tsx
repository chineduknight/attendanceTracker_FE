import {
  Box, Tabs, TabList, TabPanels, Tab, TabPanel, useColorModeValue,
} from "@chakra-ui/react";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import OfficersTab from "components/officers/OfficersTab";
import PendingInvitesTab from "components/officers/PendingInvitesTab";
import RolesTab from "components/officers/RolesTab";

const OfficersRoles = () => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return (
    <RequirePermission perm="officers.view">
      <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>
        <Box p={4}>
          <Tabs variant="enclosed" colorScheme="blue">
            <TabList>
              <Tab>Officers</Tab>
              <Tab>Pending Invites</Tab>
              <Tab>Roles</Tab>
            </TabList>
            <TabPanels>
              <TabPanel><OfficersTab organisationId={organisation.id} /></TabPanel>
              <TabPanel><PendingInvitesTab organisationId={organisation.id} /></TabPanel>
              <TabPanel><RolesTab organisationId={organisation.id} /></TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </Box>
    </RequirePermission>
  );
};

export default OfficersRoles;

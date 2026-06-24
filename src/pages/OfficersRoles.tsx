import {
  Box, Flex, Text, Tabs, TabList, TabPanels, Tab, TabPanel, useColorModeValue,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import BackButton from "components/BackButton";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import OfficersTab from "components/officers/OfficersTab";
import PendingInvitesTab from "components/officers/PendingInvitesTab";
import RolesTab from "components/officers/RolesTab";

const OfficersRoles = () => {
  const navigate = useNavigate();
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return (
    <RequirePermission perm="officers.view">
      <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>
        <Flex bg="blue.500" justifyContent="space-between" alignItems="center" p="4">
          <Text fontWeight="bold" color="#fff">Officers &amp; Roles</Text>
        </Flex>
        <BackButton handleClick={() => navigate(-1)} />
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

import { useState } from "react";
import {
  Box,
  Flex,
  Text,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useColorModeValue,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import BackButton from "components/BackButton";
import ObligationsTab from "components/finance/ObligationsTab";
import ComplianceTab from "components/finance/ComplianceTab";
import PaymentsTab from "components/finance/PaymentsTab";
import AccountabilityTab from "components/finance/AccountabilityTab";
import useGlobalStore from "zStore";

const Finance = () => {
  const navigate = useNavigate();
  const [selectedObligationId, setSelectedObligationId] = useState<string>("");
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [prefillMemberId, setPrefillMemberId] = useState<string>("");
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex bg="blue.500" justifyContent="space-between" alignItems="center" p="4">
        <Text fontWeight="bold" color="#fff">
          Finance
        </Text>
      </Flex>

      <BackButton handleClick={() => navigate(-1)} />

      <Box p={4}>
        <Tabs index={tabIndex} onChange={setTabIndex} variant="enclosed" colorScheme="green">
          <TabList>
            <Tab>Obligations</Tab>
            <Tab>Compliance</Tab>
            <Tab>Payments</Tab>
            <Tab>Accountability</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <ObligationsTab
                organisationId={organisation.id}
                selectedObligationId={selectedObligationId}
                onSelectObligation={(id) => {
                  setSelectedObligationId(id);
                  setTabIndex(1);
                }}
              />
            </TabPanel>
            <TabPanel>
              <ComplianceTab
                organisationId={organisation.id}
                obligationId={selectedObligationId}
                onSetStartDate={(memberId) => {
                  setPrefillMemberId(memberId);
                  setTabIndex(3);
                }}
              />
            </TabPanel>
            <TabPanel>
              <PaymentsTab organisationId={organisation.id} />
            </TabPanel>
            <TabPanel>
              <AccountabilityTab
                organisationId={organisation.id}
                prefillMemberId={prefillMemberId}
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Box>
  );
};

export default Finance;

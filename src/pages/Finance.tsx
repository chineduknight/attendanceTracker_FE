import { useState } from "react";
import {
  Box,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useColorModeValue,
} from "@chakra-ui/react";
import ObligationsTab from "components/finance/ObligationsTab";
import ComplianceTab from "components/finance/ComplianceTab";
import PaymentsTab from "components/finance/PaymentsTab";
import AccountabilityTab from "components/finance/AccountabilityTab";
import useGlobalStore from "zStore";

const FinanceWorkspace = ({ organisationId }: { organisationId: string }) => {
  const [selectedObligationId, setSelectedObligationId] = useState<string>("");
  const [tabIndex, setTabIndex] = useState<number>(0);
  const [prefillMemberId, setPrefillMemberId] = useState<string>("");

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
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
                organisationId={organisationId}
                selectedObligationId={selectedObligationId}
                onSelectObligation={(id) => {
                  setSelectedObligationId(id);
                  setTabIndex(1);
                }}
              />
            </TabPanel>
            <TabPanel>
              <ComplianceTab
                organisationId={organisationId}
                obligationId={selectedObligationId}
                onSetStartDate={(memberId) => {
                  setPrefillMemberId(memberId);
                  setTabIndex(3);
                }}
              />
            </TabPanel>
            <TabPanel>
              <PaymentsTab organisationId={organisationId} />
            </TabPanel>
            <TabPanel>
              <AccountabilityTab
                organisationId={organisationId}
                prefillMemberId={prefillMemberId}
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Box>
  );
};

/**
 * Finance owns no selection state itself: `FinanceWorkspace` is keyed by the
 * organisation id so switching organisations remounts it, clearing the
 * selected obligation, prefill member and tab index before Organisation B can
 * use an Organisation A id.
 */
const Finance = () => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return <FinanceWorkspace key={organisation.id} organisationId={organisation.id} />;
};

export default Finance;

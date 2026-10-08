import { useState } from "react";
import {
  Box,
  Button,
  Center,
  Spinner,
  Stack,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import CollectTab from "components/finance/CollectTab";
import ObligationsTab from "components/finance/ObligationsTab";
import StartDatesTab from "components/finance/StartDatesTab";
import { defaultObligationId } from "helpers/financeCompliance";
import { useObligations } from "hooks/useFinance";
import { usePermissions } from "rbac/usePermissions";
import useGlobalStore from "zStore";

const TABS = ["Collect", "Obligations", "Start dates"] as const;
const COLLECT = 0;
const OBLIGATIONS = 1;

const FinanceWorkspace = ({ organisationId }: { organisationId: string }) => {
  const canManage = usePermissions().has("finance.manage");
  const [tabIndex, setTabIndex] = useState(COLLECT);
  const [chosenId, setChosenId] = useState("");
  const { obligations, isLoading } = useObligations(organisationId);
  const tabBg = useColorModeValue("white", "gray.700");

  // A chosen obligation that has since been deleted falls back to the default.
  const obligationId = obligations.some((o) => o.id === chosenId)
    ? chosenId
    : defaultObligationId(obligations);

  const collect = () => {
    if (isLoading) {
      return (
        <Center py={10}>
          <Spinner />
        </Center>
      );
    }
    if (!obligations.length) {
      return (
        <Stack align="center" textAlign="center" py={10} spacing={3}>
          <Text fontWeight="semibold">Nothing to collect yet</Text>
          <Text fontSize="sm" color="gray.500">
            Set up monthly dues or a one-off levy first.
          </Text>
          {canManage && (
            <Button colorScheme="teal" onClick={() => setTabIndex(OBLIGATIONS)}>
              Set up an obligation
            </Button>
          )}
        </Stack>
      );
    }
    return (
      <CollectTab
        organisationId={organisationId}
        obligations={obligations}
        obligationId={obligationId}
        onObligationChange={setChosenId}
      />
    );
  };

  return (
    <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>
      <Box maxW="3xl" mx="auto" px={{ base: 3, md: 6 }} py={{ base: 3, md: 6 }}>
        <Tabs index={tabIndex} onChange={setTabIndex} variant="soft-rounded" colorScheme="teal" isFitted isLazy>
          <TabList bg={tabBg} borderWidth="1px" borderRadius="full" p={1} mb={4}>
            {TABS.map((label) => (
              <Tab key={label} fontSize="sm" px={2} py={1.5}>
                {label}
              </Tab>
            ))}
          </TabList>
          <TabPanels>
            <TabPanel p={0}>{collect()}</TabPanel>
            <TabPanel p={0}>
              <ObligationsTab
                organisationId={organisationId}
                obligations={obligations}
                onOpen={(id) => {
                  setChosenId(id);
                  setTabIndex(COLLECT);
                }}
              />
            </TabPanel>
            <TabPanel p={0}>
              <StartDatesTab organisationId={organisationId} />
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
 * chosen obligation, open member sheet, selections and tab before
 * Organisation B can use an Organisation A id.
 */
const Finance = () => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return <FinanceWorkspace key={organisation.id} organisationId={organisation.id} />;
};

export default Finance;

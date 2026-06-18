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

const Finance = () => {
  const navigate = useNavigate();
  const [selectedObligationId, setSelectedObligationId] = useState<string>("");
  const [tabIndex, setTabIndex] = useState<number>(0);

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
              <Text>Obligations coming soon</Text>
            </TabPanel>
            <TabPanel>
              <Text>Compliance coming soon</Text>
            </TabPanel>
            <TabPanel>
              <Text>Payments coming soon</Text>
            </TabPanel>
            <TabPanel>
              <Text>Accountability coming soon</Text>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Box>
  );
};

export default Finance;

import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  Heading,
  Grid,
} from "@chakra-ui/react";
import {
  FaUserPlus,
  FaCalendarPlus,
  FaClipboardList,
  FaEye,
  FaChartBar,
} from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";

const Dashboard = () => {
  const location = useLocation();
  const state: any = location.state;

  const navigate = useNavigate();
  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Attendance Tracker
        </Text>
      </Flex>

      <Heading mt="4" fontSize="22px" textAlign="center">
        {state?.name}
      </Heading>

      <Grid
        templateColumns={["repeat(1, 1fr)", "repeat(2, 1fr)"]}
        gap={6}
        p={4}
      >
        <Button
          leftIcon={<FaUserPlus />}
          colorScheme="teal"
          variant="outline"
          onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}
        >
          Add Member
        </Button>
        <Button
          leftIcon={<FaEye />}
          colorScheme="blue"
          variant="outline"
          onClick={() => navigate(PROTECTED_PATHS.VIEW_MEMBER)}
        >
          View Members
        </Button>

        <Button
          leftIcon={<FaCalendarPlus />}
          colorScheme="yellow"
          variant="outline"
          onClick={() => navigate(PROTECTED_PATHS.CREATE_ATTENDANCE)}
        >
          Create Attendance
        </Button>
        <Button
          leftIcon={<FaClipboardList />}
          colorScheme="purple"
          variant="outline"
          onClick={() => navigate(PROTECTED_PATHS.ALL_ATTENDANCE)}
        >
          All Attendance
        </Button>
        <Button
          leftIcon={<FaChartBar />}
          colorScheme="purple"
          variant="outline"
          onClick={() => navigate(PROTECTED_PATHS.ANALYTICS)}
        >
          Analytics
        </Button>
      </Grid>
    </Box>
  );
};

export default Dashboard;

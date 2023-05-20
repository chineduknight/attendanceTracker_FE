import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  HStack,
  Heading,
} from "@chakra-ui/react";
import { useLocation, useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";


const Dashboard = () => {
  const location = useLocation()
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

      <Heading
        mt="4"
        fontSize="22px"
        textAlign='center'>
        {state?.name}
      </Heading>
      <Box alignItems='center'>
        <HStack spacing="4" p="4" wrap="wrap">
          <Button onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}>
            Add Member
          </Button>
          <Button onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}>
            Create Model
          </Button>
        </HStack>
        <HStack spacing="4" p="4" wrap="wrap">
          <Button
            ml="4"
            onClick={() => navigate(PROTECTED_PATHS.CREATE_ATTENDANCE)}
          >
            Create Attendance
          </Button>
          <Button
            ml="4"
            onClick={() => navigate(PROTECTED_PATHS.ALL_ATTENDANCE)}
          >
            All Attendance
          </Button>
        </HStack>
      </Box>
    </Box>
  );
};

export default Dashboard;
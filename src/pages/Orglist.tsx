import {
  Box, Flex, useColorModeValue, Button, Text, Stack
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import logo from '../logo.svg'
import { PROTECTED_PATHS } from "../routes/pagePath";


const OrgList = () => {
  const navigate = useNavigate();


  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >

        <Text color="#fff"> Attendance Tracker</Text>
        <Button onClick={() => navigate(PROTECTED_PATHS.ADD_ORG)}>+ Add Org</Button>
      </Flex>
      <Stack
        spacing={4}
        w={"full"}
        maxW={"md"}
        bg={useColorModeValue("white", "gray.700")}
        rounded={"xl"}
        boxShadow={"lg"}
        p={6}
        my={12}
        mx='auto'
      >
        <Text fontWeight='bold'>No organisation yet</Text>
      </Stack>

    </Box>
  );
};

export default OrgList;

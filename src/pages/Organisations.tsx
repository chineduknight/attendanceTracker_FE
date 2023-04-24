import {
  Box, Flex, useColorModeValue, Button, Text, Stack, Image
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useQueryWrapper } from 'services/api/apiHelper';
import useGlobalStore from 'zStore';

const OrgList = () => {
  const navigate = useNavigate();

  const { data } = useQueryWrapper(["all-organisations"], "/organisations");

  function handOrg(userData) {
    navigate(PROTECTED_PATHS.DASHBOARD, { state: userData })
  }

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff">Attendance Tracker</Text>
        <Button onClick={() => navigate(PROTECTED_PATHS.ADD_ORG)}>+</Button>
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
        {
          (data?.data) ? <>{data?.data.map(org => <Flex key={org.id}
            alignItems="center"
            onClick={() => { handOrg(org) }}
          >
            <Image src={org.imageURL} alt='Dan Abramov'
              w="45px"
              h="45px"
              objectFit="cover"
              borderRadius="50%"
            />
            <Text ml="4">

              {org.name}
            </Text>
          </Flex>)}</> :

            <Text ml="4" fontWeight='bold'>No organisation yet</Text>
        }
      </Stack>

    </Box>
  );
};

export default OrgList;
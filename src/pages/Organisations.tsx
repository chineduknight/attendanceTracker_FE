import {
  Box,
  Flex,
  useColorModeValue,
  Button,
  Text,
  Stack,
  Avatar,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import {
  deleteRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { FaTrashAlt } from "react-icons/fa";
import { useState } from "react";
import { orgRequest } from "services";
import useGlobalStore from "zStore";

type OrgType = {
  name: string;
  image: string;
  owner: string;
  createdAt: string;
  updatedAt: string;
  id: string;
};

const OrgList = () => {
  const navigate = useNavigate();
  const [setOrg, setUser] = useGlobalStore((state) => [
    state.updateOrganisation,
    state.setUser,
  ]);
  const onSuccess = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["all-organistions"] });
  };

  const { mutate } = useMutationWrapper(deleteRequest, onSuccess);

  const [allOrg, setAllOrg] = useState<OrgType[]>([]);
  const handleGetOrgSuccess = (data) => {
    setAllOrg(data.data);
  };
  const { refetch } = useQueryWrapper(
    ["all-organisations"],
    orgRequest.ORGANISATIONS,
    {
      onSuccess: handleGetOrgSuccess,
    }
  );

  function handleDelete(orgDelete, e) {
    mutate({
      url: `/organisations/${orgDelete.id}`,
    });
    e.stopPropagation();
  }

  function handOrg(org) {
    setOrg(org);
    navigate(PROTECTED_PATHS.DASHBOARD, { state: org });
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
        <Button
        variant="logout"
          onClick={() =>
            setUser({
              token: "",
              id: "",
              username: "",
            })
          }
        >
          Logout
        </Button>
      </Flex>
      <Button  mt="4" ml="6" onClick={() => navigate(PROTECTED_PATHS.ADD_ORG)}>
        + Add Org
      </Button>
      <Stack
        spacing={4}
        w={"full"}
        maxW={"md"}
        bg={useColorModeValue("white", "gray.700")}
        rounded={"xl"}
        boxShadow={"lg"}
        p={6}
        my={12}
        mx="auto"
      >
        {allOrg.length ? (
          <>
            {allOrg.map((org) => (
              <Flex
                key={org.id}
                cursor="pointer"
                borderRadius="10px"
                alignItems="center"
                justifyContent="space-between"
                p="4"
                mb="10px"
                border="1px solid rebeccapurple"
                onClick={() => {
                  handOrg(org);
                }}
              >
                <Flex alignItems="center">
                  <Avatar name={org.name} w="45px" h="45px" />
                  <Text ml="4" textAlign="left">
                    {" "}
                    {org.name}
                  </Text>
                </Flex>
                <Button onClick={(e) => handleDelete(org, e)} variant="danger">
                  <FaTrashAlt color="#fff" />
                </Button>
              </Flex>
            ))}
          </>
        ) : (
          <Text ml="4" fontWeight="bold">
            No organisation yet
          </Text>
        )}
      </Stack>
    </Box>
  );
};

export default OrgList;


import {
  Box,
  Flex,
  useColorModeValue,
  Button,
  Text,
  Stack,
  Image
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import {
  deleteRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper
} from "services/api/apiHelper";
import { FaTrashAlt } from "react-icons/fa";


const OrgList = () => {
  const navigate = useNavigate();

  const onSuccess = (data) => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["all-organistions"] });
  };

  const { mutate } = useMutationWrapper(deleteRequest, onSuccess);

  const { data, refetch } = useQueryWrapper(
    ["all-organisations"],
    "/organisations"
  );

  function handleDelete(orgDelete, e) {
    mutate({
      url: `/organisations/${orgDelete.id}`
    });
    e.stopPropagation();
  }

  function handOrg(userData) {
    navigate(PROTECTED_PATHS.DASHBOARD, { state: userData });
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
        mx="auto"
      >
        {data?.data?.length ? (
          <>
            {data?.data.map((org) => (
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
                  <Image
                    src={org.imageURL}
                    alt="Dan Abramov"
                    w="45px"
                    h="45px"
                    objectFit="cover"
                    borderRadius="50%"
                  />
                  <Text ml="4" textAlign="left"> {org.name}</Text>
                </Flex>
                <Button onClick={(e) => handleDelete(org, e)} bg="#D30000">
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
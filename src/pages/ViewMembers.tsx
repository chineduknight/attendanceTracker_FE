import { useState } from "react";
import {
  Box,
  Flex,
  Text,
  Heading,
  SimpleGrid,
  Stack,
  Avatar,
  Input,
  Button,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import _ from "lodash";
import { FaPencilAlt, FaArrowCircleLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { Q_KEY } from 'utils/constant';

const ViewMembers = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [searchQuery, setSearchQuery] = useState("");
  const navigate = useNavigate();

  const url = convertParamsToString(orgRequest.MEMBERS, {
    organisationId: org.id,
  });
  const [members, setMembers] = useState<any>([]);

  const { isLoading, error } = useQueryWrapper([Q_KEY.GET_MEMBERS], url, {
    onSuccess: (res) => {
      setMembers(res.data);
    },
  });

  if (isLoading) {
    return <Text>Loading...</Text>;
  }

  if (error) {
    return <Text>Error occurred while fetching members.</Text>;
  }

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (event) => {
    setSearchQuery(event.target.value);
  };

  const removeKeys = (obj, keys) => {
    return _.omit(obj, keys);
  };

  const filteredKeys = [
    "name",
    "createdAt",
    "updatedAt",
    "organisationId",
    "id",
  ];

  return (
    <Box minH={"100vh"} bg="gray.50">
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
        mb={4}
      >
        <Text color="#fff" fontWeight="bold">
          View Members
        </Text>
      </Flex>
      <Box px="4">
        <Flex justifyContent="space-between" mb="4">
          <Button
            variant="logout"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
            mr={2}
            leftIcon={<FaArrowCircleLeft />}
          >
            Back
          </Button>
          <Button
            variant="primary"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}
          >
            Add Member
          </Button>
        </Flex>
        <Flex justify="center" mb={8}>
          <Input
            placeholder="Search"
            // w="sm"
            value={searchQuery}
            onChange={handleSearch}
          />
        </Flex>
        {filteredMembers.length === 0 ? (
          <Box
            bg="#fff"
            py="8"
            rounded={"xl"}
            boxShadow={"lg"}
            textAlign="center"
          >
            <Heading as="h2" size="lg">
              No members found
            </Heading>
          </Box>
        ) : (
          <SimpleGrid columns={{ sm: 1, md: 2, lg: 3 }} spacing={8}>
            {filteredMembers.map((member) => (
              <Box
                key={member.id}
                bg="#fff"
                p={6}
                // mx={4}
                rounded={"xl"}
                boxShadow={"lg"}
              >
                <Stack spacing={4}>
                  {/* Render member details */}
                  <Flex justify="space-between" alignItems="center">
                    <Flex align="center">
                      <Avatar
                        size="md"
                        name={member.name}
                        src={member.avatarUrl}
                        mr={3}
                      />
                      <Text fontWeight="bold">{member.name}</Text>
                    </Flex>
                    <Button
                      variant="outline"
                      colorScheme="blue"
                      onClick={() => {
                        const pagePath = convertParamsToString(
                          PROTECTED_PATHS.UPDATE_MEMBER,
                          { memberId: member.id }
                        );
                        navigate(pagePath);
                      }}
                    >
                      <FaPencilAlt />
                    </Button>
                  </Flex>
                  {Object.entries(removeKeys(member, filteredKeys)).map(
                    ([key, value]: any) => (
                      <Flex key={key} align="center">
                        <Text fontWeight="bold" flexShrink={0} mr={2}>
                          {capitalize(key)}:
                        </Text>
                        <Text>{value}</Text>
                      </Flex>
                    )
                  )}
                </Stack>
              </Box>
            ))}
          </SimpleGrid>
        )}
      </Box>
    </Box>
  );
};

export default ViewMembers;

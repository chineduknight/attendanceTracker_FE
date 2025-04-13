import { useEffect, useState, useMemo } from "react";
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
  Checkbox,
  CheckboxGroup,
  Select,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import _ from "lodash";
import { FaPencilAlt, FaArrowCircleLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { Q_KEY } from "utils/constant";

const ViewMembers: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    const stored = localStorage.getItem("selectedFields");
    return stored ? JSON.parse(stored) : [];
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const navigate = useNavigate();
  // The keys you always want to exclude
  const filteredKeys = useMemo(
    () => ["name", "createdAt", "updatedAt", "organisationId", "id"],
    []
  );
  const modelURL = convertParamsToString(orgRequest.CONFIG_MODEL, {
    organisationId: org.id,
  });

  useQueryWrapper(["get-member-model"], modelURL, {
    onSuccess: (data) => {
      const fields = data?.data.fields;
      const statusField = fields.find((field: any) => field.name === "status");
      if (statusField && Array.isArray(statusField.options)) {
        setStatusOptions(statusField.options);
        // Set default to 'active' if present, otherwise default to "all"
        setStatusFilter(
          statusField.options.includes("active") ? "active" : "all"
        );
      }
    },
  });
  const url = convertParamsToString(orgRequest.MEMBERS, {
    organisationId: org.id,
  });
  const [members, setMembers] = useState<any[]>([]);
  const allExtraFields = useMemo(() => {
    return members.length > 0
      ? Object.keys(_.omit(members[0], filteredKeys))
      : [];
  }, [members, filteredKeys]);

  useEffect(() => {
    localStorage.setItem("selectedFields", JSON.stringify(selectedFields));
  }, [selectedFields]);
  useEffect(() => {
    if (members.length > 0 && selectedFields.length === 0) {
      setSelectedFields(allExtraFields);
    }
  }, [members, allExtraFields, selectedFields]);

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

  const filteredMembers = members.filter((member) => {
    const matchesSearch = member.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || member.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  // Remove filtered keys from member object and then only pick the ones user selected
  const getDisplayFields = (member: any) => {
    const memberEntries = Object.entries(_.omit(member, filteredKeys));
    return memberEntries.filter(([key]) => selectedFields.includes(key));
  };

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
            value={searchQuery}
            onChange={handleSearch}
            mr={4}
            maxW="300px"
          />
          <Select
            placeholder="Filter by status"
            w="200px"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {capitalize(option)}
              </option>
            ))}
          </Select>
        </Flex>{" "}
        <Text mb={4} fontWeight="bold">
          Total Members: {filteredMembers.length}{" "}
        </Text>
        <Box mb={8}>
          <Heading as="h3" size="md" mb={2}>
            Select additional fields to display:
          </Heading>
          <CheckboxGroup
            value={selectedFields}
            onChange={(values: string[]) => setSelectedFields(values)}
          >
            <Flex gap={4} wrap="wrap">
              {allExtraFields.map((field) => (
                <Checkbox key={field} value={field}>
                  {capitalize(field)}
                </Checkbox>
              ))}
            </Flex>
          </CheckboxGroup>
        </Box>
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
                rounded={"xl"}
                boxShadow={"lg"}
              >
                <Stack spacing={4}>
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
                  {/* Render only the additional fields that the user has selected */}
                  {getDisplayFields(member).map(([key, value]) => (
                    <Flex key={key} align="center">
                      <Text fontWeight="bold" flexShrink={0} mr={2}>
                        {capitalize(key)}:
                      </Text>
                      <Text>{value}</Text>
                    </Flex>
                  ))}
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

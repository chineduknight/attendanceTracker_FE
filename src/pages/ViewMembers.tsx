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
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import _ from "lodash";
import {
  FaPencilAlt,
  FaArrowCircleLeft,
  FaFileExcel,
  FaFilePdf,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { Q_KEY } from "utils/constant";
import ReactSelect, { MultiValue } from "react-select";
import LoadingSpinner from "components/LoadingSpinner";

type StatusOption = {
  value: string;
  label: string;
};
const REQUIRED_EXPORT_FIELDS = ["name"];

const ViewMembers: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    const stored = localStorage.getItem("selectedFields");
    return stored ? JSON.parse(stored) : [];
  });
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const navigate = useNavigate();
  // The keys you always want to exclude
  const filteredKeys = useMemo(
    () => ["name", "createdAt", "updatedAt", "organisationId", "id"],
    [],
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
          statusField.options.includes("active") ? ["active"] : ["all"],
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
  const exportStatuses = useMemo(
    () => statusFilter.filter((status) => status !== "all"),
    [statusFilter],
  );
  const exportFields = useMemo(
    () =>
      Array.from(
        new Set([
          ...REQUIRED_EXPORT_FIELDS,
          ...selectedFields.filter((field) => Boolean(field)),
        ]),
      ),
    [selectedFields],
  );
  const exportQueryString = useMemo(() => {
    const queryParams = new URLSearchParams();

    if (exportStatuses.length) {
      queryParams.set("status", exportStatuses.join(","));
      queryParams.set("sort", "part:asc");
    }

    if (exportFields.length) {
      queryParams.set("fields", exportFields.join(","));
    }

    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : "";
  }, [exportFields, exportStatuses]);
  const exportMembersUrl = useMemo(
    () => `${url}/export${exportQueryString}`,
    [exportQueryString, url],
  );
  const exportMembersPdfUrl = useMemo(
    () => `${url}/export/pdf${exportQueryString}`,
    [exportQueryString, url],
  );

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
  const { refetch: exportMembers, isFetching: isExportingMembers } =
    useQueryWrapper(
      [
        "export-members",
        org.id,
        exportStatuses.join(","),
        exportFields.join(","),
      ],
      exportMembersUrl,
      {
        enabled: false,
        onSuccess: (response: any) => {
          if (response?.data) {
            window.open(response.data, "_blank");
          }
        },
      },
    );
  const { refetch: exportMembersPdf, isFetching: isExportingMembersPdf } =
    useQueryWrapper(
      [
        "export-members-pdf",
        org.id,
        exportStatuses.join(","),
        exportFields.join(","),
      ],
      exportMembersPdfUrl,
      {
        enabled: false,
        onSuccess: (response: any) => {
          if (response?.data) {
            window.open(response.data, "_blank");
          }
        },
      },
    );

  const statusSelectOptions = useMemo<StatusOption[]>(
    () => [
      { value: "all", label: "All" },
      ...statusOptions.map((option) => ({
        value: option,
        label: capitalize(option),
      })),
    ],
    [statusOptions],
  );

  const selectedStatusOptions = useMemo(
    () =>
      statusSelectOptions.filter((option) =>
        statusFilter.includes(option.value),
      ),
    [statusFilter, statusSelectOptions],
  );

  const filteredMembers = members.filter((member) => {
    const matchesSearch = member.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter.includes("all") ||
      statusFilter.length === 0 ||
      statusFilter.includes(member.status);
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
        <Flex
          justifyContent="space-between"
          alignItems={{ base: "stretch", sm: "center" }}
          direction={{ base: "column", sm: "row" }}
          gap={2}
          mb={2}
        >
          <Button
            variant="logout"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
            w={{ base: "100%", sm: "auto" }}
            leftIcon={<FaArrowCircleLeft />}
          >
            Back
          </Button>
          <Button
            variant="primary"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}
            w={{ base: "100%", sm: "auto" }}
          >
            Add Member
          </Button>
        </Flex>
        <Flex
          gap={2}
          mb={4}
          justifyContent={{ base: "stretch", sm: "flex-end" }}
          direction={{ base: "column", sm: "row" }}
        >
          <Button
            leftIcon={<FaFileExcel />}
            onClick={() => exportMembers()}
            isLoading={isExportingMembers}
            isDisabled={!org.id || isLoading || Boolean(error)}
            w={{ base: "100%", sm: "auto" }}
            bg="green.500"
            color="white"
            _hover={{ bg: "green.600" }}
          >
            Export Member List
          </Button>
          <Button
            leftIcon={<FaFilePdf />}
            onClick={() => exportMembersPdf()}
            isLoading={isExportingMembersPdf}
            isDisabled={!org.id || isLoading || Boolean(error)}
            w={{ base: "100%", sm: "auto" }}
            bg="red.500"
            color="white"
            _hover={{ bg: "red.600" }}
          >
            Export Member PDF
          </Button>
        </Flex>
        {isLoading ? (
          <LoadingSpinner h="45vh" text="Loading members..." />
        ) : error ? (
          <Box bg="#fff" py="8" rounded={"xl"} boxShadow={"lg"} textAlign="center">
            <Text color="red.500" fontWeight="bold">
              Error occurred while fetching members.
            </Text>
          </Box>
        ) : (
          <>
            <Flex
              justify="center"
              mb={8}
              direction={{ base: "column", md: "row" }}
              gap={3}
            >
              <Input
                placeholder="Search"
                value={searchQuery}
                onChange={handleSearch}
                mr={0}
                maxW={{ base: "100%", md: "300px" }}
              />
              <Box minW={{ base: "100%", md: "220px" }}>
                <ReactSelect
                  isMulti
                  placeholder="Filter by status"
                  options={statusSelectOptions}
                  value={selectedStatusOptions}
                  closeMenuOnSelect={false}
                  onChange={(selected: MultiValue<StatusOption>) => {
                    const values = selected.map((item) => item.value);
                    if (values.length === 0) {
                      setStatusFilter(["all"]);
                      return;
                    }
                    if (values.includes("all") && values.length > 1) {
                      setStatusFilter(values.filter((value) => value !== "all"));
                      return;
                    }
                    if (values.includes("all")) {
                      setStatusFilter(["all"]);
                      return;
                    }
                    setStatusFilter(values);
                  }}
                />
              </Box>
            </Flex>
            <Text mb={4} fontWeight="bold">
              Total Members: {filteredMembers.length}
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
                              { memberId: member.id },
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
          </>
        )}
      </Box>
    </Box>
  );
};

export default ViewMembers;

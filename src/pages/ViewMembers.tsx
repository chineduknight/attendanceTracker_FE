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
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Icon,
  Collapse,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverCloseButton,
  PopoverBody,
  useBreakpointValue,
  useDisclosure,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import useGlobalStore from "zStore";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import { format, parseISO, isValid } from "date-fns";
import _ from "lodash";
import {
  FaPencilAlt,
  FaFileExcel,
  FaFilePdf,
  FaUserPlus,
  FaShareAlt,
  FaChevronDown,
  FaChevronUp,
  FaFilter,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import ReactSelect, { MultiValue } from "react-select";
import { useMemberModel } from "hooks/useMemberModel";
import { memberFieldLabeler } from "helpers/memberFields";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { queryKeys } from "services/api/queryKeys";

type SelectOption = {
  value: string;
  label: string;
};
type FilterableField = {
  name: string;
  options: string[];
};
const REQUIRED_EXPORT_FIELDS = ["name"];

const ViewMembers: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [searchQuery, setSearchQuery] = useState("");
  const selectedFieldsStorageKey = `selectedFields-${org.id}`;
  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    const stored = localStorage.getItem(selectedFieldsStorageKey);
    return stored ? JSON.parse(stored) : [];
  });
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const navigate = useNavigate();
  const isCompactActions = useBreakpointValue({ base: true, sm: false });
  const { isOpen: isFieldsOpen, onToggle: onFieldsToggle } = useDisclosure();
  // The keys you always want to exclude
  const filteredKeys = useMemo(
    () => ["name", "createdAt", "updatedAt", "organisationId", "id"],
    [],
  );
  // Display labels only; filters, query params and saved columns keep storage keys.
  const { fields: modelFields } = useMemberModel(org.id);
  const labelFor = useMemo(() => memberFieldLabeler(modelFields), [modelFields]);
  const filterableFields = useMemo<FilterableField[]>(
    () =>
      modelFields
        .filter((field) => field.type === "option" && Array.isArray(field.options))
        .map((field) => ({ name: field.name, options: field.options ?? [] })),
    [modelFields],
  );
  const url = convertParamsToString(orgRequest.MEMBERS, {
    organisationId: org.id,
  });
  const [members, setMembers] = useState<any[]>([]);
  const allExtraFields = useMemo(() => {
    return members.length > 0
      ? Object.keys(_.omit(members[0], filteredKeys))
      : [];
  }, [members, filteredKeys]);
  const activeExportFilters = useMemo(
    () => Object.entries(filters).filter(([, values]) => values.length > 0),
    [filters],
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

    activeExportFilters.forEach(([field, values]) => {
      queryParams.set(field, values.join(","));
    });
    if (exportFields.length) {
      queryParams.set("fields", exportFields.join(","));
    }

    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : "";
  }, [exportFields, activeExportFilters]);
  const exportMembersUrl = useMemo(
    () => `${url}/export${exportQueryString}`,
    [exportQueryString, url],
  );
  const exportMembersPdfUrl = useMemo(
    () => `${url}/export/pdf${exportQueryString}`,
    [exportQueryString, url],
  );

  useEffect(() => {
    localStorage.setItem(selectedFieldsStorageKey, JSON.stringify(selectedFields));
  }, [selectedFields, selectedFieldsStorageKey]);
  useEffect(() => {
    if (members.length > 0 && selectedFields.length === 0) {
      setSelectedFields(allExtraFields);
    }
  }, [members, allExtraFields, selectedFields]);

  const { isLoading, error } = useQueryWrapper(queryKeys.members(org.id), url, {
    onSuccess: (res) => {
      setMembers(res.data);
    },
  });
  const { refetch: exportMembers, isFetching: isExportingMembers } =
    useQueryWrapper(
      [
        "export-members",
        org.id,
        JSON.stringify(filters),
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
        JSON.stringify(filters),
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

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((values) => values.length > 0).length,
    [filters],
  );

  const filteredMembers = members.filter((member) => {
    const matchesSearch = member.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesFilters = filterableFields.every((field) => {
      const values = filters[field.name];
      if (!values || values.length === 0) return true;
      return values.includes(member[field.name]);
    });
    return matchesSearch && matchesFilters;
  });

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  // Remove filtered keys from member object and then only pick the ones user selected
  const getDisplayFields = (member: any) => {
    const memberEntries = Object.entries(_.omit(member, filteredKeys));
    return memberEntries.filter(([key]) => selectedFields.includes(key));
  };

  const formatFieldValue = (value: any): string => {
    if (typeof value === "string" && /\d{4}/.test(value)) {
      const parsed = parseISO(value);
      if (isValid(parsed)) return format(parsed, "dd-MMM-yyyy");
    }
    return String(value ?? "");
  };

  return (
    <Box minH={"100vh"} bg="gray.50">
      <Box px="4">
        <Flex alignItems="center" justifyContent="flex-end" mb={4}>
          <Flex gap={2}>
            <Can perm="members.manage">
              <Button
                variant="primary"
                colorScheme="blue"
                onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}
                leftIcon={<FaUserPlus />}
                aria-label="Add Member"
                px={isCompactActions ? 3 : 4}
              >
                {!isCompactActions && "Add Member"}
              </Button>
            </Can>
            <Menu>
              <MenuButton
                as={Button}
                variant="solid"
                colorScheme="teal"
                leftIcon={<FaShareAlt />}
                aria-label="Share"
                px={isCompactActions ? 3 : 4}
              >
                {!isCompactActions && "Share"}
              </MenuButton>
              <MenuList>
                <MenuItem
                  icon={<Icon as={FaFileExcel} color="green.500" />}
                  color="green.600"
                  onClick={() => exportMembers()}
                  isDisabled={
                    !org.id || isLoading || Boolean(error) || isExportingMembers
                  }
                >
                  {isExportingMembers ? "Exporting..." : "Export Member List"}
                </MenuItem>
                <MenuItem
                  icon={<Icon as={FaFilePdf} color="red.500" />}
                  color="red.600"
                  onClick={() => exportMembersPdf()}
                  isDisabled={
                    !org.id ||
                    isLoading ||
                    Boolean(error) ||
                    isExportingMembersPdf
                  }
                >
                  {isExportingMembersPdf ? "Exporting..." : "Export Member PDF"}
                </MenuItem>
              </MenuList>
            </Menu>
          </Flex>
        </Flex>
        {isLoading ? (
          <LoadingSpinner h="45vh" text="Loading members..." />
        ) : error ? (
          <Box
            bg="#fff"
            py="8"
            rounded={"xl"}
            boxShadow={"lg"}
            textAlign="center"
          >
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
              {filterableFields.length > 0 && (
                <Popover placement="bottom-end" closeOnBlur>
                  <PopoverTrigger>
                    <Button
                      leftIcon={<FaFilter />}
                      variant="outline"
                      colorScheme="blue"
                      w={{ base: "100%", md: "auto" }}
                    >
                      Filters
                      {activeFilterCount > 0 && ` (${activeFilterCount})`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent w={{ base: "280px", md: "320px" }}>
                    <PopoverArrow />
                    <PopoverCloseButton />
                    <PopoverBody>
                      <Flex align="center" gap={3} mb={2} pr={6}>
                        <Text fontWeight="bold">Filter by</Text>
                        {activeFilterCount > 0 && (
                          <Button
                            size="xs"
                            variant="link"
                            colorScheme="blue"
                            onClick={() => setFilters({})}
                          >
                            Clear all
                          </Button>
                        )}
                      </Flex>
                      {filterableFields.map((field) => {
                        const options: SelectOption[] = field.options.map(
                          (option) => ({
                            value: option,
                            label: capitalize(option),
                          }),
                        );
                        const selected = options.filter((option) =>
                          (filters[field.name] ?? []).includes(option.value),
                        );
                        return (
                          <Box key={field.name} mb={3}>
                            <Text fontSize="sm" fontWeight="bold" mb={1}>
                              {labelFor(field.name)}
                            </Text>
                            <ReactSelect
                              isMulti
                              placeholder={`Filter by ${labelFor(field.name)}`}
                              options={options}
                              value={selected}
                              closeMenuOnSelect={false}
                              onChange={(selected: MultiValue<SelectOption>) => {
                                const values = selected.map(
                                  (item) => item.value,
                                );
                                setFilters((prev) => ({
                                  ...prev,
                                  [field.name]: values,
                                }));
                              }}
                            />
                          </Box>
                        );
                      })}
                    </PopoverBody>
                  </PopoverContent>
                </Popover>
              )}
            </Flex>
            <Text mb={4} fontWeight="bold">
              Total Members: {filteredMembers.length}
            </Text>
            <Box mb={8}>
              <Flex
                align="center"
                justify="space-between"
                mb={2}
                onClick={isCompactActions ? onFieldsToggle : undefined}
                cursor={{ base: "pointer", md: "default" }}
              >
                <Heading as="h3" size="md">
                  Select additional fields to display:
                </Heading>
                <Box display={{ base: "block", md: "none" }} color="gray.500">
                  {isFieldsOpen ? <FaChevronUp /> : <FaChevronDown />}
                </Box>
              </Flex>
              {isCompactActions && !isFieldsOpen && (
                <Text fontSize="sm" color="gray.500">
                  {selectedFields.length} selected — tap to customize
                </Text>
              )}
              <Collapse in={!isCompactActions || isFieldsOpen} animateOpacity>
                <CheckboxGroup
                  value={selectedFields}
                  onChange={(values: string[]) => setSelectedFields(values)}
                >
                  <Flex gap={4} wrap="wrap" pt={2}>
                    {allExtraFields.map((field) => (
                      <Checkbox key={field} value={field}>
                        {labelFor(field)}
                      </Checkbox>
                    ))}
                  </Flex>
                </CheckboxGroup>
              </Collapse>
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
                        <Can perm="members.manage">
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
                        </Can>
                      </Flex>
                      {/* Render only the additional fields that the user has selected */}
                      {getDisplayFields(member).map(([key, value]) => (
                        <Flex key={key} align="center">
                          <Text fontWeight="bold" flexShrink={0} mr={2}>
                            {labelFor(key)}:
                          </Text>
                          <Text>{formatFieldValue(value)}</Text>
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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Flex,
  Text,
  SimpleGrid,
  Avatar,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  IconButton,
  Button,
  Checkbox,
  CheckboxGroup,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Icon,
  Collapse,
  Badge,
  Portal,
  useColorModeValue,
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
  FaFileExport,
  FaFilter,
  FaColumns,
  FaSearch,
} from "react-icons/fa";
import { FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import ReactSelect, { MultiValue } from "react-select";
import { useMemberModel } from "hooks/useMemberModel";
import { MemberRecord, useMembers } from "hooks/useMembers";
import { usePinnedSearch } from "hooks/usePinnedSearch";
import { memberFieldLabeler } from "helpers/memberFields";
import LoadingSpinner from "components/LoadingSpinner";
import TruncatedText from "components/TruncatedText";
import { Can } from "rbac/Can";
import { useTerms } from "hooks/useOrgPresentation";
import { LABELS } from "config/presentationLabels";
import { lowerTerm } from "helpers/organisationPresentation";

type SelectOption = {
  value: string;
  label: string;
};
type FilterableField = {
  name: string;
  options: string[];
};
type OpenPanel = "filters" | "fields" | null;

const REQUIRED_EXPORT_FIELDS = ["name"];
// Keys never offered as extra display fields.
const HIDDEN_KEYS = ["name", "createdAt", "updatedAt", "organisationId", "id"];

export const shownFieldsStorageKey = (organisationId: string) =>
  `memberListFields-${organisationId}`;
const legacyShownFieldsStorageKey = (organisationId: string) =>
  `selectedFields-${organisationId}`;

const parseFieldList = (raw: string | null): string[] | null => {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : null;
  } catch {
    return null;
  }
};

/**
 * The officer's chosen extra fields, or null when they have never chosen
 * (show every field). The legacy key could never hold a deliberate empty
 * choice — the old page re-selected everything — so an empty legacy list
 * means "never chosen"; the current key stores an empty choice faithfully.
 */
const readShownFields = (organisationId: string): string[] | null => {
  try {
    const current = parseFieldList(
      localStorage.getItem(shownFieldsStorageKey(organisationId))
    );
    if (current) return current;
    const legacy = parseFieldList(
      localStorage.getItem(legacyShownFieldsStorageKey(organisationId))
    );
    return legacy && legacy.length > 0 ? legacy : null;
  } catch {
    return null;
  }
};

// Server-owned audit fields; not in the member model, so label them here.
const SYSTEM_FIELD_LABELS: Record<string, string> = {
  createdBy: "Created by",
  updatedBy: "Updated by",
};

type PersonRef = { id: string; name: string };
const isPersonRef = (value: unknown): value is PersonRef =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as PersonRef).name === "string";

// Only a leading YYYY-MM-DD is a date: a bare "0801" phone is not year 801.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

const formatFieldValue = (value: unknown): string => {
  if (isPersonRef(value)) return value.name;
  if (typeof value === "string" && ISO_DATE.test(value)) {
    const parsed = parseISO(value);
    if (isValid(parsed)) return format(parsed, "dd-MMM-yyyy");
  }
  if (typeof value === "object" && value !== null) return "—";
  const text = String(value ?? "").trim();
  return text === "" ? "—" : text;
};

// Small on the card, but each still takes a 44px-tall tap: an invisible
// zone extends past the visible edge (only 4px sideways, so neighbours
// 8px apart never overlap).
const compactTapTarget = {
  position: "relative",
  _before: { content: '""', position: "absolute", inset: "-6px -4px" },
} as const;

const openExport = (response: { data?: string }) => {
  if (response?.data) window.open(response.data, "_blank");
};

const ViewMembers: React.FC = () => {
  const terms = useTerms();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const pinnedSearch = usePinnedSearch(searchQuery);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [chosenFields, setChosenFields] = useState<string[] | null>(() =>
    readShownFields(org.id)
  );

  const pageBg = useColorModeValue("gray.50", "gray.800");
  const cardBg = useColorModeValue("white", "gray.700");
  const borderColor = useColorModeValue("gray.200", "gray.600");
  const mutedColor = useColorModeValue("gray.500", "gray.400");
  // The app's header blue is the page accent; no attendance statuses show
  // here, so it cannot be mistaken for one.
  const accentColor = useColorModeValue("blue.600", "blue.300");
  const activeToggleBg = useColorModeValue("blue.50", "whiteAlpha.200");

  const { members, isLoading, isError } = useMembers(org.id);
  // Display labels only; filters, query params and saved columns keep storage keys.
  const { fields: modelFields } = useMemberModel(org.id);
  const labelFor = useMemo(() => {
    const modelLabel = memberFieldLabeler(modelFields);
    return (key: string) => SYSTEM_FIELD_LABELS[key] ?? modelLabel(key);
  }, [modelFields]);
  const filterableFields = useMemo<FilterableField[]>(
    () =>
      modelFields
        .filter(
          (field) => field.type === "option" && Array.isArray(field.options)
        )
        .map((field) => ({ name: field.name, options: field.options ?? [] })),
    [modelFields]
  );
  const optionFieldNames = useMemo(
    () => new Set(filterableFields.map((field) => field.name)),
    [filterableFields]
  );
  const allExtraFields = useMemo(
    () =>
      members.length > 0 ? Object.keys(_.omit(members[0], HIDDEN_KEYS)) : [],
    [members]
  );
  const shownFields = chosenFields ?? allExtraFields;

  useEffect(() => {
    if (chosenFields === null) return;
    try {
      localStorage.setItem(
        shownFieldsStorageKey(org.id),
        JSON.stringify(chosenFields)
      );
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  }, [chosenFields, org.id]);

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, values]) => values.length > 0),
    [filters]
  );

  const url = convertParamsToString(orgRequest.MEMBERS, {
    organisationId: org.id,
  });
  const exportFields = useMemo(
    () =>
      Array.from(
        new Set([...REQUIRED_EXPORT_FIELDS, ...shownFields.filter(Boolean)])
      ),
    [shownFields]
  );
  const exportQueryString = useMemo(() => {
    const queryParams = new URLSearchParams();
    activeFilters.forEach(([field, values]) => {
      queryParams.set(field, values.join(","));
    });
    if (exportFields.length) {
      queryParams.set("fields", exportFields.join(","));
    }
    const queryString = queryParams.toString();
    return queryString ? `?${queryString}` : "";
  }, [exportFields, activeFilters]);

  const { refetch: exportMembers, isFetching: isExportingMembers } =
    useQueryWrapper(
      [
        "export-members",
        org.id,
        JSON.stringify(filters),
        exportFields.join(","),
      ],
      `${url}/export${exportQueryString}`,
      { enabled: false, onSuccess: openExport }
    );
  const { refetch: exportMembersPdf, isFetching: isExportingMembersPdf } =
    useQueryWrapper(
      [
        "export-members-pdf",
        org.id,
        JSON.stringify(filters),
        exportFields.join(","),
      ],
      `${url}/export/pdf${exportQueryString}`,
      { enabled: false, onSuccess: openExport }
    );
  const exportUnavailable = !org.id || isLoading || isError;

  const filteredMembers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return members.filter(
      (member) =>
        member.name.toLowerCase().includes(query) &&
        activeFilters.every(([field, values]) =>
          values.includes(member[field] as string)
        )
    );
  }, [members, searchQuery, activeFilters]);

  const togglePanel = (panel: Exclude<OpenPanel, null>) =>
    setOpenPanel((current) => (current === panel ? null : panel));

  const handleSearch = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setSearchQuery(event.target.value),
    []
  );

  const displayFields = (member: MemberRecord) =>
    shownFields.filter((key) => !HIDDEN_KEYS.includes(key) && key in member);

  const memberTerm = (count: number) =>
    lowerTerm(count === 1 ? terms.memberSingular : terms.memberPlural);
  const countNumber = (count: number) => (
    <Text as="span" fontWeight="bold" color={accentColor}>
      {count}
    </Text>
  );
  const isNarrowed = filteredMembers.length !== members.length;

  const actionButtons = (
    <Flex gap={2}>
      <Can perm="members.manage">
        <Button
          flex="1"
          colorScheme="blue"
          onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}
          leftIcon={<FaUserPlus />}
        >
          {LABELS.addMember(terms)}
        </Button>
      </Can>
      <Menu placement="bottom-end">
        <MenuButton
          as={Button}
          flex="1"
          variant="outline"
          colorScheme="blue"
          leftIcon={<FaFileExport />}
        >
          Export
        </MenuButton>
        {/* Menus default to the dropdown layer (1000), below the pinned
            search bar (sticky, 1100), which would cover the lower items.
            Portaled and raised to the popover layer so it opens on top. */}
        <Portal>
          <MenuList zIndex="popover">
            <MenuItem
              icon={<Icon as={FaFileExcel} color="green.500" />}
              onClick={() => exportMembers()}
              isDisabled={exportUnavailable || isExportingMembers}
            >
              {isExportingMembers
                ? "Exporting..."
                : `Export ${terms.memberSingular} List`}
            </MenuItem>
            <MenuItem
              icon={<Icon as={FaFilePdf} color="red.500" />}
              onClick={() => exportMembersPdf()}
              isDisabled={exportUnavailable || isExportingMembersPdf}
            >
              {isExportingMembersPdf
                ? "Exporting..."
                : `Export ${terms.memberSingular} PDF`}
            </MenuItem>
          </MenuList>
        </Portal>
      </Menu>
    </Flex>
  );

  return (
    <Box minH={"100vh"} bg={pageBg}>
      <Box px="4" pt="4" pb="8" maxW="container.xl" mx="auto">
        {actionButtons}
        {isLoading ? (
          <LoadingSpinner
            h="45vh"
            text={`Loading ${lowerTerm(terms.memberPlural)}...`}
          />
        ) : isError ? (
          <Box
            bg={cardBg}
            py="8"
            mt="4"
            rounded={"xl"}
            boxShadow={"lg"}
            textAlign="center"
          >
            <Text color="red.500" fontWeight="bold">
              {`Error occurred while fetching ${lowerTerm(
                terms.memberPlural
              )}.`}
            </Text>
          </Box>
        ) : (
          <>
            {/* Filters and column choice open inline, half-width each, so
                neither covers the list or fights the phone keyboard. */}
            <Flex mt="3" gap={2}>
              {filterableFields.length > 0 && (
                <Button
                  flex="1"
                  variant="outline"
                  colorScheme="blue"
                  // Stays filled while any filter applies, so a narrowed
                  // list is obvious even with the panel closed.
                  bg={
                    openPanel === "filters" || activeFilters.length > 0
                      ? activeToggleBg
                      : undefined
                  }
                  leftIcon={<FaFilter />}
                  aria-expanded={openPanel === "filters"}
                  onClick={() => togglePanel("filters")}
                >
                  {activeFilters.length > 0
                    ? `Filters (${activeFilters.length})`
                    : "Filters"}
                </Button>
              )}
              <Button
                flex="1"
                variant="outline"
                colorScheme="blue"
                bg={openPanel === "fields" ? activeToggleBg : undefined}
                leftIcon={<FaColumns />}
                aria-expanded={openPanel === "fields"}
                onClick={() => togglePanel("fields")}
              >
                {`Fields (${shownFields.length})`}
              </Button>
            </Flex>
            <Collapse in={openPanel === "filters"} animateOpacity unmountOnExit>
              <Box
                mt="2"
                p="3"
                bg={cardBg}
                rounded="lg"
                borderWidth="1px"
                borderColor={borderColor}
              >
                <Flex align="center" justify="space-between" mb={2}>
                  <Text fontWeight="bold">Filter by</Text>
                  {activeFilters.length > 0 && (
                    <Button
                      size="sm"
                      variant="link"
                      onClick={() => setFilters({})}
                    >
                      Clear all
                    </Button>
                  )}
                </Flex>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {filterableFields.map((field) => {
                    const options: SelectOption[] = field.options.map(
                      (option) => ({ value: option, label: capitalize(option) })
                    );
                    const selected = options.filter((option) =>
                      (filters[field.name] ?? []).includes(option.value)
                    );
                    return (
                      <Box key={field.name}>
                        <Text fontSize="sm" fontWeight="bold" mb={1}>
                          {labelFor(field.name)}
                        </Text>
                        <ReactSelect
                          isMulti
                          aria-label={`Filter by ${labelFor(field.name)}`}
                          placeholder="Any"
                          options={options}
                          value={selected}
                          closeMenuOnSelect={false}
                          menuPortalTarget={document.body}
                          menuPosition="fixed"
                          styles={{
                            menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                          }}
                          onChange={(values: MultiValue<SelectOption>) =>
                            setFilters((prev) => ({
                              ...prev,
                              [field.name]: values.map((item) => item.value),
                            }))
                          }
                        />
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </Box>
            </Collapse>
            <Collapse in={openPanel === "fields"} animateOpacity unmountOnExit>
              <Box
                mt="2"
                p="3"
                bg={cardBg}
                rounded="lg"
                borderWidth="1px"
                borderColor={borderColor}
              >
                <Text fontWeight="bold" mb={2}>
                  Show on each card
                </Text>
                <CheckboxGroup
                  value={shownFields}
                  onChange={(values: string[]) => setChosenFields(values)}
                >
                  <SimpleGrid columns={{ base: 2, md: 4 }} spacingX={3}>
                    {allExtraFields.map((field) => (
                      <Checkbox key={field} value={field} minH="44px">
                        {labelFor(field)}
                      </Checkbox>
                    ))}
                  </SimpleGrid>
                </CheckboxGroup>
              </Box>
            </Collapse>
            {/* Only the search bar is pinned: with the phone keyboard open,
                anything taller would squeeze the results it is filtering. */}
            <Box
              ref={pinnedSearch.barRef}
              position="sticky"
              top={0}
              zIndex="sticky"
              bg={pageBg}
              mx={-4}
              px={4}
              py={2}
              mt="2"
            >
              <InputGroup maxW={{ md: "400px" }}>
                <InputLeftElement pointerEvents="none">
                  <Icon as={FaSearch} color="gray.400" />
                </InputLeftElement>
                <Input
                  type="text"
                  bg={cardBg}
                  placeholder={`Search ${lowerTerm(terms.memberSingular)}`}
                  value={searchQuery}
                  onChange={handleSearch}
                  {...pinnedSearch.inputProps}
                />
                {searchQuery && (
                  <InputRightElement>
                    <IconButton
                      aria-label="Clear search"
                      icon={<FiX />}
                      size="sm"
                      variant="ghost"
                      onClick={() => setSearchQuery("")}
                    />
                  </InputRightElement>
                )}
              </InputGroup>
            </Box>
            {/* The list scrolls with the page rather than in a nested box. */}
            <Box ref={pinnedSearch.resultsRef} minH={pinnedSearch.resultsMinH}>
              <Text fontSize="sm" color={mutedColor} mb={2} role="status">
                {isNarrowed ? (
                  <>
                    Showing {countNumber(filteredMembers.length)} of{" "}
                    {countNumber(members.length)} {memberTerm(members.length)}
                  </>
                ) : (
                  <>
                    {countNumber(members.length)} {memberTerm(members.length)}
                  </>
                )}
              </Text>
              {filteredMembers.length === 0 ? (
                <Text fontWeight="bold" mt="4" ml="1">
                  {`No ${lowerTerm(terms.memberPlural)} found`}
                </Text>
              ) : (
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
                  {filteredMembers.map((member) => {
                    const fields = displayFields(member);
                    return (
                      <Box
                        key={member.id}
                        bg={cardBg}
                        p={3}
                        rounded="lg"
                        borderWidth="1px"
                        borderColor={borderColor}
                      >
                        {/* Name leads and truncates; the actions sit in a
                            non-shrinking slot so they never get squeezed. */}
                        <Flex align="center" gap={3}>
                          <Avatar
                            size="sm"
                            name={member.name}
                            src={member.avatarUrl as string | undefined}
                          />
                          <Text
                            flex="1"
                            minW={0}
                            fontWeight="bold"
                            noOfLines={1}
                          >
                            {member.name}
                          </Text>
                          {/* Outlined, not ghost: on a card a borderless
                              control stops reading as a button. */}
                          <Flex flexShrink={0} gap={2}>
                            <Can perm="attendance.view">
                              <Button
                                variant="outline"
                                colorScheme="teal"
                                size="sm"
                                {...compactTapTarget}
                                onClick={() =>
                                  navigate(
                                    convertParamsToString(
                                      PROTECTED_PATHS.MEMBER_ATTENDANCE_AVAILABILITY,
                                      { memberId: member.id }
                                    )
                                  )
                                }
                              >
                                Availability
                              </Button>
                            </Can>
                            <Can perm="members.manage">
                              <IconButton
                                aria-label={`Edit ${member.name}`}
                                icon={<FaPencilAlt />}
                                variant="outline"
                                colorScheme="blue"
                                size="sm"
                                {...compactTapTarget}
                                onClick={() =>
                                  navigate(
                                    convertParamsToString(
                                      PROTECTED_PATHS.UPDATE_MEMBER,
                                      { memberId: member.id }
                                    )
                                  )
                                }
                              />
                            </Can>
                          </Flex>
                        </Flex>
                        {fields.length > 0 && (
                          <SimpleGrid
                            columns={2}
                            spacingX={3}
                            spacingY={2}
                            mt={2}
                          >
                            {fields.map((key) => {
                              const value = formatFieldValue(member[key]);
                              // Option values are a fixed set, so they read
                              // as tags; free text stays plain.
                              const asTag =
                                optionFieldNames.has(key) && value !== "—";
                              return (
                                <Box key={key} minW={0}>
                                  <Text fontSize="xs" color={mutedColor}>
                                    {labelFor(key)}
                                  </Text>
                                  {asTag ? (
                                    <Badge
                                      colorScheme="blue"
                                      variant="subtle"
                                      textTransform="none"
                                      fontSize="sm"
                                      fontWeight="medium"
                                      maxW="full"
                                      whiteSpace="normal"
                                      wordBreak="break-word"
                                    >
                                      {value}
                                    </Badge>
                                  ) : (
                                    <TruncatedText fontSize="sm">
                                      {value}
                                    </TruncatedText>
                                  )}
                                </Box>
                              );
                            })}
                          </SimpleGrid>
                        )}
                      </Box>
                    );
                  })}
                </SimpleGrid>
              )}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};

export default ViewMembers;

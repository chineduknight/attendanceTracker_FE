import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Flex,
  Text,
  SimpleGrid,
  IconButton,
  Button,
  Checkbox,
  CheckboxGroup,
  Menu,
  Icon,
  Collapsible,
  Badge,
  Portal,
} from "@chakra-ui/react";
import { NameAvatar } from "components/ui/avatar";
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
  FaRegCalendarAlt,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { MultiValue } from "react-select";
import { ThemedSelect } from "components/ui/themed-select";
import { useMemberModel } from "hooks/useMemberModel";
import { MemberRecord, useMembers } from "hooks/useMembers";
import { EmptyState, ErrorState } from "components/ui/states";
import PageContainer from "components/layout/PageContainer";
import PinnedSearchBar from "components/PinnedSearchBar";
import { usePinnedSearch } from "hooks/usePinnedSearch";
import { memberFieldLabeler } from "helpers/memberFields";
import PageLoader from "components/PageLoader";
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

  // The app's header blue is the page accent; no attendance statuses show
  // here, so it cannot be mistaken for one.
  const accentColor = "blue.fg";
  const activeToggleBg = "blue.subtle";

  const { members, isLoading, isError, refetch: refetchMembers } = useMembers(org.id);
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
          colorPalette="blue"
          onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}
        >
          <FaUserPlus />
          {LABELS.addMember(terms)}
        </Button>
      </Can>
      <Menu.Root positioning={{ placement: "bottom-end" }}>
        <Menu.Trigger asChild>
          <Button flex="1" variant="outline" colorPalette="blue">
            <FaFileExport />
            Export
          </Button>
        </Menu.Trigger>
        {/* Menus default to the dropdown layer (1000), below the pinned
            search bar (sticky, 1100), which would cover the lower items.
            Portaled and raised to the popover layer so it opens on top. */}
        <Portal>
          <Menu.Positioner>
            <Menu.Content zIndex="popover">
              <Menu.Item
                value="excel"
                minH="44px"
                onSelect={() => exportMembers()}
                disabled={exportUnavailable || isExportingMembers}
              >
                <Icon color="green.500" asChild>
                  <FaFileExcel />
                </Icon>
                {isExportingMembers
                  ? "Exporting..."
                  : `Export ${terms.memberSingular} List`}
              </Menu.Item>
              <Menu.Item
                value="pdf"
                minH="44px"
                onSelect={() => exportMembersPdf()}
                disabled={exportUnavailable || isExportingMembersPdf}
              >
                <Icon color="red.500" asChild>
                  <FaFilePdf />
                </Icon>
                {isExportingMembersPdf
                  ? "Exporting..."
                  : `Export ${terms.memberSingular} PDF`}
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </Flex>
  );

  return (
    <PageContainer width="wide">
        {actionButtons}
        {isLoading ? (
          <PageLoader
            h="45vh"
            label={`Loading ${lowerTerm(terms.memberPlural)}...`}
          />
        ) : isError ? (
          <Box mt="8">
            <ErrorState
              title={`Couldn't load ${lowerTerm(terms.memberPlural)}`}
              onRetry={() => refetchMembers()}
            />
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
                  colorPalette="blue"
                  // Stays filled while any filter applies, so a narrowed
                  // list is obvious even with the panel closed.
                  bg={
                    openPanel === "filters" || activeFilters.length > 0
                      ? activeToggleBg
                      : undefined
                  }
                  aria-expanded={openPanel === "filters"}
                  onClick={() => togglePanel("filters")}
                >
                  <FaFilter />
                  {activeFilters.length > 0
                    ? `Filters (${activeFilters.length})`
                    : "Filters"}
                </Button>
              )}
              <Button
                flex="1"
                variant="outline"
                colorPalette="blue"
                bg={openPanel === "fields" ? activeToggleBg : undefined}
                aria-expanded={openPanel === "fields"}
                onClick={() => togglePanel("fields")}
              >
                <FaColumns />
                {`Fields (${shownFields.length})`}
              </Button>
            </Flex>
            {/* lazyMount + unmountOnExit = v2's Collapse unmountOnExit: a closed
                panel is not in the DOM at all. */}
            <Collapsible.Root open={openPanel === "filters"} lazyMount unmountOnExit>
              <Collapsible.Content>
              <Box
                mt="2"
                p="3"
                bg="bg.panel"
                rounded="lg"
                borderWidth="1px"
                borderColor="border"
              >
                <Flex align="center" justify="space-between" mb={2}>
                  <Text fontWeight="bold">Filter by</Text>
                  {activeFilters.length > 0 && (
                    <Button
                      size="sm"
                      variant="plain"
                      minH="44px"
                      px={2}
                      me={-2}
                      color="blue.fg"
                      _hover={{ textDecoration: "underline" }}
                      onClick={() => setFilters({})}
                    >
                      Clear all
                    </Button>
                  )}
                </Flex>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
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
                        <ThemedSelect
                          isMulti
                          aria-label={`Filter by ${labelFor(field.name)}`}
                          placeholder="Any"
                          options={options}
                          value={selected}
                          closeMenuOnSelect={false}
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
              </Collapsible.Content>
            </Collapsible.Root>
            <Collapsible.Root open={openPanel === "fields"} lazyMount unmountOnExit>
              <Collapsible.Content>
              <Box
                mt="2"
                p="3"
                bg="bg.panel"
                rounded="lg"
                borderWidth="1px"
                borderColor="border"
              >
                <Text fontWeight="bold" mb={2}>
                  Show on each card
                </Text>
                <CheckboxGroup
                  value={shownFields}
                  onValueChange={(values) => setChosenFields(values)}
                >
                  <SimpleGrid columns={{ base: 2, md: 4 }} columnGap={3}>
                    {allExtraFields.map((field) => (
                      <Checkbox.Root key={field} value={field} minH="44px">
                        <Checkbox.HiddenInput />
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                        <Checkbox.Label>{labelFor(field)}</Checkbox.Label>
                      </Checkbox.Root>
                    ))}
                  </SimpleGrid>
                </CheckboxGroup>
              </Box>
              </Collapsible.Content>
            </Collapsible.Root>
            {/* Only the search bar is pinned: with the phone keyboard open,
                anything taller would squeeze the results it is filtering. */}
            <PinnedSearchBar
              pinnedSearch={pinnedSearch}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={`Search ${lowerTerm(terms.memberSingular)}`}
              maxW={{ md: "400px" }}
            />
            {/* The list scrolls with the page rather than in a nested box. */}
            <Box ref={pinnedSearch.resultsRef} minH={pinnedSearch.resultsMinH}>
              <Text fontSize="sm" color="fg.muted" mb={2} role="status">
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
                members.length === 0 ? (
                  <EmptyState
                    title={`No ${lowerTerm(terms.memberPlural)} yet`}
                    action={
                      <Can perm="members.manage">
                        <Button onClick={() => navigate(PROTECTED_PATHS.ADD_MEMBER)}>
                          <FaUserPlus />
                          {LABELS.addMember(terms)}
                        </Button>
                      </Can>
                    }
                  />
                ) : (
                  <EmptyState
                    title={`No ${lowerTerm(terms.memberPlural)} found`}
                    description={
                      searchQuery
                        ? `Nothing matches "${searchQuery}".`
                        : "Nothing matches these filters."
                    }
                    action={
                      searchQuery ? (
                        <Button variant="outline" onClick={() => setSearchQuery("")}>
                          Clear search
                        </Button>
                      ) : activeFilters.length > 0 ? (
                        <Button variant="outline" onClick={() => setFilters({})}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                )
              ) : (
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap={3}>
                  {filteredMembers.map((member) => {
                    const fields = displayFields(member);
                    return (
                      <Box
                        key={member.id}
                        bg="bg.panel"
                        p={3}
                        rounded="lg"
                        borderWidth="1px"
                        borderColor="border"
                      >
                        {/* Name leads and truncates; the actions sit in a
                            non-shrinking slot so they never get squeezed. */}
                        <Flex align="center" gap={3}>
                          <NameAvatar
                            size="sm"
                            name={member.name}
                            src={member.avatarUrl as string | undefined}
                          />
                          <Text
                            flex="1"
                            minW={0}
                            fontWeight="bold"
                            lineClamp={1}
                          >
                            {member.name}
                          </Text>
                          {/* Outlined, not ghost: on a card a borderless
                              control stops reading as a button. */}
                          <Flex flexShrink={0} gap={2}>
                            <Can perm="attendance.view">
                              <IconButton
                                aria-label={`Availability for ${member.name}`}
                                variant="outline"
                                colorPalette="teal"
                                minW="44px"
                                h="44px"
                                onClick={() =>
                                  navigate(
                                    convertParamsToString(
                                      PROTECTED_PATHS.MEMBER_ATTENDANCE_AVAILABILITY,
                                      { memberId: member.id }
                                    )
                                  )
                                }
                              >
                                <FaRegCalendarAlt />
                              </IconButton>
                            </Can>
                            <Can perm="members.manage">
                              <IconButton
                                aria-label={`Edit ${member.name}`}
                                variant="outline"
                                colorPalette="blue"
                                minW="44px"
                                h="44px"
                                onClick={() =>
                                  navigate(
                                    convertParamsToString(
                                      PROTECTED_PATHS.UPDATE_MEMBER,
                                      { memberId: member.id }
                                    )
                                  )
                                }
                              >
                                <FaPencilAlt />
                              </IconButton>
                            </Can>
                          </Flex>
                        </Flex>
                        {fields.length > 0 && (
                          <SimpleGrid
                            columns={2}
                            columnGap={3}
                            rowGap={2}
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
                                  <Text fontSize="xs" color="fg.muted">
                                    {labelFor(key)}
                                  </Text>
                                  {asTag ? (
                                    <Badge
                                      colorPalette="blue"
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
    </PageContainer>
  );
};

export default ViewMembers;

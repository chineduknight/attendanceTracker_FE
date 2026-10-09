import { Box, Flex, Text, Stack, Button, Badge, NativeSelect, IconButton } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useQueryWrapper } from "services/api/apiHelper";
import { useMemo, useState } from "react";
import { attendanceRequest } from "services";
import useGlobalStore from "zStore";
import {
  capitalizeFirstLetter,
  convertParamsToString,
} from "helpers/stringManipulations";
import {
  canEditAttendance,
  resolveEditCount,
  resolveEditsRemaining,
} from "helpers/attendanceEdits";
import { FaPencilAlt, FaPlus } from "react-icons/fa";
import { format } from "date-fns";
import PageLoader from "components/PageLoader";
import PageContainer from "components/layout/PageContainer";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { Can } from "rbac/Can";
import { formatSessionDate } from "helpers/sessionDate";
import { queryKeys } from "services/api/queryKeys";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";
import {
  AnalyticsInclusionFields,
  AnalyticsInclusionFilter,
  isAnalyticsIncluded,
  matchesInclusionFilter,
} from "helpers/attendanceAnalyticsInclusion";

type PersonRef = { id: string; name: string };

const PAGE_SIZE = 25;

type AttendanceType = AnalyticsInclusionFields & {
  name: string;
  createdAt: string;
  updatedAt: string;
  id: string;
  hasBeenUpdated: boolean;
  editCount?: number;
  editsRemaining?: number;
  date: string;
  dateFormated: number;
  category?: { name: string; status: string } | null;
  subCategory?: { name: string; status: string } | null;
  createdBy?: PersonRef | null;
  updatedBy?: PersonRef | null;
};

const AllAttendance = () => {
  const navigate = useNavigate();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();

  const [allAttend, setallAttend] = useState<AttendanceType[]>([]);
  const handleGetOrgSuccess = (data) => {
    setallAttend(data.data);
  };

  const url = convertParamsToString(attendanceRequest.ALL_ATTENDANCE, {
    organisationId: org.id,
  });

  const { isFetching, isError, error, refetch } = useQueryWrapper(
    queryKeys.attendances(org.id),
    url,
    { onSuccess: handleGetOrgSuccess },
  );
  const isLoading = isFetching && allAttend.length === 0;
  // A failed first load must not read as "nothing recorded yet".
  const loadFailed = isError && allAttend.length === 0;

  const [inclusionFilter, setInclusionFilter] =
    useState<AnalyticsInclusionFilter>("all");
  // The API returns every session; render a page at a time so a long history
  // stays quick to open and scroll (until the backend paginates).
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const visibleAttendance = useMemo(
    () =>
      allAttend
        .filter((attendance) =>
          matchesInclusionFilter(attendance, inclusionFilter)
        )
        .sort((a, b) => {
          const dateDiff = b.dateFormated - a.dateFormated;
          if (dateDiff !== 0) return dateDiff;
          // Same date: newest created first
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        }),
    [allAttend, inclusionFilter]
  );

  // Month headings over the shown slice, newest first (already sorted).
  const shownGroups = useMemo(() => {
    const groups: { month: string; items: AttendanceType[] }[] = [];
    visibleAttendance.slice(0, shownCount).forEach((attendance) => {
      const month = formatSessionDate(attendance.date, "MMMM yyyy") || "Undated";
      const last = groups[groups.length - 1];
      if (last?.month === month) last.items.push(attendance);
      else groups.push({ month, items: [attendance] });
    });
    return groups;
  }, [visibleAttendance, shownCount]);
  const remaining = visibleAttendance.length - shownCount;

  function handleNavigate(attendanceInfo) {
    const url = convertParamsToString(PROTECTED_PATHS.ATTENDANCE, {
      id: attendanceInfo.id,
    });
    navigate(url, { state: org });
  }

  return (
    <PageContainer>
      {/* A card from md up; on phones the rows sit straight on the page, so
          a nested card doesn't eat the width the session names need. */}
      <Stack
        gap={4}
        bg={{ md: "bg.panel" }}
        rounded={{ md: "xl" }}
        boxShadow={{ md: "lg" }}
        p={{ base: 0, md: 6 }}
      >
        {isLoading ? (
          <PageLoader
            h="30vh"
            label={`Loading ${lowerTerm(terms.attendancePlural)}...`}
          />
        ) : loadFailed ? (
          <ErrorState
            title={`Couldn't load ${lowerTerm(terms.attendancePlural)}`}
            description={errorMessage(error)}
            onRetry={() => refetch()}
            retrying={isFetching}
          />
        ) : allAttend.length ? (
          <>
            <NativeSelect.Root>
              <NativeSelect.Field
                aria-label="Filter by analytics inclusion"
                value={inclusionFilter}
                onChange={(e) => {
                  setInclusionFilter(e.target.value as AnalyticsInclusionFilter);
                  setShownCount(PAGE_SIZE);
                }}>
                <option value="all">All</option>
                <option value="included">Included in analytics</option>
                <option value="excluded">Excluded from analytics</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
            {visibleAttendance.length === 0 && (
              <EmptyState
                title={`No ${lowerTerm(terms.attendanceSingular)} matches this filter.`}
              />
            )}
            {shownGroups.map(({ month, items }) => (
              <Stack key={month} gap={3} as="section" aria-label={month}>
                <Text
                  as="h2"
                  fontSize="sm"
                  fontWeight="semibold"
                  color="fg.muted"
                  textTransform="uppercase"
                  letterSpacing="wide"
                  pt={2}
                >
                  {month}
                </Text>
                {items.map((attendance) => {
                  const editsRemaining = resolveEditsRemaining(attendance);
                  const editCount = resolveEditCount(attendance);
                  const canEdit = canEditAttendance(attendance);
                  const name = capitalizeFirstLetter(attendance.name);
                  return (
                    <Flex
                      key={attendance.id}
                      alignItems="flex-start"
                      bg="bg.panel"
                      borderWidth="1px"
                      borderColor="border"
                      borderRadius="10px"
                      // Hover tint only where there is a real hover: on touch
                      // screens a tapped row otherwise stays grey.
                      css={{ "@media (hover: hover)": { "&:hover": { background: "var(--chakra-colors-bg-muted)" } } }}
                    >
                      {/* The row's main area is one real button (keyboard and
                          screen readers); Edit sits beside it, never inside. */}
                      <Box
                        as="button"
                        onClick={() => handleNavigate(attendance)}
                        flex="1"
                        minW={0}
                        textAlign="left"
                        p="4"
                        pe={canEdit ? 2 : 4}
                        borderRadius="10px"
                        cursor="pointer"
                        _focusVisible={{ outline: "2px solid", outlineColor: "colorPalette.focusRing", outlineOffset: "2px" }}
                        colorPalette="blue"
                      >
                        <Text fontWeight="semibold" lineClamp={2}>
                          {name}
                        </Text>
                        <Flex gap={1.5} mt={1.5} flexWrap="wrap">
                          {attendance.category?.name && (
                            <Badge colorPalette="purple">{attendance.category.name}</Badge>
                          )}
                          {attendance.subCategory?.name && (
                            <Badge colorPalette="cyan">{attendance.subCategory.name}</Badge>
                          )}
                          {editCount > 0 && (
                            <Badge colorPalette="orange">edited {editCount}×</Badge>
                          )}
                          {!isAnalyticsIncluded(attendance) && (
                            <Badge variant="outline" colorPalette="gray">
                              Excluded from analytics
                            </Badge>
                          )}
                        </Flex>
                        {/* The session's calendar day, then when it was recorded
                            (sessions have no time of their own yet). */}
                        <Text fontSize="xs" color="fg.muted" mt={1.5}>
                          {formatSessionDate(attendance.date)}
                          {" · recorded "}
                          {format(new Date(attendance.createdAt), "h:mm a")}
                          {attendance.createdBy?.name && ` by ${attendance.createdBy.name}`}
                        </Text>
                      </Box>
                      {canEdit && (
                        <Stack align="center" gap={1} pt="3" pe="3" flexShrink={0}>
                          <IconButton
                            aria-label={`Edit ${name}`}
                            variant="outline"
                            colorPalette="blue"
                            minW="44px"
                            h="44px"
                            onClick={() =>
                              navigate(
                                convertParamsToString(PROTECTED_PATHS.UPDATE_ATTENANCE, {
                                  attendanceId: attendance.id,
                                }),
                              )
                            }
                          >
                            <FaPencilAlt />
                          </IconButton>
                          <Text fontSize="xs" color="fg.muted" whiteSpace="nowrap">
                            {editsRemaining} left
                          </Text>
                        </Stack>
                      )}
                    </Flex>
                  );
                })}
              </Stack>
            ))}
            {remaining > 0 && (
              <Button
                variant="outline"
                colorPalette="blue"
                minH="44px"
                onClick={() => setShownCount((count) => count + PAGE_SIZE)}
              >
                {`Show ${Math.min(remaining, PAGE_SIZE)} more`}
                <Text as="span" color="fg.muted" fontWeight="normal">
                  {`(${remaining} left)`}
                </Text>
              </Button>
            )}
          </>
        ) : (
          <EmptyState
            title={`No ${lowerTerm(terms.attendancePlural)} yet`}
            description={`${terms.attendancePlural} you record will appear here.`}
            action={
              <Can perm="attendance.manage">
                <Button
                  variant="solid"
                  colorPalette="blue"
                  onClick={() => navigate(PROTECTED_PATHS.CREATE_ATTENDANCE)}
                >
                  <FaPlus />
                  {`Create ${lowerTerm(terms.attendanceSingular)}`}
                </Button>
              </Can>
            }
          />
        )}
      </Stack>
    </PageContainer>
  );
};

export default AllAttendance;

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Spinner,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FaListUl, FaTable } from "react-icons/fa";
import { FiBarChart2 } from "react-icons/fi";
import { MultiValue } from "react-select";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest, orgRequest } from "services";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import { ATTENDANCE_BEHAVIORS, AttendanceBehavior } from "helpers/attendanceStatuses";
import { useAttendanceStatuses } from "hooks/useAttendanceStatuses";
import {
  openExportUrl,
  handleExportError,
} from "components/analytics/analyticsExport";
import {
  useDateRange,
  formatRangeLabel,
  presetFor,
} from "components/analytics/useDateRange";
import {
  AnalyticsPageState,
  AnalyticsSearch,
  AnalyticsView,
  readAnalyticsParams,
  sameSearch,
  writeAnalyticsParams,
} from "components/analytics/analyticsSearchParams";
import DateRangeControls from "components/analytics/DateRangeControls";
import SessionSummary from "components/analytics/SessionSummary";
import ExportMenu from "components/analytics/ExportMenu";
import AnalyticsMemberList, {
  BehaviorCounts,
} from "components/analytics/AnalyticsMemberList";
import AnalyticsGrid, { AnalyticsGridRow } from "components/analytics/AnalyticsGrid";
import PageContainer from "components/layout/PageContainer";
import PinnedSearchBar from "components/PinnedSearchBar";
import { usePinnedSearch } from "hooks/usePinnedSearch";
import PageLoader from "components/PageLoader";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { ThemedSelect } from "components/ui/themed-select";
import { AnalyticsSessionSummary } from "helpers/attendanceAnalyticsInclusion";
import { queryKeys } from "services/api/queryKeys";
import { useTerms } from "hooks/useOrgPresentation";
import { lowerTerm } from "helpers/organisationPresentation";

type StatusOption = {
  value: string;
  label: string;
};

const DATE_KEY = /\d{4}-\d{2}-\d{2}$/;

/** The session (date-suffixed) columns, sorted by their YYYY-MM-DD suffix. */
export const sessionColumnsByDate = (keys: string[]): string[] =>
  keys
    .filter((k) => DATE_KEY.test(k))
    .sort((a, b) => a.match(DATE_KEY)![0].localeCompare(b.match(DATE_KEY)![0]));

/**
 * Backend per-member totals, bucketed by behavior rather than status label.
 * `attendanceBehaviorCounts` is the source of truth; the legacy
 * "Total Number of …" columns are deprecated aliases and are not read.
 */
const behaviorCountOf = (row: any, behavior: AttendanceBehavior): number =>
  (row?.attendanceBehaviorCounts as Partial<BehaviorCounts> | undefined)?.[
    behavior
  ] ?? 0;

const AttendanceAnalyticsPage: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const terms = useTerms();
  const navigate = useNavigate();
  // The searched report, view, name search and last-opened member live in the
  // address: Back from a member (or a refresh) returns to the same report.
  // Every write replaces the entry, so Back leaves Analytics in one step.
  const [searchParams, setSearchParams] = useSearchParams();
  const page = useMemo(
    () => readAnalyticsParams(searchParams, new Date()),
    [searchParams]
  );
  const applied: AnalyticsSearch = useMemo(
    () => ({
      fromDate: page.fromDate,
      toDate: page.toDate,
      statuses: page.statuses,
    }),
    [page.fromDate, page.toDate, page.statuses]
  );
  const updatePage = (patch: Partial<AnalyticsPageState>) =>
    setSearchParams(writeAnalyticsParams({ ...page, ...patch }), {
      replace: true,
    });

  // The inputs are a draft until Search; they start from the searched report.
  const {
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    activePreset,
    setActivePreset,
    applyPreset,
    handleDateChange,
  } = useDateRange({ initialFrom: applied.fromDate, initialTo: applied.toDate });
  const [statusFilter, setStatusFilter] = useState<string[]>(() =>
    applied.statuses.length ? applied.statuses : ["all"]
  );
  const [statusOptions, setStatusOptions] = useState<string[]>([
    "active",
    "inactive",
  ]);

  // A searched report arriving from outside the form (a link, the nav going
  // to a bare /analytics) resets the draft to it.
  const appliedKey = `${applied.fromDate}|${applied.toDate}|${applied.statuses.join(",")}`;
  useEffect(() => {
    setFromDate(applied.fromDate);
    setToDate(applied.toDate);
    setActivePreset(presetFor(applied.fromDate, applied.toDate, new Date()));
    setStatusFilter(applied.statuses.length ? applied.statuses : ["all"]);
    // appliedKey covers every field of `applied`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

  // Phones start on the ranked list (193 session columns don't fit a phone);
  // wider screens start on the grid. The officer's choice then sticks.
  const isWide = useBreakpointValue({ base: false, md: true }, { ssr: false });
  const view: AnalyticsView = page.view ?? (isWide ? "grid" : "list");
  const nameQuery = page.q;
  const setNameQuery = (q: string) => updatePage({ q });
  const pinnedSearch = usePinnedSearch(nameQuery);

  const goToMemberAnalytics = (memberId: string) => {
    // Remembered so the row is marked and scrolled to on the way back.
    updatePage({ member: memberId });
    const path = convertParamsToString(PROTECTED_PATHS.MEMBER_ANALYTICS, {
      memberId,
    });
    const params = new URLSearchParams({
      fromDate: applied.fromDate,
      toDate: applied.toDate,
    });
    navigate(`${path}?${params.toString()}`);
  };

  const selectedStatuses = useMemo(
    () => statusFilter.filter((status) => status !== "all"),
    [statusFilter]
  );
  const draft: AnalyticsSearch = { fromDate, toDate, statuses: selectedStatuses };
  // Edited inputs hide the report until Search, so what is shown (and
  // exported) always matches the inputs.
  const isDirty = !sameSearch(draft, applied);
  const canSearch = Boolean(fromDate && toDate && org.id);

  const modelURL = convertParamsToString(orgRequest.CONFIG_MODEL, {
    organisationId: org.id,
  });

  useQueryWrapper(queryKeys.memberModel(org.id), modelURL, {
    enabled: Boolean(org.id),
    onSuccess: (data) => {
      const fields = data?.data?.fields;
      const statusField = fields?.find((field: any) => field.name === "status");
      if (statusField && Array.isArray(statusField.options)) {
        setStatusOptions(statusField.options);
      }
    },
  });

  const queryString = useMemo(() => {
    const queryParams = new URLSearchParams({
      fromDate: applied.fromDate,
      toDate: applied.toDate,
      sort: "ranking",
    });

    if (applied.statuses.length) {
      queryParams.set("status", applied.statuses.join(","));
    }

    return queryParams.toString();
  }, [applied]);

  const url = useMemo(() => {
    if (!org.id) return "";
    const analyticsPath = convertParamsToString(attendanceRequest.ANALYTICS, {
      organisationId: org.id,
    });
    return `${analyticsPath}?${queryString}`;
  }, [org.id, queryString]);

  // Runs for the searched report as soon as the page opens. Coming back to a
  // report still in the cache shows it at once and refreshes it quietly.
  // Not on window focus: a long range is an expensive report.
  const {
    data: analyticsResponse,
    isFetching,
    error,
    refetch,
  } = useQueryWrapper(
    queryKeys.analytics.organisation(
      org.id,
      applied.fromDate,
      applied.toDate,
      applied.statuses.join(",")
    ),
    url,
    {
      enabled: Boolean(org.id),
      refetchOnWindowFocus: false,
    }
  );

  const exportExcelUrl = useMemo(() => {
    if (!org.id) return "";
    const path = convertParamsToString(
      attendanceRequest.ANALYTICS_EXPORT_EXCEL,
      {
        organisationId: org.id,
      }
    );
    return `${path}?${queryString}`;
  }, [org.id, queryString]);

  const exportPdfUrl = useMemo(() => {
    if (!org.id) return "";
    const path = convertParamsToString(attendanceRequest.ANALYTICS_EXPORT_PDF, {
      organisationId: org.id,
    });
    return `${path}?${queryString}`;
  }, [org.id, queryString]);

  const { refetch: refetchExcel, isFetching: isExportingExcel } =
    useQueryWrapper(
      [
        "attendanceAnalyticsExportExcel",
        applied.fromDate,
        applied.toDate,
        org.id,
        applied.statuses.join(","),
      ],
      exportExcelUrl,
      {
        enabled: false,
        onSuccess: (response: any) => openExportUrl(response, "Excel"),
        onError: (err: any) => handleExportError(err, "Excel"),
      }
    );

  const { refetch: refetchPdf, isFetching: isExportingPdf } = useQueryWrapper(
    [
      "attendanceAnalyticsExportPdf",
      applied.fromDate,
      applied.toDate,
      org.id,
      applied.statuses.join(","),
    ],
    exportPdfUrl,
    {
      enabled: false,
      onSuccess: (response: any) => openExportUrl(response, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    }
  );

  const handleSearch = () => {
    if (!canSearch) return;
    if (isDirty) {
      // A new report: the last-opened member belongs to the old one.
      updatePage({ ...draft, member: null });
    } else {
      refetch();
    }
  };

  // pull out keys & data rows
  const keys: string[] = useMemo(
    () => analyticsResponse?.data.keys || [],
    [analyticsResponse?.data.keys]
  );
  // The response carries the org's effective config at query time.
  const statuses = useAttendanceStatuses(
    analyticsResponse?.data.attendanceStatuses
  );
  const sessionSummary: AnalyticsSessionSummary | undefined =
    analyticsResponse?.data.sessionSummary;
  const rows: any[] = useMemo(
    () => analyticsResponse?.data.analytics || [],
    [analyticsResponse?.data.analytics]
  );

  const statusSelectOptions = useMemo<StatusOption[]>(
    () => [
      { value: "all", label: "All" },
      ...statusOptions.map((option) => ({
        value: option,
        label: capitalize(option),
      })),
    ],
    [statusOptions]
  );

  const selectedStatusOptions = useMemo(
    () =>
      statusSelectOptions.filter((option) =>
        statusFilter.includes(option.value)
      ),
    [statusFilter, statusSelectOptions]
  );

  // Session columns, oldest first. The backend's key order isn't by date;
  // sessions on the same day keep that order (Array.sort is stable).
  const dateKeys = useMemo(() => sessionColumnsByDate(keys), [keys]);

  const memberRows = useMemo<AnalyticsGridRow[]>(
    () =>
      rows.map((row, index) => ({
        memberId: row.memberId,
        name: row.name,
        rank: index + 1,
        counts: Object.fromEntries(
          ATTENDANCE_BEHAVIORS.map((b) => [b, behaviorCountOf(row, b)])
        ) as BehaviorCounts,
        cells: Object.fromEntries(dateKeys.map((d) => [d, row[d] as string | undefined])),
      })),
    [rows, dateKeys]
  );

  // Finds members in the report on screen. It narrows what is shown only:
  // ranks, totals, the legend and exports stay the whole report's.
  const visibleRows = useMemo(() => {
    const query = nameQuery.trim().toLowerCase();
    return query
      ? memberRows.filter((row) => row.name.toLowerCase().includes(query))
      : memberRows;
  }, [memberRows, nameQuery]);
  const isNarrowed = visibleRows.length !== memberRows.length;

  // Legend: active statuses plus any inactive/unknown key in these results.
  const legend = useMemo(() => {
    const usedKeys = new Set<string>();
    memberRows.forEach((row) =>
      Object.values(row.cells).forEach((key) => key && usedKeys.add(key))
    );
    return statuses.legendFor(usedKeys);
  }, [memberRows, statuses]);

  const handleStatusChange = (selected: MultiValue<StatusOption>) => {
    const values = selected.map((item) => item.value);
    if (values.length === 0) {
      setStatusFilter(["all"]);
    } else if (values.includes("all") && values.length > 1) {
      // "All" picked earlier, a status picked now: the status wins.
      setStatusFilter(values.filter((value) => value !== "all"));
    } else {
      setStatusFilter(values.includes("all") ? ["all"] : values);
    }
  };

  const isFirstLoad = isFetching && !analyticsResponse;
  const showResults = !isDirty && Boolean(analyticsResponse) && !error;

  // Back from a member: bring their row into view once, centred so the
  // pinned search bar doesn't cover it.
  const lastOpened = page.member;
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!showResults || !lastOpened || scrolledTo.current === lastOpened) return;
    const row = pinnedSearch.resultsRef.current?.querySelector<HTMLElement>(
      `[data-member-id="${CSS.escape(lastOpened)}"]`
    );
    if (!row) return;
    scrolledTo.current = lastOpened;
    row.scrollIntoView({ block: "center" });
  }, [showResults, lastOpened, view, pinnedSearch.resultsRef]);

  return (
    <PageContainer width="wide">
      <DateRangeControls
        fromDate={fromDate}
        toDate={toDate}
        activePreset={activePreset}
        applyPreset={applyPreset}
        setFromDate={setFromDate}
        setToDate={setToDate}
        handleDateChange={handleDateChange}
        trailing={
          <>
            <Box flex="1" minW={0} maxW={{ md: "320px" }}>
              <ThemedSelect
                isMulti
                aria-label={`Filter ${lowerTerm(terms.memberPlural)} by status`}
                placeholder={`${terms.memberSingular} status`}
                options={statusSelectOptions}
                value={selectedStatusOptions}
                closeMenuOnSelect={false}
                onChange={handleStatusChange}
              />
            </Box>
            <Button
              colorPalette="blue"
              onClick={handleSearch}
              disabled={!canSearch}
              minH="44px"
              flexShrink={0}
            >
              Search
            </Button>
          </>
        }
      />

      {isFirstLoad && <PageLoader h="30vh" />}
      {!isFetching && Boolean(error) && (
        <ErrorState
          title="Couldn't load analytics"
          description={errorMessage(error)}
          onRetry={() => refetch()}
        />
      )}
      {!isFirstLoad && !error && isDirty && (
        <EmptyState
          icon={<FiBarChart2 />}
          title="Choose a date range"
          description="Pick a preset or dates, then Search."
        />
      )}

      {showResults && (
        <>
          {/* What is shown, then how: the summary line, view and Export. */}
          <Box mb={3}>
            <Flex align="center" gap={2}>
              <Text fontWeight="semibold">
                {`${formatRangeLabel(applied.fromDate, applied.toDate)} · ${rows.length} ${lowerTerm(
                  rows.length === 1 ? terms.memberSingular : terms.memberPlural
                )}`}
              </Text>
              {/* A cached report on screen while it refreshes. */}
              {isFetching && <Spinner size="sm" color="fg.muted" aria-label="Refreshing" />}
            </Flex>
            {sessionSummary && (
              <Box color="fg.muted" mt={1}>
                <SessionSummary summary={sessionSummary} />
              </Box>
            )}
            <Flex gap={2} align="center" justify="space-between">
              <Group attached>
                {(
                  [
                    { value: "list", label: "List", icon: <FaListUl /> },
                    { value: "grid", label: "Grid", icon: <FaTable /> },
                  ] as const
                ).map((option) => (
                  <Button
                    key={option.value}
                    minH="44px"
                    px={3}
                    variant={view === option.value ? "solid" : "outline"}
                    colorPalette={view === option.value ? "blue" : "gray"}
                    aria-pressed={view === option.value}
                    onClick={() => updatePage({ view: option.value })}
                  >
                    {option.icon}
                    {option.label}
                  </Button>
                ))}
              </Group>
              {/* Exports follow the report on screen, never unsearched inputs. */}
              <ExportMenu
                onExcel={() => refetchExcel()}
                onPdf={() => refetchPdf()}
                busy={isExportingExcel || isExportingPdf}
              />
            </Flex>
          </Box>

          {rows.length === 0 && (
            <EmptyState
              icon={<FiBarChart2 />}
              title={`No ${lowerTerm(terms.attendanceSingular)} records found for this range.`}
            />
          )}

          {rows.length > 0 && (
            <PinnedSearchBar
              pinnedSearch={pinnedSearch}
              value={nameQuery}
              onChange={setNameQuery}
              placeholder={`Search ${lowerTerm(terms.memberSingular)}`}
              maxW={{ md: "400px" }}
              mb={2}
            />
          )}

          {rows.length > 0 && (
            <Box ref={pinnedSearch.resultsRef} minH={pinnedSearch.resultsMinH}>
              {isNarrowed && (
                <Text fontSize="sm" color="fg.muted" mb={2} role="status">
                  {`Showing ${visibleRows.length} of ${memberRows.length} ${lowerTerm(
                    memberRows.length === 1 ? terms.memberSingular : terms.memberPlural
                  )}`}
                </Text>
              )}

              {visibleRows.length === 0 && (
                <EmptyState
                  title={`No ${lowerTerm(terms.memberSingular)} found`}
                  description={`Nothing matches "${nameQuery.trim()}".`}
                  action={
                    <Button variant="outline" onClick={() => setNameQuery("")}>
                      Clear search
                    </Button>
                  }
                />
              )}

              {visibleRows.length > 0 && view === "list" && (
                <AnalyticsMemberList
                  rows={visibleRows}
                  onOpen={goToMemberAnalytics}
                  lastOpenedId={lastOpened}
                />
              )}

              {visibleRows.length > 0 && view === "grid" && (
                <>
                  <Flex mb={3} gap={4} flexWrap="wrap">
                    {legend.map((status) => (
                      <Flex key={status.key} align="center" gap={1}>
                        <Badge colorPalette={status.color}>{status.shortLabel}</Badge>
                        <Text fontSize="sm">{status.label}</Text>
                      </Flex>
                    ))}
                  </Flex>
                  <AnalyticsGrid
                    rows={visibleRows}
                    dateKeys={dateKeys}
                    statuses={statuses}
                    onOpen={goToMemberAnalytics}
                    lastOpenedId={lastOpened}
                  />
                </>
              )}
            </Box>
          )}
        </>
      )}
    </PageContainer>
  );
};

export default AttendanceAnalyticsPage;

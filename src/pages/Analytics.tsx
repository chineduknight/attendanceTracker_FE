import React, { useState, useMemo } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  Group,
  Text,
  useBreakpointValue,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { useNavigate } from "react-router-dom";
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
} from "components/analytics/useDateRange";
import DateRangeControls from "components/analytics/DateRangeControls";
import SessionSummary from "components/analytics/SessionSummary";
import ExportMenu from "components/analytics/ExportMenu";
import AnalyticsMemberList, {
  BehaviorCounts,
} from "components/analytics/AnalyticsMemberList";
import AnalyticsGrid, { AnalyticsGridRow } from "components/analytics/AnalyticsGrid";
import PageContainer from "components/layout/PageContainer";
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

type View = "list" | "grid";

const DATE_KEY = /\d{4}-\d{2}-\d{2}$/;

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
  const [hasSearched, setHasSearched] = useState(false);
  const {
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    activePreset,
    applyPreset,
    handleDateChange,
  } = useDateRange({ onChange: () => setHasSearched(false) });
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [statusOptions, setStatusOptions] = useState<string[]>([
    "active",
    "inactive",
  ]);
  const navigate = useNavigate();
  // Phones start on the ranked list (193 session columns don't fit a phone);
  // wider screens start on the grid. The officer's choice then sticks.
  const isWide = useBreakpointValue({ base: false, md: true }, { ssr: false });
  const [chosenView, setChosenView] = useState<View | null>(null);
  const view: View = chosenView ?? (isWide ? "grid" : "list");

  const goToMemberAnalytics = (memberId: string) => {
    const path = convertParamsToString(PROTECTED_PATHS.MEMBER_ANALYTICS, {
      memberId,
    });
    const params = new URLSearchParams();
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    const search = params.toString();
    navigate(search ? `${path}?${search}` : path);
  };

  const canRunQuery = Boolean(fromDate && toDate && org.id);

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

  const selectedStatuses = useMemo(
    () => statusFilter.filter((status) => status !== "all"),
    [statusFilter]
  );

  const queryString = useMemo(() => {
    if (!canRunQuery) return "";
    const queryParams = new URLSearchParams({
      fromDate,
      toDate,
      sort: "ranking",
    });

    if (selectedStatuses.length) {
      queryParams.set("status", selectedStatuses.join(","));
    }

    return queryParams.toString();
  }, [canRunQuery, fromDate, toDate, selectedStatuses]);

  // build the request URL once both dates are set
  const url = useMemo(() => {
    if (!canRunQuery) return "";
    const analyticsPath = convertParamsToString(attendanceRequest.ANALYTICS, {
      organisationId: org.id,
    });
    return `${analyticsPath}?${queryString}`;
  }, [canRunQuery, org.id, queryString]);

  // react‑query wrapper: don't run until we call refetch()
  const {
    data: analyticsResponse,
    isFetching,
    error,
    refetch,
  } = useQueryWrapper(
    queryKeys.analytics.organisation(
      org.id,
      fromDate,
      toDate,
      selectedStatuses.join(",")
    ),
    url,
    {
      enabled: false,
    }
  );

  const exportExcelUrl = useMemo(() => {
    if (!canRunQuery) return "";
    const path = convertParamsToString(
      attendanceRequest.ANALYTICS_EXPORT_EXCEL,
      {
        organisationId: org.id,
      }
    );
    return `${path}?${queryString}`;
  }, [canRunQuery, org.id, queryString]);

  const exportPdfUrl = useMemo(() => {
    if (!canRunQuery) return "";
    const path = convertParamsToString(attendanceRequest.ANALYTICS_EXPORT_PDF, {
      organisationId: org.id,
    });
    return `${path}?${queryString}`;
  }, [canRunQuery, org.id, queryString]);

  const { refetch: refetchExcel, isFetching: isExportingExcel } =
    useQueryWrapper(
      [
        "attendanceAnalyticsExportExcel",
        fromDate,
        toDate,
        org.id,
        selectedStatuses.join(","),
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
      fromDate,
      toDate,
      org.id,
      selectedStatuses.join(","),
    ],
    exportPdfUrl,
    {
      enabled: false,
      onSuccess: (response: any) => openExportUrl(response, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    }
  );

  const handleSearch = () => {
    if (canRunQuery) {
      setHasSearched(true);
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

  // detect which columns are dates
  const dateKeys = useMemo(() => keys.filter((k) => DATE_KEY.test(k)), [keys]);

  const memberRows = useMemo<AnalyticsGridRow[]>(
    () =>
      rows.map((row) => ({
        memberId: row.memberId,
        name: row.name,
        counts: Object.fromEntries(
          ATTENDANCE_BEHAVIORS.map((b) => [b, behaviorCountOf(row, b)])
        ) as BehaviorCounts,
        cells: Object.fromEntries(dateKeys.map((d) => [d, row[d] as string | undefined])),
      })),
    [rows, dateKeys]
  );

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
    setHasSearched(false);
    if (values.length === 0) {
      setStatusFilter(["all"]);
    } else if (values.includes("all") && values.length > 1) {
      // "All" picked earlier, a status picked now: the status wins.
      setStatusFilter(values.filter((value) => value !== "all"));
    } else {
      setStatusFilter(values.includes("all") ? ["all"] : values);
    }
  };

  const showResults = hasSearched && !isFetching && !error;

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
              disabled={!canRunQuery}
              minH="44px"
              flexShrink={0}
            >
              Search
            </Button>
          </>
        }
      />

      {isFetching && <PageLoader h="30vh" />}
      {!isFetching && Boolean(error) && (
        <ErrorState
          title="Couldn't load analytics"
          description={errorMessage(error)}
          onRetry={() => refetch()}
        />
      )}
      {!isFetching && !error && !hasSearched && (
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
            <Text fontWeight="semibold">
              {`${formatRangeLabel(fromDate, toDate)} · ${rows.length} ${lowerTerm(
                rows.length === 1 ? terms.memberSingular : terms.memberPlural
              )}`}
            </Text>
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
                    onClick={() => setChosenView(option.value)}
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

          {rows.length > 0 && view === "list" && (
            <AnalyticsMemberList rows={memberRows} onOpen={goToMemberAnalytics} />
          )}

          {rows.length > 0 && view === "grid" && (
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
                rows={memberRows}
                dateKeys={dateKeys}
                statuses={statuses}
                onOpen={goToMemberAnalytics}
              />
            </>
          )}
        </>
      )}
    </PageContainer>
  );
};

export default AttendanceAnalyticsPage;

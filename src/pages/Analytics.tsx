import React, { useState, useMemo } from "react";
import {
  Box,
  Flex,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Spinner,
  useColorModeValue,
  Text,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { useNavigate } from "react-router-dom";
import { FaFileExcel, FaFilePdf } from "react-icons/fa";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest, orgRequest } from "services";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import {
  ATTENDANCE_BEHAVIORS,
  AttendanceBehavior,
  BEHAVIOR_META,
} from "helpers/attendanceStatuses";
import { useAttendanceStatuses } from "hooks/useAttendanceStatuses";
import {
  openExportUrl,
  handleExportError,
} from "components/analytics/analyticsExport";
import ReactSelect, { MultiValue } from "react-select";
import { format, parseISO } from "date-fns";
import {
  useDateRange,
  formatRangeLabel,
} from "components/analytics/useDateRange";
import DateRangeControls from "components/analytics/DateRangeControls";
import { queryKeys } from "services/api/queryKeys";

type StatusOption = {
  value: string;
  label: string;
};

const DAY_HEADER_FORMAT = "EEE d, MMM"; // e.g. "Tue 3, Jul"

// rotate narrow column headers so single-letter cells don't waste width.
// applied to an inner span (not the th) so the cell stays in normal writing
// mode and can center the label horizontally over its column.
const VERTICAL_LABEL_SX = {
  display: "inline-block",
  writingMode: "vertical-rl",
  transform: "rotate(180deg)",
  whiteSpace: "nowrap",
} as const;

type BehaviorCounts = Record<AttendanceBehavior, number>;

/**
 * Backend per-member totals, bucketed by behavior rather than status label.
 * `attendanceBehaviorCounts` is the source of truth; the legacy
 * "Total Number of …" columns are deprecated aliases and are not read.
 */
const behaviorCountOf = (row: any, behavior: AttendanceBehavior): number =>
  (row?.attendanceBehaviorCounts as Partial<BehaviorCounts> | undefined)?.[
    behavior
  ] ?? 0;

// extract the yyyy-MM-dd suffix from a date column key and render it compactly
const formatDayHeader = (key: string) => {
  const isoDate = key.match(/\d{4}-\d{2}-\d{2}$/)?.[0];
  return isoDate ? format(parseISO(isoDate), DAY_HEADER_FORMAT) : key;
};

const AttendanceAnalyticsPage: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [hasSearched, setHasSearched] = useState(false);
  const {
    fromDate, toDate, setFromDate, setToDate,
    activePreset, applyPreset, handleDateChange,
  } = useDateRange({ onChange: () => setHasSearched(false) });
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [statusOptions, setStatusOptions] = useState<string[]>([
    "active",
    "inactive",
  ]);
  const navigate = useNavigate();

  const goToMemberAnalytics = (memberId: string) => {
    const path = convertParamsToString(PROTECTED_PATHS.MEMBER_ANALYTICS, { memberId });
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
    [statusFilter],
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
    [
      "attendanceAnalytics",
      fromDate,
      toDate,
      org.id,
      selectedStatuses.join(","),
    ],
    url,
    {
      enabled: false,
    },
  );

  const exportExcelUrl = useMemo(() => {
    if (!canRunQuery) return "";
    const path = convertParamsToString(
      attendanceRequest.ANALYTICS_EXPORT_EXCEL,
      {
        organisationId: org.id,
      },
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
      },
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
    },
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
    [analyticsResponse?.data.keys],
  );
  // The response carries the org's effective config at query time.
  const statuses = useAttendanceStatuses(analyticsResponse?.data.attendanceStatuses);
  const rows: any[] = useMemo(
    () => analyticsResponse?.data.analytics || [],
    [analyticsResponse?.data.analytics],
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

  // detect which columns are dates
  const dateKeys = useMemo(
    () => keys.filter((k) => /\d{4}-\d{2}-\d{2}$/.test(k)),
    [keys],
  );

  // Legend: active statuses plus any inactive/unknown key in these results.
  const legend = useMemo(() => {
    const usedKeys = new Set<string>();
    rows.forEach((row) =>
      dateKeys.forEach((d) => {
        if (row[d]) usedKeys.add(row[d] as string);
      }),
    );
    return statuses.legendFor(usedKeys);
  }, [rows, dateKeys, statuses]);

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Box p={2}>
        <>
          <Flex mb={3} mt={2} gap={2} justifyContent="flex-end" flexWrap="wrap">
            <Button
              leftIcon={<FaFileExcel />}
              onClick={() => refetchExcel()}
              isLoading={isExportingExcel}
              isDisabled={!canRunQuery}
              bg="green.500"
              color="white"
              _hover={{ bg: "green.600" }}
            >
              Export Excel
            </Button>
            <Button
              leftIcon={<FaFilePdf />}
              onClick={() => refetchPdf()}
              isLoading={isExportingPdf}
              isDisabled={!canRunQuery}
              bg="red.500"
              color="white"
              _hover={{ bg: "red.600" }}
            >
              Export PDF
            </Button>
          </Flex>
          {/* Date range presets + selectors + status filter + search */}
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
                <Box w={{ base: "100%", md: "260px" }}>
                  <ReactSelect
                    isMulti
                    placeholder="Filter members by status"
                    options={statusSelectOptions}
                    value={selectedStatusOptions}
                    closeMenuOnSelect={false}
                    onChange={(selected: MultiValue<StatusOption>) => {
                      const values = selected.map((item) => item.value);
                      if (values.length === 0) {
                        setStatusFilter(["all"]);
                        setHasSearched(false);
                        return;
                      }
                      if (values.includes("all") && values.length > 1) {
                        setStatusFilter(
                          values.filter((value) => value !== "all"),
                        );
                        setHasSearched(false);
                        return;
                      }
                      if (values.includes("all")) {
                        setStatusFilter(["all"]);
                        setHasSearched(false);
                        return;
                      }
                      setStatusFilter(values);
                      setHasSearched(false);
                    }}
                  />
                </Box>
                <Button
                  colorScheme="blue"
                  onClick={handleSearch}
                  isDisabled={!canRunQuery}
                  w={{ base: "100%", md: "auto" }}
                >
                  Search
                </Button>
              </>
            }
          />

          {/* Loading & error */}
          {isFetching && <Spinner />}
          {error && (
            <Text color="red.500" mb={4}>
              Error fetching analytics.
            </Text>
          )}

          {/* Table */}
          {!isFetching && !error && hasSearched && rows.length > 0 && (
            <Box>
              {/* Applied range + status legend */}
              <Flex
                mb={3}
                gap={3}
                align="center"
                justify="space-between"
                flexWrap="wrap"
              >
                <Text fontWeight="semibold">
                  {formatRangeLabel(fromDate, toDate)}
                </Text>
                <Flex gap={4} flexWrap="wrap">
                  {legend.map((status) => (
                    <Flex key={status.key} align="center" gap={1}>
                      <Badge colorScheme={status.color}>{status.shortLabel}</Badge>
                      <Text fontSize="sm">{status.label}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Flex>

              <Box overflowX="auto">
                <Table variant="striped" size="sm">
                  <Thead>
                    <Tr>
                      <Th isNumeric>SN</Th>
                      <Th>Name</Th>
                      {ATTENDANCE_BEHAVIORS.map((behavior) => (
                        <Th key={behavior} textAlign="center" verticalAlign="bottom">
                          <Box as="span" sx={VERTICAL_LABEL_SX}>
                            {BEHAVIOR_META[behavior].label}
                          </Box>
                        </Th>
                      ))}
                      {dateKeys.map((d) => (
                        <Th key={d} textAlign="center" verticalAlign="bottom">
                          <Box as="span" sx={VERTICAL_LABEL_SX}>
                            {formatDayHeader(d)}
                          </Box>
                        </Th>
                      ))}
                    </Tr>
                  </Thead>
                  <Tbody>
                    {rows.map((row, index) => (
                      <Tr
                        key={row.memberId}
                        onClick={() => row.memberId && goToMemberAnalytics(row.memberId)}
                        cursor={row.memberId ? "pointer" : "default"}
                        _hover={row.memberId ? { bg: "blue.50" } : undefined}
                        title={row.memberId ? "View member analytics" : undefined}
                        role={row.memberId ? "button" : undefined}
                        tabIndex={row.memberId ? 0 : undefined}
                        onKeyDown={(e) => {
                          if (row.memberId && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            goToMemberAnalytics(row.memberId);
                          }
                        }}
                      >
                        <Td isNumeric>{index + 1}</Td>
                        <Td>{row.name}</Td>

                        {ATTENDANCE_BEHAVIORS.map((behavior) => (
                          <Td key={behavior} textAlign="center">
                            <Badge colorScheme={BEHAVIOR_META[behavior].color}>
                              {behaviorCountOf(row, behavior)}
                            </Badge>
                          </Td>
                        ))}

                        {dateKeys.map((d) => {
                          const key = row[d] as string | undefined;
                          if (!key) {
                            return (
                              <Td key={d} textAlign="center">
                                <Badge title="No record">-</Badge>
                              </Td>
                            );
                          }
                          const status = statuses.resolve(key);
                          return (
                            <Td key={d} textAlign="center">
                              <Badge colorScheme={status.color} title={status.label}>
                                {status.shortLabel}
                              </Badge>
                            </Td>
                          );
                        })}
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          )}

          {/* No data message */}
          {!isFetching && !error && hasSearched && rows.length === 0 && (
            <Text>No attendance records found for this range.</Text>
          )}
        </>
      </Box>
    </Box>
  );
};

export default AttendanceAnalyticsPage;

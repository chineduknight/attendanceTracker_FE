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
import { FaArrowCircleLeft, FaFileExcel, FaFilePdf } from "react-icons/fa";
import { PROTECTED_PATHS } from "routes/pagePath";
import { attendanceRequest, orgRequest } from "services";
import { capitalize, convertParamsToString } from "helpers/stringManipulations";
import {
  STATUS_META,
  getStatusMeta,
  AttendanceStatus,
} from "components/analytics/statusMeta";
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

  useQueryWrapper(["get-member-model", org.id], modelURL, {
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
  const rows: any[] = analyticsResponse?.data.analytics || [];

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

  // static totals
  // static totals (simplified labels) and a lookup for your actual field keys
  const totalKeys = ["Present", "Absent", "Apology"];
  const totalsMap: Record<string, string> = {
    Present: "Total Number of Times Present",
    Absent: "Total Number of Times Absent",
    Apology: "Total Number of  Apology",
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Attendance Analytics
        </Text>
      </Flex>
      <Box p={2}>
        <>
          <Button
            variant="logout"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
            mr={2}
            leftIcon={<FaArrowCircleLeft />}
            m="2"
          >
            Back
          </Button>
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
                  {(Object.keys(STATUS_META) as AttendanceStatus[]).map(
                    (status) => (
                      <Flex key={status} align="center" gap={1}>
                        <Badge colorScheme={STATUS_META[status].color}>
                          {STATUS_META[status].short}
                        </Badge>
                        <Text fontSize="sm">{STATUS_META[status].full}</Text>
                      </Flex>
                    ),
                  )}
                </Flex>
              </Flex>

              <Box overflowX="auto">
                <Table variant="striped" size="sm">
                  <Thead>
                    <Tr>
                      <Th isNumeric>SN</Th>
                      <Th>Name</Th>
                      {totalKeys.map((label) => (
                        <Th key={label} textAlign="center" verticalAlign="bottom">
                          <Box as="span" sx={VERTICAL_LABEL_SX}>
                            {label}
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

                        {totalKeys.map((label) => (
                          <Td key={label} textAlign="center">
                            <Badge
                              colorScheme={getStatusMeta(label.toLowerCase()).color}
                            >
                              {row[totalsMap[label]] ?? 0}
                            </Badge>
                          </Td>
                        ))}

                        {dateKeys.map((d) => {
                          const meta = getStatusMeta(row[d] as string);
                          return (
                            <Td key={d} textAlign="center">
                              <Badge colorScheme={meta.color}>{meta.short}</Badge>
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

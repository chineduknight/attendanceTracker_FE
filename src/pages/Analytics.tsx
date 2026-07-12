import React, { useState, useMemo } from "react";
import {
  Box,
  Flex,
  Input,
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
import ReactSelect, { MultiValue } from "react-select";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-toastify";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  startOfYear,
  endOfYear,
  format,
  parseISO,
} from "date-fns";

type StatusOption = {
  value: string;
  label: string;
};

const DATE_INPUT_FORMAT = "yyyy-MM-dd";
const DAY_HEADER_FORMAT = "EEE d, MMM"; // e.g. "Tue 3, Jul"

// rotate narrow column headers so single-letter cells don't waste width.
// applied to an inner span (not the th) so the cell stays in normal writing
// mode and can center the label horizontally over its column.
// keep the react-datepicker input full-width and vertically center its
// clear (×) button, which otherwise sits misaligned against a Chakra input
const DATE_PICKER_WRAPPER_SX = {
  ".react-datepicker-wrapper": { width: "100%" },
  ".react-datepicker__close-icon": {
    top: 0,
    right: "0.5rem",
    marginRight: "0.5rem",
    height: "100%",
    display: "flex",
    alignItems: "center",
    padding: 0,
  },
  ".react-datepicker__close-icon::after": {
    display: "block",
    backgroundColor: "transparent",
    color: "gray.400",
    height: "auto",
    width: "auto",
    padding: 0,
    fontSize: "20px",
    lineHeight: 1,
  },
  ".react-datepicker__close-icon:hover::after": {
    color: "gray.600",
  },
} as const;

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

const formatRangeLabel = (fromISO: string, toISO: string) => {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = format(from, sameYear ? "MMM d" : "MMM d, yyyy");
  return `${fromLabel} – ${format(to, "MMM d, yyyy")}`;
};

const DATE_PRESETS: {
  label: string;
  getRange: (today: Date) => { from: Date; to: Date };
}[] = [
  {
    label: "This Month",
    getRange: (t) => ({ from: startOfMonth(t), to: endOfMonth(t) }),
  },
  {
    label: "Last Month",
    getRange: (t) => ({
      from: startOfMonth(subMonths(t, 1)),
      to: endOfMonth(subMonths(t, 1)),
    }),
  },
  {
    label: "This Quarter",
    getRange: (t) => ({ from: startOfQuarter(t), to: endOfQuarter(t) }),
  },
  {
    label: "Last Quarter",
    getRange: (t) => ({
      from: startOfQuarter(subQuarters(t, 1)),
      to: endOfQuarter(subQuarters(t, 1)),
    }),
  },
  {
    label: "This Year",
    getRange: (t) => ({ from: startOfYear(t), to: endOfYear(t) }),
  },
];

const AttendanceAnalyticsPage: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [statusOptions, setStatusOptions] = useState<string[]>([
    "active",
    "inactive",
  ]);
  const navigate = useNavigate();
  const canRunQuery = Boolean(fromDate && toDate && org.id);

  const handleExportSuccess = (response: any, format: "PDF" | "Excel") => {
    const exportUrl =
      typeof response?.data === "string" ? response.data.trim() : "";
    if (exportUrl) {
      window.open(exportUrl, "_blank", "noopener,noreferrer");
      return;
    }
    const responseError =
      typeof response?.error === "string"
        ? response.error
        : `Failed to export ${format}.`;
    toast.error(responseError);
  };

  const handleExportError = (err: any, format: "PDF" | "Excel") => {
    const statusCode = err?.response?.status;
    if (statusCode === 401) return;
    const apiError = err?.response?.data?.error;
    let message: string;
    if (Array.isArray(apiError)) {
      message = apiError.filter(Boolean).join(", ");
    } else if (typeof apiError === "string" && apiError.trim()) {
      message = apiError;
    } else {
      message = `Failed to export ${format}. Please try again.`;
    }
    toast.error(message);
  };

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
        onSuccess: (response: any) => handleExportSuccess(response, "Excel"),
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
      onSuccess: (response: any) => handleExportSuccess(response, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    },
  );

  const handleSearch = () => {
    if (canRunQuery) {
      setHasSearched(true);
      refetch();
    }
  };

  const applyPreset = (preset: (typeof DATE_PRESETS)[number]) => {
    const { from, to } = preset.getRange(new Date());
    setFromDate(format(from, DATE_INPUT_FORMAT));
    setToDate(format(to, DATE_INPUT_FORMAT));
    setActivePreset(preset.label);
    setHasSearched(false);
  };

  const handleDateChange =
    (setter: (value: string) => void) => (date: Date | null) => {
      setter(date ? format(date, DATE_INPUT_FORMAT) : "");
      setActivePreset(null);
      setHasSearched(false);
    };

  const fromDateValue = fromDate ? parseISO(fromDate) : null;
  const toDateValue = toDate ? parseISO(toDate) : null;
  // attendance can't exist in the future, so cap both pickers at today
  const today = new Date();
  const fromMaxDate =
    toDateValue && toDateValue < today ? toDateValue : today;

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
          {/* Quick date range presets */}
          <Flex mb={3} gap={2} flexWrap="wrap">
            {DATE_PRESETS.map((preset) => {
              const isActive = activePreset === preset.label;
              return (
                <Button
                  key={preset.label}
                  size="sm"
                  variant={isActive ? "solid" : "outline"}
                  colorScheme="blue"
                  aria-pressed={isActive}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </Button>
              );
            })}
          </Flex>

          {/* Date selectors + button */}
          <Flex
            mb={6}
            gap={2}
            align="center"
            direction={{ base: "column", md: "row" }}
          >
            <Box w={{ base: "100%", md: "auto" }} sx={DATE_PICKER_WRAPPER_SX}>
              <DatePicker
                selected={fromDateValue}
                onChange={handleDateChange(setFromDate)}
                selectsStart
                startDate={fromDateValue}
                endDate={toDateValue}
                maxDate={fromMaxDate}
                dateFormat="MMM d, yyyy"
                placeholderText="From date"
                isClearable
                customInput={<Input pr="2rem" />}
              />
            </Box>
            <Box w={{ base: "100%", md: "auto" }} sx={DATE_PICKER_WRAPPER_SX}>
              <DatePicker
                selected={toDateValue}
                onChange={handleDateChange(setToDate)}
                selectsEnd
                startDate={fromDateValue}
                endDate={toDateValue}
                minDate={fromDateValue ?? undefined}
                maxDate={today}
                dateFormat="MMM d, yyyy"
                placeholderText="To date"
                isClearable
                customInput={<Input pr="2rem" />}
              />
            </Box>
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
                    setStatusFilter(values.filter((value) => value !== "all"));
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
          </Flex>

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
                      <Tr key={row.memberId}>
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

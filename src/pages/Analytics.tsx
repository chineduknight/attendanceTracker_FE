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
import ReactSelect, { MultiValue } from "react-select";

type StatusOption = {
  value: string;
  label: string;
};

const AttendanceAnalyticsPage: React.FC = () => {
  const [org] = useGlobalStore((state) => [state.organisation]);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [statusOptions, setStatusOptions] = useState<string[]>([
    "active",
    "inactive",
  ]);
  const navigate = useNavigate();
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
      sort: "present:desc",
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
        onSuccess: (response: any) => {
          if (response?.data) {
            window.open(response.data, "_blank");
          }
        },
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
      onSuccess: (response: any) => {
        if (response?.data) {
          window.open(response.data, "_blank");
        }
      },
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
          {/* Date selectors + button */}
          <Flex
            mb={6}
            gap={2}
            align="center"
            direction={{ base: "column", md: "row" }}
          >
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setHasSearched(false);
              }}
              w={{ base: "100%", md: "auto" }}
              max={toDate || undefined}
            />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setHasSearched(false);
              }}
              w={{ base: "100%", md: "auto" }}
              min={fromDate || undefined}
            />
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
            <Box overflowX="auto">
              <Table variant="striped" size="sm">
                <Thead>
                  <Tr>
                    <Th isNumeric>SN</Th>
                    <Th>Name</Th>
                    {totalKeys.map((label) => (
                      <Th key={label} isNumeric>
                        {label}
                      </Th>
                    ))}
                    {dateKeys.map((d) => (
                      <Th key={d}>{d.split(" On ")[1]}</Th>
                    ))}
                  </Tr>
                </Thead>
                <Tbody>
                  {rows.map((row, index) => (
                    <Tr key={row.memberId}>
                      <Td isNumeric>{index + 1}</Td>
                      <Td>{row.name}</Td>

                      {totalKeys.map((label) => (
                        <Td key={label} isNumeric>
                          {row[totalsMap[label]]}
                        </Td>
                      ))}

                      {dateKeys.map((d) => {
                        const status = row[d] as string as
                          | "present"
                          | "absent"
                          | "apology"
                          | undefined;
                        let color: string, label: string;
                        switch (status) {
                          case "present":
                            color = "green";
                            label = "P";
                            break;
                          case "absent":
                            color = "red";
                            label = "A";
                            break;
                          case "apology":
                            color = "yellow";
                            label = "AP";
                            break;
                          default:
                            color = "gray";
                            label = "-";
                        }
                        return (
                          <Td key={d} textAlign="center">
                            <Badge colorScheme={color}>{label}</Badge>
                          </Td>
                        );
                      })}
                    </Tr>
                  ))}
                </Tbody>
              </Table>
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

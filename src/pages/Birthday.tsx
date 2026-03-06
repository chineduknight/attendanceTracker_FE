import React, { useState, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Spinner,
  useColorModeValue,
} from "@chakra-ui/react";
import { FaArrowCircleLeft, FaBirthdayCake, FaFileExcel, FaFilePdf } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { convertParamsToString } from "helpers/stringManipulations";
import { orgRequest } from "services";
import ReactSelect, { MultiValue } from "react-select";

type StatusOption = {
  value: string;
  label: string;
};

const Birthday: React.FC = () => {
  const navigate = useNavigate();
  const [org] = useGlobalStore((state) => [state.organisation]);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [statusOptions, setStatusOptions] = useState<string[]>(["active", "inactive"]);
  const [hasSearched, setHasSearched] = useState(false);

  const canSearch = Boolean(fromDate && toDate && org.id);

  // fetch status options from model
  const modelURL = convertParamsToString(orgRequest.CONFIG_MODEL, {
    organisationId: org.id,
  });

  useQueryWrapper(["get-member-model-birthday", org.id], modelURL, {
    enabled: Boolean(org.id),
    onSuccess: (data: any) => {
      const fields = data?.data?.fields;
      const statusField = fields?.find((f: any) => f.name === "status");
      if (statusField && Array.isArray(statusField.options)) {
        setStatusOptions(statusField.options);
      }
    },
  });

  const selectedStatuses = useMemo(
    () => statusFilter.filter((s) => s !== "all"),
    [statusFilter]
  );

  const queryString = useMemo(() => {
    if (!canSearch) return "";
    const params = new URLSearchParams({
      field: "dob",
      startDate: fromDate,
      endDate: toDate,
      displayedFields: "name,dob",
    });
    if (selectedStatuses.length) {
      params.set("status", selectedStatuses.join(","));
    }
    return params.toString();
  }, [canSearch, fromDate, toDate, selectedStatuses]);

  const dataUrl = useMemo(() => {
    if (!canSearch) return "";
    const base = convertParamsToString(orgRequest.BIRTHDAY, {
      organisationId: org.id,
    });
    return `${base}?${queryString}`;
  }, [canSearch, org.id, queryString]);

  const exportPdfUrl = useMemo(() => {
    if (!canSearch) return "";
    const base = convertParamsToString(orgRequest.BIRTHDAY_EXPORT_PDF, {
      organisationId: org.id,
    });
    return `${base}?${queryString}`;
  }, [canSearch, org.id, queryString]);

  const exportExcelUrl = useMemo(() => {
    if (!canSearch) return "";
    const base = convertParamsToString(orgRequest.BIRTHDAY_EXPORT_EXCEL, {
      organisationId: org.id,
    });
    return `${base}?${queryString}`;
  }, [canSearch, org.id, queryString]);

  const {
    data: birthdayResponse,
    isFetching,
    error,
    refetch,
  } = useQueryWrapper(
    ["birthday", fromDate, toDate, org.id, selectedStatuses.join(",")],
    dataUrl,
    { enabled: false }
  );

  const { refetch: refetchPdf, isFetching: isExportingPdf } = useQueryWrapper(
    ["birthday-export-pdf", fromDate, toDate, org.id, selectedStatuses.join(",")],
    exportPdfUrl,
    {
      enabled: false,
      onSuccess: (response: any) => {
        if (response?.data) {
          window.open(response.data, "_blank");
        }
      },
    }
  );

  const { refetch: refetchExcel, isFetching: isExportingExcel } = useQueryWrapper(
    ["birthday-export-excel", fromDate, toDate, org.id, selectedStatuses.join(",")],
    exportExcelUrl,
    {
      enabled: false,
      onSuccess: (response: any) => {
        if (response?.data) {
          window.open(response.data, "_blank");
        }
      },
    }
  );

  const handleSearch = () => {
    if (canSearch) {
      setHasSearched(true);
      refetch();
    }
  };

  const members: any[] = birthdayResponse?.data?.members || birthdayResponse?.data || [];

  const statusSelectOptions = useMemo<StatusOption[]>(
    () => [
      { value: "all", label: "All" },
      ...statusOptions.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) })),
    ],
    [statusOptions]
  );

  const selectedStatusOptions = useMemo(
    () => statusSelectOptions.filter((o) => statusFilter.includes(o.value)),
    [statusFilter, statusSelectOptions]
  );

  return (
    <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex bg="pink.400" justifyContent="space-between" alignItems="center" p="4">
        <Text fontWeight="bold" color="#fff">
          Birthdays
        </Text>
        <FaBirthdayCake color="#fff" size={22} />
      </Flex>

      <Box p={4}>
        <Button
          variant="ghost"
          colorScheme="pink"
          onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
          leftIcon={<FaArrowCircleLeft />}
          mb={4}
        >
          Back
        </Button>

        {/* Export */}
        <Flex mb={3} justifyContent="flex-end" gap={2}>
          <Button
            leftIcon={<FaFileExcel />}
            onClick={() => refetchExcel()}
            isLoading={isExportingExcel}
            isDisabled={!canSearch}
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
            isDisabled={!canSearch}
            bg="red.500"
            color="white"
            _hover={{ bg: "red.600" }}
          >
            Export PDF
          </Button>
        </Flex>

        {/* Filters */}
        <Flex mb={6} gap={2} align="center" direction={{ base: "column", md: "row" }}>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setHasSearched(false); }}
            placeholder="From date"
            w={{ base: "100%", md: "auto" }}
            max={toDate || undefined}
          />
          <Input
            type="date"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setHasSearched(false); }}
            placeholder="To date"
            w={{ base: "100%", md: "auto" }}
            min={fromDate || undefined}
          />
          <Box w={{ base: "100%", md: "260px" }}>
            <ReactSelect
              isMulti
              placeholder="Filter by status"
              options={statusSelectOptions}
              value={selectedStatusOptions}
              closeMenuOnSelect={false}
              onChange={(selected: MultiValue<StatusOption>) => {
                const values = selected.map((item) => item.value);
                setHasSearched(false);
                if (values.length === 0 || (values.includes("all") && values.length === 1)) {
                  setStatusFilter(["all"]);
                  return;
                }
                if (values.includes("all") && values.length > 1) {
                  setStatusFilter(values.filter((v) => v !== "all"));
                  return;
                }
                setStatusFilter(values);
              }}
            />
          </Box>
          <Button
            colorScheme="pink"
            onClick={handleSearch}
            isDisabled={!canSearch}
            w={{ base: "100%", md: "auto" }}
          >
            Find
          </Button>
        </Flex>

        {isFetching && <Spinner />}
        {error && (
          <Text color="red.500" mb={4}>
            Error fetching birthday data.
          </Text>
        )}

        {!isFetching && !error && hasSearched && members.length > 0 && (
          <Box overflowX="auto">
            <Table variant="striped" size="sm">
              <Thead>
                <Tr>
                  <Th isNumeric>SN</Th>
                  <Th>Name</Th>
                  <Th>Date of Birth</Th>
                </Tr>
              </Thead>
              <Tbody>
                {members.map((member: any, index: number) => (
                  <Tr key={member._id || index}>
                    <Td isNumeric>{index + 1}</Td>
                    <Td>{member.name}</Td>
                    <Td>{member.dob}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        )}

        {!isFetching && !error && hasSearched && members.length === 0 && (
          <Text>No birthdays found for this date range.</Text>
        )}
      </Box>
    </Box>
  );
};

export default Birthday;

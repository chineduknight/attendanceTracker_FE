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
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import {
  FaArrowCircleLeft,
  FaBirthdayCake,
  FaFileExcel,
  FaFilePdf,
  FaShareAlt,
  FaWhatsapp,
  FaCopy,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useQueryWrapper } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { convertParamsToString } from "helpers/stringManipulations";
import { orgRequest } from "services";
import { format, parseISO, isValid } from "date-fns";
import ReactSelect, { MultiValue } from "react-select";
import { toast } from "react-toastify";

type StatusOption = {
  value: string;
  label: string;
};

const Birthday: React.FC = () => {
  const navigate = useNavigate();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(["all"]);
  const [statusOptions, setStatusOptions] = useState<string[]>([
    "active",
    "inactive",
  ]);
  const [hasSearched, setHasSearched] = useState(false);

  const getErrorMessage = (err: any, fallback: string): string => {
    const statusCode = err?.response?.status;
    if (statusCode === 401) {
      return "";
    }

    const apiError = err?.response?.data?.error;
    if (Array.isArray(apiError)) {
      return apiError.filter(Boolean).join(", ");
    }
    if (typeof apiError === "string" && apiError.trim()) {
      return apiError;
    }
    return fallback;
  };

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
    const message = getErrorMessage(
      err,
      `Failed to export ${format}. Please try again.`,
    );
    if (message) {
      toast.error(message);
    }
  };

  const canSearch = Boolean(fromDate && toDate && org.id);

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
    [statusFilter],
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
    { enabled: false },
  );

  const { refetch: refetchPdf, isFetching: isExportingPdf } = useQueryWrapper(
    [
      "birthday-export-pdf",
      fromDate,
      toDate,
      org.id,
      selectedStatuses.join(","),
    ],
    exportPdfUrl,
    {
      enabled: false,
      onSuccess: (response: any) => {
        handleExportSuccess(response, "PDF");
      },
      onError: (err: any) => {
        handleExportError(err, "PDF");
      },
    },
  );

  const { refetch: refetchExcel, isFetching: isExportingExcel } =
    useQueryWrapper(
      [
        "birthday-export-excel",
        fromDate,
        toDate,
        org.id,
        selectedStatuses.join(","),
      ],
      exportExcelUrl,
      {
        enabled: false,
        onSuccess: (response: any) => {
          handleExportSuccess(response, "Excel");
        },
        onError: (err: any) => {
          handleExportError(err, "Excel");
        },
      },
    );

  const handleSearch = () => {
    if (canSearch) {
      setHasSearched(true);
      refetch();
    }
  };

  const members: any[] =
    birthdayResponse?.data?.members || birthdayResponse?.data || [];

  const buildShareText = () => {
    const formatRangeDate = (d: string) => {
      const parsed = parseISO(d);
      return isValid(parsed) ? format(parsed, "dd-MMM") : d;
    };
    const formatDob = (dob: string) => {
      const parsed = parseISO(dob);
      return isValid(parsed) ? format(parsed, "EEE, dd MMM") : dob;
    };
    const header = `🎂 Birthdays (${formatRangeDate(
      fromDate,
    )} to ${formatRangeDate(toDate)})\n\n`;
    const list = members
      .map((m: any, i: number) => `${i + 1}. ${m.name} - ${formatDob(m.dob)}`)
      .join("\n");
    return header + list;
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(buildShareText());
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard
      .writeText(buildShareText())
      .then(() => toast.success("Copied to clipboard!"))
      .catch(() => toast.error("Failed to copy. Please try again."));
  };

  const statusSelectOptions = useMemo<StatusOption[]>(
    () => [
      { value: "all", label: "All" },
      ...statusOptions.map((o) => ({
        value: o,
        label: o.charAt(0).toUpperCase() + o.slice(1),
      })),
    ],
    [statusOptions],
  );

  const selectedStatusOptions = useMemo(
    () => statusSelectOptions.filter((o) => statusFilter.includes(o.value)),
    [statusFilter, statusSelectOptions],
  );
  const pageBg: string = useColorModeValue("gray.50", "gray.800");

  return (
    <Box minH="100vh" bg={pageBg}>
      <Flex
        bg="pink.400"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
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

        {/* Share button */}
        <Flex mb={3} justifyContent="flex-end">
          <Button
            leftIcon={<FaShareAlt />}
            onClick={onOpen}
            isDisabled={!hasSearched || members.length === 0}
            colorScheme="gray"
          >
            Share
          </Button>
        </Flex>

        {/* Filters */}
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
              if (!toDate) setToDate(e.target.value);
            }}
            placeholder="From date"
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
                if (
                  values.length === 0 ||
                  (values.includes("all") && values.length === 1)
                ) {
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
        {Boolean(error) && (
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

      {/* Share drawer */}
      <Drawer isOpen={isOpen} placement="bottom" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent borderTopRadius="xl">
          <DrawerCloseButton />
          <DrawerHeader>Share Birthdays</DrawerHeader>
          <DrawerBody pb={8}>
            <VStack spacing={3}>
              <Button
                w="100%"
                size="lg"
                leftIcon={<FaFileExcel />}
                bg="green.500"
                color="white"
                _hover={{ bg: "green.600" }}
                isLoading={isExportingExcel}
                onClick={() => refetchExcel()}
              >
                Export Excel
              </Button>
              <Button
                w="100%"
                size="lg"
                leftIcon={<FaFilePdf />}
                bg="red.500"
                color="white"
                _hover={{ bg: "red.600" }}
                isLoading={isExportingPdf}
                onClick={() => refetchPdf()}
              >
                Export PDF
              </Button>
              <Button
                w="100%"
                size="lg"
                leftIcon={<FaWhatsapp />}
                bg="#25D366"
                color="white"
                _hover={{ bg: "#1ebe5d" }}
                onClick={handleWhatsApp}
              >
                Share on WhatsApp
              </Button>
              <Button
                w="100%"
                size="lg"
                leftIcon={<FaCopy />}
                colorScheme="gray"
                onClick={handleCopyToClipboard}
              >
                Copy to Clipboard
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
};

export default Birthday;

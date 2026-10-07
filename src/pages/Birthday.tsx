import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  Input,
  Spinner,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import {
  FaCopy,
  FaFileExcel,
  FaFilePdf,
  FaShareAlt,
  FaWhatsapp,
} from "react-icons/fa";
import ReactSelect, { MultiValue } from "react-select";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";
import { useMemberModel } from "hooks/useMemberModel";
import { buildBirthdayQueryString, useBirthdays } from "hooks/useBirthdays";
import { useQueryWrapper } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { orgRequest } from "services/api/request";
import { convertParamsToString } from "helpers/stringManipulations";
import {
  birthdayDisplayDate,
  birthdayOccurrenceInRange,
  birthdayRangeForPreset,
  birthdayRelativeLabel,
  formatBirthdayRangeDate,
  hasDobDateField,
  localBusinessDate,
  BirthdayPreset,
  BirthdayRange,
} from "helpers/birthday";
import BirthdaySummaryCards, {
  BirthdaySummary,
} from "components/birthday/BirthdaySummaryCards";
import BirthdayList from "components/birthday/BirthdayList";

type StatusOption = { value: string; label: string };
type ActivePreset = BirthdayPreset | "custom";

const FALLBACK_STATUSES = ["active", "inactive"];
const PRESET_BUTTONS: Array<{ preset: BirthdayPreset; label: string }> = [
  { preset: "thisMonth", label: "This Month" },
  { preset: "nextMonth", label: "Next Month" },
  { preset: "threeMonths", label: "3 Months" },
];
const EMPTY_SUMMARY: BirthdaySummary = {
  today: null,
  next7: null,
  next30: null,
};

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

/**
 * Phase 7B Birthday experience: proactive today / next 7 / next 30 overview
 * that auto-loads on open, with the deeper presets, custom range, dynamic
 * status filter, share and exports kept intact. Occurrence dates prefer the
 * backend's `birthdayOccurrence` metadata and never derive age or birth year.
 */
const Birthday: React.FC = () => {
  const org = useGlobalStore((state) => state.organisation);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const pageBg: string = useColorModeValue("gray.50", "gray.800");
  const today = localBusinessDate();

  // Proactive default: today → today + 30, no Find click required.
  const [activePreset, setActivePreset] = useState<ActivePreset>("next30");
  const [range, setRange] = useState<BirthdayRange>(() =>
    birthdayRangeForPreset("next30", localBusinessDate()),
  );
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Statuses are stored with the organisation they belong to: after a switch
  // this immediately reads as All instead of briefly sending A-only values
  // that B's backend would reject.
  const [statusSelection, setStatusSelection] = useState<{
    organisationId: string;
    values: string[];
  }>({ organisationId: org.id, values: ["all"] });
  const statusFilter = useMemo(
    () =>
      statusSelection.organisationId === org.id
        ? statusSelection.values
        : ["all"],
    [statusSelection, org.id],
  );
  const setStatusFilter = (values: string[]) =>
    setStatusSelection({ organisationId: org.id, values });

  const {
    fields,
    hasData: modelLoaded,
    isError: modelError,
  } = useMemberModel(org.id);
  const dobConfigured = hasDobDateField(fields);

  const statusOptions = useMemo(() => {
    const statusField = fields.find(
      (field) => field.name.trim().toLowerCase() === "status",
    );
    const options = statusField?.options?.filter(Boolean) ?? [];
    return options.length ? options : FALLBACK_STATUSES;
  }, [fields]);

  // When the new model no longer offers a selected status, fall back to All
  // instead of sending stale options the backend would reject.
  useEffect(() => {
    setStatusSelection((current) => {
      if (current.organisationId !== org.id) return current;
      const selected = current.values.filter((status) => status !== "all");
      if (!selected.length) return current;
      const valid = selected.filter((status) =>
        statusOptions.some(
          (option) => option.toLowerCase() === status.toLowerCase(),
        ),
      );
      if (valid.length === selected.length) return current;
      return {
        organisationId: org.id,
        values: valid.length ? valid : ["all"],
      };
    });
  }, [org.id, statusOptions]);

  const selectedStatuses = useMemo(
    () => statusFilter.filter((status) => status !== "all"),
    [statusFilter],
  );
  const statusesParam = selectedStatuses.join(",");

  // ONE next-30-days snapshot backs all three proactive counts, independent of
  // whichever range the active list below is showing.
  const summaryRange = useMemo(
    () => birthdayRangeForPreset("next30", today),
    [today],
  );
  const summary = useBirthdays(org.id, {
    fromDate: summaryRange.fromDate,
    toDate: summaryRange.toDate,
    statuses: selectedStatuses,
    enabled: dobConfigured,
  });
  const list = useBirthdays(org.id, {
    fromDate: range.fromDate,
    toDate: range.toDate,
    statuses: selectedStatuses,
    enabled: dobConfigured,
  });

  const counts = useMemo<BirthdaySummary>(() => {
    if (!summary.isSuccess) return EMPTY_SUMMARY;
    const next7End = birthdayRangeForPreset("next7", today).toDate;
    const occurrences = summary.members
      .map((member) => birthdayOccurrenceInRange(member, summaryRange))
      .filter((value): value is string => value != null);
    return {
      today: occurrences.filter((value) => value === today).length,
      next7: occurrences.filter((value) => value <= next7End).length,
      next30: occurrences.length,
    };
  }, [summary.isSuccess, summary.members, summaryRange, today]);

  const applyPreset = (preset: BirthdayPreset) => {
    setActivePreset(preset);
    setRange(birthdayRangeForPreset(preset, localBusinessDate()));
  };

  const startCustom = () => {
    setActivePreset("custom");
    setCustomFrom(range.fromDate);
    setCustomTo(range.toDate);
  };

  const customValid =
    Boolean(customFrom) && Boolean(customTo) && customFrom <= customTo;

  const applyCustom = () => {
    if (!customValid) return;
    setActivePreset("custom");
    setRange({ fromDate: customFrom, toDate: customTo });
  };

  const emptyState =
    activePreset === "today"
      ? "No birthdays today."
      : activePreset === "next7"
        ? "No birthdays in the next 7 days."
        : activePreset === "next30"
          ? "No birthdays in the next 30 days."
          : "No birthdays found for this date range.";

  const statusSelectOptions = useMemo<StatusOption[]>(
    () => [
      { value: "all", label: "All" },
      ...statusOptions.map((option) => ({
        value: option,
        label: option.charAt(0).toUpperCase() + option.slice(1),
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

  const handleStatusChange = (selected: MultiValue<StatusOption>) => {
    const values = selected.map((item) => item.value);
    if (
      values.length === 0 ||
      (values.includes("all") && values.length === 1)
    ) {
      setStatusFilter(["all"]);
      return;
    }
    if (values.includes("all") && values.length > 1) {
      setStatusFilter(values.filter((value) => value !== "all"));
      return;
    }
    setStatusFilter(values);
  };

  // Exports follow the ACTIVE range and status filter — never a backing 30-day
  // dataset when the officer selected something else.
  const exportQueryString = useMemo(
    () => buildBirthdayQueryString(range.fromDate, range.toDate, statusesParam),
    [range.fromDate, range.toDate, statusesParam],
  );

  const exportPdfUrl = useMemo(() => {
    if (!dobConfigured) return "";
    const base = convertParamsToString(orgRequest.BIRTHDAY_EXPORT_PDF, {
      organisationId: org.id,
    });
    return `${base}?${exportQueryString}`;
  }, [dobConfigured, org.id, exportQueryString]);

  const exportExcelUrl = useMemo(() => {
    if (!dobConfigured) return "";
    const base = convertParamsToString(orgRequest.BIRTHDAY_EXPORT_EXCEL, {
      organisationId: org.id,
    });
    return `${base}?${exportQueryString}`;
  }, [dobConfigured, org.id, exportQueryString]);

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

  const { refetch: refetchPdf, isFetching: isExportingPdf } = useQueryWrapper(
    queryKeys.birthday.export(
      org.id,
      "pdf",
      range.fromDate,
      range.toDate,
      statusesParam,
    ),
    exportPdfUrl,
    {
      enabled: false,
      onSuccess: (response: any) => handleExportSuccess(response, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    },
  );

  const { refetch: refetchExcel, isFetching: isExportingExcel } =
    useQueryWrapper(
      queryKeys.birthday.export(
        org.id,
        "excel",
        range.fromDate,
        range.toDate,
        statusesParam,
      ),
      exportExcelUrl,
      {
        enabled: false,
        onSuccess: (response: any) => handleExportSuccess(response, "Excel"),
        onError: (err: any) => handleExportError(err, "Excel"),
      },
    );

  const buildShareText = () => {
    const header = `🎂 Birthdays (${formatBirthdayRangeDate(
      range.fromDate,
    )} to ${formatBirthdayRangeDate(range.toDate)})\n\n`;
    const lines = list.members.map((member, index) => {
      const occurrence = birthdayOccurrenceInRange(member, range);
      const display = occurrence
        ? birthdayDisplayDate(occurrence)
        : member.dob ?? "";
      const relative = occurrence
        ? birthdayRelativeLabel(occurrence, today)
        : null;
      return `${index + 1}. ${member.name ?? ""} — ${display}${
        relative ? ` (${relative})` : ""
      }`;
    });
    return header + lines.join("\n");
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

  return (
    <Box minH="100vh" bg={pageBg}>
      <Box p={4}>
        {/* Share button */}
        <Flex mb={3} justifyContent="flex-end">
          <Button
            leftIcon={<FaShareAlt />}
            onClick={onOpen}
            isDisabled={
              list.members.length === 0 || list.isFetching || !dobConfigured
            }
            colorScheme="gray"
          >
            Share
          </Button>
        </Flex>

        {!modelLoaded && !modelError && <Spinner />}
        {modelError && (
          <Text color="red.500">Error loading the member model.</Text>
        )}
        {modelLoaded && !dobConfigured && (
          <Text>
            Birthdays are unavailable because this organisation does not have a
            date-of-birth field configured.
          </Text>
        )}

        {modelLoaded && dobConfigured && (
          <>
            <Box mb={3}>
              <Text fontWeight="semibold">Upcoming birthdays</Text>
              <Text fontSize="sm" color="gray.500">
                {`${formatBirthdayRangeDate(
                  summaryRange.fromDate,
                )} → ${formatBirthdayRangeDate(summaryRange.toDate)}`}
              </Text>
            </Box>

            <BirthdaySummaryCards
              summary={counts}
              activePreset={activePreset}
              onSelect={applyPreset}
            />
            {summary.isError && (
              <Text fontSize="sm" color="gray.500" mt={2}>
                Upcoming counts are unavailable right now.
              </Text>
            )}

            <Flex mt={4} mb={3} gap={3} align="center" wrap="wrap">
              <Wrap spacing={2}>
                {PRESET_BUTTONS.map(({ preset, label }) => (
                  <WrapItem key={preset}>
                    <Button
                      size="sm"
                      variant={activePreset === preset ? "solid" : "outline"}
                      colorScheme="pink"
                      onClick={() => applyPreset(preset)}
                    >
                      {label}
                    </Button>
                  </WrapItem>
                ))}
                <WrapItem>
                  <Button
                    size="sm"
                    variant={activePreset === "custom" ? "solid" : "outline"}
                    colorScheme="pink"
                    onClick={startCustom}
                  >
                    Custom
                  </Button>
                </WrapItem>
              </Wrap>
              <Box w={{ base: "100%", md: "260px" }}>
                <ReactSelect
                  isMulti
                  placeholder="Filter by status"
                  options={statusSelectOptions}
                  value={selectedStatusOptions}
                  closeMenuOnSelect={false}
                  onChange={handleStatusChange}
                />
              </Box>
            </Flex>

            {activePreset === "custom" && (
              <Flex
                mb={4}
                gap={2}
                align="center"
                direction={{ base: "column", md: "row" }}
              >
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  placeholder="From date"
                  aria-label="From date"
                  max={customTo || undefined}
                  w={{ base: "100%", md: "auto" }}
                />
                <Input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  placeholder="To date"
                  aria-label="To date"
                  min={customFrom || undefined}
                  w={{ base: "100%", md: "auto" }}
                />
                <Button
                  colorScheme="pink"
                  onClick={applyCustom}
                  isDisabled={!customValid}
                  w={{ base: "100%", md: "auto" }}
                >
                  Apply
                </Button>
              </Flex>
            )}

            {list.isFetching && <Spinner />}
            {!list.isFetching && list.isError && (
              <Text color="red.500" mb={4}>
                Error fetching birthday data.
              </Text>
            )}
            {!list.isFetching && !list.isError && list.isSuccess && (
              <BirthdayList
                members={list.members}
                range={range}
                asOf={today}
                emptyState={emptyState}
              />
            )}
          </>
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

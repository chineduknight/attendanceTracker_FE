import React, { useEffect, useMemo, useState } from "react";
import { useColorModeValue } from "components/ui/color-mode";
import {
  Box,
  Button,
  Drawer,
  Flex,
  Input,
  Menu,
  Spinner,
  Text,
  VStack,
  useDisclosure,
  Portal,
} from "@chakra-ui/react";
import {
  FaCheck,
  FaChevronDown,
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
  birthdayShareHeader,
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

// Secondary ranges live behind "More" so the three count tiles own the
// first row on mobile.
const MORE_PRESETS: Array<{ preset: BirthdayPreset; label: string }> = [
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
  const { open, onOpen, onClose } = useDisclosure();
  const pageBg: string = useColorModeValue("gray.50", "gray.800");
  const today = localBusinessDate();

  // Proactive default: today → today + 30, no Find click required.
  const [activePreset, setActivePreset] = useState<ActivePreset>("next30");
  const [range, setRange] = useState<BirthdayRange>(() =>
    birthdayRangeForPreset("next30", localBusinessDate())
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
    [statusSelection, org.id]
  );
  const setStatusFilter = (values: string[]) =>
    setStatusSelection({ organisationId: org.id, values });

  const {
    fields,
    hasData: modelLoaded,
    isError: modelError,
  } = useMemberModel(org.id);
  const dobConfigured = hasDobDateField(fields);

  // Status options come ONLY from the configured member model: organisations
  // are not required to have a `status` field, and invented values would make
  // the backend reject a filtered request (422). No field or no options means
  // no status filter is exposed at all.
  const statusOptions = useMemo(() => {
    const statusField = fields.find(
      (field) => field.name.trim().toLowerCase() === "status"
    );
    return statusField?.options?.filter(Boolean) ?? [];
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
          (option) => option.toLowerCase() === status.toLowerCase()
        )
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
    [statusFilter]
  );
  const statusesParam = selectedStatuses.join(",");

  // ONE next-30-days snapshot backs all three proactive counts, independent of
  // whichever range the active list below is showing.
  const summaryRange = useMemo(
    () => birthdayRangeForPreset("next30", today),
    [today]
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

  const activeMoreLabel =
    activePreset === "custom"
      ? "Custom"
      : MORE_PRESETS.find(({ preset }) => preset === activePreset)?.label;

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
    [statusOptions]
  );

  const selectedStatusOptions = useMemo(
    () =>
      statusSelectOptions.filter((option) =>
        statusFilter.includes(option.value)
      ),
    [statusFilter, statusSelectOptions]
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
    [range.fromDate, range.toDate, statusesParam]
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
      `Failed to export ${format}. Please try again.`
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
      statusesParam
    ),
    exportPdfUrl,
    {
      enabled: false,
      onSuccess: (response: any) => handleExportSuccess(response, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    }
  );

  const { refetch: refetchExcel, isFetching: isExportingExcel } =
    useQueryWrapper(
      queryKeys.birthday.export(
        org.id,
        "excel",
        range.fromDate,
        range.toDate,
        statusesParam
      ),
      exportExcelUrl,
      {
        enabled: false,
        onSuccess: (response: any) => handleExportSuccess(response, "Excel"),
        onError: (err: any) => handleExportError(err, "Excel"),
      }
    );

  const buildShareText = () => {
    const header = `${birthdayShareHeader(range)}\n\n`;
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
      <Box maxW="5xl" mx="auto" px={{ base: 3, md: 6 }} py={{ base: 3, md: 6 }}>
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
            <Flex mb={3} align="center" justify="space-between" gap={3}>
              <Box minW={0}>
                <Text fontWeight="semibold" fontSize={{ base: "md", md: "xl" }}>
                  Upcoming birthdays
                </Text>
                {/* The ACTIVE list range, not the backing 30-day snapshot. */}
                <Text fontSize={{ base: "sm", md: "md" }} color="gray.500">
                  {range.fromDate === range.toDate
                    ? formatBirthdayRangeDate(range.fromDate)
                    : `${formatBirthdayRangeDate(
                        range.fromDate
                      )} → ${formatBirthdayRangeDate(range.toDate)}`}
                </Text>
              </Box>
              <Button
                size={{ base: "sm", md: "md" }}
                flexShrink={0}
                onClick={onOpen}
                disabled={list.members.length === 0 || list.isFetching}
                colorPalette="gray"><FaShareAlt />Share
                              </Button>
            </Flex>

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

            <Flex
              mt={{ base: 3, md: 4 }}
              mb={{ base: 3, md: 4 }}
              gap={2}
              align="center"
            >
              <Menu.Root positioning={{
                placement: 'bottom-start'
              }}>
                <Menu.Trigger asChild><Button
                    size={{ base: "sm", md: "md" }}
                    flexShrink={0}
                    colorPalette="pink"
                    variant={activeMoreLabel ? "solid" : "outline"}
                    aria-label={`More ranges${
                      activeMoreLabel ? `, ${activeMoreLabel} selected` : ""
                    }`}>
                    {activeMoreLabel ?? "More"}
                    <FaChevronDown /></Button></Menu.Trigger>
                <Portal><Menu.Positioner><Menu.Content>
                      {MORE_PRESETS.map(({ preset, label }) => (
                        <Menu.Item
                          key={preset}
                          onSelect={() => applyPreset(preset)}
                          icon={
                            activePreset === preset ? <FaCheck /> : <Box w="1em" />
                          }
                          value='item-0'>
                          {label}
                        </Menu.Item>
                      ))}
                      <Menu.Separator />
                      <Menu.Item
                        onSelect={startCustom}
                        icon={
                          activePreset === "custom" ? <FaCheck /> : <Box w="1em" />
                        }
                        value='item-1'>
                        Custom
                      </Menu.Item>
                    </Menu.Content></Menu.Positioner></Portal>
              </Menu.Root>
              {statusOptions.length > 0 && (
                <Box flex={1} minW={0} maxW={{ md: "320px" }}>
                  <ReactSelect
                    isMulti
                    placeholder="Filter by status"
                    options={statusSelectOptions}
                    value={selectedStatusOptions}
                    closeMenuOnSelect={false}
                    onChange={handleStatusChange}
                  />
                </Box>
              )}
            </Flex>

            {activePreset === "custom" && (
              <Flex mb={3} gap={2} align="center">
                <Input
                  type="date"
                  size={{ base: "sm", md: "md" }}
                  flex={1}
                  minW={0}
                  maxW={{ md: "180px" }}
                  value={customFrom}
                  onValueChange={(event) => setCustomFrom(event.target.value)}
                  placeholder="From date"
                  aria-label="From date"
                  max={customTo || undefined}
                />
                <Input
                  type="date"
                  size={{ base: "sm", md: "md" }}
                  flex={1}
                  minW={0}
                  maxW={{ md: "180px" }}
                  value={customTo}
                  onValueChange={(event) => setCustomTo(event.target.value)}
                  placeholder="To date"
                  aria-label="To date"
                  min={customFrom || undefined}
                />
                <Button
                  size={{ base: "sm", md: "md" }}
                  flexShrink={0}
                  colorPalette="pink"
                  onClick={applyCustom}
                  disabled={!customValid}
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
      <Drawer.Root open={isOpen} placement='bottom' onOpenChange={e => {
        if (!e.open) {
          onClose();
        }
      }}>
        <Portal>

          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content borderTopRadius="xl">
              <Drawer.CloseTrigger />
              <Drawer.Header>Share Birthdays</Drawer.Header>
              <Drawer.Body pb={8}>
                <VStack gap={3}>
                  <Button
                    w="100%"
                    size="lg"
                    bg="green.500"
                    color="white"
                    _hover={{ bg: "green.600" }}
                    loading={isExportingExcel}
                    onClick={() => refetchExcel()}><FaFileExcel />Export Excel
                                  </Button>
                  <Button
                    w="100%"
                    size="lg"
                    bg="red.500"
                    color="white"
                    _hover={{ bg: "red.600" }}
                    loading={isExportingPdf}
                    onClick={() => refetchPdf()}><FaFilePdf />Export PDF
                                  </Button>
                  <Button
                    w="100%"
                    size="lg"
                    bg="#25D366"
                    color="white"
                    _hover={{ bg: "#1ebe5d" }}
                    onClick={handleWhatsApp}><FaWhatsapp />Share on WhatsApp
                                  </Button>
                  <Button w="100%" size="lg" colorPalette="gray" onClick={handleCopyToClipboard}><FaCopy />Copy to Clipboard
                                  </Button>
                </VStack>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>

        </Portal>
      </Drawer.Root>
    </Box>
  );
};

export default Birthday;

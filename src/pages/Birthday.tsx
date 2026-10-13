import React, { useEffect, useMemo, useState } from "react";
import {
  CloseButton,
  Box,
  Button,
  Drawer,
  Flex,
  Menu,
  Text,
  VStack,
  useDisclosure,
  Portal,
} from "@chakra-ui/react";
import {
  FaBirthdayCake,
  FaCheck,
  FaChevronDown,
  FaCopy,
  FaFileExcel,
  FaFilePdf,
  FaShareAlt,
  FaWhatsapp,
} from "react-icons/fa";
import { MultiValue } from "react-select";
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
import PageLoader from "components/PageLoader";
import PageContainer from "components/layout/PageContainer";
import { DateField } from "components/ui/date-field";
import { EmptyState, ErrorState, errorMessage } from "components/ui/states";
import { ThemedSelect } from "components/ui/themed-select";
import { lowerTerm } from "helpers/organisationPresentation";
import { useTerms } from "hooks/useOrgPresentation";
import { withSafeInset } from "styles/safeArea";

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
  const terms = useTerms();
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
    error: modelErrorDetail,
    refetch: refetchModel,
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

  const listBody = () => {
    if (list.isFetching) return <PageLoader h="20vh" />;
    if (list.isError) {
      return (
        <ErrorState
          title="Couldn't load birthdays"
          description={errorMessage(list.error)}
          onRetry={() => list.refetch()}
        />
      );
    }
    if (!list.isSuccess) return null;
    if (list.members.length === 0) {
      return <EmptyState icon={<FaBirthdayCake />} title={emptyState} />;
    }
    return (
      <BirthdayList
        members={list.members}
        range={range}
        asOf={today}
        emptyState={emptyState}
      />
    );
  };

  return (
    <PageContainer width="content">
      {!modelLoaded && !modelError && <PageLoader h="40vh" />}
      {modelError && (
        <ErrorState
          title={`Couldn't load the ${lowerTerm(terms.memberSingular)} fields`}
          description={errorMessage(modelErrorDetail)}
          onRetry={() => refetchModel()}
        />
      )}
      {modelLoaded && !dobConfigured && (
        <EmptyState
          icon={<FaBirthdayCake />}
          title="Birthdays are unavailable"
          description="This organisation does not have a date-of-birth field configured."
        />
      )}

      {modelLoaded && dobConfigured && (
        <>
          <Flex mb={3} align="center" justify="space-between" gap={3}>
            <Box minW={0}>
              <Text fontWeight="semibold" fontSize={{ base: "md", md: "xl" }}>
                Upcoming birthdays
              </Text>
              {/* The ACTIVE list range, not the backing 30-day snapshot. */}
              <Text fontSize={{ base: "sm", md: "md" }} color="fg.muted">
                {range.fromDate === range.toDate
                  ? formatBirthdayRangeDate(range.fromDate)
                  : `${formatBirthdayRangeDate(
                      range.fromDate
                    )} → ${formatBirthdayRangeDate(range.toDate)}`}
              </Text>
            </Box>
            <Button
              minH="44px"
              flexShrink={0}
              onClick={onOpen}
              disabled={list.members.length === 0 || list.isFetching}
              variant="outline"
              colorPalette="gray"
            >
              <FaShareAlt />
              Share
            </Button>
          </Flex>

          <BirthdaySummaryCards
            summary={counts}
            activePreset={activePreset}
            onSelect={applyPreset}
          />
          {summary.isError && (
            <Text fontSize="sm" color="fg.muted" mt={2}>
              Upcoming counts are unavailable right now.
            </Text>
          )}

          <Flex
            mt={{ base: 3, md: 4 }}
            mb={{ base: 3, md: 4 }}
            gap={2}
            align="center"
            wrap={{ base: "wrap", md: "nowrap" }}
          >
            <Menu.Root positioning={{ placement: "bottom-start" }}>
              <Menu.Trigger asChild>
                <Button
                  minH="44px"
                  flexShrink={0}
                  colorPalette="pink"
                  variant={activeMoreLabel ? "solid" : "outline"}
                  aria-label={`More ranges${
                    activeMoreLabel ? `, ${activeMoreLabel} selected` : ""
                  }`}
                >
                  {activeMoreLabel ?? "More"}
                  <FaChevronDown />
                </Button>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    {MORE_PRESETS.map(({ preset, label }) => (
                      <Menu.Item
                        key={preset}
                        minH="44px"
                        onSelect={() => applyPreset(preset)}
                        value={preset}
                      >
                        {activePreset === preset ? <FaCheck /> : <Box w="1em" />}
                        {label}
                      </Menu.Item>
                    ))}
                    <Menu.Separator />
                    <Menu.Item minH="44px" onSelect={startCustom} value="custom">
                      {activePreset === "custom" ? <FaCheck /> : <Box w="1em" />}
                      Custom
                    </Menu.Item>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
            {statusOptions.length > 0 && (
              // Its own row on phones: beside More, a chosen status shrank
              // to one letter next to the 44px remove/clear controls.
              <Box flex={{ base: "1 1 100%", md: 1 }} minW={0} maxW={{ md: "320px" }}>
                <ThemedSelect
                  isMulti
                  aria-label="Filter by status"
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
            // From/To share a row on phones; Apply goes under them so each
            // date keeps room for "Oct 10, 2026".
            <Flex mb={3} gap={2} align="center" wrap={{ base: "wrap", md: "nowrap" }}>
              <Box flex="1 1 0" minW={0} maxW={{ md: "200px" }}>
                <DateField
                  value={customFrom}
                  onChange={setCustomFrom}
                  range={{ role: "start", start: customFrom, end: customTo }}
                  max={customTo || undefined}
                  placeholder="From date"
                  aria-label="From date"
                />
              </Box>
              <Box flex="1 1 0" minW={0} maxW={{ md: "200px" }}>
                <DateField
                  value={customTo}
                  onChange={setCustomTo}
                  range={{ role: "end", start: customFrom, end: customTo }}
                  min={customFrom || undefined}
                  placeholder="To date"
                  aria-label="To date"
                />
              </Box>
              <Button
                minH="44px"
                w={{ base: "100%", md: "auto" }}
                flexShrink={0}
                colorPalette="pink"
                onClick={applyCustom}
                disabled={!customValid}
              >
                Apply
              </Button>
            </Flex>
          )}

          {listBody()}
        </>
      )}

      {/* Share drawer */}
      <Drawer.Root
        open={open}
        placement="bottom"
        onOpenChange={(e) => {
          if (!e.open) onClose();
        }}
      >
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content borderTopRadius="xl" maxW={{ md: "lg" }} mx="auto">
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" minW="44px" minH="44px" />
              </Drawer.CloseTrigger>
              <Drawer.Header pr={12}>
                <Drawer.Title>Share Birthdays</Drawer.Title>
              </Drawer.Header>
              {/* Clear of the iPhone home bar. */}
              <Drawer.Body pb={withSafeInset("bottom", "2rem")}>
                <VStack gap={3}>
                  <Button
                    w="100%"
                    size="lg"
                    variant="outline"
                    colorPalette="green"
                    loading={isExportingExcel}
                    onClick={() => refetchExcel()}
                  >
                    <FaFileExcel />
                    Export Excel
                  </Button>
                  <Button
                    w="100%"
                    size="lg"
                    variant="outline"
                    colorPalette="red"
                    loading={isExportingPdf}
                    onClick={() => refetchPdf()}
                  >
                    <FaFilePdf />
                    Export PDF
                  </Button>
                  {/* WhatsApp's own brand green, the same in both modes. */}
                  <Button
                    w="100%"
                    size="lg"
                    bg="#25D366"
                    color="white"
                    _hover={{ bg: "#1ebe5d" }}
                    onClick={handleWhatsApp}
                  >
                    <FaWhatsapp />
                    Share on WhatsApp
                  </Button>
                  <Button
                    w="100%"
                    size="lg"
                    variant="outline"
                    colorPalette="gray"
                    onClick={handleCopyToClipboard}
                  >
                    <FaCopy />
                    Copy to Clipboard
                  </Button>
                </VStack>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </PageContainer>
  );
};

export default Birthday;

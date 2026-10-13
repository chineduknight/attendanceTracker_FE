import React from "react";
import { Box, Flex, Button } from "@chakra-ui/react";
import { DateField, todayValue } from "components/ui/date-field";
import { DATE_PRESETS } from "components/analytics/useDateRange";

interface DateRangeControlsProps {
  fromDate: string;
  toDate: string;
  activePreset: string | null;
  applyPreset: (preset: (typeof DATE_PRESETS)[number]) => void;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  handleDateChange: (setter: (value: string) => void) => (value: string) => void;
  /** Controls on their own row under the dates (e.g. a filter and Search). */
  trailing?: React.ReactNode;
}

const DateRangeControls: React.FC<DateRangeControlsProps> = ({
  fromDate, toDate, activePreset, applyPreset,
  setFromDate, setToDate, handleDateChange, trailing,
}) => {
  const today = todayValue();
  // From can't pass To (or today); To can't precede From. YYYY-MM-DD compares
  // correctly as a string.
  const fromMax = toDate && toDate < today ? toDate : today;

  return (
    <Box mb={4}>
      {/* One sideways-scrolling row on phones (edge to edge, past the page
          padding) instead of two wrapped rows pushing results down. */}
      <Flex
        mb={3}
        gap={2}
        flexWrap={{ base: "nowrap", md: "wrap" }}
        overflowX={{ base: "auto", md: "visible" }}
        mx={{ base: -4, md: 0 }}
        px={{ base: 4, md: 0 }}
        css={{ scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
      >
        {DATE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <Button
              key={preset.label} size="sm" minH="44px" flexShrink={0}
              variant={isActive ? "solid" : "outline"} colorPalette="blue"
              aria-pressed={isActive} onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </Button>
          );
        })}
      </Flex>
      {/* From and To side by side from 360px; below that "Dec 31, 2026"
          no longer fits beside the 44px clear button, so they stack. */}
      <Flex gap={2} css={{ "@media (max-width: 359px)": { flexDirection: "column" } }}>
        <Box flex="1 1 0" minW={0} maxW={{ md: "220px" }} w="100%">
          <DateField
            value={fromDate} onChange={handleDateChange(setFromDate)}
            range={{ role: "start", start: fromDate, end: toDate }}
            max={fromMax} placeholder="From date" aria-label="From date" clearable
          />
        </Box>
        <Box flex="1 1 0" minW={0} maxW={{ md: "220px" }} w="100%">
          <DateField
            value={toDate} onChange={handleDateChange(setToDate)}
            range={{ role: "end", start: fromDate, end: toDate }}
            min={fromDate || undefined} max={today}
            placeholder="To date" aria-label="To date" clearable
          />
        </Box>
      </Flex>
      {trailing && (
        <Flex mt={2} gap={2} align="flex-start">
          {trailing}
        </Flex>
      )}
    </Box>
  );
};

export default DateRangeControls;

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
    <>
      <Flex mb={3} gap={2} flexWrap="wrap">
        {DATE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <Button
              key={preset.label} size="sm" minH="44px"
              variant={isActive ? "solid" : "outline"} colorPalette="blue"
              aria-pressed={isActive} onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </Button>
          );
        })}
      </Flex>
      <Flex mb={6} gap={2} align="center" direction={{ base: "column", md: "row" }}>
        <Box w={{ base: "100%", md: "auto" }}>
          <DateField
            value={fromDate} onChange={handleDateChange(setFromDate)}
            range={{ role: "start", start: fromDate, end: toDate }}
            max={fromMax} placeholder="From date" aria-label="From date" clearable
          />
        </Box>
        <Box w={{ base: "100%", md: "auto" }}>
          <DateField
            value={toDate} onChange={handleDateChange(setToDate)}
            range={{ role: "end", start: fromDate, end: toDate }}
            min={fromDate || undefined} max={today}
            placeholder="To date" aria-label="To date" clearable
          />
        </Box>
        {trailing}
      </Flex>
    </>
  );
};

export default DateRangeControls;

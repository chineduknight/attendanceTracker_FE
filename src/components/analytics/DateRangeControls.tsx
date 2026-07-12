import React from "react";
import { Box, Flex, Button, Input } from "@chakra-ui/react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { parseISO } from "date-fns";
import { DATE_PRESETS } from "components/analytics/useDateRange";

const DATE_PICKER_WRAPPER_SX = {
  ".react-datepicker-wrapper": { width: "100%" },
  ".react-datepicker__close-icon": {
    top: 0, right: "0.5rem", marginRight: "0.5rem", height: "100%",
    display: "flex", alignItems: "center", padding: 0,
  },
  ".react-datepicker__close-icon::after": {
    display: "block", backgroundColor: "transparent", color: "gray.400",
    height: "auto", width: "auto", padding: 0, fontSize: "20px", lineHeight: 1,
  },
  ".react-datepicker__close-icon:hover::after": { color: "gray.600" },
} as const;

interface DateRangeControlsProps {
  fromDate: string;
  toDate: string;
  activePreset: string | null;
  applyPreset: (preset: (typeof DATE_PRESETS)[number]) => void;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  handleDateChange: (setter: (value: string) => void) => (date: Date | null) => void;
  trailing?: React.ReactNode;
}

const DateRangeControls: React.FC<DateRangeControlsProps> = ({
  fromDate, toDate, activePreset, applyPreset,
  setFromDate, setToDate, handleDateChange, trailing,
}) => {
  const fromDateValue = fromDate ? parseISO(fromDate) : null;
  const toDateValue = toDate ? parseISO(toDate) : null;
  const today = new Date();
  const fromMaxDate = toDateValue && toDateValue < today ? toDateValue : today;

  return (
    <>
      <Flex mb={3} gap={2} flexWrap="wrap">
        {DATE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <Button
              key={preset.label} size="sm"
              variant={isActive ? "solid" : "outline"} colorScheme="blue"
              aria-pressed={isActive} onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </Button>
          );
        })}
      </Flex>
      <Flex mb={6} gap={2} align="center" direction={{ base: "column", md: "row" }}>
        <Box w={{ base: "100%", md: "auto" }} sx={DATE_PICKER_WRAPPER_SX}>
          <DatePicker
            selected={fromDateValue} onChange={handleDateChange(setFromDate)}
            selectsStart startDate={fromDateValue} endDate={toDateValue}
            maxDate={fromMaxDate} dateFormat="MMM d, yyyy"
            placeholderText="From date" isClearable customInput={<Input pr="2rem" />}
          />
        </Box>
        <Box w={{ base: "100%", md: "auto" }} sx={DATE_PICKER_WRAPPER_SX}>
          <DatePicker
            selected={toDateValue} onChange={handleDateChange(setToDate)}
            selectsEnd startDate={fromDateValue} endDate={toDateValue}
            minDate={fromDateValue ?? undefined} maxDate={today}
            dateFormat="MMM d, yyyy" placeholderText="To date"
            isClearable customInput={<Input pr="2rem" />}
          />
        </Box>
        {trailing}
      </Flex>
    </>
  );
};

export default DateRangeControls;

import { useState } from "react";
import {
  startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter,
  subQuarters, startOfYear, endOfYear, format, parseISO,
} from "date-fns";

export const DATE_INPUT_FORMAT = "yyyy-MM-dd";

export const DATE_PRESETS: {
  label: string;
  getRange: (today: Date) => { from: Date; to: Date };
}[] = [
  { label: "This Month", getRange: (t) => ({ from: startOfMonth(t), to: endOfMonth(t) }) },
  { label: "Last Month", getRange: (t) => ({ from: startOfMonth(subMonths(t, 1)), to: endOfMonth(subMonths(t, 1)) }) },
  { label: "This Quarter", getRange: (t) => ({ from: startOfQuarter(t), to: endOfQuarter(t) }) },
  { label: "Last Quarter", getRange: (t) => ({ from: startOfQuarter(subQuarters(t, 1)), to: endOfQuarter(subQuarters(t, 1)) }) },
  { label: "This Year", getRange: (t) => ({ from: startOfYear(t), to: endOfYear(t) }) },
];

export const formatRangeLabel = (fromISO: string, toISO: string) => {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = format(from, sameYear ? "MMM d" : "MMM d, yyyy");
  return `${fromLabel} – ${format(to, "MMM d, yyyy")}`;
};

export interface UseDateRangeOptions {
  initialFrom?: string;
  initialTo?: string;
  onChange?: () => void;
}

export const useDateRange = (options: UseDateRangeOptions = {}) => {
  const [fromDate, setFromDate] = useState<string>(options.initialFrom ?? "");
  const [toDate, setToDate] = useState<string>(options.initialTo ?? "");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (preset: (typeof DATE_PRESETS)[number]) => {
    const { from, to } = preset.getRange(new Date());
    setFromDate(format(from, DATE_INPUT_FORMAT));
    setToDate(format(to, DATE_INPUT_FORMAT));
    setActivePreset(preset.label);
    options.onChange?.();
  };

  const handleDateChange =
    (setter: (value: string) => void) => (date: Date | null) => {
      setter(date ? format(date, DATE_INPUT_FORMAT) : "");
      setActivePreset(null);
      options.onChange?.();
    };

  return {
    fromDate, toDate, setFromDate, setToDate,
    activePreset, setActivePreset, applyPreset, handleDateChange,
  };
};

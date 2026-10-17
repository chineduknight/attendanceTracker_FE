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

/** The preset whose range is exactly from–to today, if any. */
export const presetFor = (fromISO: string, toISO: string, today: Date) =>
  DATE_PRESETS.find((preset) => {
    const { from, to } = preset.getRange(today);
    return (
      format(from, DATE_INPUT_FORMAT) === fromISO &&
      format(to, DATE_INPUT_FORMAT) === toISO
    );
  })?.label ?? null;

export interface UseDateRangeOptions {
  initialFrom?: string;
  initialTo?: string;
  onChange?: () => void;
}

export const useDateRange = (options: UseDateRangeOptions = {}) => {
  const [fromDate, setFromDate] = useState<string>(options.initialFrom ?? "");
  const [toDate, setToDate] = useState<string>(options.initialTo ?? "");
  // A range arriving from a link (e.g. this month's dates) lights its preset.
  const [activePreset, setActivePreset] = useState<string | null>(() =>
    presetFor(options.initialFrom ?? "", options.initialTo ?? "", new Date())
  );

  const applyPreset = (preset: (typeof DATE_PRESETS)[number]) => {
    const { from, to } = preset.getRange(new Date());
    setFromDate(format(from, DATE_INPUT_FORMAT));
    setToDate(format(to, DATE_INPUT_FORMAT));
    setActivePreset(preset.label);
    options.onChange?.();
  };

  /** Takes DateField's value: "" or YYYY-MM-DD. */
  const handleDateChange =
    (setter: (value: string) => void) => (value: string) => {
      setter(value);
      setActivePreset(null);
      options.onChange?.();
    };

  return {
    fromDate, toDate, setFromDate, setToDate,
    activePreset, setActivePreset, applyPreset, handleDateChange,
  };
};

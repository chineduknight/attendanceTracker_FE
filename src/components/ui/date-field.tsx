import { Box, Input } from "@chakra-ui/react";
import { format, isValid, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "styles/datepicker.css";

/** Business dates travel as YYYY-MM-DD: no time, no timezone. */
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (value?: string): Date | null => {
  if (!value || !BUSINESS_DATE.test(value)) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
};

/** Today on the officer's local calendar, as YYYY-MM-DD. */
export const todayValue = () => format(new Date(), "yyyy-MM-dd");

/** Touch screens get the calendar without the on-screen keyboard. */
const useCoarsePointer = () => {
  const query = "(pointer: coarse)";
  const [coarse, setCoarse] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(query);
    const update = () => setCoarse(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return coarse;
};

const CLEAR_ICON_CSS = {
  "& .react-datepicker-wrapper": { width: "100%" },
  "& .react-datepicker__close-icon": {
    top: 0, right: "0.5rem", marginRight: "0.5rem", height: "100%",
    display: "flex", alignItems: "center", padding: 0,
  },
  "& .react-datepicker__close-icon::after": {
    display: "block", backgroundColor: "transparent", color: "fg.muted",
    height: "auto", width: "auto", padding: 0, fontSize: "20px", lineHeight: 1,
  },
  "& .react-datepicker__close-icon:hover::after": { color: "fg" },
} as const;

export interface DateFieldProps {
  /** "" or YYYY-MM-DD. */
  value: string;
  /** Called with "" (cleared) or YYYY-MM-DD; never a shifted date. */
  onChange: (value: string) => void;
  /** Inclusive bounds, YYYY-MM-DD. */
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  /** For a from/to pair: which end this is and the other end's value. */
  range?: { role: "start" | "end"; start: string; end: string };
  name?: string;
  onBlur?: () => void;
  "aria-label"?: string;
}

/**
 * The app's date input (react-datepicker), shown as "Oct 8, 2026" and read
 * and written as YYYY-MM-DD. Place it in a Field.Root beside a Field.Label:
 * the input takes its id from the field. Bounds are enforced for typed
 * dates too, which a native date input's min/max is not (and iOS ignores).
 */
export const DateField = ({
  value,
  onChange,
  min,
  max,
  placeholder = "Select date",
  clearable = false,
  disabled,
  range,
  name,
  onBlur,
  "aria-label": ariaLabel,
}: DateFieldProps) => {
  const coarse = useCoarsePointer();
  const rangeProps = range
    ? {
        selectsStart: range.role === "start",
        selectsEnd: range.role === "end",
        startDate: toDate(range.start),
        endDate: toDate(range.end),
      }
    : {};

  return (
    <Box w="100%" css={CLEAR_ICON_CSS}>
      <DatePicker
        selected={toDate(value)}
        onChange={(date: Date | null) =>
          onChange(date && isValid(date) ? format(date, "yyyy-MM-dd") : "")
        }
        minDate={toDate(min)}
        maxDate={toDate(max)}
        dateFormat="MMM d, yyyy"
        placeholderText={placeholder}
        isClearable={clearable && !disabled}
        disabled={disabled}
        name={name}
        onBlur={onBlur}
        customInput={
          <Input
            aria-label={ariaLabel}
            autoComplete="off"
            inputMode={coarse ? "none" : undefined}
            pr={clearable ? "2rem" : undefined}
          />
        }
        {...rangeProps}
      />
    </Box>
  );
};

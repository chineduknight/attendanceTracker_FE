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

// The clear ✕ is a 44px square at the input's right edge (the library's is
// ~16px wide).
const CLEAR_ICON_CSS = {
  "& .react-datepicker-wrapper": { width: "100%" },
  "& .react-datepicker__close-icon": {
    top: 0, right: 0, height: "100%", minHeight: "44px", width: "44px",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
  },
  "& .react-datepicker__close-icon::after": {
    display: "block", backgroundColor: "transparent", color: "fg.muted",
    height: "auto", width: "auto", padding: 0, fontSize: "20px", lineHeight: 1,
  },
  "& .react-datepicker__close-icon:hover::after": { color: "fg" },
} as const;

// Positioned against the viewport, not the nearest scroll box: in a bottom
// sheet or dialog body the calendar would otherwise open below the field,
// be clipped by the sheet's scrolling body and never flip up into the room
// above. Fixed + viewport boundaries let it flip or shift to stay on screen.
const POPPER_PROPS = { strategy: "fixed" as const };
const POPPER_MODIFIERS = [
  {
    name: "flip",
    options: { rootBoundary: "viewport", fallbackPlacements: ["top-start", "bottom-start"] },
  },
  { name: "preventOverflow", options: { rootBoundary: "viewport", altAxis: true, padding: 8 } },
];

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
        popperProps={POPPER_PROPS}
        popperModifiers={POPPER_MODIFIERS}
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
            pr={clearable ? "44px" : undefined}
          />
        }
        {...rangeProps}
      />
    </Box>
  );
};

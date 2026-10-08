import { Input, InputProps } from "@chakra-ui/react";
import { forwardRef, useLayoutEffect, useRef } from "react";
import {
  caretAfter,
  formatAmount,
  significantBefore,
  toRawAmount,
} from "helpers/amount";

export interface AmountInputProps
  extends Omit<InputProps, "value" | "onChange" | "type" | "inputMode"> {
  /** Plain number string, e.g. "6000.5" ("" when empty). */
  value: string;
  /** Receives the plain number string, never the formatted text. */
  onChange: (value: string) => void;
  /** Decimal places allowed; 0 for whole amounts. */
  decimals?: number;
}

/**
 * Money input that shows thousands separators while typing (6000 -> 6,000)
 * but reads and writes a plain number string, so payloads do not change.
 * A text input on purpose: number inputs cannot show separators, and
 * inputMode still brings up the numeric keypad on phones.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  function AmountInput({ value, onChange, decimals = 2, ...inputProps }, forwardedRef) {
    const innerRef = useRef<HTMLInputElement | null>(null);
    const pendingCaret = useRef<number | null>(null);
    const formatted = formatAmount(value);

    // Put the caret back after React writes the reformatted value.
    useLayoutEffect(() => {
      const input = innerRef.current;
      if (input && pendingCaret.current !== null && document.activeElement === input) {
        input.setSelectionRange(pendingCaret.current, pendingCaret.current);
      }
      pendingCaret.current = null;
    });

    return (
      <Input
        {...inputProps}
        ref={(node) => {
          innerRef.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        value={formatted}
        onChange={(event) => {
          const typed = event.target.value;
          const raw = toRawAmount(typed, decimals);
          const caret = event.target.selectionStart ?? typed.length;
          pendingCaret.current = caretAfter(
            formatAmount(raw),
            significantBefore(typed, caret),
          );
          onChange(raw);
        }}
      />
    );
  },
);

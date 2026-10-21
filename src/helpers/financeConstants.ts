import { formatAmount } from "helpers/stringManipulations";
import { MonthStatus } from "components/finance/financeTypes";

export const DEFAULT_CURRENCY = "NGN";
export const DEFAULT_COUNTRY = "NG";

export const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

/**
 * Colour scheme + words for each month/overall status. Colour is never the
 * only signal: every place that paints a status also renders or announces
 * its label.
 */
export const STATUS_META: Record<MonthStatus, { label: string; scheme: string }> = {
  paid: { label: "Paid", scheme: "green" },
  partial: { label: "Part paid", scheme: "orange" },
  unpaid: { label: "Unpaid", scheme: "red" },
  "not-due": { label: "Not due", scheme: "gray" },
  unknown: { label: "Unknown", scheme: "yellow" },
};

export function statusMeta(status: MonthStatus) {
  return STATUS_META[status] ?? STATUS_META["not-due"];
}

/**
 * Naira with kobo only when there are any: "₦751,000" rather than
 * "₦751,000.00", so long figures fit a phone-width row.
 */
export function formatMoney(value: number): string {
  const amount = value ?? 0;
  if (!Number.isInteger(amount)) {
    return String(formatAmount(amount, DEFAULT_COUNTRY, DEFAULT_CURRENCY));
  }
  return new Intl.NumberFormat(`en-${DEFAULT_COUNTRY}`, {
    style: "currency",
    currency: DEFAULT_CURRENCY,
    currencyDisplay: "symbol",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Integer kobo as Naira without floating-point arithmetic: the kobo part is
 * sliced from the decimal string and only shown when nonzero. A value that
 * is not a safe integer returns a neutral message — never a rounded or
 * invented amount.
 */
export function formatKobo(amountKobo: number): string {
  if (!Number.isSafeInteger(amountKobo)) return "Amount unavailable";
  const sign = amountKobo < 0 ? "-" : "";
  const digits = String(Math.abs(amountKobo)).padStart(3, "0");
  const naira = Number(digits.slice(0, -2));
  const kobo = digits.slice(-2);
  const whole = formatMoney(naira);
  return kobo === "00" ? `${sign}${whole}` : `${sign}${whole}.${kobo}`;
}

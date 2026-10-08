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
};

export function statusMeta(status: MonthStatus) {
  return STATUS_META[status] ?? STATUS_META["not-due"];
}

export function formatMoney(value: number): string {
  return String(formatAmount(value ?? 0, DEFAULT_COUNTRY, DEFAULT_CURRENCY));
}

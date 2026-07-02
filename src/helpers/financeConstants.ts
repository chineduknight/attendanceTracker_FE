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

const STATUS_COLORS: Record<MonthStatus, string> = {
  paid: "green.100",
  partial: "yellow.100",
  unpaid: "red.100",
  "not-due": "gray.100",
};

export function monthStatusColor(status: MonthStatus): string {
  return STATUS_COLORS[status] ?? "gray.100";
}

export function formatMoney(value: number): string {
  return String(formatAmount(value ?? 0, DEFAULT_COUNTRY, DEFAULT_CURRENCY));
}

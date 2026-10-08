import { fireEvent, render, screen } from "@testing-library/react";
import CorrectPaymentForm from "components/finance/CorrectPaymentForm";
import { ComplianceRow, MonthStatus, Obligation } from "components/finance/financeTypes";

const dues: Obligation = { id: "ob1", type: "dues", name: "2026 Dues", year: 2026, amountPerMonth: 500 };
const levy: Obligation = { id: "ob2", type: "levy", name: "Building", amount: 10000, date: "2026-06-18" };

const months = (statuses: MonthStatus[]) =>
  Object.fromEntries(statuses.map((s, i) => [String(i + 1), s]));
const row = (statuses: MonthStatus[], totalPaid: number): ComplianceRow => ({
  memberId: "m1",
  name: "Ada",
  accountable: true,
  totalPaid,
  months: months(statuses),
});
const U: MonthStatus = "unpaid";
const paidJanToMar = row(["paid", "paid", "paid", U, U, U, U, U, U, U, U, U], 1500);

const setup = (props: Partial<React.ComponentProps<typeof CorrectPaymentForm>> = {}) => {
  const onCorrectDues = jest.fn();
  const onCorrectLevy = jest.fn();
  render(
    <CorrectPaymentForm
      obligation={dues}
      memberName="Ada"
      isSaving={false}
      onCorrectDues={onCorrectDues}
      onCorrectLevy={onCorrectLevy}
      {...props}
    />,
  );
  return { onCorrectDues, onCorrectLevy };
};

test("dues shows 12 month inputs; a levy shows one total", () => {
  setup();
  expect(screen.getByLabelText("Jan")).toBeInTheDocument();
  expect(screen.getByLabelText("Dec")).toBeInTheDocument();
});

test("a levy pre-fills its current total and confirms before overwriting", () => {
  const { onCorrectLevy } = setup({
    obligation: levy,
    row: { memberId: "m1", name: "Ada", accountable: true, paid: 4000 },
  });
  const input = screen.getByLabelText(/total amount paid/i);
  expect(input).toHaveValue(4000);
  fireEvent.change(input, { target: { value: "6000" } });
  fireEvent.click(screen.getByText("Save correction"));
  expect(onCorrectLevy).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Yes, update"));
  expect(onCorrectLevy).toHaveBeenCalledWith(6000);
});

test("locks paid months, pre-fills them, and gates entry sequentially", () => {
  setup({ row: paidJanToMar });
  expect(screen.getByLabelText("Jan")).toBeDisabled();
  expect(screen.getByLabelText("Jan")).toHaveValue(500);
  expect(screen.getByLabelText("Apr")).toBeEnabled();
  expect(screen.getByLabelText("May")).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Apr"), { target: { value: "500" } });
  expect(screen.getByLabelText("May")).toBeEnabled();
});

test("locks months before the member's financial start date", () => {
  setup({ row: row(["not-due", "not-due", "not-due", "not-due", "not-due", U, U, U, U, U, U, U], 0) });
  expect(screen.getByLabelText("Jan")).toBeDisabled();
  expect(screen.getByLabelText("May")).toBeDisabled();
  expect(screen.getByLabelText("Jun")).toBeEnabled();
});

test("locks every month when nothing is due this year", () => {
  setup({ row: row(Array(12).fill("not-due"), 0) });
  expect(screen.getByLabelText("Jan")).toBeDisabled();
  expect(screen.getByLabelText("Dec")).toBeDisabled();
});

test("a month accepts no more than the monthly amount", () => {
  setup();
  fireEvent.change(screen.getByLabelText("Jan"), { target: { value: "9999" } });
  expect(screen.getByLabelText("Jan")).toHaveValue(500);
});

test("clearing the boundary month relocks the next and reopens the previous one", () => {
  setup({ row: paidJanToMar });
  expect(screen.getByLabelText("Mar")).toBeEnabled();
  expect(screen.getByLabelText("Feb")).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Mar"), { target: { value: "" } });
  expect(screen.getByLabelText("Apr")).toBeDisabled();
  expect(screen.getByLabelText("Feb")).toBeEnabled();
  expect(screen.getByLabelText("Jan")).toBeDisabled();
});

test("Fill all and Clear all set every accountable month", () => {
  setup();
  fireEvent.click(screen.getByText("Fill all"));
  expect(screen.getByLabelText("Jan")).toHaveValue(500);
  expect(screen.getByLabelText("Dec")).toHaveValue(500);

  fireEvent.click(screen.getByText("Clear all"));
  expect(screen.getByLabelText("Jan")).toHaveValue(null);
  expect(screen.getByLabelText("Jan")).toBeEnabled();
  expect(screen.getByLabelText("Feb")).toBeDisabled();
});

test("builds monthlyPaid in order with numbers, only after confirming", () => {
  const { onCorrectDues } = setup();
  fireEvent.change(screen.getByLabelText("Jan"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("Feb"), { target: { value: "300" } });

  fireEvent.click(screen.getByText("Save correction"));
  expect(onCorrectDues).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Yes, update"));
  expect(onCorrectDues).toHaveBeenCalledWith({ "1": 500, "2": 300 });
});

test("clearing everything asks for a destructive confirmation", () => {
  const { onCorrectDues } = setup({ row: paidJanToMar });
  fireEvent.click(screen.getByText("Clear all"));
  fireEvent.click(screen.getByText("Save correction"));
  expect(onCorrectDues).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Yes, clear"));
  expect(onCorrectDues).toHaveBeenCalledWith({});
});

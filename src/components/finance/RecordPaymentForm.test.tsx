import { fireEvent, screen } from "@testing-library/react";
import { render } from "test-utils/render";
import RecordPaymentForm from "components/finance/RecordPaymentForm";
import { ComplianceRow, MonthStatus, Obligation } from "components/finance/financeTypes";

const dues: Obligation = { id: "ob1", type: "dues", name: "2026 Dues", year: 2026, amountPerMonth: 500 };
const statuses: MonthStatus[] = ["paid", "paid", "paid", ...Array(9).fill("unpaid")];
const row: ComplianceRow = {
  memberId: "m1",
  name: "Ada",
  accountable: true,
  months: Object.fromEntries(statuses.map((s, i) => [String(i + 1), s])),
  totalPaid: 1500,
  totalExpected: 6000,
  balance: 4500,
  paidUpToMonth: 3,
};

const setup = () => {
  const onRecord = jest.fn();
  render(<RecordPaymentForm obligation={dues} row={row} isSaving={false} onRecord={onRecord} />);
  return { onRecord, input: screen.getByLabelText("Amount received") };
};

test("a quick amount fills the field and previews where it lands", () => {
  const { onRecord, input } = setup();
  fireEvent.click(screen.getByRole("button", { name: /3 months/ }));
  expect(input).toHaveValue(1500);
  expect(screen.getByText("Fills from Apr onwards — 3 months' worth.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Record/ }));
  expect(onRecord).toHaveBeenCalledWith(1500);
});

test("blocks amounts above the balance with an inline message", () => {
  const { onRecord, input } = setup();
  fireEvent.change(input, { target: { value: "5000" } });
  expect(screen.getByText(/More than the .*4,500.* still owed\./)).toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "Record payment" });
  expect(submit).toBeDisabled();
  fireEvent.click(submit);
  expect(onRecord).not.toHaveBeenCalled();
});

test("cannot record nothing", () => {
  setup();
  expect(screen.getByRole("button", { name: "Record payment" })).toBeDisabled();
});

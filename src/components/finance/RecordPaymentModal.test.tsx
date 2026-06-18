import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import RecordPaymentModal from "components/finance/RecordPaymentModal";
import { Obligation } from "components/finance/financeTypes";
import { putRequest } from "services/api/apiHelper";

jest.mock("services/api/apiHelper", () => {
  const actual = jest.requireActual("services/api/apiHelper");
  return {
    __esModule: true,
    ...actual,
    postRequest: jest.fn(() => Promise.resolve({})),
    putRequest: jest.fn(() => Promise.resolve({})),
  };
});

const dues: Obligation = { id: "ob1", type: "dues", name: "2026 Dues", year: 2026, amountPerMonth: 500 };
const levy: Obligation = { id: "ob2", type: "levy", name: "Building", amount: 10000, date: "2026-06-18" };

const baseProps = {
  isOpen: true,
  onClose: () => undefined,
  organisationId: "org1",
  memberId: "m1",
  memberName: "Ada",
  onSuccess: () => undefined,
};

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
});

test("record mode shows a single amount input", () => {
  render(wrap(<RecordPaymentModal {...baseProps} obligation={dues} />));
  expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
});

test("correct mode on dues shows 12 month inputs", () => {
  render(wrap(<RecordPaymentModal {...baseProps} obligation={dues} />));
  fireEvent.click(screen.getByText(/correct/i));
  expect(screen.getByLabelText("Jan")).toBeInTheDocument();
  expect(screen.getByLabelText("Dec")).toBeInTheDocument();
});

test("correct mode on levy shows a single amountPaid input", () => {
  render(wrap(<RecordPaymentModal {...baseProps} obligation={levy} />));
  fireEvent.click(screen.getByText(/correct/i));
  expect(screen.getByLabelText(/total amount paid/i)).toBeInTheDocument();
});

test("correct mode locks paid months, pre-fills them, and gates entry sequentially", () => {
  // Jan–Mar paid (500 each), rest unpaid, accountable from January.
  const row: any = {
    memberId: "m1",
    name: "Ada",
    accountable: true,
    totalPaid: 1500,
    paidUpToMonth: 3,
    months: {
      "1": "paid", "2": "paid", "3": "paid", "4": "unpaid", "5": "unpaid",
      "6": "unpaid", "7": "unpaid", "8": "unpaid", "9": "unpaid", "10": "unpaid",
      "11": "unpaid", "12": "unpaid",
    },
  };
  render(wrap(<RecordPaymentModal {...baseProps} obligation={dues} complianceRow={row} />));
  fireEvent.click(screen.getByText(/correct/i));

  // Paid months are locked and pre-filled with the monthly amount.
  expect(screen.getByLabelText("Jan")).toBeDisabled();
  expect(screen.getByLabelText("Jan")).toHaveValue(500);
  // First unpaid month is editable; the one after it is gated until it's filled.
  expect(screen.getByLabelText("Apr")).toBeEnabled();
  expect(screen.getByLabelText("May")).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Apr"), { target: { value: "500" } });
  expect(screen.getByLabelText("May")).toBeEnabled();
});

test("correct mode locks months before the member's financial start date", () => {
  // Member becomes accountable in June -> Jan–May are not-due.
  const row: any = {
    memberId: "m1",
    name: "Ada",
    accountable: true,
    totalPaid: 0,
    paidUpToMonth: 0,
    months: {
      "1": "not-due", "2": "not-due", "3": "not-due", "4": "not-due", "5": "not-due",
      "6": "unpaid", "7": "unpaid", "8": "unpaid", "9": "unpaid", "10": "unpaid",
      "11": "unpaid", "12": "unpaid",
    },
  };
  render(wrap(<RecordPaymentModal {...baseProps} obligation={dues} complianceRow={row} />));
  fireEvent.click(screen.getByText(/correct/i));

  expect(screen.getByLabelText("Jan")).toBeDisabled();
  expect(screen.getByLabelText("May")).toBeDisabled();
  expect(screen.getByLabelText("Jun")).toBeEnabled();
});

test("correct mode on dues builds monthlyPaid with only filled months as numbers", async () => {
  render(wrap(<RecordPaymentModal {...baseProps} obligation={dues} />));
  fireEvent.click(screen.getByText(/correct/i));

  fireEvent.change(screen.getByLabelText("Jan"), { target: { value: "100" } });
  fireEvent.change(screen.getByLabelText("Mar"), { target: { value: "200" } });

  fireEvent.click(screen.getByText("Save"));

  await waitFor(() => {
    expect(putRequest).toHaveBeenCalledTimes(1);
    const payload = (putRequest as jest.Mock).mock.calls[0][0].data;
    expect(payload.monthlyPaid).toEqual({ "1": 100, "3": 200 });
  });
});

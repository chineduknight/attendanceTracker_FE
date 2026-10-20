import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import CorrectPaymentForm from "components/finance/CorrectPaymentForm";
import { Obligation } from "components/finance/financeTypes";
import {
  LINKED_ALLOCATION_UNAVAILABLE_NOTE,
  LinkedAllocation,
  correctionAllocationWarning,
  linkedAllocationOf,
  nairaAmountToKobo,
} from "helpers/f0AllocationWarning";
import { toPositionsReport } from "helpers/ledgerReconciliation";
import { useLinkedAllocation } from "hooks/useLedgerReconciliation";
import {
  MEMBER_ADA,
  OBLIGATION_DUES,
  READ_AT,
  knownPosition,
  overLinkedPosition,
  positionsReport,
  unknownPosition,
} from "test-utils/ledgerF3Fixtures";

/** F3 O11(b): a read-only warning on the F0 correction screen. */

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "put", jest.Mock>;

const levy: Obligation = { id: OBLIGATION_DUES, type: "levy", name: "Building", amount: 10000, date: "2026-06-18" };
const dues: Obligation = { id: OBLIGATION_DUES, type: "dues", name: "2026 Dues", year: 2026, amountPerMonth: 500 };
const known = (allocatedKobo: number): LinkedAllocation => ({ kind: "known", allocatedKobo, readAt: READ_AT });

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
});

describe("the warning rule", () => {
  it("converts entered naira to exact kobo, never rounding a sub-kobo value", () => {
    expect(nairaAmountToKobo(4000)).toBe(400000);
    expect(nairaAmountToKobo(12.34)).toBe(1234);
    expect(nairaAmountToKobo(0.1 + 0.2)).toBe(30);
    expect(nairaAmountToKobo(1.005)).toBeNull();
    expect(nairaAmountToKobo(-1)).toBeNull();
  });

  it("warns only below what is allocated", () => {
    expect(correctionAllocationWarning(299999, known(300000))).toMatch(
      /below the ₦3,000 already allocated to it in the books.*can still be saved.*over-linked until an allocation is reversed or Finance is corrected again/,
    );
    expect(correctionAllocationWarning(300000, known(300000))).toBeNull();
    expect(correctionAllocationWarning(0, known(0))).toBeNull();
    expect(correctionAllocationWarning(1, { kind: "unavailable" })).toBeNull();
    expect(correctionAllocationWarning(1, { kind: "loading" })).toBeNull();
    expect(correctionAllocationWarning(null, known(5))).toBeNull();
    expect(correctionAllocationWarning(1, undefined)).toBeNull();
  });

  it("reads the allocated total from the server, keeping it known for unknown and ambiguous F0 values", () => {
    const of = (items: unknown[]) =>
      linkedAllocationOf({
        report: toPositionsReport(positionsReport(items)),
        isLoading: false,
        isError: false,
        memberId: (items[0] as { memberId?: string } | undefined)?.memberId ?? MEMBER_ADA,
        obligationId: OBLIGATION_DUES,
      });
    expect(of([knownPosition()])).toEqual(known(300000));
    expect(of([])).toEqual(known(0));
    expect(of([unknownPosition("ambiguous")])).toMatchObject({ kind: "known", allocatedKobo: 100000 });
    expect(of([overLinkedPosition()])).toMatchObject({ allocatedKobo: 500000 });
    expect(
      linkedAllocationOf({ report: null, isLoading: false, isError: true, memberId: MEMBER_ADA, obligationId: OBLIGATION_DUES }),
    ).toEqual({ kind: "unavailable" });
  });
});

describe("on the correction form", () => {
  const setup = (props: Partial<React.ComponentProps<typeof CorrectPaymentForm>> = {}) => {
    const onCorrectLevy = jest.fn();
    const onCorrectDues = jest.fn();
    render(
      <CorrectPaymentForm
        obligation={levy}
        memberName="Ada"
        row={{ memberId: MEMBER_ADA, name: "Ada", accountable: true, paid: 4000 }}
        isSaving={false}
        onCorrectDues={onCorrectDues}
        onCorrectLevy={onCorrectLevy}
        {...props}
      />,
    );
    return { onCorrectLevy, onCorrectDues };
  };

  it("is absent while the F3 gate is off (no prop): the form is unchanged", () => {
    setup();
    fireEvent.change(screen.getByLabelText(/total amount paid/i), { target: { value: "1" } });
    expect(screen.queryByText(/already allocated/)).not.toBeInTheDocument();
    expect(screen.queryByText(LINKED_ALLOCATION_UNAVAILABLE_NOTE)).not.toBeInTheDocument();
  });

  it("warns below the allocated amount but never blocks, and sends the same correction", async () => {
    const { onCorrectLevy } = setup({ linkedAllocation: known(300000) });
    expect(screen.queryByText(/already allocated/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/total amount paid/i), { target: { value: "2500" } });
    expect(screen.getByRole("status")).toHaveTextContent(/₦2,500, below the ₦3,000 already allocated/);
    const save = screen.getByRole("button", { name: "Save correction" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(await screen.findByText(/below the ₦3,000 already allocated/, { selector: "p, div" }, { timeout: 1000 })).toBeInTheDocument();
    fireEvent.click(await screen.findByText("Yes, update"));
    expect(onCorrectLevy).toHaveBeenCalledWith(2500, false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("warns when clearing every dues month below an allocation", async () => {
    const { onCorrectDues } = setup({
      obligation: dues,
      row: { memberId: MEMBER_ADA, name: "Ada", accountable: true, totalPaid: 1500, months: { "1": "paid", "2": "paid", "3": "paid" } },
      linkedAllocation: known(100000),
    });
    fireEvent.click(screen.getByText("Clear all"));
    expect(screen.getByRole("status")).toHaveTextContent(/₦0, below the ₦1,000 already allocated/);
    fireEvent.click(screen.getByText("Save correction"));
    fireEvent.click(await screen.findByText("Yes, clear"));
    expect(onCorrectDues).toHaveBeenCalledWith({}, false);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("says so when allocations can't be checked, without warning", () => {
    setup({ linkedAllocation: { kind: "unavailable" } });
    fireEvent.change(screen.getByLabelText(/total amount paid/i), { target: { value: "1" } });
    expect(screen.getByText(LINKED_ALLOCATION_UNAVAILABLE_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

const Probe = ({ enabled }: { enabled: boolean }) => {
  const link = useLinkedAllocation("org1", OBLIGATION_DUES, MEMBER_ADA, enabled);
  return <p>{link ? (link.kind === "known" ? `allocated ${link.allocatedKobo}` : link.kind) : "off"}</p>;
};

describe("wiring", () => {
  it("reads nothing while the gate is off", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Probe enabled={false} />
      </QueryClientProvider>,
    );
    expect(screen.getByText("off")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("reads exactly this organisation's position for this member and obligation", async () => {
    api.get.mockResolvedValue({ data: { data: positionsReport([knownPosition()]) } });
    render(
      <QueryClientProvider client={queryClient}>
        <Probe enabled />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("allocated 300000")).toBeInTheDocument();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    const url = api.get.mock.calls[0][0] as string;
    expect(url.startsWith("/finance/org1/ledger/reconciliation/positions?")).toBe(true);
    expect(url).toContain(`obligationId=${OBLIGATION_DUES}`);
    expect(url).toContain(`memberId=${MEMBER_ADA}`);
    expect(api.put).not.toHaveBeenCalled();
  });
});

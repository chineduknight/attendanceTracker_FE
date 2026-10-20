import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { chooseOption, render, selectTab } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import ReconciliationPanel from "components/finance/reconciliation/ReconciliationPanel";
import { PermissionKey } from "rbac/permissions";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";
import {
  ALLOCATION_A2,
  MEMBER_ADA,
  OBLIGATION_DUES,
  SOURCE_M12,
  allocationItem,
  allocationsPage,
  historicalSourcesReport,
  knownPosition,
  overLinkedPosition,
  positionsReport,
  reversedAllocationItem,
  sourcesReport,
  summaryReport,
  unknownPosition,
} from "test-utils/ledgerF3Fixtures";

/**
 * F3B reconciliation panel. Every request is mocked from server-shaped
 * fixtures; nothing reaches a real ledger. All reads, no writes.
 */

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<"get" | "post" | "put" | "patch" | "delete", jest.Mock>;

const OBLIGATIONS = [
  { id: OBLIGATION_DUES, type: "dues", name: "Dues", year: 2026, amountPerMonth: 1000 },
  { id: "0000000000000000000000e1", type: "levy", name: "Building levy", amount: 5000 },
];

const COMPLIANCE = {
  obligation: OBLIGATIONS[0],
  summary: {},
  rows: [{ memberId: MEMBER_ADA, name: "Ada Obi", accountable: true }],
};

type Responder = (url: string) => unknown;

const serve = (overrides: Partial<Record<"summary" | "sources" | "positions" | "allocations", Responder>> = {}) =>
  api.get.mockImplementation((url: string) => {
    const path = url.split("?")[0];
    const reply = (body: unknown) => Promise.resolve({ data: { data: body } });
    if (path.endsWith("/reconciliation/summary")) return overrides.summary ? overrides.summary(url) : reply(summaryReport());
    if (path.endsWith("/reconciliation/sources")) return overrides.sources ? overrides.sources(url) : reply(sourcesReport());
    if (path.endsWith("/reconciliation/positions"))
      return overrides.positions ? overrides.positions(url) : reply(positionsReport([knownPosition(), unknownPosition()]));
    if (path.endsWith("/ledger/allocations"))
      return overrides.allocations ? overrides.allocations(url) : reply(allocationsPage([allocationItem(), reversedAllocationItem()]));
    if (path.endsWith("/obligations")) return reply(OBLIGATIONS);
    if (path.endsWith("/compliance")) return reply(COMPLIANCE);
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });

const setPermissions = (permissions: PermissionKey[], orgId = "org1") =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, id: "officer-1" },
    organisation: { ...EMPTY_ORG, id: orgId, isOwner: false, permissions },
  });

const panel = (props: Partial<ComponentProps<typeof ReconciliationPanel>> = {}) => (
  <QueryClientProvider client={queryClient}>
    <ReconciliationPanel organisationId="org1" enabled {...props} />
  </QueryClientProvider>
);

const calls = (fragment: string) => api.get.mock.calls.map(([url]) => url as string).filter((url) => url.includes(fragment));

beforeEach(() => {
  queryClient.clear();
  jest.clearAllMocks();
  setPermissions(["finance.view"]);
  serve();
});

afterAll(() => useGlobalStore.setState({ user: EMPTY_USER, organisation: EMPTY_ORG }));

describe("gate and permissions", () => {
  it("renders and reads nothing while its gate is off", () => {
    render(panel({ enabled: false }));
    expect(screen.queryByText("Member money reconciliation")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("needs finance.view and nothing more", async () => {
    setPermissions(["attendance.view"]);
    const view = render(panel());
    expect(screen.queryByText("Member money reconciliation")).not.toBeInTheDocument();
    view.unmount();
    setPermissions(["finance.view"]);
    render(panel());
    expect(await screen.findByText("Member money reconciliation")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe("summary", () => {
  it("keeps current F0 and ledger figures apart and never shows incomplete totals as complete", async () => {
    render(panel());
    expect(await screen.findByText("Totals are incomplete")).toBeInTheDocument();
    expect(screen.getByText(/As read at/)).toBeInTheDocument();
    expect(screen.getByText(/isn't "since the opening date", and it can be negative/)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Recorded, all positions" })).getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Over known positions only (2)")).toBeInTheDocument();
    expect(screen.getByText("Member money and income now (ledger, current)")).toBeInTheDocument();
    expect(screen.getByText("Positions (Finance, current)")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Member levy income" })).getByText("₦5,000")).toBeInTheDocument();
    // Review lists, explained as review, never as errors to repair.
    expect(screen.getByText("Over-linked positions (1)")).toBeInTheDocument();
    expect(screen.getAllByText(/Reverse an allocation or correct the Finance record/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/violation/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /repair/i })).not.toBeInTheDocument();
  });

  it("shows the server's message when its checks don't agree, without calling it a violation", async () => {
    const inconsistent = summaryReport({
      identities: {
        consistent: false,
        message: "These figures do not agree with each other. Nothing was changed. Run the ledger integrity check (runbook §9.4) before acting on them.",
        checks: [{ name: "holding_balance_equals_sources_remaining", kind: "ledger", consistent: false, leftKobo: 1, rightKobo: 2 }],
      },
    });
    serve({ summary: () => Promise.resolve({ data: { data: inconsistent } }) });
    render(panel());
    expect(await screen.findByText(/Run the ledger integrity check \(runbook §9.4\)/)).toBeInTheDocument();
    expect(screen.queryByText(/violation/i)).not.toBeInTheDocument();
  });

  it("says movements are unknown for a window before the ledger", async () => {
    serve({
      summary: () =>
        Promise.resolve({
          data: {
            data: summaryReport({
              flows: { flowState: "unknown", allocationsKobo: null, allocationReversalsKobo: null, netAllocatedKobo: null, memberIncomeKobo: null, memberMoney: null },
            }),
          },
        }),
    });
    render(panel());
    expect(await screen.findByText("Not known for this period")).toBeInTheDocument();
  });

  it("explains a server without transactions instead of offering a retry loop", async () => {
    serve({
      summary: () =>
        Promise.reject({ response: { status: 503, data: { error: "Need a replica set", code: "LEDGER_TRANSACTIONS_UNAVAILABLE" } } }),
    });
    render(panel());
    expect(await screen.findByText("The reconciliation summary isn't available on this server")).toBeInTheDocument();
  });

  it("shows nothing it can't read", async () => {
    serve({ summary: () => Promise.resolve({ data: { data: { ...summaryReport(), positions: null } } }) });
    render(panel());
    expect(await screen.findByText("The reconciliation summary couldn't be read")).toBeInTheDocument();
    expect(screen.queryByText("₦5,000")).not.toBeInTheDocument();
  });
});

describe("unallocated money (sources)", () => {
  it("shows current suggestions apart, and offers allocation only when posting is possible here", async () => {
    render(panel());
    await selectTab(screen.getByRole("tab", { name: "Unallocated money" }));
    expect(await screen.findByText("Suggestions from current Finance values")).toBeInTheDocument();
    expect(screen.getByText("₦1,000 available")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start allocation" })).not.toBeInTheDocument();
    expect(calls("/reconciliation/sources")[0]).toContain("open=true");
  });

  it("hands a chosen suggestion to the allocation flow", async () => {
    const onAllocate = jest.fn();
    render(panel({ onAllocate }));
    await selectTab(screen.getByRole("tab", { name: "Unallocated money" }));
    fireEvent.click(await screen.findByRole("button", { name: "Start allocation" }));
    expect(onAllocate).toHaveBeenCalledWith({
      sourceId: SOURCE_M12,
      sourceNumber: "M-000012",
      memberId: MEMBER_ADA,
      obligationId: OBLIGATION_DUES,
    });
  });

  it("reads a past date without suggestions or an allocation action", async () => {
    serve({
      sources: (url) =>
        Promise.resolve({ data: { data: url.includes("asOf=") ? historicalSourcesReport() : sourcesReport() } }),
    });
    const onAllocate = jest.fn();
    render(panel({ onAllocate }));
    await selectTab(screen.getByRole("tab", { name: "Unallocated money" }));
    await screen.findByText("Suggestions from current Finance values");
    fireEvent.change(screen.getByLabelText("As of the end of"), { target: { value: "2026-10-05" } });
    // The summary tab's own "Show" may still be exiting; press this tab's.
    const show = screen.getAllByRole("button", { name: "Show" }).find((button) => !button.hasAttribute("disabled"));
    fireEvent.click(show as HTMLElement);
    expect(await screen.findByText("Showing a past date")).toBeInTheDocument();
    expect(screen.getByText(/aren't shown for a past date/)).toBeInTheDocument();
    expect(screen.queryByText("Suggestions from current Finance values")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Allocate from|Start allocation/ })).not.toBeInTheDocument();
    expect(calls("asOf=2026-10-05")).toHaveLength(1);
  });

  it("refuses a future date before asking the server", async () => {
    render(panel());
    await selectTab(screen.getByRole("tab", { name: "Unallocated money" }));
    await screen.findByText("Suggestions from current Finance values");
    fireEvent.change(screen.getByLabelText("At least this many days old"), { target: { value: "-3" } });
    expect(screen.getByText("Enter a whole number of days from 0 to 36500.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toBeDisabled();
  });
});

describe("positions", () => {
  it("shows unknown F0 values as unknown, never ₦0, and labels them current", async () => {
    render(panel());
    await selectTab(screen.getByRole("tab", { name: "Positions" }));
    expect(await screen.findByText("Current values only")).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "Positions" });
    const unknownCard = within(list).getAllByRole("listitem")[1];
    expect(within(unknownCard).getAllByText("Unknown").length).toBeGreaterThan(1);
    expect(within(within(unknownCard).getByRole("group", { name: "Recorded" })).getByText("Unknown")).toBeInTheDocument();
    expect(within(within(unknownCard).getByRole("group", { name: "Allocated" })).getByText("₦1,000")).toBeInTheDocument();
    expect(within(unknownCard).queryByText("₦0")).not.toBeInTheDocument();
    // The gap-window explanation for allocated-beyond-after-snapshot.
    expect(screen.getByText(/the gap window between the opening date and activation/)).toBeInTheDocument();
    expect(calls("/reconciliation/positions")[0]).not.toContain("asOf");
  });

  it("pages with the server cursor and starts again at page 1 when a filter changes", async () => {
    serve({
      positions: (url) =>
        Promise.resolve({
          data: { data: positionsReport([url.includes("cursor=") ? overLinkedPosition() : knownPosition()], url.includes("cursor=") ? null : "next-1") },
        }),
    });
    render(panel());
    await selectTab(screen.getByRole("tab", { name: "Positions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Page 2")).toBeInTheDocument();
    expect(calls("cursor=next-1")).toHaveLength(1);
    await chooseOption(screen.getByLabelText("Review flag"), "Over-linked");
    await waitFor(() => expect(calls("flag=OVER_LINKED")).toHaveLength(1));
    expect(calls("flag=OVER_LINKED")[0]).not.toContain("cursor=");
    expect(await screen.findByText("Page 1")).toBeInTheDocument();
  });

  it("names members from the obligation's Finance rows for a finance-only officer", async () => {
    render(panel());
    await selectTab(screen.getByRole("tab", { name: "Positions" }));
    await screen.findByRole("list", { name: "Positions" });
    expect(screen.getAllByText(/^Member …/).length).toBeGreaterThan(0);
    await chooseOption(screen.getByLabelText("Obligation"), "Dues (2026)");
    expect(await screen.findAllByText("Ada Obi")).not.toHaveLength(0);
    expect(calls("/members")).toHaveLength(0);
  });

  it("jumps to a position's allocations", async () => {
    render(panel());
    await selectTab(screen.getByRole("tab", { name: "Positions" }));
    const list = await screen.findByRole("list", { name: "Positions" });
    fireEvent.click(within(list).getAllByRole("button", { name: "Show its allocations" })[0]);
    await waitFor(() => expect(calls(`memberId=${MEMBER_ADA}`).filter((url) => url.includes("/allocations"))).toHaveLength(1));
    expect(screen.getByRole("tab", { name: "Allocations" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("allocation history", () => {
  it("shows live and reversed allocations and opens details in Reversals", async () => {
    const onOpenJournal = jest.fn();
    render(panel({ onOpenJournal }));
    await selectTab(screen.getByRole("tab", { name: "Allocations" }));
    const list = await screen.findByRole("list", { name: "Allocations" });
    expect(within(list).getByText("Live")).toBeInTheDocument();
    expect(within(list).getByText("Reversed")).toBeInTheDocument();
    expect(within(list).getByText(/Confirmed despite a different purpose hint/)).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "Details of allocation A-000002" }));
    expect(onOpenJournal).toHaveBeenCalledWith(ALLOCATION_A2);
  });

  it("applies a focus from elsewhere and clears it back to page 1", async () => {
    const view = render(panel());
    view.rerender(panel({ focus: { tab: "allocations", history: { sourceId: SOURCE_M12, sourceNumber: "M-000012" }, nonce: 1 } }));
    expect(await screen.findByText("Source M-000012")).toBeInTheDocument();
    await waitFor(() => expect(calls(`sourceId=${SOURCE_M12}`)).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    await waitFor(() => expect(screen.queryByText("Source M-000012")).not.toBeInTheDocument());
  });

  it("explains an empty history", async () => {
    serve({ allocations: () => Promise.resolve({ data: { data: allocationsPage([]) } }) });
    render(panel());
    await selectTab(screen.getByRole("tab", { name: "Allocations" }));
    expect(await screen.findByText("No allocations yet")).toBeInTheDocument();
  });
});

describe("organisation isolation", () => {
  it("reads only the organisation on screen after a switch", async () => {
    const view = render(panel());
    await screen.findByText("Totals are incomplete");
    api.get.mockClear();
    setPermissions(["finance.view"], "org2");
    view.rerender(panel({ organisationId: "org2" }));
    await waitFor(() => expect(calls("/finance/org2/ledger/reconciliation/summary")).toHaveLength(1));
    expect(calls("/finance/org1/")).toHaveLength(0);
  });
});

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import axiosInstance from "services/api";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import Finance from "pages/Finance";

jest.mock("react-toastify", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const ORG_A_OBLIGATION = {
  id: "ob1",
  type: "dues",
  name: "Org A Dues",
  year: 2026,
  amountPerMonth: 100,
};

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Finance />
      </MemoryRouter>
    </QueryClientProvider>
  );

const setOrg = (id: string) =>
  act(() => {
    useGlobalStore.setState({
      organisation: { ...EMPTY_ORG, id, permissions: ["finance.view", "finance.manage"] },
    });
  });

let getSpy: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  useGlobalStore.setState({ organisation: EMPTY_ORG });
  getSpy = jest.spyOn(axiosInstance, "get").mockImplementation((url: string) => {
    if (url === "/finance/orgA/obligations/ob1/compliance") {
      return Promise.resolve({
        data: {
          data: {
            obligation: ORG_A_OBLIGATION,
            summary: {
              totalMembers: 1,
              accountableMembers: 0,
              totalCollected: 0,
              totalOutstanding: 0,
            },
            rows: [{ memberId: "m1", name: "Ada", accountable: false, months: {} }],
          },
        },
      });
    }
    if (url === "/finance/orgA/obligations") {
      return Promise.resolve({ data: { data: [ORG_A_OBLIGATION] } });
    }
    if (url === "/organisations/orgA/members") {
      return Promise.resolve({ data: { data: [{ id: "m1", name: "Ada" }] } });
    }
    if (url === "/organisations/orgB/members") {
      return Promise.resolve({ data: { data: [{ id: "m2", name: "Bola" }] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

afterEach(() => {
  getSpy.mockRestore();
});

test("renders the four finance tabs", () => {
  setOrg("orgA");
  renderPage();
  expect(screen.getByText("Obligations")).toBeInTheDocument();
  expect(screen.getByText("Compliance")).toBeInTheDocument();
  expect(screen.getByText("Payments")).toBeInTheDocument();
  expect(screen.getByText("Accountability")).toBeInTheDocument();
});

test("resets obligation, prefill and tab state when the organisation changes", async () => {
  setOrg("orgA");
  renderPage();

  // Select an Organisation A obligation → Compliance tab.
  fireEvent.click(await screen.findByText("View compliance"));
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Compliance" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  );

  // Set a member financial start date → prefill + Accountability tab.
  fireEvent.click(await screen.findByText("Set start date"));
  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Accountability" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  );
  expect(screen.getAllByText("Ada").length).toBeGreaterThan(0);
  expect(screen.getByRole("checkbox")).toBeChecked();

  const callsBeforeSwitch = getSpy.mock.calls.length;

  // Switch tenant while the page stays mounted.
  setOrg("orgB");

  await waitFor(() =>
    expect(screen.getByRole("tab", { name: "Obligations" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  );

  // Stale Organisation A ids are cleared: the compliance panel is back to its
  // placeholder and the previous prefill is gone.
  expect(
    screen.getByText(/Select an obligation from the Obligations tab/)
  ).toBeInTheDocument();
  expect(screen.queryByText("Ada")).not.toBeInTheDocument();

  // Organisation B renders on its own data, with nothing pre-selected.
  expect(await screen.findByText("Bola")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("checkbox", { hidden: true })).not.toBeChecked()
  );

  // No request after the switch may carry an Organisation A id.
  const urlsAfterSwitch = getSpy.mock.calls
    .slice(callsBeforeSwitch)
    .map(([url]) => String(url));
  expect(urlsAfterSwitch.every((url) => !url.includes("orgA"))).toBe(true);
  expect(urlsAfterSwitch.every((url) => !url.includes("ob1"))).toBe(true);
});

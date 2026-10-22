import { fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render } from "test-utils/render";
import { queryClient } from "services/api/apiHelper";
import NewCategoryInline from "components/finance/postings/NewCategoryInline";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { markLedgerWriteUncertain } from "helpers/ledgerWriteUncertainty";

jest.mock("services/api", () => ({
  __esModule: true,
  ...jest.requireActual("services/api/request"),
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require("services/api").default as Record<
  "get" | "post" | "put" | "patch" | "delete",
  jest.Mock
>;

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "a1",
  name: "Venue hire",
  class: "expense",
  subtype: null,
  currency: "NGN",
  active: true,
  revision: 0,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

const renderInline = (
  props: Partial<Parameters<typeof NewCategoryInline>[0]> = {},
) => {
  const onCreated = jest.fn();
  render(
    <QueryClientProvider client={queryClient}>
      <NewCategoryInline
        organisationId="org1"
        kind="expense"
        accounts={[]}
        onCreated={onCreated}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onCreated };
};

const open = () => fireEvent.click(screen.getByRole("button", { name: "+ New category" }));
const type = (name: string) =>
  fireEvent.change(screen.getByLabelText("New category name"), { target: { value: name } });

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  api.post.mockResolvedValue({ data: { data: { accounts: [] } } });
  api.patch.mockResolvedValue({ data: { data: {} } });
});

describe("<NewCategoryInline>", () => {
  it("creates a category and hands the created account back", async () => {
    api.post.mockResolvedValueOnce({
      data: {
        data: {
          accounts: [
            { id: "new-1", name: "Generator fuel", class: "expense", subtype: null, active: true, revision: 0 },
          ],
        },
      },
    });
    const { onCreated } = renderInline();

    open();
    type("Generator fuel");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [{ name: "Generator fuel", class: "expense", subtype: null }],
      }),
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "new-1", name: "Generator fuel" }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByLabelText("New category name")).not.toBeInTheDocument(),
    );
  });

  it("refuses an active duplicate and a blank name", () => {
    renderInline({ accounts: [account()] });

    open();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Enter a name.")).toBeInTheDocument();

    type("venue HIRE");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText(/"venue HIRE" is already in use\./)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("offers Restore for a retired category with the same name", async () => {
    const retired = account({ id: "old", name: "Transport", active: false, revision: 6 });
    const { onCreated } = renderInline({ accounts: [retired] });

    open();
    type("transport");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("A retired category has this name.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/old", {
        expectedRevision: 6,
        active: true,
      }),
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(
        expect.objectContaining({ id: "old", name: "Transport", active: true }),
      ),
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it("says when the new category couldn't be confirmed", async () => {
    api.post.mockRejectedValue({ message: "Network Error", code: "ERR_NETWORK", request: {} });
    renderInline();

    open();
    type("Generator fuel");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText(/We couldn't confirm the new category\. Check Categories & Accounts/),
    ).toBeInTheDocument();
  });

  it("is disabled while an earlier ledger change is unconfirmed", () => {
    markLedgerWriteUncertain("org1", "create-accounts");
    renderInline();
    expect(screen.getByRole("button", { name: "+ New category" })).toBeDisabled();
  });
});

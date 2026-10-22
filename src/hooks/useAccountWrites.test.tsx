import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { ledgerWriteUncertaintyKey, markLedgerWriteUncertain } from "helpers/ledgerWriteUncertainty";
import { LedgerAccount } from "components/finance/ledgerTypes";
import { useAccountWrites, WRITE_BLOCKED_NOTE } from "hooks/useAccountWrites";

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

const ORGANISATION_ID = "org1";

const account = (overrides: Partial<LedgerAccount> = {}): LedgerAccount => ({
  id: "a1",
  name: "Transport",
  class: "expense",
  subtype: null,
  currency: "NGN",
  active: true,
  revision: 3,
  bankName: null,
  accountNumberLast4: null,
  openingVerified: null,
  ...overrides,
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const renderWrites = () => renderHook(() => useAccountWrites(ORGANISATION_ID), { wrapper });

beforeEach(() => {
  queryClient.clear();
  window.localStorage.clear();
  jest.clearAllMocks();
  api.post.mockResolvedValue({ data: { data: { accounts: [] } } });
  api.patch.mockResolvedValue({ data: { data: {} } });
});

describe("useAccountWrites", () => {
  it("creates accounts and hands back what the server returned", async () => {
    api.post.mockResolvedValue({
      data: {
        data: {
          accounts: [
            { id: "new-1", name: "Fuel", class: "expense", subtype: null, active: true, revision: 0 },
          ],
        },
      },
    });
    const { result } = renderWrites();
    const done = jest.fn();

    act(() =>
      result.current.create([{ name: "Fuel", class: "expense", subtype: null }], done),
    );

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/finance/org1/ledger/accounts", {
        accounts: [{ name: "Fuel", class: "expense", subtype: null }],
      }),
    );
    await waitFor(() =>
      expect(done).toHaveBeenCalledWith([
        expect.objectContaining({ id: "new-1", name: "Fuel", revision: 0 }),
      ]),
    );
  });

  it("passes null on when the response has no readable account list", async () => {
    api.post.mockResolvedValue({ data: { data: {} } });
    const { result } = renderWrites();
    const done = jest.fn();

    act(() => result.current.create([{ name: "Fuel", class: "expense", subtype: null }], done));

    await waitFor(() => expect(done).toHaveBeenCalledWith(null));
  });

  it("renames with the account's expected revision", async () => {
    const { result } = renderWrites();
    act(() => result.current.rename(account(), "Fuel"));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/a1", {
        expectedRevision: 3,
        name: "Fuel",
      }),
    );
  });

  it("retires and restores with the account's revision", async () => {
    const { result } = renderWrites();
    act(() => result.current.setActive(account(), false));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/a1", {
        expectedRevision: 3,
        active: false,
      }),
    );

    act(() => result.current.setActive(account({ active: false }), true));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/finance/org1/ledger/accounts/a1", {
        expectedRevision: 3,
        active: true,
      }),
    );
  });

  it("never sends a change without a revision", () => {
    const { result } = renderWrites();
    act(() => result.current.rename(account({ revision: null }), "Fuel"));
    act(() => result.current.setActive(account({ revision: null }), false));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("shows the server's message on a definite refusal", async () => {
    api.patch.mockRejectedValue({
      response: {
        status: 409,
        data: { error: "The account changed elsewhere.", code: "LEDGER_REVISION_CONFLICT" },
      },
    });
    const { result } = renderWrites();

    act(() => result.current.rename(account(), "Fuel"));

    await waitFor(() =>
      expect(result.current.error).toBe("The account changed elsewhere."),
    );
    expect(result.current.blocked).toBe(false);
  });

  it("latches an unknown outcome and keeps it out of the refusal message", async () => {
    api.patch.mockRejectedValue({ message: "Network Error", code: "ERR_NETWORK", request: {} });
    const { result } = renderWrites();

    act(() => result.current.setActive(account(), false));

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.error).toBeNull();
    expect(window.localStorage.getItem(ledgerWriteUncertaintyKey(ORGANISATION_ID))).not.toBeNull();
  });

  it("sends nothing while an earlier write is unconfirmed", () => {
    markLedgerWriteUncertain(ORGANISATION_ID, "create-accounts");
    const { result } = renderWrites();
    expect(result.current.blocked).toBe(true);

    act(() => result.current.create([{ name: "Fuel", class: "expense", subtype: null }]));

    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.error).toBe(WRITE_BLOCKED_NOTE);
  });
});

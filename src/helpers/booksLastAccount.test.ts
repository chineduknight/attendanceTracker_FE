import { LedgerAccount } from "components/finance/ledgerTypes";
import { defaultMethodFor, readLastAccount, writeLastAccount } from "helpers/booksLastAccount";

beforeEach(() => window.localStorage.clear());

it("remembers the last account per organisation and action", () => {
  writeLastAccount("o1", "receipt", "bank");
  expect(readLastAccount("o1", "receipt")).toBe("bank");
  expect(readLastAccount("o1", "expense")).toBeNull();
  expect(readLastAccount("o2", "receipt")).toBeNull();
});

it("never throws when storage is unavailable", () => {
  const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const setSpy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(readLastAccount("o1", "receipt")).toBeNull();
  expect(() => writeLastAccount("o1", "receipt", "bank")).not.toThrow();
  spy.mockRestore();
  setSpy.mockRestore();
});

it("picks the method from the account type", () => {
  expect(defaultMethodFor({ subtype: "bank" } as LedgerAccount)).toBe("bank_transfer");
  expect(defaultMethodFor({ subtype: "cash" } as LedgerAccount)).toBe("cash");
  expect(defaultMethodFor(undefined)).toBe("cash");
});

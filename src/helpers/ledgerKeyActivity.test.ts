import { withLedgerKeyActivity } from "helpers/ledgerKeyActivity";
import {
  holdLedgerKeyActivity,
  installPostingLockManager,
  removePostingLockManager,
} from "test-utils/postingLocks";

afterEach(() => {
  removePostingLockManager();
});

describe("withLedgerKeyActivity", () => {
  beforeEach(() => {
    installPostingLockManager();
  });

  it("lets two sends of one key run together (the server replays one)", async () => {
    const other = await holdLedgerKeyActivity("org1", "key-1", "posting");
    expect(await withLedgerKeyActivity("org1", "key-1", "posting", async () => "sent")).toEqual({
      kind: "ran",
      value: "sent",
    });
    await other.release();
  });

  it("never resolves a key this browser is sending", async () => {
    const run = jest.fn(async () => "resolved");
    const sending = await holdLedgerKeyActivity("org1", "key-1", "posting");
    expect(await withLedgerKeyActivity("org1", "key-1", "resolving", run)).toEqual({ kind: "busy" });
    expect(run).not.toHaveBeenCalled();
    await sending.release();
    expect(await withLedgerKeyActivity("org1", "key-1", "resolving", run)).toEqual({
      kind: "ran",
      value: "resolved",
    });
  });

  it("never sends a key this browser is resolving, nor resolves it twice at once", async () => {
    const run = jest.fn(async () => "x");
    const resolving = await holdLedgerKeyActivity("org1", "key-1", "resolving");
    expect(await withLedgerKeyActivity("org1", "key-1", "posting", run)).toEqual({ kind: "busy" });
    expect(await withLedgerKeyActivity("org1", "key-1", "resolving", run)).toEqual({ kind: "busy" });
    expect(run).not.toHaveBeenCalled();
    await resolving.release();
  });

  it("keeps keys and organisations apart", async () => {
    const resolving = await holdLedgerKeyActivity("org1", "key-1", "resolving");
    expect((await withLedgerKeyActivity("org1", "key-2", "posting", async () => 1)).kind).toBe("ran");
    expect((await withLedgerKeyActivity("org2", "key-1", "posting", async () => 1)).kind).toBe("ran");
    await resolving.release();
  });

  it("passes the work's own failure through", async () => {
    await expect(
      withLedgerKeyActivity("org1", "key-1", "posting", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});

it("runs uncoordinated without the Web Locks API, as before F2B-3", async () => {
  removePostingLockManager();
  expect(await withLedgerKeyActivity("org1", "key-1", "resolving", async () => 7)).toEqual({
    kind: "ran",
    value: 7,
  });
});

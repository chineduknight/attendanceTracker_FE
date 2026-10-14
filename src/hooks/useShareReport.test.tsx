import { act, renderHook, waitFor } from "@testing-library/react";
import { useShareReport } from "hooks/useShareReport";

type Snapshot = { id: string };

const A: Snapshot = { id: "A" };
const B: Snapshot = { id: "B" };

/** A prepare() whose calls the test settles one by one. */
const deferredPrepare = () => {
  const calls: {
    snapshot: Snapshot;
    resolve: (message: string) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const prepare = jest.fn(
    (snapshot: Snapshot) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ snapshot, resolve, reject });
      })
  );
  return { prepare, calls };
};

const setup = (prepare: (snapshot: Snapshot) => Promise<string>) =>
  renderHook(
    ({ snapshot }: { snapshot: Snapshot | null }) =>
      useShareReport(snapshot, prepare),
    { initialProps: { snapshot: A as Snapshot | null } }
  );

// Session switch (A → B → A) and organisation switch (A → nothing → A: the
// page passes no snapshot while another organisation's session loads).
describe.each([
  ["another session", B],
  ["another organisation", null],
])("useShareReport — A → %s → A", (_case, away) => {
  const switchAwayAndBack = (
    rerender: (props: { snapshot: Snapshot | null }) => void
  ) => {
    rerender({ snapshot: away });
    rerender({ snapshot: A });
  };

  it("never reopens the old prepared report", async () => {
    const { prepare, calls } = deferredPrepare();
    const { result, rerender } = setup(prepare);

    act(() => result.current.start());
    await act(async () => calls[0].resolve("old report"));
    expect(result.current.state).toMatchObject({
      phase: "ready",
      message: "old report",
    });

    switchAwayAndBack(rerender);
    expect(result.current.state).toEqual({ phase: "idle" });

    // Share prepares afresh.
    act(() => result.current.start());
    expect(prepare).toHaveBeenCalledTimes(2);
    await act(async () => calls[1].resolve("new report"));
    expect(result.current.state).toMatchObject({
      phase: "ready",
      message: "new report",
    });
  });

  it("clears a pending preparation, and its late answer never lands", async () => {
    const { prepare, calls } = deferredPrepare();
    const { result, rerender } = setup(prepare);

    act(() => result.current.start());
    expect(result.current.state.phase).toBe("preparing");

    switchAwayAndBack(rerender);
    expect(result.current.state).toEqual({ phase: "idle" });

    // A new Share can start straight away…
    act(() => result.current.start());
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(result.current.state.phase).toBe("preparing");

    // …the old answer arriving first changes nothing…
    await act(async () => calls[0].resolve("old report"));
    expect(result.current.state.phase).toBe("preparing");

    // …and neither does it arriving after the new one.
    await act(async () => calls[1].resolve("new report"));
    expect(result.current.state).toMatchObject({ message: "new report" });
  });

  it("does not bring back an old error", async () => {
    const { prepare, calls } = deferredPrepare();
    const { result, rerender } = setup(prepare);

    act(() => result.current.start());
    await act(async () => calls[0].reject(new Error("offline")));
    expect(result.current.state.phase).toBe("failed");

    switchAwayAndBack(rerender);
    expect(result.current.state).toEqual({ phase: "idle" });
  });

  it("ignores Share now on a report from before the switch", async () => {
    const open = jest.spyOn(window, "open").mockImplementation(() => null);
    const { prepare, calls } = deferredPrepare();
    const { result, rerender } = setup(prepare);

    act(() => result.current.start());
    await act(async () => calls[0].resolve("old report"));
    const staleShareNow = result.current.shareNow;

    switchAwayAndBack(rerender);
    act(() => staleShareNow());
    act(() => result.current.shareNow());
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe("useShareReport — same snapshot", () => {
  it("keeps a prepared report across ordinary re-renders", async () => {
    const { prepare, calls } = deferredPrepare();
    const { result, rerender } = setup(prepare);

    act(() => result.current.start());
    await act(async () => calls[0].resolve("report"));
    rerender({ snapshot: A });
    await waitFor(() =>
      expect(result.current.state).toMatchObject({ message: "report" })
    );
  });
});

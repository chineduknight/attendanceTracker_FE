import { ledgerPostingIntentLockName } from "helpers/ledgerPostingIntent";
import { ledgerKeyActivityLockName } from "helpers/ledgerKeyActivity";

type LockMode = "exclusive" | "shared";

interface Waiter {
  mode: LockMode;
  grant: () => void;
}

interface LockState {
  mode: LockMode | null;
  holders: number;
  queue: Waiter[];
}

/**
 * A deterministic stand-in for the Web Locks API in Jest/jsdom.
 *
 * Exclusive requests for the same lock name are serialised in call order,
 * which is exactly the property every posting-intent mutation relies on: two
 * tabs cannot interleave a read and a write of the same organisation's
 * record. Shared requests run together, and `ifAvailable` answers `null`
 * instead of waiting, as the real API does.
 */
export const installPostingLockManager = (): (() => void) => {
  const states = new Map<string, LockState>();
  const stateOf = (name: string) => {
    let state = states.get(name);
    if (!state) {
      state = { mode: null, holders: 0, queue: [] };
      states.set(name, state);
    }
    return state;
  };
  const compatible = (state: LockState, mode: LockMode) =>
    state.holders === 0 || (state.mode === "shared" && mode === "shared");

  const release = (state: LockState) => {
    state.holders -= 1;
    if (state.holders > 0) return;
    state.mode = null;
    while (state.queue.length && compatible(state, state.queue[0].mode)) {
      const next = state.queue.shift() as Waiter;
      state.holders += 1;
      state.mode = next.mode;
      next.grant();
      if (next.mode === "exclusive") break;
    }
  };

  const request = (
    name: string,
    optionsOrCallback: unknown,
    maybeCallback?: unknown,
  ) => {
    const options =
      typeof optionsOrCallback === "function"
        ? {}
        : ((optionsOrCallback ?? {}) as { mode?: LockMode; ifAvailable?: boolean });
    const callback = (
      typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback
    ) as (lock: unknown) => unknown;
    const mode: LockMode = options.mode ?? "exclusive";
    const state = stateOf(name);
    const grantable = compatible(state, mode) && state.queue.length === 0;

    if (!grantable && options.ifAvailable) {
      return Promise.resolve().then(() => callback(null));
    }
    return new Promise<unknown>((resolve, reject) => {
      const grant = () => {
        Promise.resolve()
          .then(() => callback({ name, mode }))
          .then(resolve, reject)
          .finally(() => release(state));
      };
      if (grantable) {
        state.holders += 1;
        state.mode = mode;
        grant();
      } else {
        state.queue.push({ mode, grant });
      }
    });
  };
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request },
  });
  return removePostingLockManager;
};

export const removePostingLockManager = () => {
  try {
    delete (navigator as unknown as { locks?: unknown }).locks;
  } catch {
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: undefined,
    });
  }
};

/** Take a lock as "another tab" would and keep it until `release()`. */
const holdLock = async (name: string, mode: LockMode) => {
  const locks = (
    navigator as unknown as {
      locks: {
        request: (name: string, options: unknown, run: () => unknown) => Promise<unknown>;
      };
    }
  ).locks;
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let acquired!: () => void;
  const isHeld = new Promise<void>((resolve) => {
    acquired = resolve;
  });
  const held = locks.request(name, { mode }, () => {
    acquired();
    return released;
  });
  await isHeld;
  return {
    release: async () => {
      release();
      await held;
    },
  };
};

/**
 * Take the organisation's intent lock as "another tab" would and keep it
 * until `release()`. Whatever runs in between plays that tab's critical
 * section; every other intent mutation must wait for it.
 */
export const holdPostingIntentLock = (organisationId: string) =>
  holdLock(ledgerPostingIntentLockName(organisationId), "exclusive");

/**
 * Play another tab sending (`posting`) or resolving (`resolving`) one key
 * until `release()`.
 */
export const holdLedgerKeyActivity = (
  organisationId: string,
  key: string,
  activity: "posting" | "resolving",
) =>
  holdLock(
    ledgerKeyActivityLockName(organisationId, key),
    activity === "posting" ? "shared" : "exclusive",
  );

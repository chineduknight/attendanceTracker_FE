import { ledgerPostingIntentLockName } from "helpers/ledgerPostingIntent";

/**
 * A deterministic stand-in for the Web Locks API in Jest/jsdom.
 *
 * Requests for the same lock name are serialised in call order, which is
 * exactly the property every posting-intent mutation relies on: two tabs
 * cannot interleave a read and a write of the same organisation's record.
 */
export const installPostingLockManager = (): (() => void) => {
  const tails = new Map<string, Promise<unknown>>();
  const request = (
    name: string,
    optionsOrCallback: unknown,
    maybeCallback?: unknown,
  ) => {
    const callback =
      typeof optionsOrCallback === "function"
        ? (optionsOrCallback as () => unknown)
        : (maybeCallback as () => unknown);
    const run = (tails.get(name) ?? Promise.resolve()).then(() => callback());
    tails.set(
      name,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
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

/**
 * Take the organisation's intent lock as "another tab" would and keep it
 * until `release()`. Whatever runs in between plays that tab's critical
 * section; every other intent mutation must wait for it.
 */
export const holdPostingIntentLock = async (organisationId: string) => {
  const locks = (
    navigator as unknown as {
      locks: { request: (name: string, run: () => unknown) => Promise<unknown> };
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
  const held = locks.request(ledgerPostingIntentLockName(organisationId), () => {
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

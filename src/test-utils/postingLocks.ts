/**
 * A deterministic stand-in for the Web Locks API in Jest/jsdom.
 *
 * Requests are serialised in call order, which is exactly the property the
 * posting claim relies on: two competing claims cannot both read an empty
 * slot before either writes.
 */
export const installPostingLockManager = (): (() => void) => {
  let tail: Promise<unknown> = Promise.resolve();
  const request = (
    _name: string,
    optionsOrCallback: unknown,
    maybeCallback?: unknown,
  ) => {
    const callback =
      typeof optionsOrCallback === "function"
        ? (optionsOrCallback as () => unknown)
        : (maybeCallback as () => unknown);
    const run = tail.then(() => callback());
    tail = run.then(
      () => undefined,
      () => undefined,
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

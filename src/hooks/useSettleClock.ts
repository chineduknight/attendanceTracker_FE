import { useEffect, useState } from "react";

// setTimeout's ceiling; a later instant simply re-arms after it fires.
const MAX_DELAY_MS = 2 ** 31 - 1;

/**
 * The current time, re-read when the next of `instants` passes, so a control
 * that waits for a server-given moment (e.g. an attempt's `settlesAt`)
 * enables itself without polling.
 */
export const useSettleClock = (instants: readonly number[]): number => {
  const [now, setNow] = useState(() => Date.now());
  const next = instants.filter((instant) => instant > now).sort((a, b) => a - b)[0];
  useEffect(() => {
    if (next === undefined) return undefined;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(next - Date.now(), 0) + 50, MAX_DELAY_MS),
    );
    return () => clearTimeout(timer);
  }, [next]);
  return now;
};

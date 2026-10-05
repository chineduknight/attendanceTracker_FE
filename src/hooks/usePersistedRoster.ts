import { useCallback, useRef, useState } from "react";

/**
 * Roster state that is mirrored into a localStorage draft on every change.
 *
 * All edits — loading, single taps, bulk actions and Undo — go through
 * `commit`, which computes the next roster, renders it and writes that exact
 * array to `storageKey`, so the displayed roster and the persisted draft can
 * never diverge. `commit` runs `update` synchronously and returns its result.
 */
export function usePersistedRoster<T>(storageKey: string) {
  const [members, setMembers] = useState<T[]>([]);
  const latest = useRef<T[]>(members);

  const commit = useCallback(
    (update: (current: T[]) => T[]): T[] => {
      const next = update(latest.current);
      latest.current = next;
      setMembers(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    },
    [storageKey],
  );

  return [members, commit] as const;
}

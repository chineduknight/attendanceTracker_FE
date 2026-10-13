import { useCallback, useRef, useState } from "react";

/**
 * Roster state that is mirrored into a localStorage draft on every change.
 *
 * All edits — loading, single taps, bulk actions and Undo — go through
 * `commit`, which computes the next roster, renders it and writes that exact
 * array to `storageKey`, so the displayed roster and the persisted draft can
 * never diverge. `commit` runs `update` synchronously and returns its result.
 *
 * Pass `{ persist: false }` for an existing attendance's roster: an edit is
 * abandoned unless it is submitted, so it stays in memory and never reads or
 * writes a localStorage draft.
 */
export function usePersistedRoster<T>(
  storageKey: string,
  { persist = true }: { persist?: boolean } = {},
) {
  const [members, setMembers] = useState<T[]>([]);
  const latest = useRef<T[]>(members);

  const commit = useCallback(
    (update: (current: T[]) => T[]): T[] => {
      const next = update(latest.current);
      latest.current = next;
      setMembers(next);
      if (persist) localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    },
    [storageKey, persist],
  );

  return [members, commit] as const;
}

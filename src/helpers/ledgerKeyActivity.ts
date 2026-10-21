/**
 * Per-key activity coordination between sending a posting and resolving its
 * key (RFC v0.3 §7.4).
 *
 * Sending a posting holds the key's lock in shared mode for the request, so
 * two tabs may still retry the same key at once (the server replays one).
 * Resolving holds it exclusively. Neither waits: whichever finds the other
 * active does nothing and says so. The server decides every real race (a
 * void and a commit can never both win), so correctness never depends on
 * this. It only stops this browser from voiding a key it is still sending,
 * from any tab or section, and from sending a key it is resolving.
 *
 * Without the Web Locks API the work runs uncoordinated, as it did before
 * F2B-3; posting claims already require the API, so nothing new is sent then.
 * Where the API exists but fails to grant (or answer), nothing runs: the
 * caller reports that it couldn't coordinate, as the intent lock does.
 */

import { getLockManager } from "helpers/ledgerPostingIntent";

export const LEDGER_KEY_ACTIVITY_LOCK_PREFIX = "presence-pro:ledger-key-activity:";

export const ledgerKeyActivityLockName = (organisationId: string, key: string) =>
  `${LEDGER_KEY_ACTIVITY_LOCK_PREFIX}${organisationId}:${key}`;

export type LedgerKeyActivity = "posting" | "resolving";

export type LedgerKeyActivityOutcome<T> =
  | { kind: "ran"; value: T }
  /** The key is busy with the other activity in this browser; nothing ran. */
  | { kind: "busy" }
  /** The lock manager failed before granting anything; nothing ran. */
  | { kind: "uncoordinated" };

export const withLedgerKeyActivity = async <T>(
  organisationId: string,
  key: string,
  activity: LedgerKeyActivity,
  run: () => Promise<T>,
): Promise<LedgerKeyActivityOutcome<T>> => {
  const locks = getLockManager();
  if (!locks) return { kind: "ran", value: await run() };

  let started = false;
  let value: T | undefined;
  try {
    await locks.request(
      ledgerKeyActivityLockName(organisationId, key),
      { mode: activity === "posting" ? "shared" : "exclusive", ifAvailable: true },
      async (lock: unknown) => {
        if (!lock) return;
        started = true;
        value = await run();
      },
    );
  } catch (error) {
    // The work's own failure belongs to the caller. A lock manager that
    // failed before granting anything must not be bypassed: running anyway
    // would drop the same-browser guarantee silently.
    if (started) throw error;
    return { kind: "uncoordinated" };
  }
  return started ? { kind: "ran", value: value as T } : { kind: "busy" };
};

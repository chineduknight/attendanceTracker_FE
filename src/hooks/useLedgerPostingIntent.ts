import { useCallback, useEffect, useState } from "react";
import {
  LedgerPostingIntentRead,
  LedgerPostingIntentRecord,
  NewLedgerPostingIntent,
  beginLedgerPostingIntent,
  clearLedgerPostingIntent,
  ledgerPostingIntentKey,
  markLedgerPostingIntentUnresolved,
  readLedgerPostingIntents,
} from "helpers/ledgerPostingIntent";

/**
 * The organisation's durable posting intents, mirrored to localStorage.
 *
 * Re-read on mount and on organisation change, so a reload or an organisation
 * switch cannot silently re-enable posting while an earlier financial intent
 * is unconfirmed. Clearing is only done by a proved outcome (201, a replay,
 * a void, or a first clean 4xx refusal).
 */
export const useLedgerPostingIntent = (organisationId: string) => {
  const [read, setRead] = useState<LedgerPostingIntentRead>(() =>
    readLedgerPostingIntents(organisationId),
  );

  const refresh = useCallback(() => {
    const next = readLedgerPostingIntents(organisationId);
    setRead(next);
    return next;
  }, [organisationId]);

  useEffect(() => {
    setRead(readLedgerPostingIntents(organisationId));
  }, [organisationId]);

  // Another tab claiming, clearing or resolving a posting must immediately
  // block/refresh this one too. The storage event fires in other tabs only;
  // this tab updates its state directly in begin/clear/mark.
  useEffect(() => {
    const storageKey = ledgerPostingIntentKey(organisationId);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return;
      setRead(readLedgerPostingIntents(organisationId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [organisationId]);

  const begin = useCallback(
    async (input: NewLedgerPostingIntent) => {
      const result = await beginLedgerPostingIntent(input);
      setRead(readLedgerPostingIntents(organisationId));
      return result;
    },
    [organisationId],
  );

  const markUnresolved = useCallback(
    (
      record: LedgerPostingIntentRecord,
      options: {
        ambiguous: boolean;
        message: string | null;
        retryMode?: "retry" | "owner";
      },
    ) => {
      const saved = markLedgerPostingIntentUnresolved(record, options);
      setRead(readLedgerPostingIntents(organisationId));
      return saved;
    },
    [organisationId],
  );

  const clear = useCallback(
    (record: LedgerPostingIntentRecord) => {
      const cleared = clearLedgerPostingIntent(organisationId, record.key);
      setRead(readLedgerPostingIntents(organisationId));
      return cleared;
    },
    [organisationId],
  );

  return { read, begin, markUnresolved, clear, refresh };
};

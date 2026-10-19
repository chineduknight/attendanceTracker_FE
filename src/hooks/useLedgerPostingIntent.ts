import { useCallback, useEffect, useState } from "react";
import {
  LedgerPostingIntentRead,
  LedgerPostingIntentRecord,
  NewLedgerPostingIntent,
  beginLedgerPostingIntent,
  clearLedgerPostingIntent,
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

  const begin = useCallback(
    (input: NewLedgerPostingIntent) => {
      const record = beginLedgerPostingIntent(input);
      setRead(readLedgerPostingIntents(organisationId));
      return record;
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

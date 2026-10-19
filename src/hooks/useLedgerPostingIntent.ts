import { useCallback, useEffect, useRef, useState } from "react";
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
export const useLedgerPostingIntent = (
  organisationId: string,
  {
    onExternalChange,
  }: {
    /**
     * Another tab claimed, resolved or cleared this organisation's posting
     * record. Says nothing about why: success, a refusal and a void all look
     * the same from here.
     */
    onExternalChange?: () => void;
  } = {},
) => {
  const [read, setRead] = useState<LedgerPostingIntentRead>(() =>
    readLedgerPostingIntents(organisationId),
  );
  const currentOrganisationId = useRef(organisationId);
  const onExternalChangeRef = useRef(onExternalChange);
  useEffect(() => {
    onExternalChangeRef.current = onExternalChange;
  });

  const refresh = useCallback(() => {
    const next = readLedgerPostingIntents(organisationId);
    setRead(next);
    return next;
  }, [organisationId]);

  useEffect(() => {
    currentOrganisationId.current = organisationId;
    setRead(readLedgerPostingIntents(organisationId));
  }, [organisationId]);

  // Every mutation waits for the cross-tab lock, so it can resolve after the
  // officer has switched organisation. Organisation A's result must never
  // repaint Organisation B's notice.
  const refreshAfterMutation = useCallback((mutatedOrganisationId: string) => {
    if (mutatedOrganisationId !== currentOrganisationId.current) return;
    setRead(readLedgerPostingIntents(mutatedOrganisationId));
  }, []);

  // Another tab claiming, clearing or resolving a posting must immediately
  // block/refresh this one too. The storage event fires in other tabs only;
  // this tab updates its state directly in begin/clear/mark.
  useEffect(() => {
    const storageKey = ledgerPostingIntentKey(organisationId);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== storageKey) return;
      setRead(readLedgerPostingIntents(organisationId));
      onExternalChangeRef.current?.();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [organisationId]);

  const begin = useCallback(
    async (input: NewLedgerPostingIntent) => {
      const result = await beginLedgerPostingIntent(input);
      refreshAfterMutation(input.organisationId);
      return result;
    },
    [refreshAfterMutation],
  );

  const markUnresolved = useCallback(
    async (
      record: LedgerPostingIntentRecord,
      options: {
        ambiguous: boolean;
        message: string | null;
        retryMode?: "retry" | "owner";
      },
    ) => {
      const saved = await markLedgerPostingIntentUnresolved(record, options);
      refreshAfterMutation(record.organisationId);
      return saved;
    },
    [refreshAfterMutation],
  );

  const clear = useCallback(
    async (record: LedgerPostingIntentRecord) => {
      const cleared = await clearLedgerPostingIntent(
        record.organisationId,
        record.key,
      );
      refreshAfterMutation(record.organisationId);
      return cleared;
    },
    [refreshAfterMutation],
  );

  return { read, begin, markUnresolved, clear, refresh };
};

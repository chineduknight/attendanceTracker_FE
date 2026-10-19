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
 * Same-tab announcements of this tab's own intent writes. The browser's
 * `storage` event reaches other tabs only, but "Record money" and "Member
 * money" are separate sections sharing one pending slot on the same page.
 */
const sameTabIntentWrites = new EventTarget();
const SAME_TAB_INTENT_WRITE = "ledger-posting-intent-write";

interface SameTabIntentWrite {
  organisationId: string;
  writer: object;
}

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
     * Another tab, or another posting section on this page, claimed,
     * resolved or cleared this organisation's posting record. Says nothing
     * about why: success, a refusal and a void all look the same from here.
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
  // This instance's identity, so it can ignore its own announcements.
  const writer = useRef({}).current;

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
  const refreshAfterMutation = useCallback(
    (mutatedOrganisationId: string) => {
      sameTabIntentWrites.dispatchEvent(
        new CustomEvent<SameTabIntentWrite>(SAME_TAB_INTENT_WRITE, {
          detail: { organisationId: mutatedOrganisationId, writer },
        }),
      );
      if (mutatedOrganisationId !== currentOrganisationId.current) return;
      setRead(readLedgerPostingIntents(mutatedOrganisationId));
    },
    [writer],
  );

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
    // Another section on this page wrote the record: the same as another tab.
    const onSameTabWrite = (event: Event) => {
      const detail = (event as CustomEvent<SameTabIntentWrite>).detail;
      if (detail.writer === writer || detail.organisationId !== organisationId) return;
      setRead(readLedgerPostingIntents(organisationId));
      onExternalChangeRef.current?.();
    };
    window.addEventListener("storage", onStorage);
    sameTabIntentWrites.addEventListener(SAME_TAB_INTENT_WRITE, onSameTabWrite);
    return () => {
      window.removeEventListener("storage", onStorage);
      sameTabIntentWrites.removeEventListener(SAME_TAB_INTENT_WRITE, onSameTabWrite);
    };
  }, [organisationId, writer]);

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

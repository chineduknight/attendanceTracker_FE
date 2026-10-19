import { useCallback, useEffect, useState } from "react";
import {
  LedgerIntentRead,
  LedgerWriteAction,
  LedgerWriteIntent,
  LedgerWriteIntentRefs,
  beginLedgerWriteIntent,
  clearLedgerWriteIntent,
  clearLedgerWriteIntentMarker,
  markLedgerWriteIntentUnresolved,
  readLedgerWriteIntent,
} from "helpers/ledgerWriteIntent";

/**
 * The organisation's persisted opening-balance write intent.
 *
 * Re-read on mount and on organisation change, so an ordinary reload cannot
 * re-enable a write whose request may already have been sent. The intent is
 * written before dispatch (through `begin`), which returns null when the store
 * is unavailable — the caller must then not send anything.
 */
export const useLedgerWriteIntent = (organisationId: string) => {
  const [read, setRead] = useState<LedgerIntentRead>(() =>
    readLedgerWriteIntent(organisationId),
  );

  const refresh = useCallback(() => {
    const next = readLedgerWriteIntent(organisationId);
    setRead(next);
    return next;
  }, [organisationId]);

  useEffect(() => {
    setRead(readLedgerWriteIntent(organisationId));
  }, [organisationId]);

  const begin = useCallback(
    (action: LedgerWriteAction, refs: LedgerWriteIntentRefs = {}) => {
      const intent = beginLedgerWriteIntent(organisationId, action, refs);
      setRead(readLedgerWriteIntent(organisationId));
      return intent;
    },
    [organisationId],
  );

  const markUnresolved = useCallback(
    (intent: LedgerWriteIntent) => {
      markLedgerWriteIntentUnresolved(intent);
      setRead(readLedgerWriteIntent(organisationId));
    },
    [organisationId],
  );

  const clear = useCallback(
    (intent: LedgerWriteIntent) => {
      clearLedgerWriteIntent(organisationId, intent.intentId);
      setRead(readLedgerWriteIntent(organisationId));
    },
    [organisationId],
  );

  /** Explicit reconciliation: clears whatever intent is stored for this org. */
  const acknowledge = useCallback(() => {
    const current = readLedgerWriteIntent(organisationId);
    if (current.kind === "pending")
      clearLedgerWriteIntent(organisationId, current.intent.intentId);
    else if (current.kind === "unknown")
      // A corrupt marker has no id to match; the explicit acknowledgement is
      // the only thing allowed to remove it.
      clearLedgerWriteIntentMarker(organisationId);
    setRead(readLedgerWriteIntent(organisationId));
  }, [organisationId]);

  return {
    read,
    /** True when no opening-balance write may be dispatched. */
    blocked: read.kind !== "none",
    begin,
    markUnresolved,
    clear,
    acknowledge,
    refresh,
  };
};

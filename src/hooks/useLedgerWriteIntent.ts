import { useCallback, useEffect, useState } from "react";
import { postRequest, putRequest, queryClient } from "services/api/apiHelper";
import { queryKeys } from "services/api/queryKeys";
import { ledgerApiFailure, ledgerWriteOutcomeUnknown } from "helpers/ledgerSetup";
import {
  LedgerIntentRead,
  LedgerWriteAction,
  LedgerWriteIntentRefs,
  clearLedgerWriteIntent,
  clearLedgerWriteIntentMarker,
  readLedgerWriteIntent,
  settleLedgerWriteIntent,
  startLedgerWriteIntent,
  subscribeLedgerWriteIntent,
} from "helpers/ledgerWriteIntent";
import type { LedgerWriteOutcome } from "helpers/ledgerWriteUncertainty";
import { LedgerWriteNotSentError } from "hooks/useLedgerSetup";

export const INTENT_BLOCKED_MESSAGE =
  "An earlier ledger change is unresolved. Recheck the ledger before continuing.";

export const INTENT_STORAGE_MESSAGE =
  "This browser can't store the safety record required before a ledger change. Allow site storage and try again.";

export interface DurableIntentWrite {
  /** Captured when the officer confirmed; the screen may show another org later. */
  organisationId: string;
  action: LedgerWriteAction;
  refs?: LedgerWriteIntentRefs;
  method: "post" | "put";
  url: string;
  data: unknown;
  /**
   * Whether a 2xx proves the requested change. A response that doesn't keeps
   * the intent unresolved, so a reload cannot permit a blind retry.
   */
  confirms?: (response: unknown) => boolean;
}

/**
 * The opening-balance and lifecycle write lifecycle, matching
 * `sendDurableLedgerWrite`. Everything that must outlive the screen happens
 * inside this promise, not in `mutate` callbacks: TanStack Query v4 drops
 * those when the component unmounts (an organisation switch remounts
 * FinanceWorkspace).
 *
 * 1. Persist this organisation's intent; refuse to send without it.
 * 2. Send the request once. Nothing is retried, and no idempotency key is
 *    minted: an unresolved intent blocks every further write until an
 *    officer reconciles.
 * 3. Settle the intent: cleared on a confirmed 2xx or a refusal that wrote
 *    nothing, latched as unresolved on anything ambiguous.
 * 4. Reload the sending organisation's ledger caches, and no other.
 */
export const sendDurableIntentWrite = async ({
  organisationId,
  action,
  refs,
  method,
  url,
  data,
  confirms = () => true,
}: DurableIntentWrite) => {
  const intent = startLedgerWriteIntent(organisationId, action, refs);
  if (!intent) {
    const current = readLedgerWriteIntent(organisationId).kind;
    throw new LedgerWriteNotSentError(
      current === "pending" || current === "unknown" ? "blocked" : "storage",
    );
  }
  let outcome: LedgerWriteOutcome = "unknown";
  try {
    const response = await (method === "post" ? postRequest : putRequest)({ url, data });
    outcome = confirms(response) ? "confirmed" : "unknown";
    return response;
  } catch (error) {
    outcome = ledgerWriteOutcomeUnknown(ledgerApiFailure(error)) ? "unknown" : "refused";
    throw error;
  } finally {
    settleLedgerWriteIntent(intent, outcome);
    void queryClient.invalidateQueries({
      queryKey: queryKeys.finance.ledger.root(organisationId),
    });
  }
};

/** What a screen should show for a failed durable intent write. */
export type IntentWriteFailure =
  /** Nothing reached the server. */
  | { kind: "not-sent"; message: string }
  /** The request may have committed; the intent notice says so. */
  | { kind: "unknown" }
  /** The server refused and wrote nothing. */
  | { kind: "refused"; message: string | null };

export const classifyIntentWriteFailure = (failure: unknown): IntentWriteFailure => {
  if (failure instanceof LedgerWriteNotSentError) {
    return {
      kind: "not-sent",
      message: failure.reason === "blocked" ? INTENT_BLOCKED_MESSAGE : INTENT_STORAGE_MESSAGE,
    };
  }
  const parsed = ledgerApiFailure(failure);
  return ledgerWriteOutcomeUnknown(parsed)
    ? { kind: "unknown" }
    : { kind: "refused", message: parsed.message ?? null };
};

/**
 * The organisation's persisted ledger write intent (opening balances and
 * lifecycle share one slot).
 *
 * Re-read on mount, on organisation change and whenever any write in this
 * page changes the slot, so an ordinary reload cannot re-enable a write whose
 * request may already have been sent, and a write that settles after its
 * screen closed still updates every reader.
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
    return subscribeLedgerWriteIntent((changed) => {
      if (changed === organisationId) setRead(readLedgerWriteIntent(organisationId));
    });
  }, [organisationId]);

  /**
   * Explicit reconciliation: clears whatever intent is stored for this org,
   * except one whose request is still running here (its outcome isn't known
   * yet, and clearing it would let a second write race the first).
   */
  const acknowledge = useCallback(() => {
    const current = readLedgerWriteIntent(organisationId);
    if (current.kind === "pending" && !current.inFlight)
      clearLedgerWriteIntent(organisationId, current.intent.intentId);
    else if (current.kind === "unknown")
      // A corrupt marker has no id to match; the explicit acknowledgement is
      // the only thing allowed to remove it.
      clearLedgerWriteIntentMarker(organisationId);
    setRead(readLedgerWriteIntent(organisationId));
  }, [organisationId]);

  return {
    read,
    /** True when no opening-balance or lifecycle write may be dispatched. */
    blocked: read.kind !== "none",
    acknowledge,
    refresh,
  };
};

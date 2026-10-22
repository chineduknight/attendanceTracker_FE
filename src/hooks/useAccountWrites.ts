import { useState } from "react";
import { LedgerAccount } from "components/finance/ledgerTypes";
import {
  CreateAccountPayload,
  ledgerApiFailure,
  ledgerWriteOutcomeUnknown,
} from "helpers/ledgerSetup";
import { LedgerWriteNotSentError, useLedgerSetup } from "hooks/useLedgerSetup";
import { useLedgerWriteUncertainty } from "hooks/useLedgerWriteUncertainty";

/** The wording the durable write reports when it never sent the request. */
export const WRITE_BLOCKED_NOTE =
  "An earlier ledger change is still waiting to be confirmed, so nothing was sent.";

const STORAGE_NOTE =
  "This browser couldn't keep a safety record of the change, so nothing was sent. Check that site storage is allowed and try again.";

export interface AccountWrites {
  /** Creates one or more accounts/categories; `onDone` gets what the server returned. */
  create: (
    payloads: readonly CreateAccountPayload[],
    onDone?: (created: LedgerAccount[] | null) => void,
  ) => void;
  rename: (account: LedgerAccount, name: string, onDone?: () => void) => void;
  /** Retire (`false`) and restore (`true`) both go through here. */
  setActive: (account: LedgerAccount, active: boolean, onDone?: () => void) => void;
  error: string | null;
  clearError: () => void;
  isSaving: boolean;
  /** True while an earlier ledger write in this organisation is unresolved. */
  blocked: boolean;
}

/**
 * The one write surface for Categories & Accounts, the inline "+ New
 * category" row and the setup fallbacks. Every call goes through
 * `useLedgerSetup`, so the durable marker is stored before sending and an
 * unknown outcome latches per organisation (AGENTS.md §29, §36).
 *
 * It deliberately holds no tenant state: the organisation id is captured when
 * the hook is created, and every request and cache key carries it.
 */
export const useAccountWrites = (organisationId: string): AccountWrites => {
  const { createAccounts, updateAccount, isCreatingAccounts, isUpdatingAccount } =
    useLedgerSetup(organisationId);
  const { uncertainty } = useLedgerWriteUncertainty(organisationId);
  const [error, setError] = useState<string | null>(null);

  const blocked = uncertainty !== null;

  const handleFailure = (cause: unknown) => {
    if (cause instanceof LedgerWriteNotSentError) {
      setError(cause.reason === "blocked" ? WRITE_BLOCKED_NOTE : STORAGE_NOTE);
      return;
    }
    const failure = ledgerApiFailure(cause);
    // Timeouts, network errors, uncoded 5xx and an uncoded 503 may all have
    // been saved. The durable write has already latched uncertainty; never
    // present it as a refusal and never retry it.
    if (ledgerWriteOutcomeUnknown(failure)) {
      setError(null);
      return;
    }
    setError(failure.message ?? "The change wasn't saved. Try again.");
  };

  const create: AccountWrites["create"] = (payloads, onDone) => {
    if (blocked) {
      setError(WRITE_BLOCKED_NOTE);
      return;
    }
    if (payloads.length === 0) return;
    createAccounts([...payloads], {
      onSuccess: (created) => {
        setError(null);
        onDone?.(created);
      },
      onError: handleFailure,
    });
  };

  const change = (
    account: LedgerAccount,
    fields: { name?: string; active?: boolean },
    onDone?: () => void,
  ) => {
    if (blocked) {
      setError(WRITE_BLOCKED_NOTE);
      return;
    }
    // PATCH needs `expectedRevision`; without it no write is offered at all.
    if (account.revision === null) return;
    updateAccount(
      account.id,
      { expectedRevision: account.revision, ...fields },
      {
        onSuccess: () => {
          setError(null);
          onDone?.();
        },
        onError: handleFailure,
      },
    );
  };

  const rename: AccountWrites["rename"] = (account, name, onDone) =>
    change(account, { name: name.trim() }, onDone);

  const setActive: AccountWrites["setActive"] = (account, active, onDone) =>
    change(account, { active }, onDone);

  return {
    create,
    rename,
    setActive,
    error,
    clearError: () => setError(null),
    isSaving: isCreatingAccounts || isUpdatingAccount,
    blocked,
  };
};

export default useAccountWrites;

import { useCallback, useEffect, useState } from "react";
import {
  LedgerWriteAction,
  UnresolvedLedgerWrite,
  clearLedgerWriteUncertainty,
  markLedgerWriteUncertain,
  readLedgerWriteUncertainty,
  subscribeLedgerWriteUncertainty,
} from "helpers/ledgerWriteUncertainty";

/**
 * The organisation's unresolved ledger write, mirrored to localStorage.
 *
 * The in-memory value is re-read on mount and when the organisation changes,
 * so an ordinary reload (or an organisation switch) cannot silently re-enable
 * writes whose outcome is still unknown. It is also re-read whenever this
 * organisation's marker changes in this page, which is how an F3A write that
 * settles after its screen unmounted reaches the screen showing now. Clearing
 * is explicit only.
 */
export const useLedgerWriteUncertainty = (organisationId: string) => {
  const [uncertainty, setUncertainty] = useState<UnresolvedLedgerWrite | null>(
    () => readLedgerWriteUncertainty(organisationId),
  );

  useEffect(() => {
    setUncertainty(readLedgerWriteUncertainty(organisationId));
    // Another organisation's marker never changes this one's state.
    return subscribeLedgerWriteUncertainty((changed) => {
      if (changed === organisationId) {
        setUncertainty(readLedgerWriteUncertainty(organisationId));
      }
    });
  }, [organisationId]);

  const mark = useCallback(
    (action: LedgerWriteAction) => {
      markLedgerWriteUncertain(organisationId, action);
      setUncertainty(readLedgerWriteUncertainty(organisationId));
    },
    [organisationId],
  );

  const clear = useCallback(() => {
    clearLedgerWriteUncertainty(organisationId);
    setUncertainty(null);
  }, [organisationId]);

  return { uncertainty, mark, clear };
};

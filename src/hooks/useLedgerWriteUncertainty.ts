import { useCallback, useEffect, useState } from "react";
import {
  LedgerWriteAction,
  UnresolvedLedgerWrite,
  clearLedgerWriteUncertainty,
  markLedgerWriteUncertain,
  readLedgerWriteUncertainty,
} from "helpers/ledgerWriteUncertainty";

/**
 * The organisation's unresolved ledger write, mirrored to localStorage.
 *
 * The in-memory value is re-read on mount and when the organisation changes,
 * so an ordinary reload (or an organisation switch) cannot silently re-enable
 * writes whose outcome is still unknown. Clearing is explicit only.
 */
export const useLedgerWriteUncertainty = (organisationId: string) => {
  const [uncertainty, setUncertainty] = useState<UnresolvedLedgerWrite | null>(
    () => readLedgerWriteUncertainty(organisationId),
  );

  useEffect(() => {
    setUncertainty(readLedgerWriteUncertainty(organisationId));
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

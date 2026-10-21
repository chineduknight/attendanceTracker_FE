import { LedgerAccount } from "components/finance/ledgerTypes";
import { PostingMethod } from "components/finance/ledgerPostingTypes";

/**
 * The account an officer last used for each kind of entry, on this device,
 * per organisation. A convenience only: it pre-selects a visible choice the
 * officer can change, and storage failures are ignored.
 */
export type LastAccountAction = "receipt" | "expense" | "transfer-from";

const key = (organisationId: string, action: LastAccountAction) =>
  `presence-pro:books-last-account:${organisationId}:${action}`;

export const readLastAccount = (organisationId: string, action: LastAccountAction): string | null => {
  try {
    return window.localStorage.getItem(key(organisationId, action));
  } catch {
    return null;
  }
};

export const writeLastAccount = (organisationId: string, action: LastAccountAction, accountId: string) => {
  try {
    window.localStorage.setItem(key(organisationId, action), accountId);
  } catch {
    // Remembering is optional.
  }
};

/** Bank accounts usually take bank transfers; everything else starts on cash. */
export const defaultMethodFor = (account: LedgerAccount | undefined): PostingMethod =>
  account?.subtype === "bank" ? "bank_transfer" : "cash";

/** The only account, else the last one used if it is still offered, else none. */
export const initialAccountId = (
  offered: readonly LedgerAccount[],
  organisationId: string | undefined,
  action: LastAccountAction,
): string => {
  if (offered.length === 1) return offered[0].id;
  const last = organisationId ? readLastAccount(organisationId, action) : null;
  return last && offered.some((account) => account.id === last) ? last : "";
};

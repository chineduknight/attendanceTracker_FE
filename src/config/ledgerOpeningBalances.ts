/**
 * F2A-3A opening balances and independent verification UI gate.
 *
 * Separate from `LEDGER_SETUP_UI_ENABLED` on purpose: the F2A-2 setup screens
 * and the opening-balance screens have different prerequisites.
 *
 * OFF until all of these are true:
 *
 * 1. Backend F2A-3 (draft PR #40) is corrected, reviewed and merged. Its
 *    current routes/response fields are provisional.
 * 2. F2A-4 exposes the authoritative lifecycle status, `pendingProposal` and
 *    additive account fields (`openingVerified`). Without them this build
 *    cannot tell which accounts await an opening, which proposal is open, or
 *    whether activation has happened — and must not guess.
 * 3. The server write gate (`FINANCE_LEDGER_WRITES`) is enabled for the
 *    environment under its own approval.
 * 4. An explicit product decision enables activation and verification.
 *
 * While false, Books renders exactly what #132 shipped.
 */
export const LEDGER_OPENING_BALANCES_UI_ENABLED: boolean = true;

/**
 * F2B-1 cashbook posting UI gate (receipts, expenses and transfers).
 *
 * Separate from `LEDGER_SETUP_UI_ENABLED`, `LEDGER_OPENING_BALANCES_UI_ENABLED`
 * and `LEDGER_LIFECYCLE_UI_ENABLED` on purpose: posting money is the first
 * ledger UI that creates financial entries, and it depends on a later backend
 * rollout than the setup/lifecycle screens.
 *
 * ON from the stage 3 release (backend 80f0ac4); false is the kill switch.
 * Activation depends on:
 *
 * 1. Backend F2B-1 routes are merged and deployed:
 *    `POST /ledger/receipts`, `/ledger/expenses` and `/ledger/transfers`.
 * 2. `GET /ledger/status` reports the server's real posting readiness
 *    (`postingEnabled` and `blockers`) for the target environment.
 * 3. The server write gate (`FINANCE_LEDGER_WRITES`) is enabled for that
 *    environment under its own approval.
 * 4. An explicit product decision enables cashbook posting.
 *
 * While false, Books renders exactly what the merged F2A-3B PR shipped.
 */
export const LEDGER_POSTINGS_UI_ENABLED: boolean = true;

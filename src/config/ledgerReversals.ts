/**
 * F2B-3 UI gate: journal reversals and the unconfirmed-attempts list.
 *
 * Separate from `LEDGER_POSTINGS_UI_ENABLED` (F2B-1) and
 * `LEDGER_MEMBER_MONEY_UI_ENABLED` (F2B-2) on purpose: a reversal undoes a
 * posted journal, and resolving an attempt can permanently void a request key.
 *
 * OFF until all of these are true:
 *
 * 1. Backend F2B-3 routes are deployed:
 *    `POST /ledger/journals/:journalId/reversal`, `GET /ledger/attempts` and
 *    `POST /ledger/attempts/resolve`.
 * 2. The server write gate (`FINANCE_LEDGER_WRITES`) is enabled for the
 *    environment under its own approval (reversals need it; resolve does not).
 * 3. A real frontend/backend integration test has passed.
 * 4. An explicit product decision enables reversals and attempt resolution.
 *
 * While false, Books renders exactly what the F2B-2 release shipped.
 */
export const LEDGER_REVERSALS_UI_ENABLED: boolean = false;

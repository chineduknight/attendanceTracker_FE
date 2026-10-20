/**
 * F2B-4 UI gate: the read-only cashbook, account balances and financial
 * summary reports in Books.
 *
 * Separate from every write gate on purpose: these are `finance.view` reads
 * and never post, but they present server balances as money figures, so they
 * stay off until a real backend has been checked against them.
 *
 * OFF until all of these are true:
 *
 * 1. Backend F2B-4 reads are deployed: `GET /ledger/accounts/:accountId/cashbook`,
 *    `GET /ledger/balances` and `GET /ledger/summary`.
 * 2. A real frontend/backend integration test has passed against them.
 * 3. An explicit product decision enables the reports.
 *
 * While false, Books renders exactly what the F2B-3 release shipped.
 */
export const LEDGER_REPORTS_UI_ENABLED: boolean = false;

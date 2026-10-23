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
export const LEDGER_REPORTS_UI_ENABLED: boolean = true;

/**
 * Financial Report v1 UI gate: the Excel and PDF downloads on the Summary
 * report. Separate from LEDGER_REPORTS_UI_ENABLED so the Summary itself is
 * unchanged while this is off.
 *
 * ON: backend BE-1..3 are deployed to Render staging and an Excel download
 * has been checked against it.
 *
 * PDF availability is not decided here: the preview's `downloads.pdf` says
 * whether this server offers it (off on Render Free).
 */
export const FINANCIAL_REPORT_DOWNLOADS_UI_ENABLED: boolean = true;

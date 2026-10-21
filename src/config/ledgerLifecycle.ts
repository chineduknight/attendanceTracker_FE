/**
 * F2A-3B ledger lifecycle UI gate (suspend/resume, period lock, gap-window
 * attestation).
 *
 * Separate from `LEDGER_SETUP_UI_ENABLED` (F2A-2) and
 * `LEDGER_OPENING_BALANCES_UI_ENABLED` (F2A-3A) on purpose: these screens
 * depend on backend routes and reads that shipped later than the two earlier
 * gates, and they are the highest-impact ledger controls.
 *
 * ON from the stage 3 release (backend 80f0ac4); false is the kill switch.
 * Activation depends on:
 *
 * 1. Backend F2A-3 lifecycle routes are merged and deployed: `POST suspend`,
 *    `POST resume`, `PUT period-lock`, `POST gap-window/attest`.
 * 2. F2A-4 reads are live: `GET /ledger/status` sends `activatedAt` and
 *    `gapWindowAttestedAt`, and `GET /ledger/audit` is available for the audit
 *    trail shown beside these controls.
 * 3. The server write gate (`FINANCE_LEDGER_WRITES`) is enabled for the
 *    environment under its own approval.
 * 4. An explicit product decision enables suspension, period locking and the
 *    gap-window attestation.
 *
 * While false, Books renders exactly what the merged F2A-3A PR shipped.
 */
export const LEDGER_LIFECYCLE_UI_ENABLED: boolean = true;

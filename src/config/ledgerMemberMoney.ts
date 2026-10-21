/**
 * F2B-2 member-money UI gate (member receipts and refunds).
 *
 * Separate from `LEDGER_POSTINGS_UI_ENABLED` (F2B-1) on purpose: member money
 * is a liability held for members, never income, and it depends on an
 * organisation having member receipts on and a holding account set up.
 *
 * ON from the stage 3 release (backend 80f0ac4); false is the kill switch.
 * Activation depends on:
 *
 * 1. Backend F2B-2 routes are deployed: `POST /ledger/member-receipts`,
 *    `POST /ledger/member-money/:sourceId/refunds` and
 *    `GET /ledger/member-money`.
 * 2. The server write gate (`FINANCE_LEDGER_WRITES`) is enabled for the
 *    environment under its own approval.
 * 3. An explicit product decision enables member money recording.
 *
 * While false, Books renders exactly what the F2B-1 release shipped.
 */
export const LEDGER_MEMBER_MONEY_UI_ENABLED: boolean = true;

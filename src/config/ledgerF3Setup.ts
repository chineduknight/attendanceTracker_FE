/**
 * F3A UI gate: member-money allocation setup in Books (the member dues/levy
 * income accounts, the `memberAllocationsEnabled` setting and its readiness).
 *
 * Separate from `LEDGER_SETUP_UI_ENABLED` (F2A-2) on purpose: these controls
 * sit inside the setup panel, so they need that gate too, but they depend on a
 * later backend rollout (F3-2) and on a per-environment rule that no member
 * income account is created before this frontend's receipt picker is live
 * there (F3 RFC v0.3 §5.2, §15).
 *
 * OFF until all of these are true:
 *
 * 1. Backend F3-2 is deployed: `GET /ledger/status` sends `allocationsEnabled`,
 *    `POST /ledger/accounts` accepts `member_dues_income` /
 *    `member_levy_income`, and `PATCH /ledger/settings` accepts
 *    `memberAllocationsEnabled`.
 * 2. The environment's frontend release is confirmed to offer only
 *    `subtype: null` income accounts as receipt categories (F3 sign-off).
 * 3. The server write gate (`FINANCE_LEDGER_WRITES`) is enabled for the
 *    environment under its own approval.
 * 4. A real frontend/backend integration test has passed.
 * 5. An explicit product decision enables allocation setup.
 *
 * Enabling the setting only permits allocations; posting them is F3-3 and has
 * no control in this release. While false, Books renders exactly what the
 * F2B-4 release shipped.
 */
export const LEDGER_F3_SETUP_UI_ENABLED: boolean = false;

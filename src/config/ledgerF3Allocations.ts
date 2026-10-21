/**
 * F3C UI gate: posting member-money allocations (`POST /ledger/allocations`)
 * and reversing them through the F2B-3 reversal route.
 *
 * Independent of the read gate (`config/ledgerF3Reconciliation`) and of F3A's
 * setup gate. An allocation is a financial posting: it uses the F2B posting
 * intent (exact body and key stored before sending, retried only as that
 * request) and the server decides every rule.
 *
 * ON from the stage 3 release (backend 80f0ac4); false is the kill switch.
 * Activation depends on:
 *
 * 1. Backend F3-3 is deployed in the environment and the F3-R rollout steps
 *    for it are complete under their own authorisation.
 * 2. The server write gate (`FINANCE_LEDGER_WRITES`) is approved for the
 *    environment and the organisation has `memberAllocationsEnabled` on.
 * 3. A real frontend/backend integration test (post, replay, lost response,
 *    resolve, reverse) has passed.
 * 4. The inherited F2A-2 write-lifecycle weakness has had its safety review
 *    before the controlled pilot.
 * 5. An explicit product decision enables allocation posting.
 *
 * While false, no allocation can be posted or reversed from this app, and the
 * reversal screen offers exactly what the F2B-3 release offered.
 */
export const LEDGER_F3_ALLOCATION_UI_ENABLED: boolean = true;

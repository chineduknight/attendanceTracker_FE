/**
 * F3B UI gate: the read-only member-money reconciliation in Books (allocation
 * history, unallocated member money, F0 positions and the reconciliation
 * summary) and the read-only F0 correction warning (F3 RFC v0.3 O11b).
 *
 * Separate from the allocation posting gate (`config/ledgerF3Allocations`), so
 * reporting can be enabled before posting during rollout. These are
 * `finance.view` reads that never post, but they put F0 positions next to
 * ledger figures, so they stay off until a real backend has been checked.
 *
 * OFF until all of these are true:
 *
 * 1. Backend F3-4 reads are deployed in the environment: `GET
 *    /ledger/allocations` and `GET /ledger/reconciliation/{sources,positions,
 *    summary}` (the last three need a database with transactions).
 * 2. A real frontend/backend integration test has passed against them.
 * 3. An explicit product decision enables the reconciliation reports.
 *
 * While false, Books and the Finance correction screen render exactly what
 * the F3A release shipped.
 */
export const LEDGER_F3_RECONCILIATION_UI_ENABLED: boolean = false;

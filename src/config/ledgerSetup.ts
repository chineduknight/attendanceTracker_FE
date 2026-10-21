/**
 * F2A-2 ledger setup and chart-of-accounts UI gate.
 *
 * The screens and payload builders ship behind this switch so they can be
 * reviewed and tested, but no setup action is exposed while any of these is
 * still true:
 *
 * 1. The F2A-2 backend routes are not merged/deployed yet (they are being
 *    implemented separately).
 * 2. `GET /ledger/status` still returns the constant F1 shape. Without the F2
 *    read shape a reload cannot tell `setup` from `not_active`, so the UI
 *    cannot show real setup progress (F2A-4).
 * 3. `GET /ledger/accounts` still returns the F1 shape without `revision`.
 *    Every rename/deactivate/reactivate PATCH requires `expectedRevision`, so
 *    those actions cannot be offered after a reload (F2A-4).
 * 4. The server write gate (`FINANCE_LEDGER_WRITES`) has not been enabled for
 *    the environment under its own approval.
 *
 * While this is `false`, the Books tab renders exactly what #131 shipped.
 * Flip only with an explicit product decision, after the dependencies above
 * are verified in the target environment.
 */
export const LEDGER_SETUP_UI_ENABLED: boolean = true;

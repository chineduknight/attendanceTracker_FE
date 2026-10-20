# F3B + F3C verification evidence

Branch: `feat/f3bc-allocation-reconciliation-ui`
App code verified at `9910d51`; the only later change is `.gitignore`, so this
evidence applies to the final review head.

- Backend contract: backend `staging` at `cc1c4b8` (F3-1 … F3-4 and F3-R merged), plus the frontend F3B/F3C architecture note in `docs/Presence-Pro-F3BC-Allocation-Reconciliation-FE.md`.
- All finance gates remain `false` in this branch, including the two new gates.
- No shared staging or production environment was read or written.

## Automated verification

| Check | Result |
|---|---|
| Focused F3B/F3C tests (7 suites) | **146 / 146 passed** |
| Full frontend suite | **149 / 149 suites, 2383 / 2383 tests passed** (284 s, `--runInBand`) |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` on every changed file | exit 0 |
| `CI=true yarn build` | exit 0 (23.3 s) |

Node 22.21.1, Yarn 1.22.22.

The focused suites were:

- `src/helpers/ledgerReconciliation.test.ts`
- `src/helpers/ledgerAllocations.test.ts`
- `src/components/finance/reconciliation/ReconciliationPanel.test.tsx`
- `src/components/finance/allocations/AllocationPanel.test.tsx`
- `src/components/finance/reversals/ReversalsAllocation.test.tsx`
- `src/components/finance/CorrectPaymentFormAllocationWarning.test.tsx`
- `src/components/finance/BooksTabF3.test.tsx`

## Mocked-contract browser run

Log: `browser-check.txt` · screenshots: `browser/`

- **89 checks, 0 failures**, across mobile + desktop and light + dark (4 profiles); 72 screenshots.
- Covers: summary unknown/ambiguous totals never shown as ₦0; review flags versus accounting-identity failure wording; historical `asOf` with suggestions omitted and no allocation action; current suggestions labelled separately; exact `POST /ledger/allocations` body with no account, line or allocation number; all three hint-mismatch confirmations; a lost response blocked across reload and retried with the same key and body; one allocation only after replay; reversal with exactly three body fields; over-linked and unknown positions blocked; F0 warning shown without changing the correction or writing F0; viewer read-only; no request outside localhost and the mock host.

## Real local FE/BE rehearsal

Log: `real-check.txt` · screenshots: `real/`

- **15 checks, 0 failures**.
- Disposable local environment only: backend staging code with a local Mongo replica set on `127.0.0.1:27991`, API on `localhost:4999`, frontend on `localhost:3902`.
- Covers: real reconciliation identities; a real allocation (`A-000001`, ₦2,000 from `OM-000001`); member and purpose mismatch confirmations stored by the server; a deliberately lost `201` that committed, replayed without a duplicate; a concurrent refund making the source stale, refused with `EXCEEDS_REMAINING` and no write; reversal of `A-000001` while the allocation stays listed; allocations switched off while history remains and reversal is still offered; the F0 correction warning; mobile-dark layout.

## Known limitations

- The gates stay off. No deployed backend, shared staging or production run was performed.
- One pre-existing timing flake in `LedgerReportsPanel › keeps the applied account, window and page across a tab switch` appeared in an earlier run of the full suite. The final full run passed 2383/2383; the same flake is documented on untouched base `staging`.
- The inherited F2A-2 setup/chart mutation-lifecycle weakness remains out of scope and is flagged for its separate safety review before the controlled pilot.
- Finance-only officers (without `members.view`) resolve member names from at most 20 active obligations' Finance rows; a member outside that set is shown by a short id, never guessed.
- A position with no F0 row and no allocation is not listed by `/reconciliation/positions`; the wizard explains that Finance records ₦0 for it and offers no allocation.
- Browser screenshots are local (ignored by git) because of their size; the check logs are tracked here.

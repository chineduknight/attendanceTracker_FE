# Presence Pro F3B + F3C: allocation and reconciliation (FE)

Checkpoint A of the combined F3B (reconciliation reads) and F3C (allocation
posting, allocation reversal, F0 correction warning) frontend. Written against
backend `staging` at `cc1c4b8` (F3-1 … F3-4 and F3-R merged) and FE `staging`
at `022fb08` (F3A merged).

Sources: backend `FRONTEND_API.md` sections F3-3 and F3-4, RFC
`docs/finance-f3-member-money-allocation-rfc.md` v0.3, and the backend code
itself (`ReconciliationService.ts`, `reconciliationReports.ts`,
`AllocationService.ts`, `MemberMoneyValidator.allocation`). Every shape below
was checked against that code, not only the document.

## 1. Gates

| Gate | File | Default | Controls |
|---|---|---|---|
| `LEDGER_F3_SETUP_UI_ENABLED` | `config/ledgerF3Setup.ts` | `false` | F3A setup (unchanged) |
| `LEDGER_F3_RECONCILIATION_UI_ENABLED` | `config/ledgerF3Reconciliation.ts` | `false` | F3B read panel and the F0 correction warning (O11b) |
| `LEDGER_F3_ALLOCATION_UI_ENABLED` | `config/ledgerF3Allocations.ts` | `false` | F3C allocation posting and allocation reversal |

Reads can ship before posting. With both new gates off, Books, Finance and every
F2 panel render and behave exactly as on `staging` (tests assert this).

## 2. Contract used (exact)

Reads (`finance.view`, GET only, all organisation-scoped):

- `GET /ledger/allocations?sourceId&memberId&obligationId&from&to&limit&cursor` →
  `{ readAt, items: [{ journal, state: "live"|"reversed", reversal|null }], nextCursor }`.
- `GET /ledger/reconciliation/sources?asOf&open&minAgeDays&limit&cursor` →
  `{ readAt, asOf, items, suggestions|null, suggestionsOmitted: null|"historical_as_of", nextCursor }`.
  Suggestions are keyed by source **number**.
- `GET /ledger/reconciliation/positions?obligationId&memberId&flag&limit&cursor` →
  `{ readAt, basis: "current", snapshot|null, items, nextCursor }`; `asOf` is refused.
- `GET /ledger/reconciliation/summary?from&to&minAgeDays` →
  `{ readAt, from, to, snapshot, balances, positions, flows, identities, lists }`.

Posting (`finance.manage`):

```
POST /ledger/allocations
{ idempotencyKey, businessDate, amountKobo, sourceId, memberId, obligationId,
  confirmMemberMismatch?, confirmObligationMismatch?, confirmPurposeMismatch?,
  reference?, note? }
```

Never sent: an account, a line, a number, a method. A flag is sent only as
`true` and only for a mismatch the UI showed and the officer confirmed.

Reversal: the F2B-3 route `POST /ledger/journals/:journalId/reversal`
`{ idempotencyKey, businessDate, reason }`.

## 3. Component ownership

| Component | Owns | Gate / permission |
|---|---|---|
| `reconciliation/ReconciliationPanel` | Tabs: Summary, Unallocated money, Positions, Allocations. Holds each tab's applied filters | F3B gate, `finance.view` |
| `reconciliation/ReconciliationSummaryReport` | Balances (current), positions totals (current), flows (window), identities, review lists | — |
| `reconciliation/SourcesReport` | Sources as of `asOf`, ageing, separate current suggestions block | — |
| `reconciliation/PositionsReport` | Current F0 positions, flags, snapshot wording | — |
| `reconciliation/AllocationHistory` | Allocation journals with live/reversed state, filters, cursor paging | — |
| `allocations/AllocationPanel` | The allocation wizard, its posting intent notice and receipt | F3C gate, `finance.manage` + server readiness |
| `allocations/AllocationWizard` | Source → position → amount/date → mismatches → final confirmation | — |
| `reversals/ReversalsPanel` (existing) | Allocation reversal, offered only when the F3C gate is on | F2B-3 gate **and** F3C gate |
| `MemberPaymentSheet` / `CorrectPaymentForm` (existing) | Hosts the read-only O11(b) warning | F3B gate |

`BooksTab` holds the cross-panel focus: "view this allocation in history",
"allocate from this suggestion", "open journal details".

## 4. Types and parsers

- `components/finance/ledgerReconciliationTypes.ts`: allocation rows, source rows,
  suggestions, positions (with `recordedState`), summary.
- `helpers/ledgerReconciliation.ts`: fail-closed parsers. A malformed page is
  `null` ("couldn't be read"), never a shorter list. For `recordedState`
  `unknown`/`ambiguous` every F0 figure must be `null`; a number there makes the
  row unusable rather than displayed. Identities are parsed but never
  recomputed; the FE does no arithmetic on money other than formatting.
- `helpers/ledgerAllocations.ts`: allocation draft rules, hint mismatch
  detection (same three rules as the server), readiness.

## 5. Query keys

Every key sits under `queryKeys.finance.ledger.root(org)`, so every ledger write
(posting, reversal, setup) already invalidates them for that organisation only:

```
["finance", org, "ledger", "allocations", params...]
["finance", org, "ledger", "reconciliation", "sources", params...]
["finance", org, "ledger", "reconciliation", "positions", params...]
["finance", org, "ledger", "reconciliation", "summary", params...]
```

F0 dependency: positions, the summary's position totals and the suggestions
read **current F0**. An F0 collection or correction does not touch the ledger
root, so `invalidateFinance(org)` (the F0 write hook's existing refresh) also
invalidates `["finance", org, "ledger", "reconciliation"]`. That is a cache
refresh only; no F0 request, payload or rule changes.

## 6. Posting-intent reuse (F3C)

Allocation is a new `PostingOperation`, `"allocation"`, in the existing F2B
machinery, not the F3A configuration-write marker:

- `beginLedgerPostingIntent` stores `{ key, exact body, org, officer, summary }`
  under the cross-tab lock before the first send; one pending posting per
  organisation blocks every new posting (cashbook, member money, reversal,
  allocation).
- `classifyPostingFailure` and the §7.5 table apply unchanged: a lost response or
  an uncoded 5xx keeps the exact body and key pending; retry resends that body
  with that key; the server replays (200 `replayed: true`) if it had committed.
- `assessPostingConfirmation` gets allocation proof rules: `sourceType
  member_money_allocation`, an `A-…` number, the body's date and amount, and the
  journal's `entry.memberMoneySource.id`, `entry.memberId` and
  `entry.obligationId` equal to the body's.
- Resolution of a stuck key is the existing unconfirmed-attempts flow
  (`/attempts/resolve`), which already lists any `sourceType`; allocation gets a
  label.
- A new posting section `allocations` joins `cashbook`, `memberMoney`,
  `reversals` so exactly one shown section offers a pending allocation's retry.

## 7. Cache dependencies after a write

| Event | Refreshed |
|---|---|
| Allocation or allocation reversal confirmed | ledger root (status, accounts, journals, member money, F2B-4 reports, allocations, reconciliation) |
| Allocation refused (e.g. `EXCEEDS_REMAINING`, `EXCEEDS_RECORDED`) | the wizard's source list and position re-read |
| F0 collection or correction | compliance, obligations (existing) + reconciliation |
| Organisation switch | nothing carried over: every key and the intent slot are per organisation |

## 8. Contract findings (no blocking incompatibility)

1. **Member names.** Every F3 read returns member ids only. The members list needs
   `members.view`, which a Financial Secretary (`finance.*` only) lacks. The FE
   resolves names from the members list when permitted and from the F0
   compliance rows of an obligation (`finance.view`) otherwise; an unresolved
   member is shown by a short id, never guessed. The wizard always picks the
   member from the chosen obligation's compliance rows, so it never needs
   `members.view`.
2. **A position with no F0 row and no allocation** is not listed by
   `/reconciliation/positions`. The contract says such a member has recorded ₦0,
   so the wizard shows "no payment recorded in Finance" and does not offer the
   allocation (the server would refuse it with `EXCEEDS_RECORDED`).
3. **Allocation reversal** is a reversal (F2B-3 rules): it needs posting readiness
   but neither member receipts nor `allocationsEnabled`, and works after either
   is turned off. The FE never gates it on those settings.
4. **Unknown/ambiguous positions** are refused by the server (`NEEDS_REVIEW`,
   `AMBIGUOUS`). The wizard explains and does not submit; the fix is in Finance.

## 9. Inherited weakness (out of scope, flagged)

The F2A-2 setup and chart-of-accounts writes still latch their uncertainty
marker from `mutate` callbacks (found in the PR #140 review). This PR does not
touch them. It needs a safety review before the controlled pilot.

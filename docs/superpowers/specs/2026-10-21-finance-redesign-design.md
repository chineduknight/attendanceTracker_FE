# Books redesign (mobile first)

Status: hierarchy and scope approved in principle, 2026-10-21. Final approval waits on the Overview and Money in mockups (light and dark).
Frontend only: `attendanceTracker_FE`, branch off `staging`. **No backend changes.**

## 1. Scope

**In scope:** the **Books** tab of Finance ([BooksTab.tsx](../../../src/components/finance/BooksTab.tsx) and the panels it renders). One minimal change to how Finance selects its tab, needed for Back/Forward (§5).

**Out of scope, unchanged:**
- The Collect, Obligations and Start dates workflows.
- F0 dues/levy collection, corrections, obligations and financial start dates.
- Every backend API, model, accounting rule, permission and calculation.
- How postings, reversals, idempotency, unconfirmed outcomes, owner approval, Member Receipts and Allocations work.

**No link between dues and Books.** No prompts, shortcuts or navigation between F0 collection and the ledger. Reason (owner): if Books copied a dues payment, a later correction of that payment would leave the two records out of step. Integration needs its own accounting design (§12).

## 2. Why

Today Books is one scroll of 13 stacked sections, about 12,000 CSS px at phone width with every gate on. Daily actions sit below one-off setup and owner controls. The forms are long and full of accounting terms. Reports and balances already exist, but they're buried near the bottom. The status text still says "balances are not calculated here" ([helpers/ledger.ts:309](../../../src/helpers/ledger.ts#L309)), which is out of date.

**Goal:** a treasurer who opens Books immediately sees:
1. how much cash there is
2. how much is in the bank
3. how to record money received
4. how to record money spent
5. where activity and reports are
6. where to manage the books

## 3. Rules that cannot change

- **Figures come from the backend only.**
  - Show per-account balances from `GET /ledger/balances`.
  - A `null` / `balanceState: "unknown"` balance shows as "Unknown", never ₦0.
  - The frontend sums, subtracts and derives nothing: no cash subtotal, no bank subtotal, no "available" figure.
  - The only total allowed is the server's own `moneyTotalKobo` (null means unknown).
- **Held money is not income and is never subtracted from cash or bank.** It's shown as its own figure, the member-money account's balance from the same balances response, and only when Member Receipts is on.
- **Every feature gate stays.** Each `LEDGER_*_UI_ENABLED` flag hides its own entry points, exactly as today.
- **Every ledger state stays as it is:** not set up, setup, pending verification, active, suspended, unknown, plus unavailable/403/404.
- **Permissions and roles stay as they are.**
  - `finance.view` can see everything read-only.
  - Write controls sit behind `finance.manage`, using the existing `<Can>` checks.
  - Owner-only actions (verify, suspend/resume, period lock) stay owner-only.
- **Organisations stay separate.** `FinanceWorkspace` stays keyed by organisation id. Books state in the URL is tied to the organisation (§5).
- **Write workflows are reused, not rewritten.**
  - Existing pieces: `usePostingWorkflow`, `PostingIntentNotice`, `PostingReceipt`, `PostingSupersededNotice`, `ReversalForm`, `UnconfirmedAttemptsPanel`, and the opening/lifecycle/setup intent handling.
  - Request bodies, validation and error mapping stay identical.

## 4. Screen hierarchy

Books becomes a small stack of screens inside the existing tab: drill-in screens with a back row, and forms and details in bottom sheets (the existing [FinanceSheet](../../../src/components/finance/FinanceSheet.tsx)). There's no new tab bar. Report and reconciliation sub-tabs stay as they are (owner, review item 5).

```
Finance  [Collect | Obligations | Start dates | Books]   ← unchanged look and behaviour
Books
├── Overview (default)
│   ├── sheet: Money in        (Income; "For a member" when Member Receipts is on)
│   ├── sheet: Money out       (expense)
│   ├── sheet: Transfer        (between own cash/bank accounts)
├── Entry                      (one transaction's details → Undo; its own screen so the reversal
│                               workflow and its recovery stay mounted)
├── Transactions               (paged list with server-side filters; tap → detail sheet)
├── Reports                    (existing LedgerReportsPanel, its Summary · Balances · Cashbook tabs kept)
├── Held for members           (only when Member Receipts is on: held items → refund / allocate)
└── Manage Books
    ├── Books status & history (LedgerLifecyclePanel unchanged: state, blockers, suspend/resume,
    │                           period lock, gap window, audit list)
    ├── Setup & accounts       (LedgerSetupPanel unchanged: checklist, Member Receipts and
    │                           Allocations settings, chart of accounts)
    ├── Opening balances       (OpeningBalancesPanel unchanged: proposals, verification, approvals)
    ├── Reconciliation         (ReconciliationPanel unchanged, its tabs kept)
    └── Unconfirmed saves      (UnconfirmedAttemptsPanel; finance.manage)
```

**Owner decision: `LedgerSetupPanel` is not split in this iteration.** Its shared state and unresolved-write recovery stay exactly as they are. For the same reason, `LedgerLifecyclePanel` stays whole, with its audit list, on one screen. Admin screens keep today's length inside their own screen; safety matters more than brevity here.

### Cross-links that must keep working
These are screen changes now, and each one is a history entry:
- Reconciliation "Allocate" → Held for members, with the allocation form started (`AllocationStart`).
- Allocation "View history" → Reconciliation, allocations view focused (`ReconciliationFocus`).
- Unconfirmed saves / reversal "Open journal" → Transaction detail sheet.

## 5. Back and Forward (owner decision: required)

Books screens and sheets live in the URL of the existing Finance route (`/finance`), so the phone's Back and Forward move through them. React Router 6.3 `useSearchParams`, following the precedent in [Analytics.tsx](../../../src/pages/Analytics.tsx#L88).

| Param | Values | Written by |
|---|---|---|
| `tab` | `collect` · `obligations` · `start-dates` · `books` | Finance tab bar (**replace**) |
| `books` | `overview` (default) · `transactions` · `reports` · `held` · `entry` · `manage` · `manage-status` · `manage-setup` · `manage-opening` · `manage-reconciliation` · `manage-attempts` | Books navigation (**push**) |
| `sheet` | `money-in` · `money-out` · `transfer` | opening a form sheet (**push**) |
| `journal` | journal id | the Entry screen (**push**) |
| `org` | selected organisation id | written alongside any Books param |

**The minimal Finance change:**
- Finance reads its selected tab from `tab` instead of `useState`.
- `/finance` without params still opens Collect.
- Tab switches **replace** the URL entry, so Back from Collect, Obligations or Start dates behaves as today and leaves Finance.
- Switching away from Books drops the Books params.
- Nothing else in those three tabs changes. Their local state (chosen obligation, open member sheet, filters) stays local.

**Inside Books:**
- Screens and sheets **push** entries.
- Back goes from a sheet to the screen under it, then from screen to screen, then from Overview out of Finance. Forward re-opens.
- The back row and a sheet's close/Cancel button call `navigate(-1)` when Books pushed that entry. If the page was opened directly at that URL (a reload or a shared link), they **replace** with the parent instead, so the user never leaves the app by accident.

**Edge cases:**
- **Org isolation:** Books params count only when `org` equals the selected organisation. Otherwise the URL is replaced with a clean Books Overview, so Back after an org switch can never open Organisation A's screen or journal under Organisation B.
- **Gates and permissions:** an unknown `books` value, a screen whose gate is off, or a manage-only screen opened by a viewer → replace with Overview.
- **Missing entries:** a `journal` the server answers 404 for → a short notice, then the sheet closes (replace).
- **Saves in progress:**
  - The posting workflow (`usePostingWorkflow` and the pending intent) lives at Books level, not inside the sheet.
  - A Back during a save never loses the outcome: the receipt or unconfirmed notice shows when the sheet reopens, and in Needs attention.
  - Back on a form sheet works like Cancel and discards unsaved values. A save already in flight still completes, and its receipt shows on Overview. *(Changed during planning: keeping unsaved values would mean keeping forms mounted inside a closed drawer, which is fragile.)*
  - Every Books screen stays mounted (hidden when not shown), so panel state, pending writes and cross-links survive navigation as they do on today's single page.
- **Reload:** a reload restores the screen and sheet, but not unsaved form values. Pending postings are already persisted by the existing intent store.

## 6. Overview (mobile layout, 320–430px)

```
Books                                     (status chip only when NOT active)
┌───────────────────┐ ┌───────────────────┐
│ CASH              │ │ BANK              │
│ Cash in hand      │ │ Main bank         │   one tile per ACTIVE cash/bank
│ ₦73,000           │ │ ₦95,000           │   account; 2 per row ≥ 360px,
└───────────────────┘ └───────────────────┘   stacked < 360px
 Inactive accounts (1)  ₦0              ›     only when the server returns any
 Total in cash and bank  ₦168,000              server moneyTotalKobo; 2+ accounts
 Held for members  ₦3,000               ›     only when Member Receipts is on
┌───────────────────┐ ┌───────────────────┐
│  ↓ Money in       │ │  ↑ Money out      │   56px, finance.manage only
└───────────────────┘ └───────────────────┘
 [ ⇄ Transfer between accounts ]              44px outline, full width
 (one-line reason under the buttons when posting isn't ready)

 Needs attention                               only when something is there
 This month                             ›     → Reports (Summary, this month)
 Recent                          See all ›    → Transactions
 Reports                                ›
 Manage Books                           ›
```

**Account tiles and totals (review item 2):**
- Tiles are the active cash/bank accounts, each with name, type and balance. Unknown shows "Unknown" plus a muted reason ("opening not verified").
- Any inactive cash/bank account in the balances response appears under **Inactive accounts (n)**. It expands inline to name + balance, so no account the server counts is hidden.
- The server's `moneyTotalKobo` includes inactive accounts that were opened. When any are included, the total is labelled "Total in cash and bank (includes inactive accounts)", so tiles + inactive line up with the total.
- If `moneyTotalKobo` is null: "Total unknown until every account's opening is verified".

**Actions:**
- Money in, Money out and Transfer are shown to managers only.
- When `postingReadiness` says posting isn't ready, they're disabled and the reason appears in one line under them.

**Needs attention:**
- One item per real condition, all from existing data:
  - this org's pending posting intent
  - `status.unconfirmedAttempts`
  - `status.hasPendingProposal`
  - `status.blockers`
- Each item opens the screen or sheet that owns the retry. Exactly one place offers a retry (`retrySectionFor`).
- While a posting is pending, opening any posting sheet shows `PostingIntentNotice` instead of a blank form, as today.

**This month:** `summary` from the first of the month to today (Lagos), income and expense totals only.

**Recent:** the first 5 items of the paged journals read (§8).

### Overview by ledger state

| State | What Overview shows |
|---|---|
| Read fails / 404 / 403 / unrecognised state | today's Unavailable / ErrorState, unchanged |
| `not_active` | "Books aren't set up." Managers get **Set up books** → Manage › Setup & accounts |
| `setup` | "Setup in progress" → **Continue setup** |
| `pending_verification` | "Opening balances are waiting for verification." Owner gets **Review and verify**; others see "Waiting for the owner" |
| `active` | full layout above |
| `suspended` | tiles, This month and Recent shown. Posting buttons disabled: "Books are suspended. An owner can resume them in Manage Books." |

Dues-only organisations (books never set up) see the `not_active` state, and the Collect tab works as today.

## 7. Forms (bottom sheets)

All forms share these rules:
- **Order:** amount first, then account, then category.
- **Inputs:** amount uses `AmountInput` (numeric keypad); date uses `DateField`, defaulting to today in Lagos within the existing min/max.
- **Optional fields** sit behind **Add details**.
- **Footer:** the Save button sticks to the bottom of the sheet. After a save, the existing `PostingReceipt` shows the number, with **Done** and **Record another**.

**Account and method stay visible (review item 3):**
- The receiving or paying account and the payment method are always main fields, never behind "Add details".
- **Account:**
  - One tappable card per active cash/bank account when there are 3 or fewer, otherwise `OptionSelect`.
  - Default: the only account if there is just one; otherwise the account last used for this action on this device for this organisation, if it's still active.
  - If neither applies, nothing is pre-selected and the officer must choose.
- **Method:** a chip row (Cash · Bank transfer · POS · More). Default: Cash for a cash account, Bank transfer for a bank account. It updates when the account changes until the officer picks a method themselves.
- Both defaults are visibly selected and can be changed before saving. They are UI defaults only; request bodies are unchanged.

| Sheet | Main fields | Behind "Add details" | Existing form |
|---|---|---|---|
| Money in, **Income** | Amount · Into · Category · Method · Date · From (optional) | External ref · Evidence ref · Reference · Note | `ReceiptForm` |
| Money in, **For a member** (only when Member Receipts is on and its gate is on) | today's member-receipt fields | refs · note | member receipt form in `MemberMoneyForms` |
| Money out | Amount · From · Category · Paid to (required) · Method · Date | External ref · Evidence ref · Reference · Note | `ExpenseForm` |
| Transfer | Amount · From · To · Method · Date | External ref · Reference · Note | `TransferForm` |

- The Money in sheet shows an **Income | For a member** switch at the top only when Member Receipts is on. Otherwise it goes straight to Income. "For a member" opens Held for members with the existing member-receipt form already started (no second copy of that form).
- **Wording:** "Post receipt" → "Record money in", "Business date" → "Date", "Journal entries" → "Transactions". Validation and server messages are unchanged.

## 8. Transactions, Reports, Held for members

**Transactions (review item 1: no misleading filters)**
- Uses the existing paged read: `GET /ledger/journals?pagination=cursor&limit=…&sourceType=…&accountId=…&from=…&to=…`.
- **Every filter is applied by the server. The client never filters a loaded page.**
- New frontend hook: an infinite query keyed by `organisationId` + filters, using `nextCursor`. The legacy unpaged array (capped at 200) is no longer used by Books.
- **Type chips map one-to-one to a `sourceType`**, because the endpoint takes one value:
  - always: All · Money in (`cash_receipt`) · Money out (`cash_expense`) · Transfers (`cash_transfer`) · Undone entries (`reversal`)
  - when Member Receipts is on: For members (`member_receipt`) · Refunds (`member_receipt_refund`)
  - when allocations are on: Applied (`member_money_allocation`), only if the backend's filter enum accepts it; verify before building
- Account and date range sit behind "Filter".
- **The footer is honest about completeness:** "Load more" while `nextCursor` is set, and "That's everything for these filters" only when it is null. No counts or totals are shown for the list.
- Rows: sign or arrow · amount (`totalKobo`) · category or counterparty · account · date. Labels come from `sourceType`; a reversal links to its original.
- Tapping a row opens the detail sheet (`JournalDetailCard`, `JournalLines`). Managers get **Undo** (the existing `ReversalForm`, reason required).

**Reports:** the existing `LedgerReportsPanel` on its own screen. Its Summary · Balances · Cashbook tabs are unchanged, defaulting to Summary for this month.

**Held for members** (only when Member Receipts is on):
- the held figure
- the existing member-money list, with Refund (existing)
- Allocate (existing `AllocationPanel`, only when allocations are on and its gate is on)

If Member Receipts was never switched on, no held-money UI appears outside Manage Books › Setup & accounts. The backend only lets Member Receipts be switched on, never off.

## 9. Manage Books

A grouped list. Each row shows one line of state and opens its own screen with the existing panel, unchanged. Visibility follows today's gates and permissions; viewers see read-only versions where the panel already supports that.

| Row | Line of state |
|---|---|
| Books status & history | Active · Suspended · Period locked through … |
| Setup & accounts | "Setup in progress" or "8 accounts" |
| Opening balances | "Awaiting verification" when a proposal is open |
| Reconciliation | (none) |
| Unconfirmed saves | count (manage only) |

The only in-panel change is plain wording, plus the missing audit label for `member_allocations_enabled`. Layout clean-ups inside admin panels are deferred.

## 10. Mobile, theme, accessibility

- **Widths:** designed at 320 / 360 / 390 / 430 px with a 16px side gutter. No horizontal page overflow (the chip row scrolls on its own). Amounts use tabular figures and wrap, never truncate.
- **Touch targets:** 44px minimum; primary actions 56px.
- **Badges:** at most one status chip per screen.
- **Colour:**
  - Semantic tokens only (`bg.panel`, `fg`, `fg.muted`, `green.fg`, `red.fg`, `{palette}.solid`).
  - Amounts always carry +/−/⇄ and text, never colour alone.
  - Light and dark mode are checked on every screen and open sheet.
- **States:** `PageLoader`, `EmptyState` and `ErrorState` (backend text + Try again) on every screen.
- **Navigation:** the back row is a real button; focus moves to the screen heading after navigating.

## 11. Testing

**Automated:**
- Rewrite `BooksTab*.test.tsx` around the new navigation:
  - every screen reachable under all gates on and off
  - viewer / manager / owner controls
  - URL ↔ screen mapping, including Back/Forward through screens and sheets
  - a mismatched `org` param is ignored and replaced
  - an Org A → B switch resets the screen and sheets
  - unknown balances never render ₦0
  - inactive accounts are listed
  - filters reach the request and are not applied client-side
  - the pending posting appears in exactly one retry place
- Finance tab tests prove that Collect, Obligations and Start dates behave as before.
- Panel tests stay as they are.
- Then the full suite, `tsc`, changed-file eslint and `CI=true yarn build`.

**Browser:**
- Against the local backend with the owner's local test user, at 320 / 360 / 390 / 430 in light and dark mode.
- Roles: owner, manager, viewer.
- Ledger states: not set up, setup, pending verification, active, suspended. Member Receipts on and off.
- Journeys: record money in, money out, transfer, member receipt, undo an entry, open each Manage Books row, Back/Forward through all of them, an org switch followed by Back.

Done on a dedicated branch with a PR to `staging`. No merge or deploy without approval.

## 12. Deferred (future work, not dependencies)

- Dues/levy ↔ Books integration with its full accounting lifecycle (corrections, reversals). Includes the combined collection endpoint idea.
- A single overview read endpoint.
- Officer names on audit rows.
- Splitting `LedgerSetupPanel` / `LedgerLifecyclePanel` and decluttering admin panels (⋯ menus, collapsed readiness lists).

## 13. Decisions log

**Owner:**
- Books only; no backend changes; no dues link.
- Back/Forward inside Books is required.
- Don't split `LedgerSetupPanel`.
- Filters must be honest about paged results.
- Inactive accounts stay visible and match the total.
- Account and method stay visible in Money in.
- Report sub-tabs are kept.

**Designer's calls (open to change):**
- The URL param names.
- Back on a form sheet discards unsaved values; an in-flight save still completes.
- Transaction details as an Entry screen, not a sheet.
- Last-used account default.
- Chip-row method picker.
- Keeping `LedgerLifecyclePanel` whole, audit list included.

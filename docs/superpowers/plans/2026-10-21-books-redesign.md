# Books Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 13-section Books scroll with a mobile-first screen stack (Overview, Transactions, Reports, Held for members, Manage Books), with Back/Forward support and without changing any posting or accounting behaviour.

**Architecture:**
- `BooksTab` becomes a shell. It keeps today's status/accounts reads and renders **every screen always mounted**, with inactive ones `hidden`. Panel state, pending writes and cross-links therefore survive navigation exactly as they do on today's single page.
- The cashbook posting workflow is lifted into the shell (a hook), so its forms can live in a bottom sheet.
- The screen, sheet and entry id live in `/finance` query params via `useSearchParams`.

**Tech Stack:** React 18, TypeScript, CRA/Jest 27, Chakra UI v3, TanStack Query v4, React Router 6.3.

**Spec:** `docs/superpowers/specs/2026-10-21-finance-redesign-design.md`

## Global Constraints

- Frontend only. No backend, API, request-body or validation changes. No new dependencies.
- **Figures:** server figures only. Unknown is `formatReportKobo(null)` ("Unknown"), never ₦0. The only total is `moneyTotalKobo`. No frontend subtotal or "available" figure.
- **Gates:** every `LEDGER_*_UI_ENABLED` gate keeps hiding its own surface.
- **Permissions:**
  - write controls behind `finance.manage`
  - owner-only actions unchanged
  - `finance.view` keeps read access
- **Organisation scoping:**
  - every new query key sits under `queryKeys.finance.ledger.*(organisationId)`
  - `FinanceWorkspace` stays keyed by organisation id
- **Untouched:** the Collect / Obligations / Start dates tabs, except reading their tab from the URL.
- **Chakra v3 rules (AGENTS.md §52–53):**
  - `FinanceSheet` for sheets
  - `OptionSelect` for dropdowns
  - `AmountInput` / `DateField` for inputs
  - semantic tokens
  - 44px targets
  - +/− with text, never colour alone
- **Commands:**
  - tests: `CI=true yarn test --watchAll=false <path>`
  - types: `npx tsc --noEmit`
  - lint: `npx eslint <changed files>`
  - build: `CI=true yarn build`
- **Branch:** `feat/books-redesign` off `origin/staging`. PR to `staging`. Never merge or deploy.

## Review Focus

1. **Back after an organisation switch.** A URL carrying Org A's `org`/`journal` is opened under Org B: it must land on a clean Books Overview and must never request Org A's journal. *(Task 1 test.)*
2. **A save in flight when the sheet closes.** Back during "Record money in": the posting completes and its receipt appears on Overview. No second key, no lost outcome. *(Task 4 test.)*
3. **A pending posting while every screen is mounted.** Exactly one Retry button exists in the DOM across all screens, and Overview's Needs attention links to the screen that owns it. *(Task 6 test.)*
4. **Filters on paged data.** Chips change the request (`sourceType`), never filter loaded rows. "That's everything" appears only when `nextCursor` is null. *(Task 2 test.)*
5. **Inactive accounts.** An inactive cash/bank account with a balance is listed. When it is, the total is labelled as including inactive accounts. *(Task 3 test.)*

---

### Task 0: Branch

- [ ] `git fetch origin && git switch -c feat/books-redesign origin/staging`
- [ ] Copy in the uncommitted spec and plan. Commit them: `docs(finance): books redesign spec and plan`.

### Task 1: Finance tab and Books location in the URL

**Files:**
- Create: `src/helpers/booksNavigation.ts`, `src/helpers/booksNavigation.test.ts`, `src/hooks/useBooksNav.ts`
- Modify: `src/pages/Finance.tsx` (tab from URL), `src/pages/Finance.test.tsx`

**Interfaces (produces):**
```ts
export type FinanceTab = "collect" | "obligations" | "start-dates" | "books";
export type BooksScreen = "overview" | "transactions" | "reports" | "held" | "entry"
  | "manage" | "manage-status" | "manage-setup" | "manage-opening"
  | "manage-reconciliation" | "manage-attempts";
export type BooksSheet = "money-in" | "money-out" | "transfer";
export interface BooksLocation { screen: BooksScreen; sheet: BooksSheet | null; journalId: string | null }
export const BOOKS_HOME: BooksLocation; // { screen: "overview", sheet: null, journalId: null }
export const readFinanceTab: (params: URLSearchParams) => FinanceTab;          // missing/unknown → "collect"
export const writeFinanceTab: (params: URLSearchParams, tab: FinanceTab) => URLSearchParams; // non-books tab drops books/sheet/journal/org
export const readBooksLocation: (params: URLSearchParams, organisationId: string)
  => { location: BooksLocation; valid: boolean }; // valid=false: org mismatch, unknown screen/sheet, "entry" without journal
export const writeBooksLocation: (params: URLSearchParams, organisationId: string, location: BooksLocation) => URLSearchParams; // tab=books, org=<id>, omits defaults
export const parentOf: (location: BooksLocation) => BooksLocation; // sheet→same screen; entry→transactions; manage-*→manage; others→overview
// useBooksNav.ts
export const useBooksNav: (organisationId: string) => {
  location: BooksLocation;
  go: (screen: BooksScreen, journalId?: string) => void;   // push, clears sheet
  openSheet: (sheet: BooksSheet) => void;                  // push
  close: () => void;     // navigate(-1) when location.state?.booksPushed, else replace with parentOf
  replace: (location: BooksLocation) => void;
};
```
- Param names: `tab`, `books`, `sheet`, `journal`, `org`.
- Pushes call `setSearchParams(next, { state: { booksPushed: true } })`. Tab switches and `replace` use `{ replace: true }`.
- `useBooksNav` replaces the URL with `BOOKS_HOME` in an effect when `valid` is false and `tab === "books"`.

- [ ] **Step 1: Write the failing helper tests** (`booksNavigation.test.ts`)
  - `readFinanceTab(new URLSearchParams(""))` → `"collect"`; `"tab=books"` → `"books"`; `"tab=nope"` → `"collect"`.
  - `writeFinanceTab(p("tab=books&books=reports&org=o1&journal=j1"), "collect").toString()` → `"tab=collect"`.
  - `readBooksLocation(p("tab=books&books=reports&org=o1"), "o1")` → `{ location: { screen: "reports", sheet: null, journalId: null }, valid: true }`.
  - The same params read with `"o2"` → `{ location: BOOKS_HOME, valid: false }`.
  - `books=entry` without `journal` → `valid: false`; `sheet=bogus` → `valid: false`; no `books` param → `BOOKS_HOME, valid: true`.
  - Round trip: `readBooksLocation(writeBooksLocation(new URLSearchParams(), "o1", L), "o1").location` equals `L` for every screen, plus `{ screen: "overview", sheet: "money-in" }` and `{ screen: "entry", journalId: "j1" }`.
  - `parentOf`:
    - `{ screen: "manage-setup" }` → `manage`
    - `{ screen: "entry", journalId: "j1" }` → `transactions`
    - `{ screen: "overview", sheet: "transfer" }` → overview with `sheet: null`
- [ ] **Step 2: Run** `CI=true yarn test --watchAll=false src/helpers/booksNavigation.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `booksNavigation.ts` and `useBooksNav.ts` to the interfaces above.
- [ ] **Step 4: Change Finance.tsx tab selection** to read/write `tab` via `readFinanceTab` / `writeFinanceTab` with `{ replace: true }`. Remove `useState(COLLECT)`. Keep the `setTabIndex(OBLIGATIONS)` / `setTabIndex(COLLECT)` call sites by mapping them to `writeFinanceTab`. Add a comment: replace keeps Back from Collect/Obligations/Start dates behaving as before.
- [ ] **Step 5: Finance.test.tsx** (render inside `MemoryRouter`)
  - `/finance` shows the Collect tab selected.
  - `/finance?tab=books` shows Books selected.
  - Clicking "Obligations" leaves `history.length`-equivalent unchanged: assert with a `MemoryRouter` + location spy that the navigation was a REPLACE.
  - Existing Finance tests still pass.
- [ ] **Step 6: Run** both test files. Expected: PASS.
- [ ] **Step 7: Commit:** `feat(finance): keep the Finance tab and Books screen in the URL`.

### Task 2: Paged journals and plain-language rows

**Files:**
- Create: `src/hooks/useLedgerJournalPages.ts`, `src/helpers/booksTransactions.ts`, `src/helpers/booksTransactions.test.ts`, `src/hooks/useLedgerJournalPages.test.tsx`
- Modify: `src/services/api/queryKeys.ts` (add `journalPages`)

**Interfaces (produces):**
```ts
// queryKeys.finance.ledger
journalPages: (organisationId: string, filters: JournalFilters) =>
  [...journals(organisationId), "pages", filters] // under journals → every existing ledger invalidation covers it
// booksTransactions.ts
export interface JournalFilters { sourceType: string; accountId: string; from: string; to: string } // "" = none
export const EMPTY_JOURNAL_FILTERS: JournalFilters;
export interface TypeChip { label: string; sourceType: string }
export const typeChips: (opts: { memberReceipts: boolean; allocations: boolean }) => TypeChip[];
export type TransactionKind = "in" | "out" | "move" | "held" | "refund" | "applied" | "opening" | "reversal" | "other";
export interface TransactionRow { id: string; kind: TransactionKind; title: string; subtitle: string; amountText: string; date: string }
export const toTransactionRow: (journal: PostingJournal, accounts: readonly LedgerAccount[]) => TransactionRow;
// useLedgerJournalPages.ts
export const useLedgerJournalPages: (organisationId: string, filters: JournalFilters, enabled: boolean, limit?: number) => {
  items: PostingJournal[] | null; hasMore: boolean; loadMore: () => void; isLoadingMore: boolean;
  isLoading: boolean; isError: boolean; error: unknown; isFetching: boolean; refetch: () => unknown;
};
```

**Chips, exact, in order:**
- `All` (`""`)
- `Money in` (`cash_receipt`)
- `Money out` (`cash_expense`)
- `Transfers` (`cash_transfer`)
- `Undone` (`reversal`)
- when `memberReceipts`: `For members` (`member_receipt`), `Refunds` (`member_receipt_refund`)
- when `allocations`: `Applied` (`member_money_allocation`)

**Row text (`amountText` uses `formatKobo(totalKobo)`; `formatReportKobo(null)` when `totalKobo` is null):**

| `sourceType` | kind | sign | title | subtitle |
|---|---|---|---|---|
| `cash_receipt` | `in` | `+` | income category name (the credit line's account) | `from <counterparty> · <money account>`, dropping missing parts |
| `cash_expense` | `out` | `−` | expense category name | `to <counterparty> · <money account>` |
| `cash_transfer` | `move` | none | `Transfer` | `<from> → <to>` |
| `member_receipt` | `held` | `+` | `Held for a member` | `from <counterparty> · <money account>` |
| `member_receipt_refund` | `refund` | `−` | `Refund to a member` | — |
| `member_money_allocation` | `applied` | none | `Applied to dues` / `Applied to a levy` (from `obligationType`) | — |
| `opening_balance*` | `opening` | — | `Opening balance` | — |
| `reversal` | `reversal` | — | `Undo of an earlier entry` | — |
| anything else | `other` | — | `Entry` | — |

**Paged read:** `GET LEDGER_JOURNALS?pagination=cursor&limit=<limit ?? 50>` plus non-empty filters, via `reportQuery`. Page parse: `{ items: toPostingJournal[] , nextCursor }`, following the `useUnresolvedLedgerAttempts` infinite-query pattern. An unreadable page throws.

- [ ] **Step 1: Failing tests**
  - `booksTransactions.test.ts`:
    - `typeChips({ memberReceipts: false, allocations: false }).map(c => c.label)` equals the first five labels.
    - With both flags on → 8 labels.
    - One `toTransactionRow` case per row of the table above (receipt ₦5,000 from "Ada" into "Cash in hand" category "Donations" → `{ kind: "in", title: "Donations", subtitle: "from Ada · Cash in hand", amountText: "+₦5,000" }`).
  - `useLedgerJournalPages.test.tsx` (mock `services/api` axios like the attempts tests):
    - filters `{ sourceType: "cash_expense", accountId: "a1", from: "2026-10-01", to: "" }` request a URL containing `pagination=cursor`, `sourceType=cash_expense`, `accountId=a1`, `from=2026-10-01` and no `to=`.
    - `hasMore` is true when `nextCursor` is `"c1"`; `loadMore` requests `cursor=c1`.
    - `hasMore` is false when `nextCursor` is null.
    - Keys for org `o1` and `o2` differ.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** to the interfaces.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(finance): paged Books transactions with server-side filters`.

### Task 3: Overview data helpers and Overview components

**Files:**
- Create: `src/helpers/booksOverview.ts` (+ `.test.ts`)
- Create: `src/components/finance/books/BalanceTiles.tsx`, `NeedsAttention.tsx`, `ThisMonth.tsx`, `RecentTransactions.tsx`, `BooksStateCard.tsx`, `BackRow.tsx`, `NavRow.tsx` (+ `BalanceTiles.test.tsx`)

**Interfaces (produces):**
```ts
export interface BalanceTile { accountId: string; name: string; type: "Cash" | "Bank"; balanceKobo: number | null; reason: string | null }
export const balanceTiles: (report: BalancesReport, accounts: readonly LedgerAccount[], memberReceiptsOn: boolean) => {
  active: BalanceTile[]; inactive: BalanceTile[];
  totalKobo: number | null;            // report.moneyTotalKobo, untouched
  showTotal: boolean;                  // active.length + inactive.length >= 2
  totalIncludesInactive: boolean;      // inactive.some(t => t.balanceKobo !== null)
  heldKobo: number | null | undefined; // undefined when !memberReceiptsOn or no member-money account; else its balance (null = unknown)
};
export type AttentionItem = { id: string; text: string; target:
  | { kind: "sheet"; sheet: BooksSheet } | { kind: "screen"; screen: BooksScreen } };
export const attentionItems: (input: {
  pending: LedgerPostingIntentRecord | null; pendingSection: PostingSection | null;
  unconfirmedAttempts: number | null; hasPendingProposal: boolean | null; blockers: string[] }) => AttentionItem[];
export const monthToDate: (todayLagos: string) => { from: string; to: string }; // "2026-10-21" → { from: "2026-10-01", to: "2026-10-21" }
```

**Rules:**
- Tiles come from active `asset` accounts with subtype `cash` / `bank` (inactive ones go to `inactive`).
- `reason` is `"Opening not verified"` when `openingVerified === false` and the balance is null, otherwise `"Not known yet"` for null.
- **Attention text, exact:**
  - pending: `postingSummaryText(record.summary) + " wasn't confirmed"`
    - cashbook receipt → sheet `money-in`; expense → `money-out`; transfer → `transfer`
    - memberMoney / allocations → screen `held`
    - reversals → screen `entry`
  - attempts: `"1 save needs checking"` / `"N saves need checking"` → `manage-attempts`
  - proposal: `"Opening balances are waiting for verification"` → `manage-opening`
  - blockers: `"Books can't record entries right now"` → `manage-status`

**Components:**
- **`BalanceTiles`** (props: `organisationId`, `status`, `accounts`):
  - `useLedgerBalances(organisationId, todayInLagos(), enabled)`, enabled only for `active` / `suspended` states.
  - `SimpleGrid columns={{ base: 1, sm: 2 }}`, but the 2-column switch is at **360px**: use `templateColumns="repeat(auto-fill, minmax(150px, 1fr))"`.
  - Tile: uppercase type label `fg.muted` `xs`, name `md`, amount `2xl` semibold `tabular-nums`.
  - "Inactive accounts (n)" is a `NavRow` that toggles an inline list.
  - Total row label: `"Total in cash and bank"`, or `"Total in cash and bank (includes inactive accounts)"`.
  - Held row `"Held for members"` → `go("held")`.
- **`ThisMonth`:** `useLedgerSummary(org, from, to, enabled)`, showing `Income` and `Expenses` totals. Unknown state → `"Not known yet"`. Whole card is a button → `go("reports")`.
- **`RecentTransactions`:** `useLedgerJournalPages(org, EMPTY_JOURNAL_FILTERS, enabled, 5)`, first page only. "See all" → `go("transactions")`. Row → `go("entry", id)`.
- **`BooksStateCard`:** copy per spec §6 table (not set up, setup, pending verification, suspended), with actions to `manage-setup` / `manage-opening` / `manage-status`. Owner check: `useGlobalStore(s => s.organisation.isOwner)`.
- **`BackRow`:** a `Button variant="ghost"` "‹ Books" / "‹ Manage Books", min 44px. On navigation, focus the screen `h2` (pass a ref).

- [ ] **Step 1: Failing tests**
  - `booksOverview.test.ts`:
    - unknown balance → tile `balanceKobo: null`, reason `"Opening not verified"`
    - an inactive bank with ₦2,000 → in `inactive` and `totalIncludesInactive: true`
    - `memberReceiptsOn: false` → `heldKobo` undefined
    - the `attentionItems` mapping for each source (exact text and target above)
    - `monthToDate`
  - `BalanceTiles.test.tsx`: renders `"Unknown"`, never `"₦0"`, for a null balance. Renders the server total exactly, even when it differs from the sum of the tiles (fixture: tiles 73,000 + 95,000, total 170,000 → shows `₦170,000`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(finance): Books overview building blocks`.

### Task 4: Lift the cashbook posting workflow; posting sheet

**Files:**
- Create: `src/hooks/useCashbookPostings.ts`, `src/components/finance/books/PostingSheet.tsx` (+ `PostingSheet.test.tsx`)
- Modify: `src/components/finance/postings/CashbookPostingsPanel.tsx` (use the hook; rendering unchanged so its tests keep passing)

**Interfaces (produces):**
```ts
export const useCashbookPostings: (args: { organisationId: string; status: LedgerStatus;
  accounts: LedgerAccount[] | null; onRecheckLedger?: () => void }) => {
  workflow: ReturnType<typeof usePostingWorkflow<"receipt" | "expense" | "transfer">>;
  intentRead: LedgerPostingIntentRead; hasIntent: boolean;
  readiness: Readiness; receiptReadiness: Readiness; expenseReadiness: Readiness; transferReadiness: Readiness;
  formProps: Omit<PostingFormProps, never>; canManage: boolean;
};
export const SHEET_VIEW: Record<BooksSheet, "receipt" | "expense" | "transfer">;
// PostingSheet props
{ sheet: BooksSheet | null; postings: ReturnType<typeof useCashbookPostings>;
  shownSections: PostingSection[]; isRechecking: boolean; onClose: () => void;
  onForMember?: () => void /* shown as the "For a member" switch when defined */ }
```

**Behaviour:**
- The sheet is open when `sheet !== null`. On open it calls `workflow.open(SHEET_VIEW[sheet])` unless `workflow.view` already matches.
- Body, in order:
  - `PostingIntentNotice` (section `"cashbook"`)
  - `panelError`
  - `PostingSupersededNotice`
  - the form for the view
- On confirmed success, the sheet shows `PostingReceipt`, whose "Done" closes the sheet.
- On close (Back, X, Cancel): call `workflow.back()` **unless `postings.isPosting`**. Then call `onClose()`.
- While `workflow.success` is set and the sheet is closed, the shell shows `PostingReceipt` at the top of Overview (Task 6).
- Titles:
  - `money-in` → `"Money in"`
  - `money-out` → `"Money out"`
  - `transfer` → `"Transfer between accounts"`
- `onForMember` renders a two-option segmented control `Income | For a member` at the top of the money-in sheet. Choosing "For a member" calls `onForMember`.

- [ ] **Step 1: Failing tests** (`PostingSheet.test.tsx`, mock the posting endpoint as `CashbookPostingsPanel.test.tsx` does)
  - Opening `money-in` shows the receipt form.
  - Closing while `isPosting` (request held unresolved) does not call `workflow.back`. Resolving it then sets `workflow.success`. Assert via a harness component rendering `postings.workflow.success?.result` text `"R-000001"`.
  - With a stored pending intent, opening `money-in` shows the notice's retry button and no form.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Refactor `CashbookPostingsPanel` to call `useCashbookPostings` (no visible change).
- [ ] **Step 4: Run** `PostingSheet.test.tsx` and `CashbookPostingsPanel.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(finance): cashbook postings in a bottom sheet`.

### Task 5: Shorter posting forms

**Files:**
- Modify: `src/components/finance/postings/PostingForms.tsx`
- Create: `src/helpers/booksLastAccount.ts` (+ `.test.ts`), `src/components/finance/postings/AccountChoice.tsx`, `MethodChips.tsx`
- Modify the tests that assert old labels: `CashbookPostingsPanel.test.tsx`, `BooksTab*.test.tsx` (label updates only)

**Interfaces (produces):**
```ts
export const readLastAccount: (organisationId: string, operation: "receipt" | "expense" | "transfer-from") => string | null;
export const writeLastAccount: (organisationId: string, operation: ..., accountId: string) => void; // key `presence-pro:books-last-account:<org>:<operation>`, try/catch, never throws
export const defaultMethodFor: (account: LedgerAccount | undefined) => PostingMethod; // subtype "bank" → "bank_transfer", else "cash"
<AccountChoice label accounts={postingMoneyAccounts(accounts)} value onChange /> // ≤3: radio cards (role="radio", 44px+, name + type); >3: OptionSelect
<MethodChips value onChange />  // Cash · Bank transfer · POS · More (More opens OptionSelect of the rest)
```

**Form changes:**
- Field order: Amount, account, category/to, Method, Date, then From/Paid to.
- Everything else goes behind an "Add details" `Button variant="ghost"` (`aria-expanded`). The section auto-opens if any of its values are non-empty, or if validation reports an issue in it.

| Form | Main fields | Behind "Add details" |
|---|---|---|
| Receipt | Amount · Into · Category · Method · Date · Received from | External ref · Evidence ref · Reference · Note |
| Expense | Amount · Paid from · Category · Paid to (required) · Method · Date | External ref · Evidence ref · Reference · Note |
| Transfer | Amount · From · To · Method · Date | External ref · Reference · Note |

- **Account default:**
  - only one account → that one
  - otherwise `readLastAccount` if it's still in the list
  - otherwise none (`""`)
  - Save writes `writeLastAccount` after a confirmed submit. Transfer uses `transfer-from`.
- **Method:** starts at `defaultMethodFor(selected account)` and follows account changes until the officer picks a method. Track `methodTouched`.
- **Labels:**
  - "Post receipt" → "Record money in"
  - "Post expense" → "Record money out"
  - "Post transfer" → "Record transfer"
  - "Money received into" → "Into"
  - "Business date" → "Date"
- Drop the long intro paragraph. Keep one line: "This never marks dues or levies as paid."
- Draft bodies, validation and `summary` are unchanged.

- [ ] **Step 1: Failing tests**
  - `booksLastAccount.test.ts`: round trip; storage that throws returns null and never throws.
  - Add to `CashbookPostingsPanel.test.tsx`:
    - with one cash and one bank account, choosing the bank card sets the method to "Bank transfer"; then choosing "Cash" chip and switching back to the cash card keeps "Cash"
    - "External reference" is not visible until "Add details" is pressed
    - the submitted body is identical to today's for the same inputs (reuse an existing body assertion)
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement**, and update the label assertions in the existing tests.
- [ ] **Step 4: Run** the finance postings tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(finance): shorter Money in, Money out and Transfer forms`.

### Task 6: Books shell, screens and Manage Books

**Files:**
- Rewrite: `src/components/finance/BooksTab.tsx`
- Create: `src/components/finance/books/BooksOverview.tsx`, `BooksTransactions.tsx`, `ManageBooks.tsx`
- Modify:
  - `src/components/finance/postings/MemberMoneyPanel.tsx`: add prop `startReceipt?: number`. A nonce: when it changes and the panel can start, call `workflow.open("member_receipt")`.
  - `src/pages/Finance.tsx`: pass nothing new. BooksTab reads nav itself.
- Rewrite tests: `BooksTab.test.tsx`, `BooksTabAllGates.test.tsx`, `BooksTabF3.test.tsx`, `BooksTabSetupGate.test.tsx` (render inside `MemoryRouter initialEntries={["/finance?tab=books"]}`)

**Shell rules:**
- **Status handling:** status loading, error, unavailable and `unknown` handling stays exactly as today, before any screen renders.
- **Mounting:** every screen is wrapped in `<Box hidden={screen !== X}>` and always mounted.

| Screen | Contents |
|---|---|
| `overview` | `BooksStateCard` (non-active states) **or** `BalanceTiles` + actions + `NeedsAttention` + `ThisMonth` + `RecentTransactions`, then `NavRow`s "Reports" and "Manage Books" |
| `transactions` | chips (`typeChips` from `status.memberReceiptsEnabled === true` and `status.allocationsEnabled === true` and the gates), a "Filter" button opening a `FinanceSheet` with account `OptionSelect` and two `DateField`s, the list, a footer that reads "Load more" while `hasMore` and "That's everything for these filters" otherwise |
| `reports` | `LedgerReportsPanel` (gate) |
| `held` | `MemberMoneyPanel` + `AllocationPanel` (their gates; screen hidden from nav when `memberReceiptsEnabled !== true`) |
| `entry` | `ReversalsPanel` with `openJournalId={location.journalId}`, `onCloseJournal={nav.close}`, `onOpenJournal={id => nav.go("entry", id)}` |
| `manage` | `NavRow` list: "Books status & history", "Setup & accounts", "Opening balances", "Reconciliation", "Unconfirmed saves" (manage only), each with its one-line state |
| `manage-status` | `LedgerLifecyclePanel` (gate) |
| `manage-setup` | `LedgerSetupPanel` (gate), or today's `AccountsSection` when that gate is off |
| `manage-opening` | `OpeningBalancesPanel` (gate) |
| `manage-reconciliation` | `ReconciliationPanel` (gate) |
| `manage-attempts` | `UnconfirmedAttemptsPanel` (gate, `finance.manage`) |

- **Actions (manage only):**
  - "Money in" / "Money out": two 56px buttons, `SimpleGrid columns={2}`, `variant="outline"`, with `LuArrowDownLeft` / `LuArrowUpRight` icons (or the repo's icon set) and text.
  - "Transfer between accounts": 44px full-width outline button.
  - Disabled with the readiness reason in one `fg.muted` line when not ready.
- **Wiring:**
  - Actions call `nav.openSheet`. `PostingSheet` receives `nav.location.sheet`.
  - `onForMember` is defined only when `LEDGER_MEMBER_MONEY_UI_ENABLED && status.memberReceiptsEnabled === true`. It does `nav.go("held")` and bumps `startReceipt`.
- **Availability:** a computed `available(screen)` uses the same gate/permission expressions as today's BooksTab, plus the `held` and `manage-attempts` rules. An effect calls `nav.replace(BOOKS_HOME)` when `!available(location.screen)`.
- **Cross-links:**
  - Reconciliation `onAllocate` → `setAllocationStart(...)` + `nav.go("held")`.
  - Allocation `onViewHistory` → `setReconciliationFocus(...)` + `nav.go("manage-reconciliation")`.
  - `UnconfirmedAttemptsPanel onOpenJournal` and journal links → `nav.go("entry", id)`.
- **Shown sections:** `shownPostingSections` stays computed from the gates, unchanged. Every panel stays mounted, so exactly one retry place exists as today.
- **Receipt on Overview:** when `postings.workflow.success` is set and `location.sheet === null`, Overview shows `PostingReceipt` at the top.
- **Removed:** the old flat `JournalsSection` list and the duplicated status header. The state chip appears only on non-active states.

- [ ] **Step 1: Rewrite the BooksTab tests first** (failing). Cover:
  - each screen reachable via its `NavRow`, and Back returns (`nav.close`)
  - every gate off → only today's read-only content (accounts list on `manage-setup`, the Transactions list)
  - viewer: no Money in/out/Transfer, no "Unconfirmed saves" row
  - owner and manager: the actions are present
  - `?books=manage-attempts` as a viewer → replaced with Overview
  - `org=o1` in the URL while rendering org `o2` → Overview, and no request for o1
  - a stored pending receipt intent → exactly one button named "Retry" in the whole document (including hidden screens, `{ hidden: true }`), and a Needs attention item that opens the money-in sheet
  - with Member Receipts off, no "Held for members" anywhere and no "For a member" switch
  - every gate on (port the `BooksTabAllGates` assertions: rendering never writes, the viewer gets no write controls, an org switch reads only the new org)
- [ ] **Step 2: Run** `CI=true yarn test --watchAll=false src/components/finance/BooksTab`. Expected: FAIL.
- [ ] **Step 3: Implement** the shell, `BooksOverview`, `BooksTransactions`, `ManageBooks` and the `MemberMoneyPanel` prop.
- [ ] **Step 4: Run** all finance tests: `CI=true yarn test --watchAll=false src/components/finance src/pages/Finance`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(finance): Books overview, transactions and Manage Books screens`.

### Task 7: Copy fixes

**Files:** `src/helpers/ledger.ts:283-311`, `src/helpers/ledgerLifecycle.ts:120` (+ the tests that assert these strings)

- [ ] **Remove** "balances are not calculated here" from every state note. New active notes:
  - `"Bookkeeping is active."`
  - `"Bookkeeping is active, but opening balances have not been verified."`
  - Other states keep their first sentence(s), minus that clause.
- [ ] **Add** the audit label `member_allocations_enabled: "Allocations turned on"` and `member_allocations_disabled: "Allocations turned off"`.
- [ ] **Update** the string assertions. Run `CI=true yarn test --watchAll=false src/helpers src/components/finance`. Expected: PASS.
- [ ] **Commit:** `fix(finance): current Books status wording and allocation audit labels`.

### Task 8: Verification and PR

- [ ] Run `nvm use`. Record Node and Yarn versions. Then:
  - the full suite: `CI=true yarn test --watchAll=false`
  - `npx tsc --noEmit`
  - `npx eslint` on every changed file
  - `CI=true yarn build`, comparing warnings to the staging baseline
- [ ] **Browser check** on the local backend, after confirming the login hits the local API (see the browser-checks memory):
  - widths: 320 / 360 / 390 / 430, light and dark
  - roles: owner / manager / viewer
  - ledger states: not set up, setup, pending verification, active, suspended
  - Member Receipts on and off
  - journeys: Money in, Money out, Transfer, For a member, undo an entry
  - every Manage row
  - Back/Forward through screens, a sheet and an entry
  - an org switch followed by Back
  - Save screenshots to `docs/books-redesign-evidence/` (git-excluded).
- [ ] Push and open a PR to `staging` with the AGENTS.md §75 sections. Stop there: no merge, no deploy.

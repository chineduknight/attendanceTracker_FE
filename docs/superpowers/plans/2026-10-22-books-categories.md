# Books Categories & Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "Setup & accounts" account management with a **Categories & Accounts** screen (Expenses · Income · Cash & bank tabs), let a finance manager add a category from inside Money in / Money out even when none exists, and simplify first-time setup without duplicating accounts a backend now creates for us.

**Architecture:** One pure helper module groups accounts, detects retired-name matches and computes what is missing. A Categories & Accounts Books screen and the Setup panel share one write hook built on the existing durable ledger writes (`useLedgerSetup`), and one notice for unconfirmed changes. The generic Type/Subtype form and `LedgerChartOfAccounts` are removed.

**Tech Stack:** CRA + React 18 + TS, Chakra UI v3, TanStack Query v4, React Router 6.3, Jest/RTL. Node 22, Yarn 1.22.22.

**Spec:** `docs/superpowers/specs/2026-10-22-books-categories-design.md` (approved 22 Oct, corrections approved 22 Oct). Backend note: `docs/books-accounts-backend-note.md` — the backend agent implements it separately; **no backend change is made in this repository**.

## Global Constraints

- Branch `feat/books-categories` from `staging` d2c4caa. PR into `staging`. **No merge or deploy without approval.**
- **Frontend only:** no API, request-body or endpoint change. Writes are `POST /ledger/accounts { accounts: [...] }` and `PATCH /ledger/accounts/:id { expectedRevision, name? | active? }`.
- **Every write goes through `useLedgerSetup`** (durable marker before send; latch on unknown outcome). No direct `postRequest` and no optimistic writes.
- **No accounting words in copy treasurers must act on:** asset, equity, liability, subtype, "chart of accounts". The read-only Bookkeeping section may name each account's purpose in plain words.
- **User-facing words:** "Retire" / "Restore" for deactivate / reactivate. No delete anywhere.
- **Screen name:** "Categories & Accounts". Tabs, in order: **Expenses**, **Income**, **Cash & bank**. Default tab Expenses; tabs are local state, never history.
- **Suggested categories:** Income: Donations, Offerings, Other income. Expenses: Transport, Utilities, Other expenses. None ticked.
- **Money in / Money out** open for a finance manager regardless of whether a category exists. Posting is blocked by the form's own validation until a category is selected.
- **Retired matches are restored, never duplicated.** This applies on the Categories & Accounts screen, in the inline "+ New category" row, and to setup suggestions.
- **Setup reloads accounts before deciding what is missing**, after `startSetup` and after member receipts are enabled. It must never duplicate accounts the backend already created. A failed reload creates nothing.
- **Recovery path:** whenever a required bookkeeping account is still missing, Setup shows "Finish setup: some bookkeeping accounts are missing" with **Create them** (managers, not frozen, not write-blocked).
- **Auto-created names:** `Cash in hand`, `Opening balance equity`, `Member money – unallocated`. On a clash with an active account, add ` (Books)`, then ` (Books 2)`, and so on.
- **Bank metadata is out of scope:** `bankName` and `accountNumberLast4` are captured when a bank account is added and shown read-only. Rename sends only `name`.
- **Invariants to preserve:** `finance.manage` for every write; durable write uncertainty latch; organisation-scoped query keys and requests; `expectedRevision` on every PATCH; F3 allocations behaviour untouched.
- **Chakra v3 and project UI rules (AGENTS.md §52–53):**
  - themed-select only; `FinanceSheet` for sheets; `useConfirm` for confirmations;
  - 44px tap targets; semantic tokens; light and dark.
- Write files with bash heredocs (owner's global preference).

## Review Focus

1. **A backend that already auto-creates** (backend note changes 2–3). After setup, Books must **reload accounts before** computing what's missing, or it would POST duplicates and get a 409.
   - Test: reload returns cash + equity → no POST. Reload returns cash but not the holding account with receipts on → only the holding account is posted.
2. **The unconfirmed-change latch** must block writes on Setup, Categories & Accounts **and** the inline add alike, and recheck/acknowledge must work from Categories & Accounts.
   - Test: latch set elsewhere → Add is disabled and the inline link is disabled.
3. **Retired name matches.** Adding "Transport" while a retired Transport exists offers **Restore** (PATCH `active: true`) instead of POSTing a duplicate. An active name match is refused client-side before sending. Suggested categories follow the same rule.
4. **Legacy money accounts:** an org with two active cash accounts shows both and no "Add Cash in hand"; an org with none shows the fallback.
5. **No-category posting:** Money in/out open for a manager with zero categories; the form shows "+ New category"; submitting without a category is refused and sends no journal.
6. **States:**
   - viewer: no write controls anywhere;
   - suspended: Rename only, no Add or Retire;
   - pending verification: categories can still be added, but Add bank / Add cash are blocked with the existing note.
7. **F3 untouched:** dues/levy income accounts are never categories, stay out of Income, and are not retireable while allocations are on.

---

### Task 1: Category helpers

**Files:**
- Create: `src/helpers/booksCategories.ts`
- Test: `src/helpers/booksCategories.test.ts`

**Interfaces:**
- Consumes: `LedgerAccount`, `LedgerStatus` (`components/finance/ledgerTypes`); `accountNameKey`, `CreateAccountPayload`, `toAccountRole` (`helpers/ledgerSetup`); `ledgerStateKey` (`helpers/ledger`).
- Produces:
  - `type CategoryKind = "income" | "expense"`
  - `interface AccountGroups { income; expense; retiredIncome; retiredExpense; cash; bank; retiredMoney; bookkeeping: LedgerAccount[] }`
  - `groupAccounts(accounts: readonly LedgerAccount[]): AccountGroups`
    - categories: `class` income/expense with `subtype === null`; A–Z by name;
    - `bookkeeping`: equity, liability, `member_dues_income` / `member_levy_income`, and any role this build does not recognise (nothing is hidden);
    - active = `active === true`; `retired*` = `active !== true`;
    - `cash` / `bank` split on `subtype`.
  - `SUGGESTED_CATEGORIES: readonly SuggestedCategory[]` (the six above, with a stable local `key`).
  - `type SuggestionState = { kind: "create"; suggestion } | { kind: "restore"; suggestion; account }`
  - `suggestedCategoryStates(accounts): SuggestionState[]`
    - omits a suggestion whose name matches an **active** account (any kind);
    - returns `restore` when the only match is a retired account of the **same** kind;
    - otherwise `create` (a retired other-kind name may be reused).
  - `freeName(base: string, accounts): string`: `base`, else `base (Books)`, `base (Books 2)`, … against active names.
  - `missingBookkeepingAccounts(status: LedgerStatus, accounts: readonly LedgerAccount[]): CreateAccountPayload[]`
    - adds cash if no active `asset/cash`;
    - adds equity if no active `opening_balance_equity`;
    - adds the holding account if `status.memberReceiptsEnabled === true` and no active `member_receipts_unallocated`;
    - order: cash, equity, holding; names via `freeName`.
  - `type CategoryNameCheck = { kind: "ok"; name: string } | { kind: "issue"; message: string } | { kind: "retired"; account: LedgerAccount }`
  - `checkCategoryName(raw: string, kind: CategoryKind, accounts): CategoryNameCheck`
    - trims; empty → issue `"Enter a name."`;
    - over 80 chars → issue `"Use 80 characters or fewer."`;
    - any **active** account with the same name key → issue `"${name}" is already in use.`;
    - a retired category of the same kind with that key → `{ kind: "retired", account }`.

- [ ] **Step 1: Write the failing tests** in `booksCategories.test.ts`:
  - `groupAccounts` puts Donations (income, null) in `income`, Dues income (`member_dues_income`) in `bookkeeping`, Cash/Bank in `cash`/`bank`, an inactive Transport in `retiredExpense`; lists sort A–Z.
  - `suggestedCategoryStates` omits "Donations" when an active "Donations" exists; keeps a suggestion whose only match is retired, as `restore`; a retired **other-kind** match stays `create`.
  - `missingBookkeepingAccounts`:
    - returns `[]` when cash, equity and (receipts on) holding are active;
    - returns cash + equity for an empty list with receipts off;
    - returns all three with receipts on;
    - names the cash `"Cash in hand (Books)"` when an active expense is called "Cash in hand", and `" (Books 2)"` when that is taken too;
    - payloads equal `{ name, class, subtype }` with no bank fields.
  - `checkCategoryName`: the empty, 81-char, active-duplicate (case/space-insensitive), retired-same-kind → `retired`, and retired-other-kind → `ok` cases.
- [ ] **Step 2:** Run `CI=true yarn test --watchAll=false src/helpers/booksCategories.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `src/helpers/booksCategories.ts`.
- [ ] **Step 4:** Rerun. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(finance): helpers for Books categories and bookkeeping accounts`.

### Task 2: Created accounts reach the caller; one write hook and one notice

**Files:**
- Modify: `src/hooks/useLedgerSetup.ts` (`createAccounts` `onSuccess` receives the created accounts; `updateAccount` callbacks unchanged)
- Create: `src/hooks/useAccountWrites.ts`
- Create: `src/components/finance/LedgerWriteNotices.tsx`: move `WriteUncertaintyNotice`, `PendingWriteNotice` and `AlertBox` out of `LedgerSetupPanel.tsx`, with behaviour unchanged.
- Modify: `src/components/finance/LedgerSetupPanel.tsx` (import them)
- Test: `src/hooks/useAccountWrites.test.tsx`

**Interfaces:**
- Produces:
  - `useLedgerSetup().createAccounts(accounts, { onSuccess?: (created: LedgerAccount[] | null) => void, onError? })`. `created` is `toLedgerAccounts(response?.data?.accounts)`. Existing callers ignore the argument.
  - `useAccountWrites(organisationId)` → `{ create(payloads, onDone?: (created: LedgerAccount[] | null) => void), rename(account, name, onDone?), setActive(account, active, onDone?), error: string | null, clearError(), isSaving: boolean, blocked: boolean }`
    - `blocked` = `useLedgerWriteUncertainty(org).uncertainty !== null`;
    - every method is a no-op while `blocked`, or when `account.revision === null` (rename/setActive);
    - failure classification is copied from `LedgerChartOfAccounts.handleFailure`:
      - `LedgerWriteNotSentError`: "blocked" → "An earlier ledger change is still waiting to be confirmed, so nothing was sent."; otherwise the storage message;
      - unknown outcome → `error` null (the latch owns it);
      - else the server message, or "The change wasn't saved. Try again.".
    - `setActive` is the restore path too: `setActive(account, true)` PATCHes `{ expectedRevision, active: true }`.
  - `LedgerWriteNotices`: `{ organisationId, canManage, onRecheckLedger?, onRetryAccounts, isRechecking }`. Renders the pending or uncertainty notice exactly as the Setup panel did, including the `requireAllocations` / `allowInitialSetup` recheck options.

- [ ] **Step 1: Failing tests** in `useAccountWrites.test.tsx` (`renderHook` with a QueryClientProvider; `services/api` mocked as in `LedgerSetupPanel.test.tsx`):
  - `create` POSTs `/finance/org1/ledger/accounts` with `{ accounts: [payload] }` and calls `onDone` with the parsed created account;
  - `rename` PATCHes `{ expectedRevision: 3, name: "Fuel" }`;
  - `setActive(false)` PATCHes `{ expectedRevision: 3, active: false }`; `setActive(true)` PATCHes `active: true`;
  - a 409 sets `error` to the server's message;
  - an `ERR_NETWORK` rejection leaves `error` null and makes `blocked` true;
  - with a latch already stored (`markLedgerWriteUncertain`), `create` sends nothing.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement the hook and the `useLedgerSetup` change; move the notices with no behaviour change.
- [ ] **Step 4:** Run `useAccountWrites.test.tsx` plus `LedgerSetupPanel.test.tsx` and `LedgerSetupPanelAllocations.test.tsx`. Expected: all PASS.
- [ ] **Step 5:** Commit: `refactor(finance): shared account writes and ledger write notices`.

### Task 3: The Categories & Accounts screen

**Files:**
- Create: `src/components/finance/categories/CategoriesScreen.tsx` (tabs, lists, bookkeeping section)
- Create: `src/components/finance/categories/CategorySheets.tsx`: `AddCategorySheet`, `AddMoneyAccountSheet` (bank, or cash fallback), `AccountActionsSheet` (Rename, Retire/Restore)
- Test: `src/components/finance/categories/CategoriesScreen.test.tsx`

**Interfaces:**
- Consumes: Task 1 helpers; Task 2 `useAccountWrites` and `LedgerWriteNotices`; `accountActions`, `activeSingletonSubtypes`, `canCreateAccounts`, `moneyAccountsFrozen`, `OPENING_PENDING_CREATE_NOTE`, `SUSPENDED_CREATE_NOTE` (`helpers/ledgerSetup`); `FinanceSheet`; `useConfirm`.
- Produces: `CategoriesScreen({ organisationId, status, accounts, accountsError, accountsUnreadable, onRetryAccounts, isRetryingAccounts, onRecheckLedger? })`.

**Behaviour:**

- **Tabs:** a segmented `role="tablist"` (Chakra `Tabs`) with **Expenses** (default), **Income**, **Cash & bank**; each label carries its active count, e.g. "Expenses 4".
- **Rows:** each is a button opening `AccountActionsSheet`, whose actions come from `accountActions(...)`.
  - Retire asks first: `useConfirm`, title `Retire ${name}?`, body "It won't be offered for new entries. Past entries keep it. You can restore it later.", confirm label "Retire", destructive.
  - Restore sends without a confirmation.
  - The sheet has a Rename name field + Save; a 409 shows the server's message and the list reloads through the durable write.
- **Add:**
  - Add category: `Add expense category` / `Add income category`, managers only, disabled while `blocked` or when `canCreateAccounts` is false.
  - The sheet uses `checkCategoryName`; a `retired` result shows "A retired category has this name." with a **Restore** button (PATCH `active: true`), never a create.
  - Adding one sends `{ accounts: [{ name, class, subtype: null }] }`.
- **Cash & bank:**
  - Cash rows, then bank rows ("Bank · ****1234" caption; bank name read-only).
  - **Add bank account** sheet: Account name, Bank (optional), Last 4 digits (optional, exactly 4 digits).
  - **Add Cash in hand** only when there's no active cash account.
  - Both disabled with `OPENING_PENDING_CREATE_NOTE` when `moneyAccountsFrozen(status)`.
- **Retired:** "Retired (n)" disclosure under each tab's list; retired money accounts under Cash & bank.
- **Bookkeeping accounts (managed for you):** a collapsed disclosure at the bottom, read-only, one plain line per account:
  - equity: "Balances the opening count.";
  - holding: "Money held for members until it is allocated.";
  - dues/levy income: "Income recorded when member money is allocated.";
  - an unrecognised role: "This account type isn't recognised by this app version." (still shown, no actions).
- **Notices:** `LedgerWriteNotices` at the top; `useAccountWrites().error` in an `AlertBox`.
- **Loading and errors:** loading, error (`ErrorState` with retry) and unreadable states, as in the old chart.

- [ ] **Step 1: Failing tests** (pattern: `LedgerSetupPanel.test.tsx` mocks and `statusOf` / `account` builders):
  - `"opens on Expenses and lists only that kind, A–Z"`
  - `"switches to Income and Cash & bank with counts"`
  - `"keeps dues and levy income out of Income and lists them under Bookkeeping accounts"`
  - `"adds an expense category with a name only"`: POST body `{ accounts: [{ name: "Fuel", class: "expense", subtype: null }] }`
  - `"refuses an active duplicate before sending"` (no POST, message shown)
  - `"offers Restore for a retired category with the same name"`: PATCH `{ expectedRevision, active: true }`, no POST
  - `"renames with the account's revision"`; `"retires only after confirmation and never deletes"` (`api.delete` never called)
  - `"shows a bank account's bank and last four and adds one"`: POST `{ class: "asset", subtype: "bank", bankName, accountNumberLast4 }`; no control edits bank metadata afterwards
  - `"offers Add Cash in hand only when no active cash account exists"`; `"lists two legacy cash accounts without an add"`
  - `"blocks money accounts while opening balances await verification"`
  - `"allows rename only while suspended"`
  - `"gives a viewer the lists and no buttons"`
  - `"disables every write while a ledger change is unconfirmed, and recovers after recheck"` (seed with `markLedgerWriteUncertain`)
  - `"shows the server's message when a rename is refused"` (409)
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(finance): Categories & Accounts screen`.

### Task 4: Categories & Accounts in Books navigation; Setup renamed

**Files:**
- Modify: `src/helpers/booksNavigation.ts` (`BOOKS_SCREENS` gains `"manage-categories"`)
- Modify: `src/components/finance/BooksTab.tsx`:
  - `TITLES["manage-categories"] = "Categories & Accounts"`;
  - `TITLES["manage-setup"] = "Setup"`;
  - Manage rows in this order: Categories & Accounts (caption "Income, expenses, cash & bank") first, then Books status & history, Setup, then the rest;
  - `available("manage-categories") = LEDGER_SETUP_UI_ENABLED`;
  - mount `CategoriesScreen` with the same props and recheck callback as Setup.
- Tests: `src/helpers/booksNavigation.test.ts`, `src/components/finance/BooksShell.test.tsx`, and every test that clicks "Setup & accounts" (`grep -rln "Setup & accounts" src`).

- [ ] **Step 1: Failing tests:**
  - booksNavigation accepts `books=manage-categories` and `parentOf` returns manage;
  - BooksShell `"opens Categories & Accounts first in Manage Books, and Back returns to Manage Books"` (row order asserted by `getAllByRole("button")` names inside the Manage group).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. Rename "Setup & accounts" → "Setup" in the source and in the test files grep finds.
- [ ] **Step 4:** Run the Books, Finance and booksNavigation tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(finance): Categories & Accounts first in Manage Books`.

### Task 5: Setup without the account form

**Files:**
- Modify: `src/helpers/ledgerSetup.ts`
  - `ledgerSetupSteps` steps become `started`, `cash`, `bank`, `categories`, `activation`;
  - `SetupStepStatus` gains `"optional"`, used by bank/categories when there are none yet (never "current");
  - remove `STARTER_ACCOUNTS`, `starterAccountsFor` and `draftFromStarter` once nothing uses them (`grep` first).
- Modify: `src/components/finance/LedgerSetupPanel.tsx`:
  - drop `LedgerChartOfAccounts`;
  - add an inline Add bank account (reuses `AddMoneyAccountSheet`);
  - add a "Suggested categories" picker: checkboxes, **none ticked**, "Add selected (n)" → one `create` batch; a retired suggestion shows **Restore** instead of a checkbox;
  - auto-create bookkeeping accounts after reloading;
  - a recovery step when something is still missing.
  - New prop: `reloadAccounts: () => Promise<LedgerAccount[] | null>`. BooksTab passes `async () => toLedgerAccounts((await accountsQuery.refetch()).data?.data)`.
- Delete: `src/components/finance/LedgerChartOfAccounts.tsx`.
- Tests: `src/helpers/ledgerSetup.test.ts`, `src/components/finance/LedgerSetupPanel.test.tsx`. Move the row/latch/scope tests that still apply into Task 3's test file; delete the tests of the removed generic form.

**Auto-create rules:**

- After `startSetup` succeeds, and after `enableMemberReceipts` succeeds: `const fresh = await reloadAccounts()`. If `fresh !== null` and `missingBookkeepingAccounts(nextStatus ?? status, fresh)` is non-empty, `create(missing)` once.
- A failed reload (`fresh === null`) creates nothing; the recovery step remains.
- Guard with a ref so one screen never sends the same auto-create twice while it awaits.
- The "Cash in hand" step:
  - done when an active cash account exists;
  - otherwise, for managers, "Finish setup: some bookkeeping accounts are missing." with **Create them** (same reload-then-create path);
  - while `moneyAccountsFrozen`, the step explains instead of offering the button;
  - hidden once the ledger is active and nothing is missing.

- [ ] **Step 1: Failing tests:**
  - `"start creates the missing bookkeeping accounts in one request after reloading"`: reload returns `[]`, so one POST with cash + equity; with receipts on, three;
  - `"sends nothing when the backend already created them"`: reload returns cash + equity (receipts off), so no POST;
  - `"sends only the holding account when the backend created cash and equity"` (receipts on, reload lacks holding);
  - `"creates nothing when the reload fails"`;
  - `"offers Create them when a bookkeeping account is missing"`, and the button reloads before creating;
  - `"turning member receipts on adds the holding account only when it is missing"`;
  - `"suggests categories unticked and adds the chosen ones in one request"`;
  - `"hides suggestions that already exist"`; `"offers Restore for a retired suggestion"`;
  - `"no Type or Subtype control anywhere in Setup"`;
  - steps: `ledgerSetupSteps` returns the five keys; bank/categories show `optional` until one exists.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement and migrate the tests.
- [ ] **Step 4:** Run the setup, allocations, categories and Books tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(finance): simpler first-time setup; account form removed`.

### Task 6: "+ New category" inside Money in / Money out; no-category access

**Files:**
- Create: `src/components/finance/postings/NewCategoryInline.tsx`
- Modify: `src/components/finance/postings/PostingForms.tsx`
  - Receipt and Expense forms render it under Category when `canAddCategory`;
  - `SelectField` gets `searchable={options.length > 8}`;
  - keep the just-created (or restored) category in the options until `accounts` include it.
- Modify: `src/hooks/useCashbookPostings.ts` (`formProps.canAddCategory = LEDGER_SETUP_UI_ENABLED && canCreateAccounts(status, canManage)`)
- Modify: `src/components/finance/BooksTab.tsx` (Money in/out buttons no longer depend on a category existing; the note explains the in-form add)
- Modify: `src/helpers/ledgerPostings.ts` (readiness reasons now say a category can be added inside the form)
- Test: `src/components/finance/postings/NewCategoryInline.test.tsx`; extend `src/components/finance/postings/CashbookPostingsPanel.test.tsx`

**Interfaces:**
- `NewCategoryInline({ organisationId, kind, accounts, onCreated: (account: LedgerAccount) => void })`
  - collapsed: a "+ New category" button;
  - expanded: a Name field and an Add button;
  - uses `checkCategoryName` and `useAccountWrites`;
  - a retired match shows a Restore button;
  - an unknown outcome shows "We couldn't confirm the new category. Check Categories & Accounts before trying again.";
  - disabled while `blocked`.
- `PostingFormProps.canAddCategory?: boolean`.

- [ ] **Step 1: Failing tests:**
  - `"creates a category and selects it, keeping the form's entries"`: amount and the Into card stay set; the Category value becomes the new name; POST `{ accounts: [{ name: "Generator fuel", class: "expense", subtype: null }] }`;
  - `"opens Money out with no expense category and refuses to post until one is chosen"`;
  - `"offers Restore for a retired match"`;
  - `"says when the new category couldn't be confirmed"`;
  - `"is not offered to a viewer or when Books can't take new accounts"` (suspended);
  - `"makes the category list searchable above 8"`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the posting and Books tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(finance): add a category from Money in and Money out`.

### Task 7: Verify, smoke, PR

- [ ] `nvm use`; `CI=true yarn test --watchAll=false` → all pass; `npx tsc --noEmit`; `npx eslint <changed files>`; `CI=true yarn build`.
- [ ] **Local browser smoke** (branch build on :3931 → local backend :2424), as in the earlier smokes:
  - a new throwaway org "ZZ Categories 2026-10-22", owner + `lagosdata.treasurer`;
  - a write allowlist; fictional figures;
  - start setup → bookkeeping accounts auto-created (or created by the backend, with no duplicate); tick 2 suggestions; add a bank;
  - Categories & Accounts tabs: add, rename, retire, restore; bookkeeping section collapsed;
  - Money out with no expense category → + New category → record;
  - 320 / 390 px, light and dark.
- [ ] Push; open a PR into `staging` with the AGENTS.md §75 sections and the backend note linked. No merge.

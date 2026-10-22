# Books: Categories & Accounts, cash & bank, and setup (frontend design)

Date: 2026-10-22. Status: approved by the owner, 22 Oct 2026; corrections approved 22 Oct 2026.
Backend note: `docs/books-accounts-backend-note.md`. This design ships **without** waiting for it and works with today's backend.

## Why

After Books is set up, treasurers come to Manage Books → Setup for one thing: managing **income and expense categories** and their money accounts. Today that means:

- scrolling past the setup steps, member receipts and allocations to reach a single long mixed list of accounts;
- using a "New account" form that asks for a Type (asset, equity, liability, income, expense) and a Subtype.

"Account" reads as "bank account", and asset/equity/liability mean nothing to most officers.

**Success:** a treasurer adds, renames or retires a category in a few taps without seeing an accounting word. When the category they need is missing while recording money, they add it on the spot and the form carries on.

## Corrections approved 22 Oct (second pass)

1. The screen is **Categories & Accounts**, with **Expenses**, **Income** and **Cash & bank** tabs in that order.
2. **Money in / Money out stay open to a finance manager even with no category of that kind.** The form offers **+ New category**; only the posting itself waits until a valid category is selected.
3. A **retired category with the same name** is offered for **Restore** — never duplicated — on the Categories & Accounts screen, inside the posting form and in the setup suggestions.
4. Setup **reloads the account list** after starting setup and after member receipts are turned on, then creates only what is still missing. Accounts the backend creates automatically are recognised, never duplicated.
5. An **older or incomplete setup** keeps a recovery path: a “Finish setup” step with **Create them**, using the same reload-then-create rule.
6. The technical bookkeeping accounts live in a **collapsed, read-only** section.
7. Permissions, posting safety, durable write uncertainty, organisation isolation, account revision checks and F3 allocation behaviour are unchanged.
8. **Bank metadata (bank name, last four digits) is not editable:** the existing update API does not support it. It is captured when a bank account is added and shown read-only afterwards.

## Decisions from the owner (22 Oct)

- Talk about **categories**, not accounts. Adding one asks the type (income or expense) and a name; nothing else.
- Categories get their own place, shown first; **tabs** instead of one long list.
- **One Cash in hand**, never something to deliberate over. **Any number of bank accounts.**
- **One flat level** of categories (no subcategories).
- Treasurers can **add a category from inside Money in / Money out**. There's no automatic "Uncategorized"; the treasurer makes a catch-all such as "Other expenses" if they want one.
- **First-time setup offers a few ready-made categories** to tick.
- The frontend can go first; backend changes follow separately.

## Anti-goals

- No accounting vocabulary (asset, equity, liability, subtype, chart of accounts) in anything a treasurer must read or choose.
- No way to delete a category. Accounts are never deleted; **Retire** hides one from new entries and keeps its history. "Retire" is the user-facing word for the backend's deactivate.
- No loss of today's safety: an unconfirmed ledger change still blocks further changes until rechecked, on every screen that can make one.

## Where things live

Manage Books, in this order:

1. **Categories & Accounts** (new). Caption: "Income, expenses, cash & bank".
2. Books status & history
3. **Setup**, renamed from "Setup & accounts": setup steps, member receipts, allocations.
4. Opening balances
5. Reconciliation
6. Unconfirmed saves

Categories & Accounts is a new Books screen, `books=manage-categories` in the URL, so Back and Forward work as on the other screens.

## The Categories & Accounts screen

Three tabs in a segmented control: **Expenses · Income · Cash & bank**, each with a count.

- The tab is local state, not a history entry. It opens on Expenses, the most common edit.

**Income and Expenses tabs**

- Active categories of that type, A–Z. Income lists only ordinary categories (`class: income`, `subtype: null`); dues and levy income from allocations are not categories.
- Tap a row to open a small sheet:
  - **Rename** (name field + Save);
  - **Retire**, with confirmation: "Retire Transport? It won't be offered for new entries. Past entries keep it. You can restore it later."
- **Add category** button at the top, managers only. A sheet with one Name field; the type comes from the tab. The button reads "Add expense category" or "Add income category".
- **Retired (n)**: collapsed at the bottom, with **Restore** on each row.
- Empty tab: "No expense categories yet", plus the Add button (managers) or "A finance manager can add them" (viewers).

**Cash & bank tab**

- **Cash in hand**: the organisation's one cash account, with Rename. There is no "add cash" while an active cash account exists.
  - Fallback: if none exists (old backend, an earlier setup), show **Add Cash in hand**.
  - Legacy orgs with two or more active cash accounts see all of them and no add.
- **Bank accounts**: name, bank, last four digits. **Add bank account** opens a sheet with Account name, Bank (optional) and Last 4 digits (optional).
  - Bank and last four digits are **shown read-only** after creation: the existing update API does not accept them, so there is no metadata editor.
  - While opening balances are waiting for verification, adding is blocked with the existing explanation.
- Rename and Retire as on the other tabs. The backend refuses to retire an account with money in it; show its message as it comes back.

**Bookkeeping accounts (managed for you)**: a collapsed, read-only section at the very bottom of the screen. It lists opening balance equity, member money held, and dues and levy income from allocations, each with one line saying what it is for.

- No add, rename or retire here.
- It exists so nothing in the books is hidden, and so an auditor can see every account.

**Permissions**

- Viewers see every list and no buttons.
- Suspended books allow Rename only, the same as today's rule.

## Adding a category from Money in / Money out

- **The forms open for a finance manager even when that kind has no category.** The Money in / Money out buttons depend on the ledger and money accounts, not on a category existing. A short line under the form explains that a category can be added there.
- Under the Category field, managers get a **"+ New category"** link. It opens an inline row inside the form: Name field + **Add**.
- On success the new category is created and **selected**, and the inline row closes. Everything already typed in the form stays.
- **Posting is still blocked until a valid category is selected:** the form's own validation refuses to submit without one, exactly as it does for a missing amount.
- The inline row avoids a sheet on top of a sheet on a phone and keeps the form one scroll.
- The Category dropdown becomes searchable once a type has more than 8 categories.

Failure cases:

- **Name taken:** shows the server's message inline. Nothing is selected.
- **Unconfirmed outcome:** the inline row says "We couldn't confirm the new category. Check Categories & Accounts before trying again." The form can still be submitted with an existing category. The usual ledger lock appears in Categories & Accounts and Setup.
- **Retired category with the same name:** an exact (case-insensitive) match offers **Restore <name>** instead of creating a duplicate. A successful restore selects the restored category.

## Setup screen (first-time setup)

Steps, top to bottom:

1. **Start bookkeeping**: the member-receipts switch and the Start button, as today.
2. **Cash in hand**, created for you.
3. **Bank accounts**: optional. "Add bank account", or carry on without.
4. **Categories**: suggested categories, none ticked; the treasurer ticks the ones they want, then "Add selected". Optional.
   - Income: Donations, Offerings, Other income.
   - Expenses: Transport, Utilities, Other expenses.
   - Any that already exist as an **active** account (matched by name, ignoring case) are left out.
   - A suggestion matching a **retired** category of the same kind shows **Restore** on its row instead of a checkbox; restoring never creates a duplicate.
5. **Opening balances and activation**: links to Opening balances, as today.

Member receipts and allocations stay below the steps, unchanged.

**Automatic bookkeeping accounts** (works with today's backend):

- After setup starts, and after member receipts are turned on, Books **reloads the account list first**, then creates only what is still missing, in **one** request:
  - Cash in hand;
  - Opening balance equity;
  - the member money holding account, when member receipts are on.
- Reloading first is what makes this compatible with a backend that creates these accounts inside `POST /ledger/setup` or `PATCH /ledger/settings` (backend note changes 2 and 3): the fresh list already contains them, so the frontend sends nothing and can never duplicate them.
- If such a request fails or can't be confirmed, step 2 reads "Finish setup: some bookkeeping accounts are missing", with a **Create them** button. The usual unconfirmed-change lock applies. This is also the recovery path for an older or incomplete setup where the accounts were never made.
- If the reload itself fails, nothing is created (a partial list would invite duplicates); the recovery step offers the button again after a retry.
- Once backend changes 2–3 ship, nothing is missing and no request is sent.
- Cash can't be created while opening balances await verification. In that state the step explains this instead of offering a button.
- Names: "Cash in hand", "Opening balance equity", "Member money – unallocated". If the name is taken by an active account of another kind, add " (Books)"; if that is taken too, keep adding a number.

**Removed from Setup:** the generic "New account" form (Type + Subtype), the long mixed account list, and the "Add the opening balance equity account" step. Categories and money accounts now live in Categories & Accounts. Dues and levy income accounts are still created from the allocations checklist, as today (F3 unchanged).

**Kept:** gates-off mode (`LEDGER_SETUP_UI_ENABLED` false) still shows the plain read-only account list.

## Safety and state

- Every write uses the existing durable ledger writes (`useAccountWrites`, built on `useLedgerSetup`): the marker is stored before sending, and an unconfirmed outcome latches per organisation.
  - The latch is read from storage, so it blocks writes on Setup, Categories & Accounts **and** the inline "New category" alike.
  - The recheck-and-acknowledge notice appears on whichever of Setup or Categories & Accounts is open.
- Renames and retire/restore send `expectedRevision`. A 409 means "changed elsewhere": reload and show the message.
- Query keys and invalidation are unchanged (`finance.ledger.root(org)`), so Money in/out, Transactions, Reports and Overview pick up new or renamed categories.
- An organisation switch resets everything, as today: the screen is keyed by organisation and every request/query carries its id.
- Nothing writes optimistically; a category only appears after the server confirms it (or the durable write latches).
- Bank metadata is read-only after creation (`bankName`, `accountNumberLast4`); renaming a bank account sends only `name`.

## Testing

- **Helpers:** grouping accounts into categories, cash, bank, bookkeeping and retired; which bookkeeping accounts are missing; name-clash suffix; retired-name detection; suggestion states (create / restore / already exists).
- **Categories & Accounts screen:**
  - manager, viewer and owner;
  - the three tabs, opening on Expenses;
  - states: not set up, setup, pending verification (bank add blocked), active, suspended (rename only);
  - legacy org with two cash accounts; empty tabs; retire and restore; 409 on rename;
  - the bookkeeping section is collapsed and read-only.
- **Inline add:**
  - the form opens with no category at all and posting is refused until one is chosen;
  - creates and selects; keeps the form's entries;
  - name taken; offers Restore for a retired match;
  - unconfirmed outcome latches; viewer sees no link.
- **Setup:**
  - start reloads the accounts and creates the missing ones in one request;
  - a backend that already created them (reload returns cash + equity) gets no request; the same holds for the holding account after receipts are enabled;
  - the failure/recovery step and Create them; a failed reload creates nothing;
  - suggested categories posted as one batch; a retired suggestion offers Restore;
  - turning receipts on adds the holding account only when it is still missing.
- **Back/Forward:** into and out of Categories & Accounts; tab changes add no history.
- **Browser:** 320 / 360 / 390 / 430 px, light and dark; one local write smoke in a throwaway org.

## Not in this change

- Backend changes (separate note). The backend agent creates the accounts; this repository sends no backend patch for it.
- **Editing bank metadata** (bank name, last four digits): the update API does not accept it. It is set when the account is added and shown read-only afterwards.
- Subcategories, icons or colours per category, budgets.
- A hard “one cash account” rule: without backend change 1 it is presentation only (no Add while an active cash account exists; legacy orgs keep both).
- Reports layout. Reports already list categories by name.
- Collect, Obligations and Start dates.

## Builder's calls (owner to check)

1. The inline "+ New category" row instead of a nested picker sheet; search turns on above 8 categories.
2. Categories & Accounts opens on Expenses; tabs are local state, not history.
3. A "Bookkeeping accounts (managed for you)" read-only section, collapsed at the bottom, so nothing is hidden.
4. "Retire / Restore" as the words for deactivate / reactivate.
5. Suggested categories: Donations, Offerings, Other income; Transport, Utilities, Other expenses. None is ticked (owner, 22 Oct).
6. Name clash suffix " (Books)", then " (Books 2)" and so on.

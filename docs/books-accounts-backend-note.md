# Backend changes for the Books accounts redesign

For the backend team. Checked against backend `staging` a74d8b4, 22 Oct 2026.

## Why

Treasurers find the "New account" form confusing: it asks them to choose between asset, equity, liability, income and expense, then a subtype. After setup, what they actually do on that screen is add, rename and retire income and expense **categories**.

The frontend is being redesigned around three plain groups:

- **money accounts**: one cash box plus any number of bank accounts
- **income categories**
- **expense categories**

Bookkeeping accounts (opening balance equity, the member-money holding account, the allocation income accounts) will be created for the officer, never chosen.

Most of this is frontend only. The backend needs two small rules and one automatic step, plus a fourth change for your call.

## Summary

| # | Change | Where | Status |
|---|--------|-------|--------|
| 1 | At most one **active** cash account per organisation | `POST /ledger/accounts`, `PATCH /ledger/accounts/:id` | Needed |
| 2 | Starting setup creates Cash in hand, Opening balance equity and (with receipts on) the member-money holding account | `POST /ledger/setup` | Needed |
| 3 | Turning member receipts on creates the holding account if none is active | `PATCH /ledger/settings` | Needed |
| 4 | Turning allocations on creates the missing dues and levy income accounts instead of refusing | `PATCH /ledger/settings` | Your call |

No request body or response shape changes. Every change is additive; existing ledgers and accounts are not migrated.

## 1. One active cash account (needed)

**Today.** Cash is not limited: `SINGLETON_SUBTYPES` holds only `opening_balance_equity`, `member_receipts_unallocated`, `member_dues_income` and `member_levy_income`. Any number of active `asset/cash` accounts can exist.

**Change.**

- Creating a cash account, or reactivating one, while another cash account is active is refused with `409 LEDGER_ALREADY_EXISTS` and the existing `singletonTaken` message. This applies to the batch check inside one request too.
- Deactivating the cash account stays allowed under the existing guards: zero balance, not in an open opening proposal, not while pending verification.
- **Don't** just add `cash` to `SINGLETON_SUBTYPES`. That list also means "required", so `accountChangeError` would refuse every cash deactivation with `singletonRequired`. Suggestion: split it into "at most one active" (all five subtypes) and "required while the ledger exists" (equity and holding only).
- Bank accounts stay unlimited.

**Existing data.** An organisation that already has two or more active cash accounts keeps them; nothing is deactivated or merged. The rule only stops a new or reactivated one. Please add a count of such organisations to the finance preflight, so we know how many exist.

**Tests.**

- A second create is refused, both singly and in a batch.
- Reactivating a second cash account is refused.
- Deactivating with a zero balance, then creating a new one, works.
- An organisation with two legacy active cash accounts can still rename and post to both.

## 2. Setup creates the bookkeeping accounts (needed)

**Today.** `POST /ledger/setup` creates only the ledger record. The officer then has to add Cash in hand and Opening balance equity, and the holding account if receipts are on, by ticking starter suggestions. Proposing opening balances fails until they do (`equityRequired`, `noMoneyAccount`).

**Change.** Inside the same `runLedgerConfigTransaction` as the ledger insert, also create:

- `Cash in hand`: `asset / cash`, `openingVerified: false` like any new money account
- `Opening balance equity`: `equity / opening_balance_equity`
- `Member money – unallocated`: `liability / member_receipts_unallocated`, only when `memberReceiptsEnabled: true`

Write one `account_created` audit row for each, as `createAccounts` does. Then a dropped connection can never leave a ledger with only some of them.

- **Skip any role that already has an active account.** Organisations can hold legacy F1 accounts from before the ledger record existed.
- **Never fail setup over a name clash.** If an active account of a different role already uses one of these names, choose a free name, for example by adding " (Books)". Tell us what you pick.
- The response stays the status object. The frontend reloads the account list after setup.

**Tests.**

- Setup with receipts off creates two accounts; with receipts on, three.
- A legacy active cash or equity account is reused, not duplicated.
- A name clash still completes setup.
- A refused setup (409 already started) creates nothing.

## 3. Member receipts bring their holding account (needed)

**Today.** Turning receipts on (`PATCH /ledger/settings { memberReceiptsEnabled: true }`, allowed in setup, pending verification and active) does not create the holding account. Until an officer finds it in the starter suggestions, member money can't be recorded. This came up in real use this week.

**Change.** In the same transaction as the setting change (and the F0 snapshot on an active ledger), create `Member money – unallocated` if no active `member_receipts_unallocated` account exists, with its audit row. The skip and name-clash rules are the same as change 2. It isn't a money account, so the pending-verification refusal for money accounts doesn't apply.

**Tests.**

- Enabling in each allowed state leaves exactly one active holding account.
- An inactive holding account: create a new one, or reactivate it? Your choice; tell us which.
- A refusal (revision conflict, suspended, snapshot too large) creates nothing.

## 4. Allocations bring their income accounts (your call)

**Today.** `setMemberAllocations` refuses with `422 REQUIRED_ACCOUNT_MISSING` unless active `member_dues_income` and `member_levy_income` accounts exist. The frontend shows a readiness checklist with buttons to create them first.

**Proposal.** When enabling, create whichever of `Dues income (from allocations)` and `Levy income (from allocations)` is missing, in the same transaction, instead of refusing. Disabling is unchanged. If the F3 RFC needs the explicit step, keep it. The frontend will then keep the checklist and its create buttons, so tell us either way.

## No backend change needed

The redesign uses these as they are:

- **Add a category**, including from inside Money in or Money out: `POST /ledger/accounts` with one `income` or `expense` account, `subtype: null`.
- **Rename, retire and restore a category**: `PATCH /ledger/accounts/:id` with `expectedRevision`. Accounts are never deleted.
- **Suggested categories at setup** (Donations, Offerings, Transport, Utilities, Other income, Other expenses): one batch `POST /ledger/accounts`, well under the 20-per-request limit.
- **Add a bank account**: `POST /ledger/accounts` with `asset / bank`, bank name and last four digits. It's still refused while opening balances await verification.
- **The tabs** (Money accounts, Income, Expense): grouped on the frontend from `class` and `subtype` in `GET /ledger/accounts`.

## Rollout

- **Order:** either. The frontend ships first and works with today's backend.
  - Without change 2, the frontend creates the missing accounts itself right after setup. That's a second request, so it isn't atomic, but anything still missing appears as a "Finish setup" step until it's done.
  - Without change 3, the frontend offers to create the holding account straight after receipts are turned on.
  - Without change 1, "one cash account" is only enforced on screen, which is presentation and not a rule.
  
  Once these changes ship, the frontend's fallbacks simply find nothing left to do.
- **Today's frontend against the new backend:** it hides starter suggestions that already exist, so it won't try to create the accounts setup now makes. If it did, it would get the existing 409.
- **Existing ledgers:** unaffected. Nothing runs against them, and changes 2–4 only act at the moment of setup or a settings change.

## Questions for you

1. Is it fine that the cash account can be deactivated, as long as it has a zero balance, after which a new one may be created?
2. What name do you want when an auto-created account's name is already taken?
3. Change 3: create a new holding account, or reactivate an inactive one?
4. Change 4: yes or no?

---

Prepared from the backend source on `staging` (`ledgerAccountRules.ts`, `LedgerSetupService.ts`, `OpeningBalanceService.ts`) and the product owner's decisions of 22 Oct 2026: one cash box, many banks, flat categories, add a category from Money in and Money out, suggested categories at setup.

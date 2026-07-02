# Finance Section — Design Spec

**Date:** 2026-06-18
**Status:** Approved — ready for implementation planning
**Scope:** Full Finance section (all flows), frontend only. The backend API already exists (see `FinancialModel.md`).

---

## 1. Goal

Add a self-contained **Finance** area to the Presence Pro frontend that lets an org owner:

1. Create and manage financial **obligations** (yearly **dues** and one-off **levies**).
2. Set member **accountability** (`financialStartDate`) — individually and in bulk.
3. **Record** and **correct** payments.
4. View a per-member **compliance** report grid with summary + Excel/PDF export.

This is purely a frontend build against the existing API documented in `FinancialModel.md`.

---

## 2. Architecture & Navigation

- Add a new protected path `FINANCE: "/finance"` to [`src/routes/pagePath.ts`](../../../src/routes/pagePath.ts).
- Register a lazy-loaded `Finance` page in [`src/routes/protectedRoutes.tsx`](../../../src/routes/protectedRoutes.tsx), following the existing `WithSuspense(lazy(...))` pattern.
- Add a single **Finance** button to the [`src/pages/Dashboard.tsx`](../../../src/pages/Dashboard.tsx) action grid (icon `FaMoneyBillWave`, `green` colorScheme), navigating to `PROTECTED_PATHS.FINANCE`.
- The Finance page is a **single routed page using Chakra `Tabs`** with four tabs, in order:
  **Obligations · Compliance · Payments · Accountability**.
- A `selectedObligationId` is held in the Finance page's local `useState`. Selecting an obligation in the Obligations tab sets it and drives the Compliance and Payments tabs.
- `organisation.id` comes from `useGlobalStore` (existing). **No global store changes are required.**

---

## 3. File Layout

The Finance page is a thin shell that composes focused tab components. This deliberately avoids the 500–670-line single-file pages that already exist in the repo.

```
src/pages/Finance.tsx                          // shell: header, BackButton, Tabs, selectedObligationId state
src/components/finance/ObligationsTab.tsx      // list + create (dues/levy) + rename + delete
src/components/finance/ComplianceTab.tsx       // grid + summary + exports + per-row actions
src/components/finance/PaymentsTab.tsx         // standalone record/correct by obligation + member
src/components/finance/AccountabilityTab.tsx   // member list, bulk + individual financialStartDate
src/components/finance/RecordPaymentModal.tsx  // shared modal (record + correct), used by Compliance & Payments
src/components/finance/financeTypes.ts         // TS types: obligation, compliance row, payment, etc.
src/helpers/financeConstants.ts                // MONTHS, month-status -> color map, default currency/country
```

---

## 4. API Layer

Add a `financeRequest` block to [`src/services/api/request.ts`](../../../src/services/api/request.ts), mirroring the existing `attendanceRequest`/`orgRequest` style:

```ts
export const financeRequest = {
  OBLIGATIONS: "/finance/obligations",                                     // POST create
  LIST_OBLIGATIONS: "/finance/:organisationId/obligations",               // GET (active)
  ONE_OBLIGATION: "/finance/:organisationId/obligations/:id",             // GET / DELETE
  UPDATE_OBLIGATION: "/finance/obligations/:id",                          // PUT (name only)
  PAYMENTS: "/finance/payments",                                          // POST record / PUT correct
  COMPLIANCE: "/finance/:organisationId/obligations/:id/compliance",      // GET
  COMPLIANCE_EXPORT_EXCEL: "/finance/:organisationId/obligations/:id/compliance/export/excel",
  COMPLIANCE_EXPORT_PDF: "/finance/:organisationId/obligations/:id/compliance/export/pdf",
  FINANCIAL_START_DATE: "/finance/members/:memberId/financial-start-date", // PATCH
};
```

Conventions (matching the existing codebase):

- **Reads** via `useQueryWrapper(key, url, options)`.
- **Writes** via `useMutationWrapper` + `postRequest` / `putRequest` / `patchRequest` / `deleteRequest`.
- URLs built with `convertParamsToString(url, { ...params })`.
- **Exports** return a URL in `data` (not bytes). Open it in a new tab — identical to the Analytics export behaviour.
- Query keys must include `organisationId` and (where relevant) `selectedObligationId` so caches are scoped correctly.

---

## 5. Tab Behaviours

### 5.1 Obligations
- List active obligations from `LIST_OBLIGATIONS` (cards or table).
- **Create** opens a modal with a `type` toggle:
  - **Dues:** `name`, `year`, `amountPerMonth`.
  - **Levy:** `name`, `amount`, `date` (`YYYY-MM-DD`).
  - POST to `OBLIGATIONS`.
- **Rename** via `UPDATE_OBLIGATION` (PUT). **Amounts are immutable** — amount/year/date fields are disabled when editing; only `name` is editable.
- **Delete** with `react-confirm-alert` → `deleteRequest` on `ONE_OBLIGATION`.
- Selecting an obligation sets `selectedObligationId` and switches to the Compliance tab.
- `409` (duplicate active dues plan for a year) surfaces through the existing toast handler.

### 5.2 Compliance
- Requires a `selectedObligationId`; otherwise show an empty state prompting the user to pick an obligation from the Obligations tab.
- Fetch `COMPLIANCE`. Render:
  - **Summary:** `totalMembers`, `accountableMembers`, `totalCollected`, `totalOutstanding`.
  - **Grid:**
    - **Dues:** 12 month columns colored by status `paid` / `partial` / `unpaid` / `not-due`, plus `totalExpected`, `totalPaid`, `balance`, `compliance%`.
    - **Levy:** single status cell per row (`expected`, `paid`, `balance`, `status`).
  - `accountable: false` rows render "not accountable" (no grid) with a **"Set start date"** shortcut that jumps to the Accountability tab for that member.
  - Each accountable row has a **"Record payment"** action opening `RecordPaymentModal`.
- **Excel / PDF export** buttons (open returned URL in a new tab).
- Wide grids scroll horizontally (same approach as `Analytics.tsx`).

### 5.3 Payments
- Standalone entry: pick obligation → pick member → **Record** (amount) or **Correct**.
  - **Record:** POST `PAYMENTS` `{ organisationId, obligationId, memberId, amount }`. Dues auto-fills earliest unpaid months; levy adds to cumulative.
  - **Correct:** PUT `PAYMENTS`. Dues sends `monthlyPaid` as a map (e.g. `{ "1": 500, "2": 500 }`); levy sends `amountPaid` (number).
- Reuses `RecordPaymentModal`'s body/logic so behaviour matches the grid's row action.
- On success, invalidate the compliance query for the affected obligation.

### 5.4 Accountability
- Table of all org members with their current `financialStartDate`.
- **Individual:** per-row date picker + a **Clear** control (PATCH `FINANCIAL_START_DATE` with `financialStartDate: null`).
- **Bulk:** multi-select checkboxes + a "Set start date for selected" action that fires the PATCH per selected member and reports a success/failure count via toast.
- Reachable directly, and via the Compliance tab's "Set start date" shortcut (prefilled member).

---

## 6. Money, Errors, Edge Cases

- **Money:** formatted via the existing `formatAmount(value, countryCode, currency)` helper. No currency is configured anywhere in the app, so add `DEFAULT_CURRENCY = "NGN"` and `DEFAULT_COUNTRY = "NG"` constants in `financeConstants.ts` (rendered as ₦; swappable later, a natural future org-config field). **Decision: hardcode NGN for now — approved.**
- **Errors:** `422` (overpay beyond balance / member not liable / no `financialStartDate`) and `409` (duplicate dues) surface through the existing `useMutationWrapper` toast handler — no bespoke UI, just the server's message.
- **Cache invalidation:** after any payment or start-date mutation, invalidate the relevant React Query keys (compliance, members) so views refresh.
- **Empty states:** no obligations → prompt to create one; no obligation selected on Compliance/Payments → prompt to pick one.
- **Dates:** always `YYYY-MM-DD` strings (use `date-fns` `format`, as elsewhere).

---

## 7. Testing

Follow the repo's existing Testing-Library setup. Keep tests light, matching the current footprint:

- `RecordPaymentModal`: dues vs levy field switching, basic validation, correct payload shape for record vs correct.
- Compliance grid: month-status → color mapping; dues vs levy row rendering; `accountable: false` row rendering.

---

## 8. Out of Scope

- Backend changes (API already exists).
- Global store / currency configuration UI (currency is a constant for now).
- Editing obligation amounts (API forbids it).
- Any finance surfacing inside the generic member form (`financialStartDate` is finance-only per `FinancialModel.md` §7).

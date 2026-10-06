# Presence Pro — Frontend Foundation Phase 2
## Tenant-Aware Finance, RBAC and Organisation-Switch State

## Goal

Complete the remaining frontend multi-organisation foundation work after Phase 1.

Phase 1 handled:

- member/member-model/category/attendance query isolation
- route-level permissions
- session-specific attendance drafts
- organisation-specific member preferences

Phase 2 should harden the remaining tenant-owned frontend state in:

- Finance
- Officers
- Roles
- Invites
- category mutation cache consistency
- organisation-switch local UI state

Do **not** merge or deploy anything. Implement, test, manually verify, and return one frontend PR for review.

---

# Prerequisite

Repository: `chineduknight/attendanceTracker_FE`

Base branch: `dev`

Before starting, ensure the previously approved frontend foundation PR has been merged:

- PR #57 — `fix: complete tenant-aware frontend foundations`

Branch from the latest `dev` **after PR #57 is present**.

Do not recreate or undo the Phase 1 route guards/query keys.

---

# 1. Extend the Central Query-Key Factory

Primary file:

- `src/services/api/queryKeys.ts`

Move the remaining tenant-owned Finance and RBAC keys into the central factory.

Use a structure that supports both exact queries and prefix invalidation cleanly.

Example direction, adapt as needed:

```ts
export const queryKeys = {
  // existing members / attendance / categories...

  finance: {
    obligations: (organisationId: string) =>
      ["finance", organisationId, "obligations"] as const,

    complianceRoot: (organisationId: string) =>
      ["finance", organisationId, "compliance"] as const,

    compliance: (organisationId: string, obligationId: string) =>
      ["finance", organisationId, "compliance", obligationId] as const,
  },

  rbac: {
    officers: (organisationId: string) =>
      ["rbac", organisationId, "officers"] as const,

    roles: (organisationId: string) =>
      ["rbac", organisationId, "roles"] as const,

    invites: (organisationId: string) =>
      ["rbac", organisationId, "invites"] as const,
  },

  organisation: (organisationId: string) =>
    ["organisation", organisationId] as const,

  permissionsCatalog: ["permissions-catalog"] as const,
};
```

Exact shape is flexible. Requirements are not.

## Requirements

- every tenant-owned key must include `organisationId`
- resource-detail keys must include their resource ID where applicable
- global/account-wide resources must remain global
- invalidation keys must match the same factory hierarchy
- avoid duplicate string literals representing the same server resource

---

# 2. Finance Query Isolation and Invalidation

Primary files:

- `src/components/finance/ObligationsTab.tsx`
- `src/components/finance/ComplianceTab.tsx`
- `src/components/finance/PaymentsTab.tsx`
- `src/components/finance/AccountabilityTab.tsx`
- `src/components/finance/RecordPaymentModal.tsx`
- `src/pages/Finance.tsx`

Replace inline keys such as:

```ts
["finance-obligations", organisationId]
["finance-members", organisationId]
["finance-compliance", organisationId, obligationId]
```

with central query-key helpers.

## Reuse the canonical member cache

Finance member lists currently call the same organisation member endpoint as the main members UI.

Where the request shape is identical, prefer reusing:

```ts
queryKeys.members(organisationId)
```

instead of maintaining a second `"finance-members"` cache.

Do not reuse it if the request parameters/data shape differ materially.

## Compliance invalidation

Make post-payment, correction, obligation, and financial-start-date invalidations consistent.

Examples:

- payment/correction should invalidate the affected organisation/obligation compliance data
- financial start-date changes may invalidate all compliance queries for that organisation if multiple obligations are affected
- obligation create/update/delete should invalidate the organisation's obligation list
- do not accidentally invalidate another organisation's cache

Use query-key prefixes intentionally rather than hand-written partial arrays.

---

# 3. Reset Finance Local State on Organisation Change

Current `Finance.tsx` keeps local state such as:

- `selectedObligationId`
- `prefillMemberId`
- `tabIndex`

If the selected organisation changes while the Finance page remains mounted, Organisation A IDs must not continue driving Organisation B requests/actions.

When `organisation.id` changes:

- clear `selectedObligationId`
- clear `prefillMemberId`
- return to a safe/default tab, preferably Obligations
- close/reset any mutation modal state if needed

Add an automated test proving this reset.

---

# 4. RBAC Query Isolation and Invalidation

Primary files:

- `src/components/officers/OfficersTab.tsx`
- `src/components/officers/RolesTab.tsx`
- `src/components/officers/PendingInvitesTab.tsx`
- `src/components/officers/InviteOfficerModal.tsx`
- `src/components/officers/EditOfficerRoleModal.tsx`
- `src/components/officers/EditOfficerPermissionsModal.tsx`
- `src/components/officers/RoleFormModal.tsx`
- `src/pages/OfficersRoles.tsx`

Move inline keys such as:

```ts
["officers", organisationId]
["roles", organisationId]
["officer-invites", organisationId]
```

to the central query-key factory.

Keep `permissions-catalog` global because it is not organisation-owned.

## Mutation invalidation

Ensure:

- invite officer invalidates officers + invites for the same org
- revoke invite invalidates invites for the same org
- role create/update/delete invalidates roles and officer-derived role displays for the same org
- officer role change invalidates officers for the same org
- officer permission override invalidates officers for the same org
- remove officer invalidates officers for the same org

No mutation should invalidate or refetch another organisation's tenant-owned data.

---

# 5. Reset Officer / Role UI State on Organisation Change

The officers UI contains local modal/selection state.

A selected Organisation A:

- officer
- role
- pending invite
- edit modal target

must not remain actionable after the global organisation changes to Organisation B.

Implement a simple, maintainable reset strategy.

Acceptable approaches include:

- keying the feature subtree by `organisation.id` so it remounts
- explicit effects that close modals/reset selected targets

Do not rely on “the user normally leaves the page before switching org.”

Add automated coverage where practical.

---

# 6. Category Mutation Cache Consistency

Phase 1 centralised the category query key.

Current category/sub-category create screens do not consistently invalidate the categories cache after mutation.

Primary files:

- `src/pages/Category.tsx`
- `src/pages/SubCategory.tsx`
- `src/hooks/useCategories.ts`

After successful create:

```ts
queryClient.invalidateQueries({
  queryKey: queryKeys.categories(org.id),
});
```

or the equivalent for the repository's React Query version.

Only invalidate the current organisation.

Do not reintroduce generic category keys.

---

# 7. Organisation Settings Key Consistency

Audit organisation settings query/invalidation.

If the selected organisation detail is cached using an inline key such as:

```ts
["organisation", org.id]
```

move it to the central factory.

Ensure an Organisation A settings save does not mutate/invalidate Organisation B detail state.

Do not change the global all-organisations query unless necessary.

---

# 8. Do Not Duplicate Phase 1 Permission Work

PR #57 already adds route-level permission enforcement.

Do not create another route-guard framework.

Keep existing:

- `RequirePermission`
- route `perm` metadata
- `Can` action gating

Only fix a permission issue if you discover a concrete regression while touching Finance/RBAC.

---

# 9. Automated Tests

Add focused frontend tests.

At minimum cover:

## Query keys

- finance obligations differ between Org A and Org B
- finance compliance differs by both org and obligation
- officers/roles/invites differ between orgs
- permissions catalog remains global
- prefix invalidation cannot collide across organisations

## Finance org switch

Render Finance with Organisation A, set:

- selected obligation
- prefill member
- non-default tab

then change global organisation to B.

Assert:

- stale IDs are cleared
- default/safe tab restored
- B requests do not use A IDs

## Officers/Roles org switch

Prove an Organisation A selected officer/role/modal target cannot remain active after switching to Organisation B.

## Category mutation

Prove successful category and sub-category creates invalidate only:

```ts
queryKeys.categories(currentOrgId)
```

## Existing tests

Update any tests that seed old inline keys.

Do not weaken tests just to make them pass.

---

# 10. Manual Verification

Use two organisations with visibly different data.

## Finance

1. Select Organisation A.
2. Create/select an obligation.
3. Open Compliance.
4. Select/set a member financial start date.
5. Record/correct a payment.
6. Confirm A updates immediately.
7. Switch to Organisation B without a full browser reload where possible.
8. Confirm:
   - no A obligation remains selected
   - no A member remains prefilled
   - no A compliance data flashes or appears
   - B finance data is independent
9. Switch back to A and confirm A cache/state reloads correctly.

## Officers / Roles

1. In Org A, open Officers & Roles.
2. Open an edit/invite/role modal.
3. Switch to Org B.
4. Confirm the A target cannot be submitted against B.
5. Verify B officer/role/invite lists contain only B data.
6. Switch back to A and verify A data remains correct.

## Categories

1. Create a category in A.
2. Confirm attendance setup sees it after cache refresh.
3. Switch to B and confirm it does not appear.
4. Create a sub-category in B and confirm A is unaffected.

---

# Tests and Verification Commands

Use the frontend `.nvmrc` Node version.

Run:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false
CI=true yarn build
```

Also run any focused tests you add directly where useful.

Report:

- Node version
- Yarn version
- exact test count
- build result
- TypeScript result
- warnings
- manual verification results
- Netlify preview URL if generated

Do not claim verification that was not actually performed.

---

# PR Requirements

Return **one frontend PR**.

Do not merge or deploy it.

The PR description must include:

- Summary
- Why
- Query-key changes
- Organisation-switch state changes
- Mutation invalidation changes
- Tests added
- Exact test/build results
- Manual verification table
- Netlify preview URL
- Known limitations
- Follow-up work

If a currently inline key is already safe because it contains the organisation ID, centralise it only where it improves consistency with the Phase 1 factory. Do not create a giant cosmetic refactor.

---

# Non-Goals

Do not implement:

- new Finance UX
- finance ledger redesign
- configurable attendance statuses
- offline/PWA work
- new role system
- dynamic organisation terminology
- dashboard redesign
- auth/token redesign
- dependency upgrade campaign
- new state-management library
- backend changes

---

# Expected Result

One frontend PR where tenant-owned frontend state has a single rule:

> Server cache keys, invalidations, and local feature selections are always scoped to the currently selected organisation, and changing organisations cannot leave actionable IDs or UI state from the previous tenant.

Do not merge or deploy. Send the PR URL back for review.

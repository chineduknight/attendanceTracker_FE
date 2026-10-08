# Presence Pro — Frontend Phase 4
## Attendance Workflow UX v1: Quick Marking + Session Templates

## Goal
Make attendance much faster to create and mark on a phone without changing the Phase 3 attendance semantics.

This phase adds:
1. reusable session templates on Create Attendance
2. quick-mark mode on Mark Attendance
3. bulk apply/reset for the currently visible roster
4. one-step undo for bulk changes

The existing generic `memberStatuses` backend write contract remains unchanged.

Do not implement eligibility rules here. They alter analytics/absence semantics and belong in the next phase.

Do not merge or deploy. Return one frontend PR for review.

## Prerequisites
Repository: `chineduknight/attendanceTracker_FE`

Base: `staging`

Before starting:
1. Phase 3 FE PR #59 must be merged into `staging`.
2. Phase 3 BE PR #4 must be merged/deployed to backend staging.
3. Phase 4 backend template API should be available for final integration testing.

Branch from latest `staging`.

## Product intent
Today the officer types session details, loads the roster, then repeatedly taps members to cycle statuses.

The improved workflow should support:
- reuse common session details in one tap
- choose a status once, then tap many members
- apply a chosen status to everyone currently visible
- search first, then bulk-mark only matching members
- reset visible members to the organisation default
- undo the most recent bulk change

Existing cycle behavior must remain available.

## 1. Query keys + API
Extend central query keys:

```ts
attendanceTemplates: (organisationId: string) =>
  ["attendance-templates", organisationId] as const
```

Add request paths:

```ts
ATTENDANCE_TEMPLATES: "/attendance/:organisationId/templates"
ATTENDANCE_TEMPLATE: "/attendance/:organisationId/templates/:templateId"
```

Use GET/POST/PUT/DELETE.

Every mutation invalidates only the current org template key.

## 2. Template type

```ts
interface AttendanceTemplate {
  id: string;
  organisationId: string;
  name: string;
  categoryId: string | null;
  subCategoryId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Do not add date, member IDs, statuses, or eligibility filters.

## 3. Create Attendance template UX
Primary page: `src/pages/CreateAttendance.tsx`

Create a focused component such as:

`src/components/attendance/AttendanceTemplatePicker.tsx`

Show the template selector above the existing `AttendanceDetailsForm`.

Selecting a valid template fills:
- name
- category
- sub-category

It must **not** change the current date.

If no templates exist, show a simple empty state and preserve the normal create flow.

## 4. Save current details as template
Add `Save as template`.

Use current:
- name
- categoryId
- subCategoryId

Date is ignored.

Requirements:
- non-empty name
- obvious duplicate active name blocked client-side when list is available
- backend remains authoritative
- success toast
- invalidate/refetch template list
- newly created template becomes selected
- do not navigate away

## 5. Update selected template
When a template is selected, expose `Update template`.

Save the current name/category/sub-category over it.

Date remains excluded.

This is also the repair path for a stale template.

## 6. Delete selected template
Expose `Delete template` with confirmation.

On success:
- clear selected template ID
- invalidate template list
- leave the current attendance form values untouched

Deleting a shortcut must not erase today's entered details.

## 7. Stale template handling
Compare stored category/sub-category IDs with the current active tree from `useCategories(org.id)`.

A template is stale when:
- category no longer exists
- sub-category no longer exists
- sub-category no longer belongs to stored category

UX:
- keep stale template visible
- mark it `Needs update`
- disable Apply
- allow Update using current valid form values
- allow Delete
- do not silently drop stale category refs

## 8. Organisation switching
On `org.id` change:
- selected template resets
- template query comes from new org key
- no A template can appear in B
- Create Attendance details reset safely if page remains mounted

Add tests.

## 9. Mark Attendance quick-mark mode
Primary page: `src/pages/MarkAttendance.tsx`

Add marking modes using active attendance statuses:

```text
Cycle | Present | Late | Apology | ...
```

Use configured labels/colors.

Default mode is `Cycle`.

### Cycle mode
Preserve existing behavior:

```text
tap member -> statuses.next(currentStatus)
```

### Selected-status mode
When an active status is selected:

```text
tap member -> set exactly that status
```

Inactive statuses must never appear as selectable quick-mark modes.

## 10. QuickMarkToolbar
Create a focused component, e.g. `QuickMarkToolbar.tsx`.

Requirements:
- mobile-first
- horizontal scroll if many statuses
- configured labels/colors
- selected state not based on color alone
- Cycle always available
- selected mode stays component-local
- org/session change resets to Cycle
- sticky placement encouraged if it does not cover roster/Submit

## 11. Bulk apply to visible members
Bulk operations must use the existing `filteredMembers` result.

Add:

```text
Apply <Selected Status> to N visible
```

Requirements:
- enabled only in selected-status mode
- `N = filteredMembers.length`
- hidden/search-excluded members unchanged
- active status only
- update `allMembers` atomically
- immediately persist same array to the draft localStorage key
- count summary updates immediately

Example: search for a subset, then Apply Present changes only the matching members.

## 12. Reset visible to default
Add:

```text
Reset N visible to <Default Label>
```

Set only visible members to `statuses.defaultStatus.key`.

Hidden members remain unchanged.

Works in Cycle or selected-status mode.

Button text must include count so the blast radius is obvious.

## 13. One-level bulk Undo
Before Apply or Reset, capture:

```text
memberId -> previous attendanceStatus
```

Show `Undo bulk change` after a bulk operation.

Undo:
- restores captured members still in roster
- writes restored draft to localStorage
- disappears after use

Clear/replace undo snapshot when:
- single member is manually changed
- another bulk action occurs
- organisation/session changes
- submit succeeds
- Refresh is used

This prevents stale Undo from overwriting later intentional edits.

## 14. Central draft update helper
Do not let single tap, bulk apply, reset, and undo each implement different localStorage behavior.

Extract one helper/callback that:
1. computes next member array
2. updates `allMembers`
3. writes that exact array to `localStorageKey`

Displayed roster and persisted draft must never diverge.

## 15. Historical inactive-status safety
Edit mode may contain inactive historical statuses.

Rules:
- render unchanged on open
- Cycle mode may move one into active cycle
- selected quick-mark may intentionally replace one
- bulk apply/reset may replace one only because user chose the bulk action
- Undo may restore the original inactive status for that same member
- never auto-normalize all inactive historical statuses on page load

## 16. Submit contract
Do not change the backend attendance write contract.

Continue sending only:

```ts
{
  name,
  date,
  categoryId?,
  subCategoryId?,
  organisationId,
  memberStatuses: [{ memberId, status }]
}
```

No legacy arrays.
No template ID.
No bulk metadata.

Template is UI convenience only.

## 17. Confirmation
Keep final confirmation before submit and continue showing dynamic status counts.

No need to mention whether assignments were single or bulk.

## 18. Mobile/accessibility
At phone width:
- status chips must be comfortably tappable
- selected mode needs text/icon/border, not color alone
- bulk buttons include affected count
- search remains accessible
- sticky toolbar must not hide last member or Submit

Use existing Chakra patterns only.

## 19. Automated tests
At minimum:

### Templates/query isolation
- template key differs Org A vs B
- list uses current org
- mutations invalidate only current org
- no-template flow still works
- selecting template fills name/category/sub-category
- date unchanged
- save new excludes date/status/member data
- duplicate obvious name blocked
- update selected template
- delete leaves form details
- org switch clears selected template
- Org A template absent in B

### Stale templates
- missing category marks stale
- stale Apply disabled
- stale template can be repaired via Update
- stale template can be deleted

### Quick mark
With Present, Late, Apology, Absent(default):
- default mode Cycle
- Cycle preserves current next behavior
- Present mode assigns Present directly
- Late mode assigns Late directly
- inactive status not offered

### Bulk visible
Use at least 5 members and search down to 2:
- Apply Present changes only visible 2
- hidden 3 unchanged
- localStorage equals displayed state
- counts update
- clearing search reveals untouched hidden members

### Reset visible
- only visible -> default
- hidden unchanged

### Undo
- bulk captures previous values
- Undo restores them and draft
- second bulk replaces snapshot
- manual single tap clears Undo
- org/session change clears Undo

### Historical edit
- inactive historical status renders
- quick-mark can replace intentionally
- bulk replace + Undo restores original inactive status

### Submit regression
- exact allowlisted payload
- no template ID
- no bulk metadata
- no legacy arrays

## 20. Manual verification
Use staging with:
- 30+ members
- 4 active attendance statuses
- 1 inactive historical status
- 2 categories with sub-categories
- 2 organisations

### Templates
1. Create Org A template `Thursday Rehearsal` with category/sub-category.
2. Set a date, apply template, confirm date unchanged.
3. Continue and submit successfully.
4. Reuse template on another session.
5. Update template from changed details.
6. Delete template, confirm current form details remain.
7. Switch to Org B, prove Org A template absent.
8. Create same template name in Org B, prove allowed.
9. Archive a referenced category and confirm template shows Needs update, not silent application.

### Quick mark
10. Start session with 30+ members.
11. Default mode is Cycle.
12. Select Present and tap several members, direct assignment only.
13. Select Late and tap several members.
14. Search subset and Apply Present to visible.
15. Clear search, hidden members unchanged.
16. Reset searched subset to default.
17. Undo, previous statuses return.
18. Bulk action then manual single tap, stale Undo disappears.
19. Submit/reopen, stored statuses correct.

### Historical
20. Open session with inactive historical status.
21. It displays unchanged.
22. Bulk-change visible member, Undo, inactive status returns.
23. Submit without backend rejection.

### Mobile
24. Repeat quick-mark flow at ~420px width and verify toolbar/buttons/roster remain usable.

Include concise evidence/screenshots in PR body.

## 21. Verification
Use frontend `.nvmrc`.

Run:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false
CI=true yarn build
```

Report Node/Yarn versions, exact suite/test counts, TS/build results, warnings, manual verification, and preview URL if available.

## PR requirements
Return one frontend PR into `staging`.

Do not merge/deploy.

PR body must document:
- template UX
- stale template behavior
- quick-mark behavior
- visible-only bulk semantics
- undo semantics
- draft persistence
- historical inactive handling
- unchanged submit contract
- automated/manual verification
- preview URL or limitation

## Non-goals
Do not implement:
- eligibility rules
- denominator/analytics changes
- member inclusion/exclusion rules
- backend bulk-status endpoint
- recurring calendar sessions
- template date
- template member lists
- template default statuses
- PWA/offline
- terminology/share redesign
- finance/RBAC/auth changes
- dependency upgrade campaign

## Expected result
> An officer can reuse recurring session details and mark a large roster quickly, while every final attendance record remains the same explicit configurable-status record introduced in Phase 3.

# Presence Pro - Phase 6E Frontend Brief
## Attendance Analytics Inclusion / Exclusion

**Prepared:** 6 October 2026  
**Repository:** `chineduknight/attendanceTracker_FE`  
**Integration branch:** `staging`

Current reviewed staging snapshot after Phase 6D merge:

```text
b5d09881f20bdf5682cad32fa46ba2af75b7267e
```

This SHA is a snapshot for context only. Inspect live `staging` before implementation.

Do not merge or deploy as part of implementation.

The frontend should be implemented after the Phase 6E backend contract is available on staging or against an agreed mock matching that contract.

---

# 1. Product Contract

A whole attendance record can be excluded from analytics without deleting it.

Default:

```text
Include in analytics = ON
```

Excluded:

```text
Include in analytics = OFF
```

The record remains:

- in All Attendance;
- viewable;
- editable under existing edit rules;
- shareable;
- exportable through the ordinary attendance export.

It does not count in:

- Organisation Analytics;
- Member Analytics;
- attendance rates;
- Present/Excused/Absent totals;
- streaks;
- analytics PDF/Excel exports.

This is session-level metadata.

Do not treat it as an attendance status.

Do not use `N/A` for excluded sessions.

---

# 2. Backend Contract Expected

Dedicated mutation:

```http
PATCH /api/attendance/:organisationId/:id/analytics-inclusion
```

Permission:

```text
attendance.manage
```

Exclude:

```json
{
  "analyticsIncluded": false,
  "reason": "Attendance was incompletely recorded"
}
```

Restore:

```json
{
  "analyticsIncluded": true
}
```

Attendance list/detail reads expose:

```ts
analyticsIncluded: boolean
analyticsExclusionReason: string | null
analyticsExcludedAt: string | null
analyticsExcludedBy: string | null
```

Legacy records should be returned effectively as:

```text
analyticsIncluded = true
```

Organisation analytics response additionally exposes:

```ts
sessionSummary: {
  recorded: number;
  included: number;
  excluded: number;
}
```

Do not invent a fallback that excludes a session client-side if the backend still counts it.

Backend remains the analytics source of truth.

---

# 3. Terminology

Use organisation presentation terminology for new user-facing nouns.

If:

```text
Attendance = Rehearsal
Member = Student
```

prefer:

```text
Exclude this rehearsal from analytics?
This rehearsal will remain in rehearsal history.
Rehearsal analytics inclusion
```

Do not rename:

```text
permission keys
API paths
query keys
storage fields
analyticsIncluded
attendance.manage
attendance.view
```

because terminology is display-only.

Use existing helpers such as:

```ts
useTerms()
lowerTerm(...)
```

---

# 4. All Attendance

Current page:

```text
src/pages/AllAttendance.tsx
```

Excluded sessions must remain in this list.

Add a visible badge to excluded records:

```text
Excluded from analytics
```

Do not hide excluded attendance.

Do not style it as deleted/archived.

Keep existing:

```text
edited Nx
category badges
date/creator metadata
edit button
```

## Lightweight filter

Add a local filter:

```text
All
Included in analytics
Excluded from analytics
```

This fulfils the previously discussed "View excluded sessions" action without requiring a separate backend list endpoint.

Default:

```text
All
```

The filter should operate on the already-loaded attendance list.

Do not make this filter alter Organisation Analytics.

---

# 5. View Attendance

Current page:

```text
src/pages/ViewAttendance.tsx
```

This should be the primary place to manage Phase 6E state.

## View-only state

Any user with `attendance.view` should see whether the attendance is included.

When included:

```text
Included in analytics
```

When excluded:

```text
Excluded from analytics
```

If present, display:

```text
Reason
Excluded date
```

`analyticsExcludedBy` does not need a resolved display name in Phase 6E unless the backend already supplies one naturally.

## Manage action

Only users with:

```text
attendance.manage
```

should see the action to change the state.

For an included attendance:

```text
Exclude from analytics
```

For an excluded attendance:

```text
Restore to analytics
```

Do not couple visibility to whether the marking edit button is available.

A record may have:

```text
editsLocked = true
```

and still be eligible for analytics exclusion/restoration.

---

# 6. Exclude Confirmation Flow

When the manager chooses:

```text
Exclude from analytics
```

show a confirmation UI.

Suggested terminology-aware copy:

```text
Exclude this rehearsal from analytics?

This rehearsal will remain available in rehearsal history, but it will not count toward organisation or student analytics.

Reason (optional)
[ Attendance was incompletely recorded ]

Cancel
Exclude from analytics
```

Reason:

- optional;
- max 200 characters;
- trim before sending;
- blank may be omitted or sent as empty according to the backend contract.

Do not use a simple accidental one-click toggle.

This action changes statistical treatment of historical data and should require deliberate confirmation.

On success:

- update/invalidate attendance detail;
- update/invalidate All Attendance;
- invalidate current organisation analytics caches;
- invalidate current organisation member-analytics caches;
- show a concise success toast;
- remain on the attendance page.

Suggested toast:

```text
Rehearsal excluded from analytics.
```

Use current terminology.

---

# 7. Restore Confirmation Flow

For an excluded record:

```text
Restore to analytics
```

Suggested confirmation:

```text
Restore this rehearsal to analytics?

Its stored attendance will count again in organisation and student analytics.

Cancel
Restore
```

No reason is needed.

On success:

- refresh the attendance detail;
- refresh All Attendance cache;
- invalidate analytics caches;
- show success toast.

Suggested:

```text
Rehearsal restored to analytics.
```

---

# 8. Loading / Failure Behaviour

While exclude/restore mutation is in flight:

- disable the corresponding action;
- do not optimistically flip analytics state unless the existing mutation conventions make rollback guaranteed;
- prevent duplicate submissions.

If the backend rejects the action:

- keep the previous displayed state;
- surface `error.response.data.error` through the existing error handling;
- do not silently change local analytics state.

A failed restore must leave the record visually excluded.

A failed exclude must leave it visually included.

---

# 9. Analytics Page Session Summary

Current page:

```text
src/pages/Analytics.tsx
```

Use the backend:

```ts
sessionSummary
```

to disclose excluded records for the selected date range.

Show a compact summary near the applied date range:

```text
Sessions recorded: 12
Included in analytics: 10
Excluded: 2
```

Use organisation Attendance terminology where natural.

For example:

```text
Rehearsals recorded: 12
Included in analytics: 10
Excluded: 2
```

Do not derive these numbers from table columns on the client.

Collapse-by-day can change member verdict representation, so the backend raw-session summary is authoritative.

## Important Phase 6D distinction

If an included session does not contain a member on its stored roster:

```text
cell = N/A
```

If a whole session is excluded in Phase 6E:

```text
the session column must not appear at all
```

Do not create an `Excluded` status, legend entry or table cell.

---

# 10. Member Analytics

Current page:

```text
src/pages/MemberAnalytics.tsx
```

The backend is responsible for removing excluded sessions.

Frontend must not locally filter records to repair backend data.

When:

```text
analytics.summary.totalSessions === 0
```

prefer copy that is correct even when historical records exist but were excluded.

Instead of:

```text
No rehearsal records for this range.
```

prefer something like:

```text
No included rehearsal records for this range.
```

Use organisation terminology.

Existing:

```text
StatTiles
AttendanceTimeline
MemberRecordsTable
StreakCard
Excel export
PDF export
```

should consume the backend response normally.

No synthetic excluded entries should be added to Member Analytics.

---

# 11. Query Keys and Cache Invalidation

Phase 6E changes analytics after a mutation, so stale cross-page caches matter.

Current code has central tenant-safe query keys for attendance, but analytics pages still use ad-hoc arrays.

Introduce tenant-scoped analytics query keys rather than invalidating broad global keys.

Suggested shape:

```ts
analytics: {
  root: (organisationId: string) =>
    ["attendance-analytics", organisationId] as const,

  organisation: (
    organisationId: string,
    fromDate: string,
    toDate: string,
    statuses: string
  ) =>
    [
      "attendance-analytics",
      organisationId,
      "organisation",
      fromDate,
      toDate,
      statuses,
    ] as const,

  memberRoot: (organisationId: string) =>
    ["member-analytics", organisationId] as const,

  member: (
    organisationId: string,
    memberId: string,
    fromDate: string,
    toDate: string
  ) =>
    [
      "member-analytics",
      organisationId,
      memberId,
      fromDate,
      toDate,
    ] as const,
}
```

Exact naming may follow existing repository conventions, but every tenant-owned analytics key must include `organisationId`.

After exclude/restore invalidate only the current organisation:

```text
attendance detail
all attendance
organisation analytics root
member analytics root
```

Never invalidate another organisation's analytics cache.

Add a regression test for org switching / cache isolation where appropriate.

---

# 12. API Constants / Hook

Add a request constant such as:

```ts
ANALYTICS_INCLUSION:
  "/attendance/:organisationId/:id/analytics-inclusion"
```

Prefer a focused mutation helper/hook instead of embedding request assembly in several pages.

Possible location:

```text
src/hooks/useAttendanceAnalyticsInclusion.ts
```

Responsibilities:

- build route from authoritative organisation + attendance ID;
- call PATCH through the existing API wrapper;
- accept `{ analyticsIncluded, reason? }`;
- tenant-scoped invalidation;
- expose mutation loading state;
- preserve backend error message.

Do not send:

```text
memberStatuses
eligibilityRules
attendance[]
editCount
editsLocked
```

---

# 13. Permissions

Read state:

```text
attendance.view
```

Change state:

```text
attendance.manage
```

Use existing RBAC components/helpers.

A view-only user:

- sees Included/Excluded badge;
- sees reason if excluded;
- does not see Exclude/Restore controls.

A manage-only role follows the application's current permission semantics. Do not globally redefine permission inheritance.

---

# 14. Interaction with Existing Edit UI

Keep analytics inclusion independent of marking edits.

Existing edit affordances are based on:

```text
editCount
editsRemaining
editsLocked
```

Phase 6E must not alter that logic.

Examples:

```text
Excluded + edit allowed
-> edit attendance button still works

Excluded + edits locked
-> attendance marking edit remains unavailable
-> Restore to analytics can still be available to attendance.manage

Included + edit limit reached
-> Exclude from analytics can still be available to attendance.manage
```

Do not use `canEditAttendance(...)` to gate Phase 6E state changes.

---

# 15. Ordinary Attendance Actions

Excluded attendance remains historical content.

Therefore keep:

```text
View
Share
ordinary Export to Excel
Delete
normal edit when allowed
```

Delete remains the existing archive/delete action and is different from analytics exclusion.

The UI should make the distinction obvious:

```text
Delete
= remove/archive the attendance record

Exclude from analytics
= keep the attendance but ignore it statistically
```

---

# 16. Required Frontend Tests

Add focused Phase 6E coverage.

## All Attendance

1. included record has no excluded badge;
2. excluded record shows `Excluded from analytics`;
3. excluded record remains clickable/viewable;
4. All/Included/Excluded filter works;
5. edit availability remains governed only by existing edit rules;
6. custom Attendance terminology still renders naturally.

## View Attendance read state

7. `attendance.view` can see inclusion state;
8. excluded reason is visible;
9. view-only user cannot see Exclude/Restore controls;
10. `attendance.manage` sees appropriate action;
11. edits-locked record can still expose Restore/Exclude to manage user.

## Mutation

12. exclude sends:

```json
{
  "analyticsIncluded": false,
  "reason": "..."
}
```

to the correct org/attendance route;

13. blank reason handled according to backend contract;
14. 200-character limit;
15. restore sends `analyticsIncluded: true`;
16. double-submit blocked while saving;
17. backend error remains visible;
18. failed mutation does not flip displayed state;
19. successful mutation invalidates only current organisation attendance + analytics keys.

## Confirmation copy

20. exclusion explains record remains in history;
21. restore explains stored attendance will count again;
22. custom terms such as Rehearsal/Student are used naturally.

## Organisation Analytics

23. renders `sessionSummary.recorded`;
24. renders included count;
25. renders excluded count;
26. excluded session is not rendered as an N/A column;
27. Phase 6D off-roster cells remain N/A for included sessions.

## Member Analytics

28. zero included sessions uses accurate `No included ...` copy;
29. existing response still drives tiles/timeline/table;
30. no excluded synthetic status is introduced.

## Tenant/cache safety

31. org A inclusion mutation must not invalidate/use org B attendance/analytics keys.

Preserve all existing Phase 3-6D regression tests.

---

# 17. Likely Frontend Files

Inspect live code before changing anything.

Expected touch points:

```text
src/pages/AllAttendance.tsx
src/pages/ViewAttendance.tsx
src/pages/Analytics.tsx
src/pages/MemberAnalytics.tsx

src/services/api/request.ts
src/services/api/queryKeys.ts
```

Likely new focused helper/hook:

```text
src/hooks/useAttendanceAnalyticsInclusion.ts
```

Tests may include:

```text
src/pages/AllAttendance.test.tsx
src/pages/ViewAttendance.test.tsx
src/pages/Analytics.test.tsx
src/pages/MemberAnalytics.test.tsx
src/hooks/useAttendanceAnalyticsInclusion.test.tsx
src/services/api/queryKeys.test.ts
```

If `AllAttendance.test.tsx` does not currently exist, add it rather than hiding Phase 6E coverage elsewhere.

---

# 18. Accessibility / UX

The state must not rely on colour alone.

Use visible text:

```text
Included in analytics
Excluded from analytics
```

Confirmation fields require accessible labels.

The reason textarea should expose its 200-character limit.

Buttons should have explicit accessible names.

Keyboard users must be able to:

- open the confirmation;
- enter/cancel;
- confirm exclude/restore.

Do not turn the whole inclusion state into an unlabeled icon.

---

# 19. No New Analytics Status

Do not add any of these:

```text
excluded
ignored
n/a
not-counted
```

to attendance status configuration.

Status legend/filter remains the organisation's attendance status config only.

Phase 6D N/A remains presentation-only and must not appear in the status filter.

Phase 6E excluded sessions do not appear as columns/rows in analytics data.

---

# 20. Scope Boundaries

Do not include in this PR:

- leave-based Full Presence / Near Perfect recognition redesign;
- manual member addition/removal for one attendance;
- availability changes;
- eligibility changes;
- attendance-status redesign;
- offline/PWA work;
- generic audit-history UI;
- bulk exclusion of many sessions;
- recurring exclusion rules.

The leave/eligibility recognition denominator is intentionally deferred for discussion immediately after these Phase 6E briefs.

---

# 21. Manual Smoke Test

Use three records:

```text
R1 - 1 Oct - included
R2 - 8 Oct - included
R3 - 15 Oct - included
```

Members:

```text
Ada
Bea
```

Give R2 clearly identifiable statuses.

## A. Baseline

Analytics shows:

```text
Recorded 3
Included 3
Excluded 0
```

R2 contributes to org + member analytics.

## B. Exclude

From View Attendance, exclude R2:

```text
Reason: Incomplete marking
```

Expected:

- R2 remains in All Attendance;
- R2 shows excluded badge;
- R2 remains viewable;
- reason is visible;
- ordinary R2 export still works;
- analytics summary becomes:

```text
Recorded 3
Included 2
Excluded 1
```

- R2 column disappears from Organisation Analytics;
- R2 statuses disappear from totals;
- R2 disappears from Member Analytics;
- streaks/rates recalculate without R2;
- analytics Excel/PDF exclude R2.

## C. Restore

Restore R2.

Expected:

```text
Recorded 3
Included 3
Excluded 0
```

Original R2 stored marks return to analytics unchanged.

## D. Edit lock independence

Use an attendance with no edits remaining or `editsLocked=true`.

Expected:

- normal marking edit unavailable;
- attendance manager can still exclude/restore analytics.

## E. Permission

View-only officer:

- sees excluded state/reason;
- cannot change it.

## F. Organisation switch

Exclude a record in Org A.

Switch:

```text
A -> B -> A
```

No state/cache bleed.

---

# 22. Verification

Run:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false --runInBand
CI=true yarn build
```

Report:

```text
exact final SHA
exact suite count
exact test count
TypeScript result
build result
Netlify preview status
```

Update the PR description with those final values.

Do not merge or deploy.

---

# 23. Acceptance Summary

Phase 6E frontend is complete when this statement is true:

> Users can clearly see whether an attendance record is included in analytics, authorised managers can deliberately exclude or restore it without touching the attendance-edit contract, excluded records remain fully accessible in history, organisation analytics disclose recorded/included/excluded session counts, and every affected cache/UI remains tenant-safe and terminology-aware.

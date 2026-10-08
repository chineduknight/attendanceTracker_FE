# Presence Pro Phase 6D Frontend
## Member Attendance Availability / Leave Periods

Repository: `chineduknight/attendanceTracker_FE`

Target branch: latest `staging` **after Phase 6C frontend PR #64 has merged**.

Backend dependency: Phase 6D backend should already be merged/deployed to staging before this frontend is deployed.

Create one focused PR into `staging`.

Do not merge or deploy unless Knight explicitly asks.

Read the repository's agent instructions before changing code.

---

# 1. Goal

Phase 6D gives officers a way to say:

```text
This member is not expected to attend between these dates.
```

Example:

```text
Student: Ada
Availability:
10 Oct 2026 to 10 Nov 2026
Reason: Travel
```

For sessions in that period Ada should not appear as:

- Absent
- Apology
- Present

She should simply not be on the session's expected roster.

In analytics, a session where a member was not on the roster is displayed as:

```text
N/A
```

This is not a new attendance status.

---

# 2. Product language

Use **Attendance availability** as the feature name.

Avoid making the model specific to only annual leave.

It must also make sense for:

- travel
- examinations
- work assignment
- maternity leave
- temporary exemption
- other planned absence

Do not introduce a reason category enum in v1.

Use the organisation's configured terminology wherever natural.

Example:

```text
Member -> Student
Attendance -> Session
Officer -> Coordinator
```

Possible copy:

```text
Student attendance availability
```

and:

```text
This student will not be expected for sessions in this period.
```

---

# 3. Availability is not member status

Do not modify the member's dynamic profile `status`.

A member can be:

```text
Status: Active
```

and:

```text
Unavailable: 10 Oct - 10 Nov
```

at the same time.

Do not automatically set:

```text
status = Excused
```

when an availability period is created.

Do not clear/change status when the period ends.

---

# 4. Backend API assumed

Phase 6D frontend depends on:

## List by member

```http
GET /api/attendance/:organisationId/availability?memberId=:memberId
```

## Query by date

```http
GET /api/attendance/:organisationId/availability?date=YYYY-MM-DD
```

## Create

```http
POST /api/attendance/:organisationId/availability
```

```json
{
  "memberId": "...",
  "startDate": "2026-10-10",
  "endDate": "2026-11-10",
  "reason": "Travel"
}
```

## Update

```http
PUT /api/attendance/:organisationId/availability/:availabilityId
```

```json
{
  "startDate": "2026-10-10",
  "endDate": "2026-11-05",
  "reason": "Returned earlier"
}
```

## Archive

```http
DELETE /api/attendance/:organisationId/availability/:availabilityId
```

Permissions:

```text
attendance.view   -> read
attendance.manage -> create/update/archive
```

Do not build a fallback that pretends the endpoint succeeded when it failed.

---

# 5. Types

Add a focused type.

Example:

```ts
export interface AttendanceAvailability {
  id: string;
  organisationId: string;
  memberId: string;
  member?: {
    id: string;
    name: string;
  };
  startDate: string;
  endDate: string;
  reason?: string | null;
  createdBy?: unknown;
  updatedBy?: unknown;
  createdAt: string;
  updatedAt: string;
}
```

Do not store availability in Zustand as global organisation state.

Availability belongs in React Query/server state.

---

# 6. Query keys

Add tenant-safe query keys.

Suggested shape:

```ts
attendanceAvailability: {
  root: (organisationId) => [...],
  member: (organisationId, memberId) => [...],
  date: (organisationId, date) => [...],
}
```

Every key must include:

```text
organisationId
```

Date queries also include:

```text
date
```

Member queries also include:

```text
memberId
```

No cache bleed between organisations.

After create/update/archive, invalidate the organisation's availability root so:

- member availability page
- Create Attendance date preview
- Mark Attendance roster

all refresh.

---

# 7. Shared hook

Create:

```text
src/hooks/useAttendanceAvailability.ts
```

It may expose:

```ts
useAttendanceAvailabilityForMember(organisationId, memberId)

useAttendanceAvailabilityForDate(organisationId, date, options?)
```

or one well-designed hook with explicit modes.

Date query should be disabled until there is:

```text
organisationId
AND
valid YYYY-MM-DD date
```

Do not fetch for a blank date.

Useful return data:

```text
periods
unavailableMemberIds
isLoading
isSuccess
isError
refetch
```

Use a Set for membership checks:

```ts
new Set(periods.map((period) => period.memberId))
```

---

# 8. Member availability management page

Create a dedicated member-specific page.

Suggested route:

```text
/members/:memberId/attendance-availability
```

or a path matching existing route conventions.

Suggested title:

```text
Member Availability
Student Availability
Resident Availability
```

using organisation terminology.

Route permission:

```text
attendance.view
```

Do not require `members.manage` merely to read availability.

Create/edit/archive controls require:

```text
attendance.manage
```

---

# 9. Entry point

Add an Availability action from member-facing UI.

At minimum, from View Members provide a clear action for users with:

```text
attendance.view
```

Example:

```text
Ada
Soprano

[ Availability ]
```

Do not make the whole member card unexpectedly change destination.

If the current layout makes a row action awkward, use a compact action/menu consistent with the existing design.

It is acceptable to add a secondary link from Member Analytics, but Analytics must not be the only path because Analytics can be hidden per organisation.

---

# 10. Availability page layout

Suggested:

```text
Ada
Attendance availability

[ + Add unavailable period ]

CURRENT / UPCOMING

10 Oct 2026 - 10 Nov 2026
Travel
Active now

[ Edit ] [ Remove ]

PAST

1 Aug 2026 - 7 Aug 2026
Exams
```

Read-only users see periods without management buttons.

Attendance managers see create/edit/remove.

Do not show archived records by default.

---

# 11. Add/edit form

Fields:

```text
Start date *
End date *
Reason (optional)
```

Helper:

```text
The start and end dates are both included.
```

Client validation:

- both dates required
- end date cannot be before start date
- reason max 200
- reason trimmed

Backend remains authoritative for overlap and tenant checks.

If backend returns the overlap message, show it clearly rather than replacing it with a generic toast.

---

# 12. Historical warning

Show this on the availability page:

```text
Availability affects attendance created after it is saved.
Existing attendance records are not recalculated.
```

Do not imply that backdating a period repairs already-created attendance.

This is a hard product truth.

---

# 13. Current/upcoming/past grouping

Business dates are `YYYY-MM-DD`.

Avoid UTC shifts.

A period is:

```text
current
startDate <= today <= endDate
```

```text
upcoming
startDate > today
```

```text
past
endDate < today
```

Current and upcoming may be grouped if the page is cleaner that way.

Grouping is presentation-only.

---

# 14. Remove/archive flow

"Remove" archives the availability period.

Confirmation:

```text
Remove this attendance availability period?

This will affect only attendance created after the change.
Existing attendance records will stay unchanged.
```

Do not claim the member will be re-added to an existing session.

After success:

- invalidate availability queries
- refresh
- show concise success toast

---

# 15. Create Attendance integration

Phase 6C Create Attendance currently:

- loads members
- optionally loads member model when eligibility is ON
- computes eligibility match count
- stores rules
- navigates to Mark Attendance

Phase 6D adds a date-based availability query.

When a valid session date exists:

```text
GET availability?date=<session date>
```

---

# 16. Preserve eligibility zero-match behavior

Do not let availability change Phase 5 eligibility semantics.

Calculate two concepts separately.

## Raw eligibility match count

```text
members matching eligibility before availability
```

This is what the existing Eligibility Editor continues to use.

If a non-empty rule matches zero members:

```text
Continue remains blocked
```

exactly as now.

## Final expected count

```text
raw eligibility members
-
members unavailable on the session date
```

This is the true roster preview after availability.

Do not feed the post-availability zero into the old "rules match zero" error.

Example:

```text
2 Sopranos match rule
2 Sopranos are unavailable
```

The rule itself is valid.

Do not show:

```text
No students match these eligibility rules
```

because that would be false.

---

# 17. Availability summary on Create Attendance

Add a compact summary outside the eligibility editor.

Example:

```text
Attendance availability

2 students are unavailable on this date.
Final expected roster: 10 students.
```

Optional simple list:

```text
Ada - Travel
Bea - Exams
```

Keep it compact.

When nobody is unavailable, a large empty panel is unnecessary.

When eligibility is OFF, this summary still works.

That matters because availability should be useful without advanced eligibility.

---

# 18. Which unavailable periods count in summary

Only count unavailable members who would otherwise be expected.

Eligibility OFF:

```text
all non-archived members
-
unavailable
```

Eligibility ON:

```text
eligibility-matched members
-
unavailable
```

Example:

- a Tenor is unavailable
- session is Soprano-only

Do not report the Tenor as removed by availability because they were already outside the session rule.

---

# 19. Availability loading/error on Create Attendance

Once a valid date is chosen, frontend needs availability data to show the same roster the backend will enforce.

Do not silently assume everyone is available if the query fails.

While loading:

```text
Checking attendance availability...
```

On error:

```text
Attendance availability could not be loaded. Try again before continuing.
```

Disable Continue while a selected date's availability query is unresolved or failed.

This avoids proceeding with a roster the backend may reject.

---

# 20. Date changes

If the user changes:

```text
17 Oct -> 24 Oct
```

the availability query must change.

Do not keep the old unavailable set.

Query key must include the date.

Availability summary and final expected count must update.

---

# 21. Mark Attendance integration

This is mandatory.

Current new-session Mark Attendance derives working roster from:

```text
current members
+
session eligibility rules
```

Phase 6D becomes:

```text
current members
→ filter by eligibility
→ remove members unavailable on currentAttendance.date
→ reconcile local draft
```

Existing attendance edit mode remains based on the stored roster and must **not** query availability to rebuild it.

---

# 22. Mark Attendance date query

For a new session only:

```text
GET /attendance/:organisationId/availability?date=currentAttendance.date
```

Roster is ready only after:

```text
members loaded
AND
availability loaded
```

If availability fails:

```text
Attendance availability could not be loaded. Use Refresh to try again.
```

Do not build a full-roster fallback.

---

# 23. Draft reconciliation

Preserve current `reconcileAttendanceDraft` architecture.

If a member becomes unavailable after marking starts but before Refresh:

1. Refresh availability.
2. Recompute expected roster.
3. Draft reconciliation drops that member.
4. Their stale local mark disappears.
5. Other marks remain.

If member becomes available again before submit:

1. Refresh.
2. They re-enter expected roster.
3. Existing reconciliation/default-status rules apply.

Stale localStorage must never force an unavailable member back into the roster.

---

# 24. Mark Attendance availability summary

Show a compact explanation near expected roster.

Example:

```text
Expected students: 28
Unavailable on this date: 3
```

Optional names/reasons can be shown in a compact list.

This helps officers understand why someone is missing.

Unavailable members must not render as markable rows.

Manual exceptions belong to a later phase.

---

# 25. Submission

Submit only members on final expected working roster.

Backend independently recomputes availability and remains authoritative.

If backend rejects because availability changed after the client last loaded:

- show backend error
- keep current marks
- Refresh re-reads members + availability and reconciles

Do not navigate away on failed submit.

---

# 26. Existing attendance edit

When editing historical attendance:

- load stored roster
- preserve unresolved placeholders
- display stored eligibility rules
- do not remove someone because unavailable today
- do not add someone because old leave ended
- do not fetch availability to alter stored roster

Creation-time only is a hard invariant.

---

# 27. View Attendance

View Attendance remains historical display.

It shows stored expected roster.

Do not apply current availability.

A member omitted by availability at creation simply is not on the roster.

No special mutation is needed.

---

# 28. Organisation analytics N/A

Current Analytics renders a neutral badge:

```text
-
```

when:

```text
member has no status cell for this session
```

Change the visual value to:

```text
N/A
```

Suggested tooltip:

```text
Not applicable: not on this session roster
```

Use organisation terminology where natural.

Do not treat N/A as an attendance status.

Do not pass it to `useAttendanceStatuses()`.

Do not include it in:

- attendance-status legend
- attendance-status filter
- behavior totals

---

# 29. Why N/A applies beyond leave

The analytics cell does not know why someone was outside the frozen roster.

Possible reasons:

- eligibility
- attendance availability

Both mean:

```text
not expected
```

Therefore N/A is correct for every missing roster cell.

Do not use N/A only for availability while leaving eligibility gaps as "-".

The stored roster is the source of truth.

---

# 30. Member Analytics

Member Analytics already receives only sessions where the member belonged to the frozen roster.

Preserve that.

Do not insert fake N/A records into:

- behavior counts
- totalSessions
- attendanceRate
- streaks

If a member was unavailable for four sessions:

```text
those four sessions are outside the denominator
```

The organisation matrix provides explicit N/A.

Do not redesign Member Analytics timeline in Phase 6D.

---

# 31. Exports

Analytics Excel/PDF are backend-generated.

Frontend should not post-process them.

Manual verification should check that downloaded organisation analytics reports show:

```text
N/A
```

for not-on-roster cells after backend 6D.

Member analytics exports remain expected-session only.

---

# 32. Terminology

Reuse:

```text
useTerms()
lowerTerm()
LABELS
```

Do not create another terminology system.

Examples:

```text
Member -> Student
Attendance -> Session
```

Possible copy:

```text
Student availability
2 students are unavailable for this session.
This student will not be expected for sessions in this period.
```

Technical identifiers remain unchanged.

---

# 33. Permissions in UI

Read:

```text
attendance.view
```

Manage:

```text
attendance.manage
```

View-only officer:

- can see periods
- cannot add
- cannot edit
- cannot remove

Manager:

- can manage all periods for own org

Do not gate only on `isOwner`.

---

# 34. View Members integration

Add availability action only when relevant permission exists.

Do not break:

- existing row/card navigation
- edit-member navigation
- export actions
- responsive layout

At about 420px:

- action must remain tappable
- no horizontal overflow from the new action

Prefer a compact menu/action if necessary.

---

# 35. Empty states

Examples:

```text
No attendance availability periods for this student.
```

For manager:

```text
Add an unavailable period when this student will not be expected to attend.
```

Keep it concise.

---

# 36. Loading/error states

Availability page:

```text
Loading attendance availability...
```

Error:

```text
Attendance availability could not be loaded.
```

Create/Mark must distinguish:

```text
loaded empty list
```

from:

```text
request failed
```

Never translate failure into "no unavailable members".

---

# 37. Overlap error UX

If backend returns:

```text
This member already has an attendance availability period that overlaps these dates.
```

show that exact message near form and/or toast.

Do not reduce it to:

```text
Something went wrong.
```

---

# 38. Date UX

Use normal date inputs.

Send business-date strings unchanged.

Avoid unnecessary conversions such as:

```ts
new Date(value).toISOString().slice(0, 10)
```

There is no timezone problem to solve here.

---

# 39. Organisation switching

Test:

```text
Org A
Ada unavailable 10 Oct - 10 Nov

Org B
no periods
```

Switch:

```text
A -> B -> A
```

Never show A's period in B.

Create Attendance date query must refetch under new org key.

Mark Attendance already remounts by org/session identity. Preserve that.

---

# 40. Member switching

If Availability Page can change member without full route remount, query key must include memberId.

Prefer route identity:

```text
organisationId + memberId
```

No stale period from previous member.

---

# 41. Frontend tests

Suggested files:

```text
src/helpers/attendanceAvailability.test.ts
src/hooks/useAttendanceAvailability.test.tsx
src/pages/MemberAttendanceAvailability.test.tsx
src/pages/CreateAttendance.test.tsx
src/pages/MarkAttendance.test.tsx
src/pages/Analytics.test.tsx
src/pages/ViewMembers.test.tsx
src/routes/protectedRouteConfig.test.ts
```

Use existing patterns.

---

# 42. Test matrix: helper/query

Test:

- inclusive date helper if frontend owns one
- unavailable IDs set
- query disabled without date
- query key includes org/date
- query key includes org/member
- loaded empty differs from error
- invalid response never widens roster

---

# 43. Test matrix: availability page

Test:

- title uses Member/Student terminology
- read permission
- manage permission
- list periods
- create
- edit
- remove
- start > end blocked
- optional reason
- overlap message displayed
- historical warning visible
- archived periods not shown
- Org A/B isolation

---

# 44. Test matrix: Create Attendance

Eligibility OFF:

- member model remains unfetched per Phase 6C
- availability fetched once date exists
- unavailable members reduce final expected count
- availability summary appears
- Continue blocked while availability loading/error
- loaded empty allows normal Everyone flow
- unrestricted template flow still works

Eligibility ON:

- raw eligibility count remains existing Phase 5 count
- final expected roster subtracts unavailable
- raw zero-match rules still block
- all matched members unavailable does not falsely say rule matches zero
- restricted templates still work when eligibility enabled

---

# 45. Test matrix: Mark Attendance

New session:

- waits for member + availability data
- filters eligibility first
- removes unavailable second
- unavailable row not rendered
- unavailable member not submitted
- Refresh re-resolves availability
- local draft cannot resurrect unavailable member
- newly available member may re-enter after refresh
- availability failure blocks roster and shows error

Historical edit:

- current availability does not change stored roster
- ended availability does not add historical member
- new availability does not remove historical member
- unresolved historical behavior remains unchanged

---

# 46. Test matrix: Analytics

Test:

- missing roster cell renders `N/A`
- tooltip says not applicable / not on roster
- N/A absent from status legend
- N/A absent from status filter
- behavior totals unchanged
- row still opens Member Analytics
- terminology used where appropriate

---

# 47. Manual smoke test

Use:

```text
Org A
Member terminology: Student
Attendance terminology: Session
```

Members:

```text
Ada - Soprano
Bea - Soprano
Cal - Tenor
```

Create:

```text
Ada unavailable
10 Oct - 10 Nov
Reason: Travel
```

## Scenario 1: Everyone session

Create:

```text
17 Oct
Eligibility OFF
```

Expected:

```text
Ada absent from Mark Session roster
Bea present
Cal present
Availability summary says 1 unavailable
```

Submit.

Analytics:

```text
Ada cell = N/A
Ada absent total does not increase
```

## Scenario 2: Eligibility + availability

Turn eligibility ON.

Create:

```text
24 Oct
Voice Part = Soprano
```

Raw rule matches:

```text
Ada + Bea
```

Availability removes:

```text
Ada
```

Mark roster:

```text
Bea only
```

## Scenario 3: after leave

Create:

```text
11 Nov
```

Ada should be expected again.

## Scenario 4: historical freeze

Create 17 Oct attendance while Ada unavailable.

Edit/remove Ada's availability.

Re-open old attendance.

Ada remains outside stored roster.

## Scenario 5: backdated period

Create attendance on 3 Oct with Ada expected.

Then create availability:

```text
1 Oct - 31 Oct
```

Re-open 3 Oct attendance.

Ada remains in old roster.

## Scenario 6: org switch

Org B has no availability.

Switch A -> B -> A.

No cache bleed.

---

# 48. Responsive/manual UI

Check around:

```text
420px
```

Light and dark mode.

Verify:

- Availability action accessible
- form fits
- date inputs fit
- reason fits
- cards/table do not overflow
- Create Attendance summary wraps cleanly
- Mark Attendance summary does not crowd Quick Mark
- Analytics N/A badge remains readable

---

# 49. Verification

Run:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false
CI=true yarn build
```

Report:

- Node
- Yarn
- suite count
- test count
- skipped count
- TypeScript
- build warnings
- Netlify preview
- manual test status

Do not merge or deploy.

---

# 50. Rollout

Frontend depends on backend availability endpoints.

Recommended:

```text
1. Backend 6D merged
2. Backend staging deployed
3. Backend API smoke tested
4. Frontend 6D merged
5. Frontend staging deployed
6. Full cross-app smoke test
```

Do not advertise frontend-before-backend compatibility for this phase.

Fail closed if availability cannot load.

---

# 51. Non-goals

Do **not** implement:

- Phase 6E analytics include/exclude toggle
- attendance-level analytics removal
- manual per-session add-member exception
- manual per-session remove-member exception
- automatic member-status changes
- retroactive roster rewrite
- recurring availability
- open-ended ranges
- approval workflow
- reason categories
- notifications
- calendar sync
- N/A as an attendance status
- Member Analytics redesign
- offline/PWA

---

# 52. Definition of done

Phase 6D frontend is complete when:

```text
A coordinator opens Ada's attendance availability.

They add:
10 Oct - 10 Nov
Travel.

On 17 Oct Create Session shows Ada as unavailable.

On Mark Session, Ada is not a markable row.

The officer does not mark Ada Absent or Apology.

Analytics shows N/A for Ada on that session and does not increase her
Present, Excused, Absent, or total expected-session counts.

On 11 Nov, Ada appears in new session rosters again.

Changing the availability period later never rewrites old attendance.
```

That is the Phase 6D frontend contract.

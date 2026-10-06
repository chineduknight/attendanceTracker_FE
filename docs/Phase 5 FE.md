# Presence Pro — Frontend Phase 5
## Attendance Eligibility Rules v1

## Goal
Let an officer define who is expected at a new attendance session using the organisation's configured option-type member fields.

Examples:
- Part = Soprano
- Part = Soprano or Alto
- Status = Active
- Part = Soprano or Alto AND Status = Active
- Department = Engineering AND Shift = Morning

A member who is not expected must not appear in the marking roster and must not become absent in analytics.

Do not merge or deploy. Return one PR into `staging`.

## Prerequisites
- Repo: `chineduknight/attendanceTracker_FE`
- Base: `staging`
- Start only after Phase 4 FE PR #60 is merged, because this phase extends the same CreateAttendance, MarkAttendance and template-picker surfaces.
- Rebase onto latest `staging` before review.
- Final manual verification must use the Phase 5 backend.

## Product semantics
Eligibility applies only when creating a NEW session.

The backend then freezes the roster.

Existing session edit must never recalculate eligibility from current member data.

## Shared type

```ts
interface AttendanceEligibilityRule {
  field: string;
  values: string[];
}
```

Extend:
- AttendanceTemplate with `eligibilityRules`
- currentAttendanceType with optional `eligibilityRules`

Default is `[]` = Everyone.

## Shared helper
Create e.g.:

`src/helpers/attendanceEligibility.ts`

Pure helpers should:
- extract option-type fields from member model
- normalize rules
- validate rules
- match a member
- filter a roster
- count eligible members
- produce friendly rule summary
- detect stale template rules

Semantics:
- values within one field = OR
- fields = AND
- [] = Everyone
- missing member field value does not match a selected rule

Do not hard-code choir terms.

## Member-model source
Use:

```ts
queryKeys.memberModel(org.id)
```

Offer only fields where:

```ts
field.type === "option"
```

and options are non-empty.

Do not offer text/email/number/tel/checkbox/date/color fields.

## Eligibility editor
Create a focused component such as:

`src/components/attendance/AttendanceEligibilityEditor.tsx`

Place on Create Attendance near the session details/template controls.

Default view:

```text
Expected members: 32 of 32
Everyone is expected
```

For each option field allow zero or more selected values.

Using the project's existing react-select multi-select pattern is fine.

Example:

```text
Part
[Soprano] [Alto]

Status
[Active]
```

Helper copy:

```text
Within a field, any selected value may match.
Across fields, all selected fields must match.
```

Provide:

```text
Clear eligibility
```

to return to Everyone.

## Preview count
Create Attendance should load:
- canonical current members
- current member model

Compute the preview client-side using the shared helper.

Show:

```text
Expected members: 10 of 32
```

If zero:

```text
No members match these eligibility rules.
```

Disable Continue.

Backend remains authoritative.

Do not send eligible member IDs from Create Attendance.

## Create Attendance state
Keep eligibility separate from AttendanceDetailsForm.

AttendanceDetailsForm remains:
- name
- category
- sub-category
- date

On Continue store:

```ts
currentAttendance = {
  name,
  date,
  categoryId?,
  subCategoryId?,
  eligibilityRules
}
```

Org switch resets rules to Everyone.

## Phase 4 template integration
Phase 5 template payload now includes rules.

### Apply template
Apply:
- name
- category
- sub-category
- eligibilityRules

Date must remain unchanged.

### Save/update
Send exactly:

```ts
{
  name,
  categoryId,
  subCategoryId,
  eligibilityRules
}
```

No date, members, attendance statuses, or resolved count.

New FE should always send explicit rules, including `[]` when clearing.

## Template staleness
Phase 4 already detects stale category placement.

Extend it to stale eligibility when:
- field removed
- field no longer option
- selected option removed/renamed

A stale template:
- stays visible
- is labelled Needs update
- cannot Apply
- can be repaired with Update
- can be deleted

Warning should distinguish category issue, eligibility issue, or both where practical.

Never silently fall back to Everyone.

Templates with missing/undefined eligibilityRules normalize to `[]`.

## Mark Attendance — new session
For new attendance only:

1. load full canonical current roster as today
2. filter roster using `currentAttendance.eligibilityRules`
3. sort/reconcile the draft against the eligible subset only
4. newly eligible members begin at configured default attendance status

Show a compact summary:

```text
Expected roster: 10 members
Part: Soprano, Alto · Status: Active
```

Phase 4 Cycle/direct marking/bulk/reset/undo then operate only on this expected roster.

## Draft behavior
For NEW session drafts:
- member outside current eligibility -> drop
- new member matching rules after refetch -> add at default
- member who stops matching before submit -> remove from draft
- localStorage must mirror the displayed eligible roster

If backend submit returns a roster/eligibility-changed 422:
- show backend error
- preserve draft
- Refresh can reload roster

Do not silently submit excluded members.

## Mark Attendance — existing session
Critical:

In edit mode, use the roster returned in the attendance record.

Do NOT:
- refilter from current eligibility
- add newly matching members
- drop members who no longer match
- apply current template rules
- use current member model to rebuild the roster

Eligibility rules on the record are read-only metadata only.

Quick-mark/bulk/undo operate over the stored roster.

## Submit contract
NEW attendance sends:

```ts
{
  name,
  date,
  categoryId?,
  subCategoryId?,
  organisationId,
  eligibilityRules,
  memberStatuses
}
```

UPDATE attendance sends:

```ts
{
  name,
  date,
  categoryId?,
  subCategoryId?,
  organisationId,
  memberStatuses
}
```

Do not send eligibilityRules on PUT.

No template ID.
No eligible-member ID list.
No legacy arrays.

Add exact body tests for both create and update.

## View Attendance
Show:

```text
Expected members: <attendance.length>
```

If stored eligibilityRules exist, show a small read-only friendly summary.

If current model no longer understands an old rule, do not alter the roster. Show:

```text
Eligibility rule has changed since this session was created.
The roster below is the historical snapshot.
```

Never recompute historical expectation.

## Analytics
A missing date/session cell currently uses "No record".

Change neutral missing-cell title/copy to:

```text
Not expected
```

or:

```text
Not on this session roster
```

Do not create a fourth attendance status.

Do not render it as Absent.

Behavior totals still come only from backend.

## Member analytics
No client denominator math.

Use backend `summary.totalSessions` and behavior counts.

If an organisation had 3 sessions but the member was expected at 2, Total Sessions should simply be 2.

## Query/cache rules
Use canonical:
- `queryKeys.members(org.id)`
- `queryKeys.memberModel(org.id)`
- `queryKeys.attendanceTemplates(org.id)`

Do not store an eligibility-filtered roster under `queryKeys.members(org.id)`.

## Permissions
Eligibility editing lives under Create Attendance and therefore existing `attendance.manage`.

Read-only attendance display remains under `attendance.view`.

No new permission.

## Automated tests

Use member model:
- name: text
- part: option [soprano, alto, tenor, bass]
- gender: option [female, male]
- status: option [active, associate, inactive]
- probationstatus: option [probation, graduated]
- profession: text

Roster at least 8 members.

### Helper
- [] matches everyone
- one field/one value
- one field/multi-value = OR
- multi-field = AND
- missing value does not match
- text field not offered
- normalization
- stale field
- stale option
- friendly summary

### Create Attendance
- defaults Everyone
- only option fields shown
- preview count updates
- OR works
- AND works
- Clear -> Everyone
- zero matches disables Continue
- Continue stores normalized eligibilityRules
- org switch clears A's rules
- date/details behavior unchanged

### Templates
- old template without rules -> []
- apply fills rules but not date
- save payload includes rules
- update payload includes explicit []
- stale category behavior remains
- stale eligibility -> Needs update
- stale template cannot Apply
- repair/delete works

### New-session Mark Attendance
- rule filters roster
- excluded members never render
- Phase 4 quick/bulk operate on eligible members only
- draft excludes non-eligible
- new matching member after refetch enters at default
- member ceasing to match drops from new-session draft

### Historical edit
- stored roster loads unchanged even if profiles no longer match
- newly matching member not added
- newly-created member not added
- inactive attendance status still works
- bulk/undo still works

### Submit
Create body includes:
- eligibilityRules
- memberStatuses

Update body excludes:
- eligibilityRules

No template ID/member list/bulk metadata/legacy arrays.

### Analytics
- missing session cell says Not expected / Not on roster
- no fake Absent badge

## Manual verification

Use Org A with 30+ members and model:
- part: soprano/alto/tenor/bass
- status: active/associate/inactive
- gender: female/male

### Everyone
1. Create session with no rules.
2. Expected count = all non-archived.
3. Mark and submit.

### One rule
4. Part = Soprano.
5. Expected count shrinks correctly.
6. Continue.
7. Mark page contains only sopranos.
8. Submit/reopen; session contains only sopranos.

### OR + AND
9. Part = Soprano + Alto.
10. Both included.
11. Add Status = Active.
12. Only active soprano/alto remain.
13. Bulk Present touches only expected roster.

### Analytics denominator
14. Pick an excluded Tenor.
15. Run analytics.
16. This session must NOT count as an absence for them.
17. Pick an eligible member marked absent.
18. It DOES count absent.
19. Member analytics Total Sessions reflects expected sessions only.

### Historical stability
20. Change an eligible member's Part after the session.
21. Change an excluded member into an eligible Part.
22. Add a brand-new matching member.
23. Reopen/edit old attendance.
24. Original roster remains unchanged.
25. New/moved members do not appear.
26. Save edit; backend still does not add them.

### Templates
27. Save "Soprano Rehearsal" with Part=Soprano.
28. Reuse it: rule + details apply, date remains.
29. Same template in Org B uses B's model only.
30. Remove/change an option so the template becomes stale.
31. Needs update appears; Apply disabled.
32. Repair with Update.

### Mobile
33. Run Create + Mark at ~420px.
34. Eligibility editor remains usable alongside Phase 4 quick-mark/bulk UX.

Record evidence/screenshots in PR.

## Verification
Run:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false
CI=true yarn build
```

Report Node/Yarn, exact suite/test counts, TS, build, warnings, manual matrix, preview URL if available.

## Non-goals
No:
- NOT/exclusion operators
- manual one-off include/exclude exceptions
- text/date/number eligibility
- eligibility editing on historical attendance
- recurring scheduling
- auto-created sessions
- calendar availability
- finance eligibility
- offline/PWA
- terminology redesign

## Expected result
> Officers define who is expected before marking begins; excluded members are not treated as absent, and an old session's expected roster never changes.

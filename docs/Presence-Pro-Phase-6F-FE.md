# Presence Pro — Phase 6F Frontend
## Manual Per-Session Attendance Exception

## Purpose

Support the final attendance/eligibility exception:

> A member was not expected for this session, but physically attended.

The frontend must let authorised officers deliberately add that person to **this session only**, while keeping the normal expected roster and historical rules truthful.

This frontend must be built against the Phase 6F backend contract, not by client-side roster invention.

---

# 1. Repository / target

Repository:

```text
chineduknight/attendanceTracker_FE
```

Target:

```text
staging
```

Start from current merged staging.

Do not merge/deploy.

Backend should land/deploy to staging before final real-server frontend integration.

---

# 2. Product semantics

Manual addition means:

```text
not expected
+
physically attended
+
added deliberately to this one session
```

It does **not** mean:

- changing eligibility,
- ending leave,
- editing the member profile,
- making them expected retroactively,
- adding them to future sessions.

Only statuses whose backend/configured behavior is:

```text
present
```

may be chosen.

Do not compare literal keys like `"present"`.

Use the existing status behavior model.

---

# 3. Two roster concepts in the UI

Once Phase 6F exists, do not use `attendance.length` as "expected count".

For stored attendance:

```text
expected =
entries where manuallyAdded != true

manual =
entries where manuallyAdded == true
```

Show this truthfully.

Recommended summary:

```text
Expected roster: 19 members
Added manually: 1
Session roster: 20
```

A compact variant is acceptable:

```text
Expected roster: 19
+ 1 added manually
```

but expected and manual counts must remain distinguishable.

If manual count is zero, preserve the current simple display where possible.

---

# 4. Stored roster helper

Update `helpers/storedRoster.ts`.

The current helper returns:

```text
resolved
unresolved
expectedCount = attendance.length
```

That is no longer sufficient.

Preserve manual metadata in the normalized entry types.

Recommended derived shape:

```ts
{
  resolved,
  unresolved,
  expectedCount,
  manualCount,
  rosterCount
}
```

Where:

```text
expectedCount = !manuallyAdded entries
manualCount = manuallyAdded entries
rosterCount = all stored entries
```

Unresolved entries must also retain whether they were manually added.

Do not silently convert an unresolved manual attendee into an expected member.

---

# 5. Attendance row presentation

Update `AttendanceMemberRow` or add a small wrapper/adjacent label so manual entries can display:

```text
Added manually
```

The existing attendance status badge remains.

Do not replace the status label.

Example:

```text
Ada Okafor        [Late] [Added manually]
```

Keep styling modest.

This is provenance, not a new attendance status.

---

# 6. View Attendance

This should be the primary historical management surface.

Anyone with attendance view permission may see:

- manual badge,
- manual reason if present,
- manual-added date if useful,
- expected/manual roster counts.

Only users with:

```text
attendance.manage
```

may add/remove manual members.

Use the existing RBAC `Can` pattern where appropriate.

---

# 7. Add member action

On View Attendance, provide:

```text
Add member to this session
```

Only for `attendance.manage`.

The action must be independent of eligibility rules being currently valid/stale.

It operates against the stored historical session.

However, if the backend reports edit locked/limit reached, show that error and do not fake success.

---

# 8. Add member dialog

Use a deliberate modal/dialog.

Suggested copy, terminology-aware:

```text
Add student to this rehearsal

Use this only when the student was not expected for this rehearsal but physically attended.
This changes this rehearsal only. It does not change eligibility, leave, or future rehearsals.
```

Fields:

```text
Member
Attendance status
Reason (optional)
```

## Member selector

Load the organisation's current members from the canonical member query.

Candidates:

```text
active/current members
minus every member already in the stored session roster
```

Do not hide a candidate merely because:

- they fail the session's eligibility rules;
- they have an availability/leave period covering that date.

Those are precisely valid reasons for this feature.

The backend remains authoritative.

Search should work by member name.

## Status selector

Show only active statuses with:

```text
behavior == "present"
```

If one present-behavior status exists, it may be preselected.

If several exist:

```text
Present
Late
Arrived Late
...
```

allow selection.

Never show Excused/Absent behavior statuses.

## Reason

Optional textarea.

Max:

```text
200
```

Visible counter preferred.

Blank reason should be omitted or sent blank only according to the final backend contract; prefer trimming/omission if backend treats blank as null.

---

# 9. Existing add request

Add request constant:

```text
POST /attendance/:organisationId/:id/manual-members
```

Payload:

```json
{
  "memberId": "...",
  "status": "late",
  "reason": "Joined the sectional rehearsal"
}
```

No extra metadata.

Never send:

```text
manuallyAdded
manuallyAddedAt
manuallyAddedBy
editCount
eligibilityRules
attendance[]
```

---

# 10. Remove manual member

Only a row whose stored entry has:

```text
manuallyAdded === true
```

may show:

```text
Remove from this session
```

Only for `attendance.manage`.

Use a confirmation dialog.

Suggested copy:

```text
Remove Ada from this rehearsal?

Ada was manually added to this rehearsal.
Removing her will remove this historical attendance entry from this rehearsal only.
```

Do not show removal for a normal expected member.

Endpoint:

```text
DELETE /attendance/:organisationId/:id/manual-members/:memberId
```

---

# 11. Edit-limit UX

Existing-session manual add/remove consumes an attendance edit and respects edit locks.

The frontend should not try to reproduce backend edit-limit business rules beyond existing display helpers.

If record state already says no edits remain, disabling/hiding the action is acceptable if consistent with current attendance editing UX.

But backend remains authoritative.

Important:

A stale screen may show the action while another officer consumes the final edit.

If backend rejects:

- show backend error;
- do not mutate local state optimistically.

Creation-time manual additions do not consume an edit.

---

# 12. Create / Mark Attendance

Support manual addition while creating a new session.

The officer should not have to:

```text
save
→ reopen
→ manually add
```

when the member is physically standing there.

Add an action near the Expected Roster summary:

```text
Add member to this session
```

This applies only to the current draft.

The normal expected roster calculation remains:

```text
members
→ eligibility
→ availability
```

Manual members are stored separately in local state.

Do not merge them into the expected roster derivation.

---

# 13. Creation-time state

Keep separate collections:

```ts
expectedMembers
manualAdditions
```

or equivalent.

Do not sneak manual members into ordinary expected-members state in a way that makes the UI call them expected.

The final create request sends:

```json
{
  "memberStatuses": [...expected marks...],
  "manualAdditions": [
    {
      "memberId": "...",
      "status": "present-like-key",
      "reason": "..."
    }
  ]
}
```

The backend decides whether each manual addition is valid.

---

# 14. Create candidate list

Manual candidate search on create:

```text
current organisation members
minus current expected roster
minus already-added manual members
```

Do not subtract unavailable members.

Do not require matching eligibility rules.

That is the feature.

If a person becomes expected due to roster refresh while still present in `manualAdditions`, reconcile safely:

```text
remove them from manualAdditions
keep/transfer their selected present status to the expected roster if practical
```

At minimum do not submit the same member through both fields.

Test this stale/refresh case.

---

# 15. Draft persistence

`MarkAttendance` currently persists the working roster to localStorage.

If manual additions are supported during creation, persist them explicitly too.

Do not corrupt old drafts.

Use a versioned or backward-compatible shape if necessary.

On changing session/date/rules or refreshing roster:

- expected draft reconciliation follows existing behavior;
- valid manual additions remain manual unless the member becomes expected;
- manual additions must never silently become expected because of array concatenation.

On successful submit, clear all related draft state.

---

# 16. Existing Edit Attendance screen

The current MarkAttendance update mode edits the stored roster.

Manual entries should appear there with:

```text
Added manually
```

badge.

Their status interaction must only cycle/select statuses whose behavior is `present`.

Do not allow quick-mark/bulk operations to turn a manual entry into Excused or Absent.

This is important.

Possible implementation:

```text
normal rows
→ existing quick-mark behavior

manual rows
→ only present-behavior status cycle
```

Bulk operations must either:

- skip manual rows when target behavior is not present; or
- be disabled/refused for those rows.

Never silently set a manual member to Absent because "Reset" uses the organisation default absent status.

This is a critical frontend safeguard.

Backend will enforce it too.

---

# 17. Refresh / edit behavior

When an existing attendance loads from backend:

- treat stored roster as historical truth;
- do not re-run eligibility or availability;
- preserve `manuallyAdded` metadata;
- do not remove manual attendees because they fail current rules.

The ordinary update request may continue using `memberStatuses`, because the backend knows which stored entries are manual and preserves provenance.

Do not send manual metadata in PUT.

---

# 18. View filters / counts

Manual attendees remain ordinary rows for:

- search,
- attendance-status filter,
- member-status filter,
- status counts.

Their attendance status contributes normally.

The manual badge is supplementary.

Expected roster count must exclude them.

A separate manual count should remain visible even if search/filter hides the row, because it describes the stored session.

---

# 19. Share / single-session export

Do not client-filter manual attendees out.

They physically attended and are part of the stored session.

Existing share/export should continue to include them.

No frontend special analytics handling.

---

# 20. Analytics

No analytics page changes expected.

Do not:

- add "Manual" to status legend;
- create a manual analytics column;
- synthesize N/A;
- repair analytics client-side.

The backend's existing analytics should count their present-behavior result.

Phase 6E exclusion still controls whole-session inclusion.

---

# 21. Cache invalidation

After existing-session add/remove, invalidate only the current organisation's relevant caches.

At minimum:

```text
attendance detail
attendance list
organisation analytics root
member analytics root
```

Because adding/removing a physical attendee changes analytics immediately.

If single-attendance export is query-cached, invalidate/refetch according to existing conventions.

Never invalidate another organisation.

Creation-time submission follows the normal attendance creation invalidation/navigation flow.

---

# 22. Mutation behavior

Create a focused hook if that matches current patterns, for example:

```text
useManualAttendanceMember
```

or separate add/remove mutations.

Requirements:

- prevent accidental double submit;
- no optimistic roster mutation unless rollback is watertight;
- surface backend error text;
- close modal only on success;
- invalidate current-org caches on success.

---

# 23. Terminology

Use organisation terminology:

```text
member/student/singer
attendance/rehearsal/session
```

Examples:

```text
Add student to this rehearsal
Added manually
Remove from this rehearsal
```

Do not hardcode choir-specific nouns.

---

# 24. Empty expected roster creation

Backend Phase 6F may allow:

```text
Expected roster: 0
Added manually: 1
```

when availability removed everyone but somebody physically attended.

The frontend must not keep the current blanket create disable:

```text
allMembers.length === 0
```

if that state only refers to expected members.

Submission should be allowed when:

```text
expected member count + manual addition count > 0
```

while preserving existing loading/error guards.

Do not allow an actually empty final session.

---

# 25. Backend error handling

Handle and display backend errors for at least:

- member already on roster;
- invalid/foreign/archived member;
- non-present status;
- edit locked;
- edit limit reached;
- attendance not found;
- member already manually added;
- removing normal expected member;
- removing last roster entry.

Do not invent local success when backend refuses.

---

# 26. Frontend tests

At minimum:

## View Attendance

1. normal entries show no manual badge.
2. manual entry shows `Added manually`.
3. expected count excludes manual entries.
4. manual count is correct.
5. view-only user sees provenance but no add/remove controls.
6. manager sees add action.
7. add dialog explains one-session-only semantics.
8. candidate list excludes current roster.
9. candidate list does not hide leave/non-eligible members.
10. status selector contains only active present-behavior statuses.
11. optional reason max 200.
12. correct POST payload.
13. failed add leaves screen unchanged and shows backend error.
14. successful add invalidates current-org detail/list/org analytics/member analytics.
15. cross-org caches untouched.
16. only manual rows get remove action.
17. remove confirmation is explicit.
18. correct DELETE endpoint.
19. failed remove leaves row visible.
20. successful remove refetches/invalidation.

## Create Attendance

21. can add non-expected member to draft.
22. manual member is visually separate from expected count.
23. manual member may be unavailable.
24. manual member may fail eligibility.
25. create payload uses `manualAdditions`, not widened `memberStatuses`.
26. same member never appears in both arrays.
27. manual status only present-behavior.
28. manual draft persists safely.
29. roster refresh reconciles member becoming expected.
30. submit enabled for 0 expected + 1 manual.
31. submit disabled for 0 expected + 0 manual.
32. successful create clears manual draft.

## Edit Attendance

33. manual metadata survives loading/editing.
34. manual row cannot be changed to excused.
35. manual row cannot be changed to absent.
36. manual row can change between two present-behavior statuses.
37. Reset/default-absent does not convert manual rows.
38. bulk absent/excused operation skips or safely blocks manual rows.
39. ordinary expected rows keep existing quick-mark behavior.
40. PUT sends status only, never spoofed manual metadata.

## Historical / terminology

41. unresolved manual entry remains identified as manual.
42. custom member/attendance terminology appears correctly.
43. Phase 6E excluded sessions still show manual rows in historical detail even though analytics exclude whole session.
44. no synthetic manual attendance status introduced.

---

# 27. Likely files

Expected areas:

```text
src/pages/MarkAttendance.tsx
src/pages/ViewAttendance.tsx
src/components/attendance/AttendanceMemberRow.tsx
src/components/attendance/ExpectedRosterSummary.tsx
src/components/attendance/UnresolvedRosterEntries.tsx
src/helpers/storedRoster.ts
src/services/api/request.ts
src/services/api/queryKeys.ts
new manual-addition component/hook/helper files as appropriate
tests
docs/Phase 6F brief if project convention requires
```

Keep the implementation focused.

---

# 28. Non-goals

Do not:

- build a generic roster editor;
- let users remove expected members;
- modify member profiles;
- modify eligibility rules;
- modify availability periods;
- modify templates;
- add manual absent/excused entries;
- add a "Manual" analytics status;
- change attendance-rate formulas;
- change recognition logic;
- change PDF;
- change collapse semantics;
- build Welfare yet;
- build PWA/offline;
- add imports/bulk member tooling;
- merge/deploy.

---

# 29. Verification

Before handoff:

```text
npx tsc --noEmit
full frontend test suite
focused Phase 6F tests
CI=true yarn build
changed-file lint
Netlify preview if PR integration provides it
```

Then test against the real Phase 6F backend staging server before merge.

Mocks alone are not enough for final acceptance.

---

# 30. Completion report

Return:

1. branch,
2. commits,
3. PR link,
4. changed files,
5. View Attendance add/remove UX,
6. creation-time manual-addition UX,
7. how expected/manual counts remain separate,
8. how present-behavior-only statuses are enforced in UI,
9. how bulk/reset avoids corrupting manual entries,
10. exact API payloads/routes,
11. cache invalidation behavior,
12. focused/full test results,
13. TypeScript/build/lint result,
14. real-backend integration status,
15. confirmation nothing merged/deployed.

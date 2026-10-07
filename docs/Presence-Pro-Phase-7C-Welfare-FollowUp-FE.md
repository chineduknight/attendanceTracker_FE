# Presence Pro — Phase 7C Frontend
## Welfare Follow-up Log + Optional Workflow

## Product goal

Add lightweight human follow-up to Welfare without making officers run a ticketing system.

The UI must support:

```text
See an insight
→ optionally log a follow-up

Know something outside attendance
→ manually add a welfare follow-up

One-off interaction
→ save and close immediately

Ongoing situation
→ optionally keep open and optionally choose a next date
```

Nothing should be mandatory merely because a Welfare insight exists.

---

## 1. Repository / rollout

Repository: `chineduknight/attendanceTracker_FE`

Target: `staging`

Build against the Phase 7C backend. Do not merge/deploy without explicit authorization.

---

## 2. Preserve Phase 7A route access

The Welfare page remains:

```text
attendance.view
featureVisibility.welfare
```

Do not switch the whole page to `welfare.view`.

Existing attendance viewers still see:

- Needs Check-in,
- Communicated,
- Encouragement,
- Currently Away,
- Returning Soon,
- Birthday snapshot when permitted.

Private follow-up records are separately permissioned inside the page.

---

## 3. Add Welfare permission area

Frontend RBAC adds:

```text
welfare.view
welfare.manage
```

Update:

```text
src/rbac/permissions.ts
src/rbac/copy.ts
RBAC types/tests
```

Permission editor copy:

```text
Welfare

View
Read private Welfare follow-up records

Manage
Create and update Welfare follow-ups
```

---

## 4. Capability behavior inside Welfare

Use:

```ts
const canViewFollowUps = has("welfare.view");
const canManageFollowUps =
  has("welfare.view") && has("welfare.manage");
```

Without `welfare.view`:

- no follow-up API request,
- no private notes/history,
- no open-follow-up badge.

With view but not manage:

- records are read-only,
- no create/edit/archive actions.

---

## 5. Shared types

Add follow-up types, e.g.:

```text
src/components/welfare/followUps/types.ts
```

Cover:

```ts
sourceType: "manual" | "attention" | "communicated" | "encouragement"
workflowStatus: "open" | "closed"
member
reason
note
recordDate
sourceSignals/sourceAsOf
nextFollowUpDate
assignedTo
createdBy/updatedBy
closedAt
revision
createdAt/updatedAt
```

---

## 6. Query keys

Extend Welfare keys:

```ts
welfare: {
  root(orgId),
  overview(orgId, asOf),
  followUps: {
    root(orgId),
    list(orgId, asOf, workflowStatus?, memberId?, assignedToUserId?)
  }
}
```

All tenant scoped.

Do not put follow-up notes into Zustand.

---

## 7. Request constants

Add:

```text
GET/POST /welfare/:organisationId/follow-ups
PATCH/DELETE /welfare/:organisationId/follow-ups/:id
```

---

## 8. Follow-up section

Render only for `welfare.view`.

Recommended layout:

```text
WELFARE & ENGAGEMENT

existing summary cards
review-window explanation

FOLLOW-UPS
[ Open ] [ Due Today ] [ Overdue ]
[ + Add welfare follow-up ]   // manage only

Open follow-ups
Recent history

existing Needs Check-in / Communicated / Encouragement / Away / Birthdays...
```

This is additive. Do not replace the existing insight sections.

---

## 9. Summary counts

Use backend summary:

```text
Open
Due Today
Overdue
```

Never convert follow-up API failure into zeros.

The follow-up section can fail without breaking the rest of Welfare.

---

## 10. Manual add

For manage users show:

```text
+ Add welfare follow-up
```

Dialog fields:

```text
Member                 required
Date                   default local today
Reason                 required
Note                   optional

Keep open for follow-up?   default OFF

if ON:
  Next follow-up date   optional
  Assignment            optional
```

This must be valid:

```text
Member: Ada
Reason: Bereavement
Keep open: OFF
Note: blank
```

---

## 11. Privacy helper

Under Note show:

> Keep notes brief and relevant. Avoid storing unnecessary sensitive personal information.

Do not prompt for diagnoses or detailed private history.

---

## 12. Open toggle

Label:

```text
Keep open for follow-up
```

Default OFF.

OFF sends:

```text
workflowStatus = closed
nextFollowUpDate = null/omitted
```

ON sends:

```text
workflowStatus = open
```

Next date stays optional.

---

## 13. Manual member selector

Use the canonical organisation member query.

Candidate rule:

```text
non-archived members
```

Do not filter by dynamic member status.

On organisation change, clear selection and close/re-key the dialog so Org A can never submit into Org B.

---

## 14. Insight-based follow-up

Add a small manage-only action on `AttendanceInsightCard`:

```text
Add follow-up
```

Open the same dialog with:

```text
member preselected + locked
sourceType = attention / communicated / encouragement
sourceSignals = backend insight signals
sourceAsOf = overview.asOf
reason = prefilled human-readable text
```

The officer may edit reason and note.

Nothing is created until explicit Save.

---

## 15. Suggested prefill text

Attention examples:

```text
2 consecutive unexplained absences
Physical presence reduced, with unexplained absences
```

If multiple signals:

```text
Attendance follow-up: 2 consecutive unexplained absences; physical presence reduced
```

Communicated:

```text
Physical presence reduced, but communicated
```

Encouragement:

```text
Physical presence improved
```

These are convenience defaults, not fixed categories.

---

## 16. Manual source

Manual dialog uses:

```text
sourceType = manual
sourceSignals = []
sourceAsOf = null
```

Do not expose technical source fields to the user.

---

## 17. Open follow-up cards

Show compactly:

```text
Member
Reason
Open badge

Next follow-up: 12 Oct
or Open — no date set

Assigned to: Welfare II
or Unassigned

Short note excerpt, if present
Recorded by
Record date

[Edit] [Close]
```

Do not dump long private notes on the overview.

---

## 18. Due labels

For one returned open record:

```text
next date < today  → Overdue
next date == today → Due today
next date > today  → Follow up 12 Oct
null                → Open — no date set
```

Backend summary remains authoritative for counts.

No browser notifications.

---

## 19. Closed history

Show compact recent closed records:

```text
Recent follow-up history
```

Example:

```text
7 Oct
Grace Eze
Encouragement after recent improvement
Logged by Knight
```

Do not force officers to “resolve” a one-off record. It was already saved closed.

---

## 20. Open-follow-up badge on insight cards

When user has `welfare.view`, match open records by `memberId`.

Display:

```text
Open follow-up
```

or:

```text
2 open follow-ups
```

Presentation only.

Do not hide/suppress the insight.

---

## 21. Edit dialog

Manage users may edit:

```text
Date
Reason
Note
Open/Closed
Next follow-up date
Assignment
```

They may not change:

```text
Member
Source type
Source signals
Source as-of
Created by
```

Send loaded `expectedRevision`.

---

## 22. Concurrency UX

On 409:

```text
This welfare follow-up was changed by someone else. Refresh and try again.
```

Invalidate/refetch current org follow-up cache.

Do not silently retry a note edit.

---

## 23. Close/reopen

Provide manage actions:

```text
Close follow-up
Reopen follow-up
```

Close copy means:

```text
No further follow-up is currently pending.
```

Do not say “problem solved”.

---

## 24. Archive

Provide secondary destructive action:

```text
Archive record
```

Manage only, with confirmation.

This is mainly for accidental/duplicate records.

Do not call it hard Delete.

---

## 25. Assignment UX

Assignment is optional.

If user has `officers.view`:

- reuse current organisation officer list;
- show optional assignee selector;
- only show candidates whose effective permissions include `welfare.view`.

If user lacks `officers.view`:

- do not call officer-list API;
- hide general assignee picker.

Optionally provide `Assign to me` when current user has `welfare.view`.

No assignment is required.

---

## 26. Assignment is not a reminder system

Helper copy may say:

```text
Assignment is for visibility only; Presence Pro will not send a notification in this phase.
```

---

## 27. Member Welfare history

Allow viewing records filtered by `memberId` from Welfare, using a modal/drawer or lightweight panel.

Do not build a new full Member Profile page in Phase 7C.

History includes:

```text
manual
attention
communicated
encouragement
```

newest first.

---

## 28. Analytics/leave do not mutate follow-ups

If attendance improves, a signal may disappear while an open follow-up remains open.

If the member goes on leave, the follow-up also remains as recorded.

Humans decide when to close it.

---

## 29. Cache invalidation

After create/update/archive invalidate only:

```text
queryKeys.welfare.followUps.root(orgId)
```

Do **not** invalidate:

- attendance analytics,
- member analytics,
- Welfare overview,
- birthdays,
- member list.

Follow-up records are independent.

---

## 30. Organisation switching

Critical:

```text
Org A private notes must never flash under Org B.
```

Use org-scoped keys and re-key/close dialogs and member/officer selectors on org switch.

No follow-up draft survives an organisation switch.

---

## 31. Route behavior

Keep Welfare route under:

```text
attendance.view + welfare feature visibility
```

Do not require `welfare.view` just to open the page.

The private section gates itself internally.

---

## 32. Permission editor

Add `welfare` area and copy:

```text
Welfare

View
Read private welfare follow-up records

Manage
Create, edit, close and archive welfare follow-ups
```

Do not assume Manage automatically implies View.

---

## 33. No new feature visibility setting

Reuse:

```text
featureVisibility.welfare
```

Do not add another visibility toggle just for follow-ups.

---

## 34. No reminders / exports

Do not add:

- email reminder,
- WhatsApp reminder,
- push notification,
- notification bell,
- calendar integration,
- scheduled jobs,
- PDF/Excel export of private notes.

---

## 35. Tests — RBAC/privacy

At minimum:

1. attendance.viewer still opens Welfare;
2. no welfare.view → no follow-up API call;
3. welfare.view renders records;
4. view without manage has no write actions;
5. view+manage gets actions;
6. featureVisibility.welfare off still hides module;
7. private note text never renders for user without welfare.view.

---

## 36. Tests — manual create

- Add button opens dialog;
- member required;
- reason required;
- note optional;
- default date local today;
- Keep open defaults OFF;
- closed one-off submits without note;
- open submits with no next date;
- open with next date submits;
- privacy helper visible;
- exact manual source payload.

---

## 37. Tests — insight create

- attention preselects/locks member;
- attention signals sent;
- communicated source sent;
- encouragement source sent;
- sourceAsOf equals overview asOf;
- reason prefilled but editable;
- no create until explicit Save.

---

## 38. Tests — list/summary

- Open / Due Today / Overdue counts render;
- API failure does not become zeros;
- open no-date label correct;
- overdue label correct;
- closed history separate.

---

## 39. Tests — workflow/concurrency/archive

- edit sends expectedRevision;
- close refetches and removes due state;
- reopen works;
- 409 shows stale-update message and refetches;
- archive confirmation sends DELETE with expected revision;
- archived record disappears after success.

---

## 40. Tests — assignment

- officers.view enables picker;
- no officers.view means no officer-list API call;
- only Welfare-capable officers shown;
- assignment optional;
- Assign to me correct if implemented.

---

## 41. Tests — tenancy

- Org A/B keys differ;
- switching A→B removes A note text immediately;
- open A dialog cannot submit after B switch;
- member/assignee selection cannot carry across.

---

## 42. Tests — no side effects

- follow-up create does not invalidate Welfare overview;
- does not invalidate attendance/member analytics;
- does not mutate member data;
- insight stays visible if overview still returns it.

---

## 43. Accessibility

- Open/Closed use text, not color alone;
- due state uses text;
- fields have labels;
- note privacy helper associated with field;
- archive confirmation keyboard accessible;
- action labels are explicit.

---

## 44. Likely files

Expected new:

```text
src/components/welfare/followUps/WelfareFollowUpSection.tsx
src/components/welfare/followUps/WelfareFollowUpCard.tsx
src/components/welfare/followUps/WelfareFollowUpDialog.tsx
src/components/welfare/followUps/WelfareFollowUpHistory.tsx
src/components/welfare/followUps/types.ts
src/hooks/useWelfareFollowUps.ts
```

Expected changed:

```text
src/pages/Welfare.tsx
src/components/welfare/AttendanceInsightCard.tsx
src/rbac/permissions.ts
src/rbac/copy.ts
src/services/api/request.ts
src/services/api/queryKeys.ts
RBAC tests
Welfare tests
```

Reuse existing member/officer query code where possible. Do not duplicate tenant logic.

---

## 45. Non-goals

Do not:

- create automatic cases,
- require follow-up for every insight,
- require notes,
- require assignment,
- require next date,
- auto-close from attendance,
- send reminders,
- send WhatsApp,
- add AI,
- add risk/engagement score,
- change attendance analytics,
- modify birthdays,
- build a CRM/ticket system.

---

## 46. Real-backend acceptance

Smoke at least:

### Manual one-off

```text
Bereavement
No note
Closed immediately
```

### Manual ongoing

```text
Family situation
Open
No next date
```

### Dated follow-up

```text
Open
Next date tomorrow
```

### Attention

Create from consecutive-absence card.

### Encouragement

Create from improvement card and close immediately.

### Privacy

Attendance-only officer sees 7A insights but no follow-up notes.

### Tenant switching

Switch organisations while dialog/list is open.

### Concurrency

Edit same record from two sessions/tabs; stale save gets 409.

---

## 47. Verification

Before handoff:

```text
Node 22
Yarn 1.22.22
focused follow-up tests
RBAC tests
Welfare 7A regression tests
full frontend suite
npx tsc --noEmit
changed-file lint
CI=true yarn build
Netlify preview
real backend staging smoke
```

---

## 48. Completion report

Return:

1. branch,
2. commits,
3. PR link,
4. changed files,
5. RBAC/privacy behavior,
6. manual follow-up UX,
7. insight follow-up UX,
8. optional workflow behavior,
9. assignment behavior,
10. query/cache isolation,
11. concurrency UX,
12. focused/full tests,
13. TypeScript/build/lint,
14. staging integration result,
15. confirmation nothing merged/deployed.

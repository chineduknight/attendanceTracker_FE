# Presence Pro — Phase 7A Frontend
## Welfare & Member Engagement — Insight Foundation

## Purpose

Create the first Welfare & Member Engagement page.

It should help leadership answer:

```text
Who may need a check-in?
Who is improving and deserves encouragement?
Who is legitimately away?
Who is returning soon?
Whose birthday is coming up?
```

Phase 7A is read-only.

## 1. Repository / rollout

Repository: `chineduknight/attendanceTracker_FE`
Target: `staging`

Build against the Phase 7A backend.

Backend should deploy to staging before final integration because `welfareSettings`, `featureVisibility.welfare` and the Welfare endpoint are new.

Do not merge/deploy without explicit authorization.

## 2. Product tone

Avoid:
- Poor members
- Bad attendance
- Defaulters
- Problem members
- Worst attendance

Use:
- Needs a check-in
- Physical presence reduced
- Unexplained absences
- Reduced presence, communicated
- Improving
- Currently away
- Returning soon

Always explain why someone appears.

## 3. New route

Add:

```text
/welfare
```

or project-consistent equivalent.

Route config:

```text
permission: attendance.view
feature: welfare
title: Welfare & Engagement
```

Add a dashboard/nav action with an appropriate icon.

Do not add a new RBAC permission area in Phase 7A.

## 4. Feature visibility

Add:

```text
welfare: true
```

to effective feature visibility.

Update:
- `OrganisationFeatureVisibility`
- defaults
- labels
- settings UI/payload
- selected-org types
- tests

Feature visibility is presentation only.

## 5. Welfare settings helper

Add e.g.:

```text
src/helpers/welfareSettings.ts
```

Effective default:

```ts
{ reviewWindowDays: 14 }
```

Legacy persisted organisations missing the field must work without clearing localStorage.

## 6. Organisation Settings

Add section:

```text
Welfare & Engagement
```

Field:

```text
Review window (days)
```

Validation:

```text
integer
7–90
default 14
```

Helper copy:

```text
Presence Pro compares the most recent period with the immediately preceding period of the same length.

Choose a shorter window for organisations that meet several times a week and a longer window for organisations that meet less often.
```

Examples may say:

```text
Frequent meetings: 7–14 days
Monthly meetings: around 30 days
```

Respect settings.view/settings.manage.

## 7. Settings compatibility

Follow the existing backend-support pattern.

Only send `welfareSettings` if the backend returned support.

Preserve selected-org RBAC fields when merging save response.

Prevent Org A save response from overwriting Org B after switch.

Invalidate:
- current organisation detail
- all organisations
- current organisation Welfare root

## 8. Query keys

Add:

```ts
welfare: {
  root: (organisationId) =>
    ["welfare", organisationId],

  overview: (organisationId, asOf) =>
    ["welfare", organisationId, "overview", asOf]
}
```

Tenant scoped only.

## 9. Welfare endpoint

Add request constant for:

```http
GET /welfare/:organisationId/overview?asOf=YYYY-MM-DD
```

Use the current local business date as `asOf`.

Do not calculate welfare signals client-side.

## 10. Page layout

Recommended:

```text
Welfare & Engagement

[ Needs Check-in ] [ Encouragement ] [ Currently Away ] [ Returning Soon ]
[ Birthdays This Week, when permitted ]

Review window: Last 14 days vs previous 14 days

Needs Check-in
Communicated
Encouragement
Currently Away
Returning Soon
Upcoming Birthdays
```

The page should load useful data immediately, no Search button required.

## 11. Review window explanation

Always show exact periods.

Example:

```text
Review window: 14 days

Recent
24 Sep – 7 Oct

Previous
10 Sep – 23 Sep
```

Never show only a percentage change with no comparison context.

## 12. Needs Check-in cards

Example:

```text
Ada Okafor

2 consecutive unexplained absences

Physical presence:
Previous 100%
Recent 50%
↓ 50 percentage points

Recent period:
Present 3
Excused 1
Absent 2

Last present: 28 Sep

[View attendance history]
```

Multiple backend attention signals should appear on one member card.

## 13. Communicated section

Informational, not alarming.

Example:

```text
Chika Obi

Physical presence reduced, but communicated

Previous presence: 100%
Recent presence: 50%

Recent:
2 Present
2 Excused
0 Absent

Attendance Rate: 100%
```

Helpful note:

```text
The missed sessions were excused.
```

Do not classify automatically as Needs Check-in.

## 14. Encouragement section

First-class positive feature.

Example:

```text
Grace Eze

Improving 🎉

Physical presence:
Previous 50%
Recent 100%
↑ 50 percentage points

Recent:
6 Present
0 Excused
0 Absent

[View attendance history]
```

Use wording such as:

```text
Physical presence improved
```

not "Score improved".

## 15. Presence vs Attendance Rate

Keep clear:

```text
Physical Presence = Present / Expected
Attendance Rate = (Present + Excused) / Expected
```

Physical Presence is the trend metric.

Attendance Rate may appear as context, especially in Communicated.

## 16. Member Analytics links

Each insight card should link to the existing Member Analytics page.

Use:

```text
fromDate = previous.fromDate
toDate = recent.toDate
```

so the officer lands on the full comparison horizon.

## 17. Currently Away

Show:
- member name
- leave dates
- reason when present
- return date

Example:

```text
Favour James
Away: 20 Sep – 10 Oct
Returns: 11 Oct
Reason: Travelling
```

Do not reclassify these members on the frontend.

## 18. Returning Soon

Show the backend list sorted by return date.

Example:

```text
Returning this week

11 Oct — Favour James
13 Oct — Ada Okeke
```

## 19. Birthday snapshot

Reuse the existing Birthday API.

Show only when:

```text
user has members.view
AND birthday feature is visible
AND member model has a configured `dob` date field
```

If not, hide the birthday snapshot without affecting Welfare.

## 20. Birthday snapshot range

Phase 7A:

```text
Today through next 7 days
```

Use existing backend year-wrap behavior.

Do not redesign Birthday export/share in Phase 7A.

## 21. Birthday RBAC

Welfare route requires `attendance.view`.

Birthday API requires `members.view`.

Therefore an attendance viewer without members.view still gets attendance/leave welfare sections, but not birthdays.

Do not call Birthday endpoint without members.view.

## 22. Birthday page boundary

Do not substantially change `Birthday.tsx` in 7A.

Phase 7B will add:
- Today
- Next 7 Days
- Next 30 Days
- auto-load
- summary cards
- cleaner machine/display date handling

## 23. Empty states

Examples:

```text
No members currently meet the check-in signals for this review window.

No major improvement signal yet for this comparison period.

No members are currently recorded as away.

No birthdays in the next 7 days.
```

Do not imply failure.

## 24. Loading/error independence

Welfare overview and birthday snapshot are separate queries.

Birthday failure must not break Welfare.

Do not turn API errors into fake zero counts.

## 25. Tenant switching

All queries include organisationId.

On org switch, no previous org welfare/birthday/leave data may remain visible.

## 26. Terminology

Use organisation terminology for member/attendance words.

Do not use labels as identifiers.

## 27. No mutations yet

Do not add:
- Mark contacted
- Resolve
- Add welfare note
- Assign officer
- Schedule follow-up
- automatic messaging

Those belong to Phase 7C.

## 28. No opaque score

Do not display:
- Engagement score
- Risk score
- Welfare score

Every insight must expose its reason.

## 29. Accessibility

Do not rely on red/green alone.

Use labels/icons/text for:
- attention
- communicated
- improvement
- away
- returning

Buttons/links must be keyboard accessible.

## 30. Likely files

New:
```text
src/pages/Welfare.tsx
src/components/welfare/WelfareSummaryCards.tsx
src/components/welfare/AttendanceInsightCard.tsx
src/components/welfare/AvailabilitySection.tsx
src/components/welfare/BirthdaySnapshot.tsx
src/helpers/welfareSettings.ts
src/hooks/useWelfareOverview.ts
tests
```

Changed:
```text
src/routes/pagePath.ts
src/routes/protectedRouteConfig.tsx
src/config/navActions.ts
src/helpers/organisationPresentation.ts
src/helpers/orgPayloads.ts
src/pages/OrganisationSettings.tsx
src/zStore.ts
src/services/api/request.ts
src/services/api/queryKeys.ts
src/components/settings/PresentationSettings.tsx
tests
```

Avoid touching analytics calculations, MarkAttendance and PDF code.

## 31. Key frontend tests

### Settings
- legacy default 14
- stored 7/30 render correctly
- 6/91/decimal rejected
- settings.manage controls editing
- unsupported backend omits welfareSettings
- supported backend sends it
- Org A save cannot overwrite Org B
- save invalidates only current org Welfare cache
- welfare visibility defaults true

### Routing/RBAC
- route/nav visible with attendance.view + feature on
- hidden/redirected when feature off
- blocked without attendance.view
- owner allowed
- birthday section hidden without members.view
- birthday API not called without members.view

### Insight rendering
- attention reason visible
- multiple reasons on one member
- exact rate/change shown
- last-present date shown
- Member Analytics link uses comparison horizon
- communicated visually distinct from attention
- encouragement uses positive copy
- no "poor attendance" copy
- away/returning sections render correctly
- no client reclassification of backend arrays

### Birthday snapshot
- dob + members.view + birthday feature triggers query
- no dob hides section
- birthday feature off hides section
- next-7-days renders
- birthday error does not break Welfare
- year-wrap works with existing backend contract

### Tenancy
- query keys include organisationId
- Org A → Org B clears A data
- birthday cache tenant scoped
- settings invalidation current org only

## 32. Real-backend acceptance

Before merge test against deployed Phase 7A backend with:
- frequent org using 7/14-day window
- monthly-style org using 30-day window
- Present→Absent decline
- Present→Excused decline
- improvement
- current leave
- returning soon
- Phase 6E excluded attendance
- Phase 6F manual Present
- collapse ON date+category
- attendance viewer without members.view

## 33. Non-goals

Do not:
- redesign Birthday page
- store follow-ups
- send messages automatically
- add notes/tasks
- add engagement score
- change analytics formulas
- change member analytics
- change PDF
- change attendance marking
- change eligibility/availability semantics
- add finance to Welfare
- add PWA/offline

## 34. Verification

Report:
- Node 22
- Yarn 1.22.22
- focused Welfare/settings tests
- full frontend suite
- `npx tsc --noEmit`
- changed-file lint
- `CI=true yarn build`
- Netlify preview
- real backend staging smoke
- confirmation nothing merged/deployed

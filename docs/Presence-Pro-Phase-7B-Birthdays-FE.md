# Presence Pro — Phase 7B Frontend
## Proactive Birthdays & Member Moments — Birthday Experience

## Purpose
Turn the Birthday page from a manual report into a proactive member-care experience.

Opening Birthday should immediately answer:
```text
Who has a birthday today?
Who has a birthday in the next 7 days?
Who has a birthday in the next 30 days?
```

Keep existing deeper tools:
- This Month
- Next Month
- 3 Months
- Custom Range
- member-status filter
- WhatsApp share
- Copy
- PDF
- Excel

Use backend `birthdayOccurrence` metadata instead of reparsing display DOB strings.

## Repository / rollout
- Repo: `chineduknight/attendanceTracker_FE`
- Base: `staging`
- Build against Phase 7B backend.
- Do not merge/deploy without explicit authorization.

## RBAC / visibility
Keep:
```text
permission: members.view
feature: birthdays
```
No new permission area.

## Birthday type
Add optional metadata:
```ts
birthdayOccurrence?: {
  month: number;
  day: number;
  occurrenceDate: string;
}
```
Prefer it whenever present. Keep legacy fallback during rollout.

## Shared helper
Create `src/helpers/birthday.ts` for:
```ts
birthdayOccurrenceDate(member)
birthdayRelativeLabel(occurrenceDate, asOf)
birthdayDisplayDate(occurrenceDate)
birthdayRangeForPreset(...)
```
Centralize legacy parsing fallback here. Do not keep separate DOB parsers in Birthday and Welfare.

## Default proactive view
On page open:
```text
default range = today through today + 30 days
```
Auto-fetch immediately. No initial Find click.
Use local business date `YYYY-MM-DD`, matching Welfare.

## Summary cards
Top cards:
```text
Today
Next 7 Days
Next 30 Days
```
Example:
```text
Today         2
Next 7 Days   5
Next 30 Days  11
```
Preferred: one next-30-days dataset derives all three counts from `occurrenceDate`; do not issue three separate queries just for counts.

Clicking a card switches the active visible range.

## Window semantics
For compatibility with Phase 7A Welfare, prefer:
```text
Next 7 Days = today through today + 7 days
Next 30 Days = today through today + 30 days
```
In helper text, clarify that Today is included. Do not let Welfare and Birthday silently use different definitions.

## Presets
Support:
```text
Today
Next 7 Days
Next 30 Days
This Month
Next Month
3 Months
Custom
```
Preset selection auto-loads. Only custom range may require explicit Apply/Find.

## Status filtering
Keep the dynamic member-status multi-select.
- Default = All.
- Do not hardcode only Active/Inactive after model options load.
- Changing status filter refreshes the current range.
- Backend remains authoritative.

## Page structure
Recommended:
```text
BIRTHDAYS

[ Today 2 ] [ Next 7 Days 5 ] [ Next 30 Days 11 ]

Upcoming birthdays
7 Oct → 6 Nov

[presets] [status filter]

TODAY
Ada Okafor          Today
Chika Obi           Today

COMING UP
Grace Eze   Tue, 13 Oct   In 6 days
Peter James Sat, 17 Oct   In 10 days
```
A table is acceptable on desktop, but mobile must remain readable without horizontal chaos.

## Row/card content
Show:
```text
Name
Birthday date
Relative timing
```
Do not show age, birth year or turning age.

## Year-wrap
Use `birthdayOccurrence.occurrenceDate` so December→January has the correct actual year and weekday.
Never infer occurrence year from display DOB text.

## Legacy fallback
If metadata is missing:
- use the centralized legacy parser;
- do not crash;
- keep current share/list behavior.
Once metadata exists, it is calendar truth.

## Welfare snapshot refactor
Update Phase 7A:
```text
BirthdaySnapshot
useWelfareBirthdays
```
to use the shared type/helper.
When metadata exists, show accurate Today/Tomorrow/date labels without parsing `Mon, 13 October`.
Birthday query failure must still never break Welfare.

## Query keys
Expand canonical Birthday keys:
```ts
birthday: {
  root: (organisationId) => ["birthday", organisationId],
  list: (organisationId, startDate, endDate, statuses) => [...],
  snapshot: (...existing args) => [...],
  export: (organisationId, format, startDate, endDate, statuses) => [...]
}
```
Replace ad-hoc Birthday page arrays. Every tenant-owned key includes organisationId.

## Data hook
Move fetching from the page into a focused hook, e.g. `src/hooks/useBirthdays.ts`.
Responsibilities:
- build list URL;
- full-date ranges;
- tenant-scoped key;
- status filter;
- preset auto-fetch;
- members/loading/error.

Keep export logic separate if cleaner.

## API dates
New frontend always sends full:
```text
startDate=YYYY-MM-DD
endDate=YYYY-MM-DD
```
MM-DD is backend compatibility only.

## Sharing
Keep WhatsApp + Copy.
Build share text from occurrence metadata when available:
```text
🎂 Birthdays (7 Oct to 6 Nov)

1. Ada Okafor — Wed, 7 Oct (Today)
2. Grace Eze — Tue, 13 Oct (In 6 days)
```
Do not parse decorative DOB text when metadata exists.

## PDF / Excel
Keep current export routes. Export the active visible range/status filter, not some backing 30-day dataset if the user selected another range.

## Summary cards vs custom list
Preferred product design:
- persistent Today/7/30 summary remains a proactive upcoming snapshot;
- active list may show another preset/custom range;
- use a cached 30-day summary query plus an active-list query only when needed.

Simpler acceptable alternative:
- hide summary cards outside the default/upcoming range.

Do not show cards whose counts appear to summarize a custom range when they do not.

## Custom range
Require valid From/To and `from <= to` before request. Backend remains authoritative.

## Empty states
Examples:
```text
No birthdays today.
No birthdays in the next 7 days.
No birthdays in the next 30 days.
No birthdays found for this date range.
```

## Loading/error independence
Do not turn API failure into `0 birthdays`.
If summary/list are separate queries, one failure should not destroy the other valid section.

## Organisation switching
On Org A→Org B:
- query keys change immediately;
- no A members flash under B;
- status selection must reconcile with B's model options;
- stale A-only status values should reset safely to All.

## Missing DOB field
If `dob` is not configured as a date field:
- do not call Birthday API;
- show a clear configuration state.
Example:
```text
Birthdays are unavailable because this organisation does not have a date-of-birth field configured.
```

## Terminology
Use organisation member terminology in empty/help copy where natural. Keep feature title `Birthdays`.

## Accessibility
- summary cards use text labels, not color only;
- presets keyboard accessible;
- relative/date text visible;
- share controls retain text labels;
- mobile layout readable.

## Tests — helpers
1. metadata preferred over legacy DOB;
2. Today;
3. Tomorrow;
4. In N days;
5. year-wrap;
6. legacy formatted DOB fallback;
7. malformed fallback does not crash;
8. no age derivation.

## Tests — proactive UX
9. auto-load next 30 days;
10. no initial Find click;
11. Today count;
12. Next 7 count;
13. Next 30 count;
14. cards switch range;
15. This Month;
16. Next Month;
17. 3 Months;
18. custom range validation/load.

## Tests — status / tenancy
19. dynamic status options load;
20. All means no status query param;
21. selected statuses sent correctly;
22. Org A→Org B no cache bleed;
23. stale A status reconciles for B;
24. missing dob prevents API call.

## Tests — share/export
25. share uses occurrenceDate;
26. Today/Tomorrow text correct;
27. WhatsApp encoded active-list text;
28. Copy uses same text;
29. Excel active filters/range;
30. PDF active filters/range;
31. missing export URL shows error.

## Tests — Welfare snapshot
32. Welfare prefers occurrence metadata;
33. legacy response still works;
34. birthday error does not break Welfare;
35. no members.view → no Birthday API call;
36. feature off → no Birthday API call;
37. no dob → no Birthday API call.

## Likely files
New:
```text
src/helpers/birthday.ts
src/hooks/useBirthdays.ts
src/components/birthday/BirthdaySummaryCards.tsx
src/components/birthday/BirthdayList.tsx
```
Changed:
```text
src/pages/Birthday.tsx
src/components/welfare/BirthdaySnapshot.tsx
src/hooks/useWelfareBirthdays.ts
src/components/welfare/welfareTypes.ts
src/services/api/queryKeys.ts
```

## Non-goals
Do not add birthday reminders, automatic WhatsApp, age/turning age, anniversaries, join-date milestones, welfare follow-up state, RBAC changes, attendance analytics changes or Phase 7A threshold changes.

## Verification
Run:
```text
Node 22
Yarn 1.22.22
focused Birthday helper/page tests
Welfare birthday snapshot tests
full frontend suite
npx tsc --noEmit
changed-file lint
CI=true yarn build
Netlify preview
real backend staging smoke
```

## Completion report
Return branch, commits, PR link, changed files, proactive default UX, summary behavior, metadata usage, legacy fallback, status/tenant behavior, share/export behavior, Welfare snapshot update, tests/type/build/lint, real-backend integration status, and confirmation nothing merged/deployed.

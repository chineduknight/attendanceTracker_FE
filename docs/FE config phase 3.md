# Presence Pro — Frontend Phase 3
## Configurable Attendance Statuses v1

## Goal
Stop assuming every organisation uses exactly `Present / Absent / Apology`.

Render and submit organisation-defined attendance statuses while consuming the backend's stable behavior classes:
- `present`
- `excused`
- `absent`

Do not merge or deploy. Return one frontend PR for review.

## Prerequisites
Repository: `chineduknight/attendanceTracker_FE`
Base: `dev`

Before starting:
1. merge Phase 2 FE PR #58 into `dev`
2. make sure the Phase 3 backend contract is available in the dev backend or coordinated against its PR

## Backend contract

```ts
type AttendanceBehavior = "present" | "excused" | "absent";

interface AttendanceStatusDefinition {
  key: string;
  label: string;
  shortLabel: string;
  color: "gray" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "cyan" | "purple" | "pink";
  behavior: AttendanceBehavior;
  active: boolean;
  isDefault: boolean;
}
```

Every selected org should expose `attendanceStatuses`.

## 1. Central status helpers
Replace hard-coded `statusMeta.ts` assumptions with config-driven helpers for:
- active statuses
- lookup by key
- effective default
- label
- short label
- color
- behavior
- display/cycle order
- unknown fallback

Unknown fallback should be neutral, e.g.:
`Unknown / ? / gray / absent-behavior`

Do not scatter literal status checks around components.

## 2. Organisation type
Extend `OrganisationType`:

```ts
attendanceStatuses: AttendanceStatusDefinition[];
```

`EMPTY_ORG` must include the safe default configuration.

Org switching must naturally switch status config.

## 3. Organisation Settings editor
Add an **Attendance statuses** section to `OrganisationSettings.tsx`.

`settings.manage` can edit/save.
`settings.view` can view read-only.

Each row:
- Label
- Short label
- Color
- Behavior
- Active
- Default
- Up/down order controls

No new drag/drop dependency.

Add status:
- generate key once from initial label
- key becomes immutable after persistence
- behavior becomes immutable after persistence

Persisted statuses are deactivated, not deleted.
Brand-new unsaved rows may be removed before first save.

Explain behaviors:
- Present: counts as attendance and extends streak
- Excused: counts toward attendance rate but does not extend streak
- Absent: no attendance credit and breaks streak

Client validation:
- unique key/label/short
- max 10
- exactly one active default
- default must be absent-behavior
- at least one active present
- at least one active absent
- inactive cannot be default

## 4. Org settings payload
Extend the existing org payload helper and tests.

Preserve:
- name
- image
- collapseAttendanceByDay
- maxAttendanceEdits

Saving statuses must not wipe other settings.

On success:
- update selected org immediately
- invalidate `queryKeys.organisation(org.id)`
- invalidate `queryKeys.allOrganisations`

## 5. Drafts
Replace hard-coded status union in `attendanceDraft.ts`.

New session:
- unknown draft status -> configured default
- inactive draft status -> configured default
- new roster member -> configured default
- removed member -> drop
- live roster owns identity

Historical edit:
- inactive status already returned by backend remains renderable
- do not auto-rewrite it merely because it is inactive

## 6. Mark Attendance
Remove the fixed `NEXT_STATUS`.

Cycle through the organisation's active status definitions in configured array order.

New roster starts with configured default.

If current value is inactive/unknown, next tap enters the active cycle deterministically.

Dynamic count summary:
- label
- color
- count

Include inactive historical status in edit counts when present.

Submit only the new contract:

```ts
memberStatuses: allMembers.map(member => ({
  memberId: member.id,
  status: member.attendanceStatus,
}))
```

Do not send `presentMembers` or `apologisedMembers`.

Remove the literal `present > 0` submit requirement. A valid all-absent/excused session must be submit-able.

Keep confirmation, but show dynamic status counts in the confirmation.

## 7. View Attendance
Replace fixed types/order.

- sort by configured status order
- unknown historical statuses last
- dynamic counts
- dynamic filter options
- dynamic badge label/short/color
- inactive historical definitions still resolve
- unknown fallback neutral

## 8. Sharing
Do not redesign choir-specific WhatsApp sharing in this PR.

But:
- custom statuses must not crash it
- do not claim `Apology` if no apology key exists
- use configured labels for status summary where practical

Document remaining Bro/Sis/voice-part assumptions as a separate future terminology/share-template phase.

## 9. Main Analytics
Use backend behavior totals.

Summary columns:
- Present
- Excused
- Absent

These are semantic buckets, not configured labels.

Date cells contain actual status keys and must render using configured short label/color/label.

Legend is dynamic.

Include inactive definitions only when needed for historical results.

Attendance-status filter, if present, uses configured status keys.

Keep member-directory status filtering separate.

## 10. Member Analytics
Update types/components.

Consume:

```ts
behaviorCounts: {
  present: number;
  excused: number;
  absent: number;
}
```

Stat tiles:
- Present
- Excused
- Absent
- Total Sessions

Timeline and record table use actual configured status key metadata.

Inactive history renders.
Unknown fallback renders.

## 11. Exports
Continue using backend-generated files.

Only update query/filter construction to support configurable attendance status keys.

No client-side PDF/XLSX generation.

## 12. Query keys
Do not add ad-hoc tenant keys.

Keep invalidation organisation-scoped.

## 13. Compatibility
Frontend must use only the new `memberStatuses` contract.

Do not keep a conditional legacy fallback.

## 14. Tests
At minimum:

Status helper:
- configured label/short/color
- cycle order
- default
- inactive historical resolve
- unknown fallback

Settings:
- default config
- add `late`
- duplicate validation
- default validation
- behavior requirements
- deactivation
- persisted key/behavior immutable
- payload preserves all other org settings

Draft:
- new member gets default
- removed drops
- inactive/unknown new-session draft -> default
- active custom survives

Mark Attendance with:
- No Show (absent/default)
- Present (present)
- Late (present)
- Excused (excused)

Prove:
- default initialization
- configured cycle
- dynamic counts
- `memberStatuses` payload
- no legacy arrays
- zero present-behavior can still submit
- inactive historical edit renders

View Attendance:
- dynamic sort/filter/badges
- inactive history
- unknown fallback

Analytics:
- custom exact status date cells
- behavior totals
- dynamic legend
- no hard-coded Apology dependency

Member Analytics:
- behavior tiles
- custom timeline
- inactive historical
- unknown fallback

## 15. Manual verification
Use two orgs with different configs.

Org A:
- Absent -> absent/default
- Present -> present
- Apology -> excused
- Late -> present

Org B:
- No Show -> absent/default
- Attended -> present
- Excused -> excused
- Remote -> present

Verify:
1. configure independently
2. A -> B -> A no config leakage
3. new A session starts at A default
4. cycle A statuses
5. submit/reopen
6. Late renders correctly
7. B uses B terminology only
8. deactivate a historically-used A status
9. old session still renders it
10. new session no longer cycles it
11. main analytics behavior totals
12. date-cell badges/legend
13. member analytics
14. export still downloads
15. view-only settings user cannot save

Include Netlify preview.

## 16. Verification
Use `.nvmrc`.

Run:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false
CI=true yarn build
```

Report Node/Yarn versions, exact suite/test counts, TS, build, warnings, manual table, preview URL.

## PR requirements
Return one frontend PR. Do not merge/deploy.

Document:
- status config UX
- `memberStatuses` write contract
- cycle behavior
- draft behavior
- behavior-vs-status distinction
- inactive historical handling
- unknown fallback
- tests/build/manual verification
- preview
- known limitations

## Non-goals
Do not implement:
- bulk marking
- selected-status marking mode
- session templates
- eligibility rules
- offline/PWA
- terminology templates
- full sharing redesign
- member schema v2
- finance/RBAC/auth redesign
- dependency upgrades

## Expected result
> Each organisation sees and uses its own attendance language everywhere, while Presence Pro still understands the stable analytics meaning behind those words.

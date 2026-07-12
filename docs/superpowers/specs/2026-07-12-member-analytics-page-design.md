# Individual Member Analytics Page — Design

**Date:** 2026-07-12
**Status:** Approved (design)
**Author:** Chinedu Knight (with Claude)

## Goal

Add a per-member attendance analytics page: from the org-wide analytics grid,
click a member to open a celebratory, colorful profile showing their attendance
detail — streak, attendance rate, per-session history, and a records table — with
Excel/PDF export. The backend endpoints already exist and return the values.

Tone: **celebratory / motivational** — a member seeing their own page should feel
enthused. The streak is the emotional centerpiece.

## Backend (already implemented)

`GET /api/attendance/:organisationId/analytics/member/:memberId` (+ `/export/excel`
and `/export/pdf`), documented in `FRONTEND_API.md` §9. Returns a single object:

- `member` — `{ memberId, name, fields }` (dynamic model fields, system keys stripped)
- `range` — echoes `fromDate`/`toDate` (null when unbounded)
- `summary` — `totalSessions`, `present`, `absent`, `apology`, `attendanceRate`,
  `currentStreak`, `longestStreak`
- `verdicts[]` — chronological (ascending) one-status-per-day/session sequence
  (`{ date, status }`); one per day when the org has `collapseAttendanceByDay`,
  else one per session
- `records[]` — every raw session (most-recent-first): `{ attendanceId, date,
  status, sessionName, hasBeenUpdated }`

Query params: `fromDate`, `toDate` (`YYYY-MM-DD`, both optional).

Errors: **404** if the org isn't accessible or the member isn't in it (malformed
`memberId` also 404); **422** on bad date format. Exports return a **URL** in `data`
and **400** if the member has no sessions in range.

Streak rule (for milestone/label copy): a present session extends the streak; an
absent breaks it immediately; apologies never add but tolerate up to 2 in a row —
a 3rd consecutive apology breaks it. `currentStreak` is the run at the end of the
range; `longestStreak` is the best run seen. (Computed server-side; the FE only
displays these values.)

## Routing & entry point

- New path: `MEMBER_ANALYTICS: "/analytics/member/:memberId"` in
  `src/routes/pagePath.ts`, registered as a lazy protected route in
  `src/routes/protectedRoutes.tsx`.
- **Entry point:** org-wide grid rows in `src/pages/Analytics.tsx`. Rows already
  carry `row.memberId`. Clicking a row navigates to the member page, carrying the
  current range as query params: `/analytics/member/:memberId?fromDate=…&toDate=…`.
  Rows get an affordance (pointer cursor + hover highlight).
- **Default range on open:** carry over the grid's `fromDate`/`toDate` from the
  query params; still adjustable on the page.

## Service layer

Add to `attendanceRequest` in `src/services/api/request.ts`:

```
MEMBER_ANALYTICS: "/attendance/:organisationId/analytics/member/:memberId",
MEMBER_ANALYTICS_EXPORT_EXCEL: "/attendance/:organisationId/analytics/member/:memberId/export/excel",
MEMBER_ANALYTICS_EXPORT_PDF: "/attendance/:organisationId/analytics/member/:memberId/export/pdf",
```

## New page: `src/pages/MemberAnalytics.tsx`

Reads `memberId` from `useParams`, `org` from `useGlobalStore`, seeds range from
query params. Fetches via `useQueryWrapper` — **auto-enabled** when `org.id` and
`memberId` are present, re-fetching when the range changes (range is in the query
key). No manual "Search" button (range is pre-filled).

### Layout (full-width hero banner)

1. **Header bar** (`blue.500`, matches existing pages): title "Member Analytics",
   **Back** button, and **Export Excel** + **Export PDF** buttons on the right.
2. **Date range controls**: preset buttons + two `DatePicker`s (shared component).
3. **Hero banner** (gradient): avatar (name initials) + member name + identity line
   built from `member.fields` (e.g. "Soprano · Active · joined 2021"). Identity only
   — no rate ring here (rate lives in the streak card, not duplicated).
4. **Streak card** (gradient "milestone" card): 🔥 `currentStreak` with "current
   streak", "longest ever: `longestStreak`", a **milestone progress bar** toward the
   next tier, and the **attendance-rate ring** (conic gauge showing `attendanceRate`)
   on the right.
5. **Stat tiles** — four colored tiles: Present (green), Absent (red),
   Apology (amber), Total Sessions (blue).
6. **Timeline strip**: one colored square per `verdicts` entry, wrapping in
   chronological order, grouped with month labels; hover shows the date + status.
   Green = present, amber = apology, red = absent. Small legend.
7. **Records table**: columns SN, Date, Session name, Status badge, and an "edited"
   tag when `hasBeenUpdated`. Rendered in API order (most-recent-first).

### Milestone ladder

Fixed tiers: **3, 5, 10, 20, 50, 100**. The bar fills toward the smallest tier
greater than `currentStreak`; past 100 it shows "record territory" (bar full).
Copy references `longestStreak` for cheer (e.g. "N more to beat your record of M").

### States

- **Loading**: spinner.
- **Empty** (no sessions / `totalSessions === 0`): friendly "No attendance records
  for this range" message; export buttons disabled.
- **404**: "Member not found in this organisation" + Back button.
- **401**: handled as elsewhere in the app (ignored in export error handler).

### Exports

Two header buttons. Each builds its export URL (member path + current range),
`refetch`es a disabled query, and on success opens the returned URL in a new tab.
On error, surfaces the API message via toast (covers the 400 "no sessions in range"
case). Buttons disabled when the range yields no data.

## Shared modules (DRY extraction from `Analytics.tsx`)

Extract the following so both the org-wide and member pages consume them (behavior
of `Analytics.tsx` unchanged, just deduplicated):

- **`useDateRange` hook** — `fromDate`/`toDate`/`activePreset` state, `DATE_PRESETS`,
  `applyPreset`, `handleDateChange`, `formatRangeLabel`.
- **`DateRangeControls` component** — preset buttons + two `DatePicker`s + the
  `DATE_PICKER_WRAPPER_SX` styling + today/max-date capping.
- **Export helper** — `openExportUrl(response)` + `handleExportError(err, format)`
  (open URL in new tab; toast on failure; ignore 401).
- **`statusMeta` module** — `STATUS_META`, `EMPTY_STATUS_META`, `getStatusMeta`,
  and the `AttendanceStatus` type.

Exact file locations (hook dir vs components/helpers) to be confirmed against the
existing structure during planning; follow current conventions.

## Testing

- If a test setup exists in the repo, add tests for: milestone-tier selection logic,
  stat-tile/summary rendering, empty state, and the shared `useDateRange` behavior.
- Regardless, verify end-to-end by driving the app (via the `run`/`verify` skills):
  org grid → click member → profile renders with correct summary/streak/timeline/
  records, range changes refetch, and both exports open a URL.

## Out of scope

- Members-list and dashboard entry points (grid-row drill-down only for now).
- Any change to the backend endpoints.
- Member self-login / member-facing auth (app remains officer-facing).

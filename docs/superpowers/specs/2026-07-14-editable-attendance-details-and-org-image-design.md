# Editable Attendance Session Details + Org Image Display — Design

**Date:** 2026-07-14
**Status:** Approved (pending spec review)

## Goal

Two follow-ups surfaced while testing the org-settings / attendance-edit work:

1. **Editable session details on attendance edit.** The attendance edit screen only
   lets you re-toggle member present/apology status. Users need to also edit the
   session's **name, category, sub-category, and date** — the values are already
   loaded and re-sent on update, but there are no controls to change them.
2. **Org image never displays.** A logo URL saved via Organisation Settings round-trips
   to the backend but is not rendered anywhere — the org avatar is drawn from the org
   name only.

## Context / current state

- **Attendance edit** lives in `src/pages/MarkAttendance.tsx` (create + update in one
  component; update detected by `params.attendanceId`). In update mode
  `onGetAttandanceSuccess` (`:151-172`) loads `name/date/categoryId/subCategoryId` into
  the `currentAttendance` store and builds the roster; the submit path
  (`sendAttandanceToAPI`, `:234-259`) spreads `...currentAttendance` plus
  `presentMembers`/`apologisedMembers` into the `PUT`. The UI renders only the member
  roster + status toggles — no inputs for name/category/date.
- **The create flow** collects those fields on a separate earlier screen
  `src/pages/CreateAttendance.tsx` (react-hook-form: name `Input`, category `Select`,
  sub-category `Select` filtered by selected category, date `Input type="date"` capped
  at today), writes `currentAttendance`, then navigates to `MarkAttendance`.
  `CreateAttendance` owns the category query (`useQueryWrapper(["get-all-category"], …)`)
  and the `CategoryType`/`SubCategoryType` types (`:26-36`).
- **`PUT /attendance/:id`** already accepts `name/date/categoryId/subCategoryId`;
  **`GET /attendance/:organisationId/:id`** returns those IDs (already picked into the
  store). No endpoint changes needed.
- **Org avatar** in `src/pages/Organisations.tsx:112` is `<Avatar name={org.name} … />`
  — no `src`, so it always shows name-initials. `AppHeader.tsx:61` is the *user* avatar.
  The store `OrganisationType` carries `image` and the settings save merges it in, so the
  value is present client-side; nothing consumes it.
- Stack (unchanged): React 18 + TS strict, Chakra UI v2, Zustand (persisted), React
  Query v4, react-hook-form v7, react-toastify. No i18n layer. Tests: Jest +
  @testing-library/react via `react-scripts test`.

## Decision (from brainstorming)

**Inline editable details on the edit screen, via one shared form component** — extract
the session-details fields into a reusable presentational component used by BOTH the
create screen and the edit screen (single-screen edit, DRY, one source of truth for the
form). (Rejected: duplicating the fields inline; and a two-step edit that reuses the
create screen.)

## Design

### Unit 1 — `useCategories(organisationId)` hook

New `src/hooks/useCategories.ts`. Wraps the org category query (the one currently inline
in `CreateAttendance`), returning `{ categories: CategoryType[]; isLoading: boolean }`.
Move the shared `CategoryType`/`SubCategoryType` types into this module (or a sibling
`attendance` types file) and re-export; `CreateAttendance` imports them from there
instead of declaring its own. One fetch definition, used by both screens.

### Unit 2 — `AttendanceDetailsForm` (presentational, controlled)

New `src/components/attendance/AttendanceDetailsForm.tsx`.

- Type: `interface AttendanceDetails { name: string; categoryId: string; subCategoryId: string; date: string; }` (`date` = `"YYYY-MM-DD"`).
- Props: `{ value: AttendanceDetails; onChange: (next: AttendanceDetails) => void; categories: CategoryType[]; }`.
- Renders: name `Input`; category `Select`; sub-category `Select` whose options are the
  selected category's `subCategories` (empty when no category chosen); date
  `Input type="date"` with `max` = today.
- Behavior: fully controlled — every field edit calls `onChange` with the next value.
  When the category changes, `subCategoryId` is reset to `""` (stale sub-category can't
  survive a category switch). No internal persistence, no data fetching, no submit
  button — the parent owns all of that.

### `CreateAttendance` — consume the shared component

Replace the inline `FormControl` fields with `<AttendanceDetailsForm>`. Hold the four
values in local `useState<AttendanceDetails>` (seeded empty). Fetch categories via
`useCategories`. On **Continue**: validate `name` and `date` are non-empty (toast on
failure), write the trimmed values to `currentAttendance`, invalidate `GET_MEMBERS`,
navigate to `MARK_ATTENANCE`. Net behavior identical to today; only the form markup and
the category fetch are now shared.

### `MarkAttendance` — surface the form in edit mode

When `isUpdate`, render `<AttendanceDetailsForm>` above the roster, seeded from the
loaded `currentAttendance` (map the API `date` to `"YYYY-MM-DD"`; coerce missing
category/sub-category to `""`). Fetch categories via `useCategories`. `onChange` writes
back with `setAttendance({ ...currentAttendance, ...next })`. The existing submit path
already spreads `...currentAttendance`, so edited details ride along on the `PUT`.
Disable the **Update** button when `name` or `date` is empty (in addition to the
existing present-count guard). Create mode is unchanged — no details form there.

### Bug #1 — org image display

- `src/pages/Organisations.tsx:112`: `<Avatar name={org.name} src={org.image} … />`.
  Chakra falls back to name-initials automatically when `src` is empty or fails to load.
- `src/pages/OrganisationSettings.tsx`: render a small logo preview (an `Avatar`/`Image`
  bound to the current image field value) beside the Logo URL input so the user can see
  what they entered.

## Data flow / contract

No new endpoints. Edit: `GET .../:id` → IDs into `currentAttendance` → prefill form →
edits update `currentAttendance` → `PUT /attendance/:id` with
`name/date/categoryId/subCategoryId` + member arrays. Errors surface through the existing
`MarkAttendance` `onError` toast (which also carries the edit-limit 400 and any BE
validation 422).

## Error handling

- Client-side: block Update when name/date empty; keep the present-count guard.
- Server-side: existing toast path renders `error.response.data.error` for 400/422.

## Testing

- Unit-test `AttendanceDetailsForm`: renders all four fields; sub-category options are
  those of the selected category; changing the category clears `subCategoryId`;
  `onChange` fires with the patched value.
- Unit-test `useCategories`: returns the fetched list on success (light test, mockable).
- `CreateAttendance` and `MarkAttendance` verified by `npx tsc --noEmit` + full suite +
  a manual edit round-trip: open an editable session, change name + category + date,
  Update, confirm persisted values on reload; confirm sub-category clears on category
  change; confirm a saved org logo now shows in the org list and the settings preview.

## Out of scope (YAGNI)

- No time-of-day / date-range fields; no category CRUD changes.
- No image upload — URL string only.
- Create flow keeps its current two-screen shape (details screen → roster screen).
- No i18n — strings hardcoded, matching the codebase.

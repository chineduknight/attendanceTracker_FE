# Organisation Settings + Attendance Multi-Edit — Design

**Date:** 2026-07-13
**Status:** Approved (pending spec review)

## Goal

Two related pieces of work, both driven by `ORGANISATION_SETTINGS_FRONTEND.md`:

1. **Organisation Settings page** — a new screen where a permitted user can edit an
   organisation's `name`, `image`, `collapseAttendanceByDay`, and `maxAttendanceEdits`,
   using `GET`/`PUT /api/organisations/:id`.
2. **Attendance multi-edit adoption** — the edit limit moved off the individual
   attendance record (binary `hasBeenUpdated`) and onto the org (`maxAttendanceEdits`).
   Each attendance record now reports `editCount` / `editsRemaining`. The FE must gate
   the edit action on `editsRemaining > 0` instead of `hasBeenUpdated`, and surface the
   remaining-edit count.

## Context / current state

Stack: React 18 + TypeScript, Chakra UI v2 (Emotion), Zustand (persisted store) for
global state, TanStack React Query v4 for server state, axios, react-router-dom v6,
react-hook-form v7 (no yup/zod), react-toastify. No i18n layer exists — strings are
hardcoded JSX, and this feature follows suit.

Relevant existing code:

- **Org state:** `OrganisationType` in `src/zStore.ts:21-30` (store actions
  `organisation` / `updateOrganisation`), near-duplicate `OrganisationSummary` in
  `src/rbac/types.ts:34-43`. Neither carries `collapseAttendanceByDay` or
  `maxAttendanceEdits` yet.
- **Org endpoints:** `orgRequest` in `src/services/api/request.ts` has
  `ORGANISATIONS = "/organisations"` but **no** single-org `GET`/`PUT`.
- **API helpers:** `src/services/api/apiHelper.ts` — `useQueryWrapper`,
  `putRequest`, `useMutationWrapper` (auto error-toast), shared `queryClient`.
  URL params filled via `convertParamsToString` (`src/helpers/stringManipulations.ts`).
- **RBAC:** `usePermissions()`, `<Can perm=… anyOf=… owner>`, `<RequirePermission perm=…>`
  in `src/rbac/`. The `settings` permission area already exists
  (`settings.manage` = "Rename org, change settings") but no screen consumes it.
- **Org list UI:** `src/pages/Organisations.tsx` (delete gated on `org.isOwner`),
  create in `src/pages/AddOrganisation.tsx`. No settings/edit screen exists.
- **Dashboard nav:** `src/pages/Dashboard.tsx` renders `DASHBOARD_ACTIONS`, each gated
  by `<Can perm=…>`.
- **Routing:** `src/routes/protectedRoutes.tsx` (lazy `WithSuspense`), path constants
  in `src/routes/pagePath.ts`.
- **Attendance edit:** `src/pages/MarkAttendance.tsx` (create + update, update detected
  by `params.attendanceId`); the edit button is gated by `hasBeenUpdated` at
  `src/pages/AllAttendance.tsx:145-161` (button hidden once edited). Analytics record
  badge in `src/components/analytics/MemberRecordsTable.tsx:29`
  (`MemberRecord` type at `src/components/analytics/memberAnalyticsTypes.ts:8-14`).

## Decisions (from brainstorming)

- **Settings entry points: both** — a Dashboard tile (gated `settings.view`) and a
  pencil/edit affordance on the org-switcher list.
- **Logo/image: editable URL input** — prefilled, always resent on PUT (never wiped),
  user-editable.
- **Attendance edit UI: show count + gate button** — gate on `editsRemaining > 0` and
  display remaining/edited counts, with the BE 400 as a fallback.

## Design

### A. Types & service layer

- Make the org shape a single source of truth: add `collapseAttendanceByDay?: boolean`
  and `maxAttendanceEdits?: number | null` to the canonical org type, and have the
  duplicate (`OrganisationSummary`) extend/alias it rather than redeclare fields.
  This DRY cleanup is in-scope because both types are being touched anyway.
- Add to `orgRequest` in `src/services/api/request.ts`:
  `ORGANISATION = "/organisations/:id"` — used for both `GET` (load one) and
  `PUT` (save), with `:id` filled via `convertParamsToString`.
- Save via the existing `putRequest` + `useMutationWrapper` helpers; load via
  `useQueryWrapper`.

### B. Settings page (`/settings`)

- New `src/pages/OrganisationSettings.tsx`; add `SETTINGS` to `PROTECTED_PATHS`
  (`src/routes/pagePath.ts`) and a lazy route in `src/routes/protectedRoutes.tsx`.
- Page-guarded by `<RequirePermission perm="settings.view">`.
- react-hook-form (dominant pattern). Fields:
  - **name** — text, required, non-empty.
  - **image** — URL text input, optional; validated as a URI when non-empty.
  - **collapseAttendanceByDay** — Chakra `Switch`.
  - **maxAttendanceEdits** — number input, integer 0–100. Blank = "use default";
    helper text: `0` disables editing for all records, blank falls back to the
    deployment default (`1`).
- **Load:** `GET /organisations/:id` for the selected org (freshest copy), prefill the
  form. If `maxAttendanceEdits` is `null`, show the effective default (`1`) as a
  placeholder / "use default" state.
- **Save (PUT):** follow the doc's safe pattern — spread the loaded values, override
  only what changed, and **always send `name` and `image`** (the BE overwrites `image`
  unconditionally and wipes it if omitted; `name` is required or 422). Map a blank
  `maxAttendanceEdits` to `null`.
  - On success: `toast.success`, `updateOrganisation()` in the store (header + switcher
    reflect new name/image immediately), and invalidate the `["all-organisations"]`
    React Query key.
  - Validation / duplicate-name (422) and 403/404 errors surface automatically through
    the central error toast in `useMutationWrapper` (keys off status, shows
    `error.response.data.error`).
- **Save gating:** the save control is wrapped in `<Can perm="settings.manage">`;
  `settings.view`-only users see the form without a working save (read-only intent).

### C. Org-switcher entry

- In `src/pages/Organisations.tsx`, add a pencil/edit icon-button beside the existing
  delete action, wrapped in `<Can perm="settings.view">`. On click: set that org as the
  selected org (`updateOrganisation`), then `navigate(PROTECTED_PATHS.SETTINGS)`.
- Add a **Settings tile** to `DASHBOARD_ACTIONS` in `src/pages/Dashboard.tsx`, gated
  `<Can perm="settings.view">`, routing to `/settings`.

### D. Attendance multi-edit adoption

- Add `editCount?: number` and `editsRemaining?: number` to the attendance list item
  type (`src/pages/AllAttendance.tsx:26-37`) and to `MemberRecord`
  (`src/components/analytics/memberAnalyticsTypes.ts:8-14`).
- Replace the binary gate at `src/pages/AllAttendance.tsx:145-161`: compute
  `const editsRemaining = attendance.editsRemaining ?? (attendance.hasBeenUpdated ? 0 : 1)`
  (defensive fallback for any stale/old response) and render the edit button only when
  `editsRemaining > 0`.
- **Surface the count:** show `edited {editCount}×` when `editCount > 0`, plus a subtle
  `{editsRemaining} left` indicator near the edit button. Apply the same
  `editCount`-aware treatment to the "edited" badge in
  `src/components/analytics/MemberRecordsTable.tsx:29`.
- **Fallback error:** the `MarkAttendance` update path routes through the central error
  toast, so the BE's 400 messages (`"…reached its edit limit of N."` /
  `"Editing attendance is disabled for this record."`) display automatically. Verify the
  update mutation does not override `onError` in a way that swallows this message.

## Error handling

- Central `useMutationWrapper` error toast keys off HTTP status and renders
  `error.response.data.error` (401 excluded, handled globally; supports arrays).
- Settings save: 422 (validation / duplicate name), 403 (`settings.manage` missing),
  404 (org not found / no access) → surfaced via the central toast.
- Attendance edit: client-side gating on `editsRemaining` is primary; the 400 limit
  responses are the cross-tab/stale fallback.

## Testing / verification

- Manual end-to-end (per project convention — no automated FE test harness observed):
  - Load settings, toggle `collapseAttendanceByDay`, save → verify persisted and store
    updated; confirm `image` is preserved when only toggling another field.
  - Set `maxAttendanceEdits` to `0`, `N`, and blank → verify PUT body and downstream
    edit gating.
  - Duplicate name → verify 422 toast copy.
  - `settings.view`-only vs `settings.manage` → verify page visibility and save gating.
  - Attendance list: a record with `editsRemaining > 0` shows the edit button; `0` hides
    it; counts display; exceeding the limit (or a locked legacy record) surfaces the BE
    400 message.

## Out of scope (YAGNI)

- Member-model builder (`src/pages/UserModel.tsx`) is left where it is — not folded into
  the settings page.
- No image upload — URL string only, per the contract.
- No i18n layer — the project has none; strings stay hardcoded to match the codebase.

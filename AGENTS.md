# AGENTS.md

# Presence Pro Frontend Agent Guide

> Repository: `chineduknight/attendanceTracker_FE`  
> Product: Presence Pro  
> Primary integration branch: `staging`  
> Runtime: Node 22  
> Package manager: Yarn 1.22.22  
> Framework: React 18 + TypeScript + Create React App  
> UI: Chakra UI v3 (with v2-parity theme overrides)  
> Server state: TanStack React Query v4  
> Client/global state: Zustand v4 with persistence  
> Routing: React Router DOM v6.3  
> HTTP: Axios  
> Forms: React Hook Form  
> Tests: Jest + React Testing Library through `react-scripts test`  
> Last refreshed against `staging`: 2026-10-07

This file is the operating manual for coding agents working in the Presence Pro frontend.

Presence Pro has accumulated real attendance, member, finance, permissions and historical-data semantics. Many frontend regressions come from changes that appear harmless in isolation:

- using a label as an identifier,
- deriving server truth again in the browser,
- sharing a React Query cache key across organisations,
- treating hidden UI as authorization,
- recomputing a historical attendance roster,
- assuming `present`, `apology` and `absent` are permanent status keys,
- treating a blank analytics cell as absent,
- merging configuration saves in a way that wipes settings the current form does not own.

Read the relevant sections before changing code.

---

# 1. Instruction precedence

When working in this repository, follow instructions in this order:

1. The user's current task and explicit constraints.
2. This `AGENTS.md`.
3. The current code on the target branch.
4. Current backend API behavior and frontend-facing API documentation.
5. Current feature briefs supplied for the task.
6. Historical files under `docs/` and older planning/spec documents.

Important:

- **Live `staging` is the source of truth.**
- Historical plans and handoff documents are snapshots, not reset targets.
- A current task brief may deliberately refine an invariant documented here. Follow the task, but preserve compatibility intentionally.
- Do not revive old behavior merely because an older plan says it existed.
- Do not broaden a task because adjacent code looks untidy.

If the task and live code disagree materially, verify the current backend/frontend contract before making a breaking change.

---

# 2. Repository and release discipline

## Default base branch

Unless the user explicitly says otherwise:

```text
base branch: staging
```

Feature/fix PRs should target `staging`.

Do not assume production/default deployment contains everything currently in `staging`.

## Never merge or deploy without explicit authorization

Creating or updating a PR is not permission to merge.

Do not:

- merge a PR,
- deploy staging,
- deploy production,
- promote staging,
- change hosting configuration,
- mutate production data,

unless the user explicitly asks.

If asked to implement, fix, review, prepare, push or open a PR, stop at the PR unless merge/deploy permission is explicit.

## Keep PRs narrow

Do not combine:

- a feature with unrelated cleanup,
- a bug fix with a repository-wide formatting pass,
- UI work with speculative API redesign,
- attendance changes with finance cleanup,
- a feature with dependency upgrades unless required.

Note adjacent debt separately.

---

# 3. Runtime and tooling

## Node

`.nvmrc` contains:

```text
22
```

Use:

```bash
nvm use
node --version
```

Do not silently develop/test on a different major Node version.

## Package manager

The repository declares:

```json
"packageManager": "yarn@1.22.22"
```

Use Yarn Classic.

Typical:

```bash
yarn --version
yarn install
```

Do not migrate to npm, pnpm, Yarn Berry or Bun as incidental work.

## This is Create React App, not Vite

Development:

```bash
yarn start
```

or:

```bash
yarn dev
```

Both currently invoke `react-scripts start`.

Production build:

```bash
CI=true yarn build
```

Tests:

```bash
CI=true yarn test --watchAll=false
```

Focused tests can use:

```bash
CI=true yarn test --watchAll=false path/to/test
```

TypeScript:

```bash
npx tsc --noEmit
```

Changed-file lint:

```bash
npx eslint path/to/changed-file.tsx path/to/changed-file.ts
```

There is no dedicated `lint` script in `package.json`.

Do not claim the whole repo is lint-clean when only changed files were checked.

---

# 4. Environment

The API base URL is read from:

```text
REACT_APP_BASE_URL
```

via:

```ts
process.env.REACT_APP_BASE_URL
```

in:

```text
src/services/api/index.ts
```

Because this is CRA:

- client-exposed variables must follow CRA's `REACT_APP_` convention,
- environment values are build-time browser configuration,
- never place secrets in frontend environment variables.

Do not invent `VITE_*` variables in this repository unless the project is explicitly migrated away from CRA.

---

# 5. High-level architecture

The application roughly follows:

```text
App
 ├─ Provider (components/ui/provider: ChakraProvider + colour mode)
 ├─ QueryClientProvider
 ├─ ToastContainer
 ├─ ErrorBoundary
 └─ Pages
     ├─ Authenticated
     │   └─ BrowserRouter
     │       └─ protected routes/layout
     └─ UnAuthenticated
         └─ BrowserRouter
             └─ public routes
```

Main areas:

```text
src/
  components/
  config/
  helpers/
  hooks/
  pages/
  rbac/
  routes/
  services/
  styles/
  zStore.ts
```

General responsibility:

```text
pages        = route-level orchestration
components   = reusable UI/presentation
hooks        = reusable query/mutation/domain orchestration
helpers      = pure domain/presentation transformations
services     = HTTP/query wrappers and endpoint constants
rbac         = client permission presentation/route guards
routes       = route config and guards
zStore       = persisted account/selected-org/small global workflow state
```

Prefer pure helpers for domain transformations and test them directly.

---

# 6. Core state model

Presence Pro deliberately separates server state from client/global state.

## React Query owns server state

Examples:

- organisations,
- members,
- member model,
- categories,
- attendance records,
- attendance availability,
- templates,
- analytics,
- finance,
- roles/officers.

Use React Query for data whose source of truth is the backend.

## Zustand owns small cross-page client state

Current persisted global state includes:

```text
user
selected organisation
current attendance draft/details
```

Do not put server collections into Zustand merely because several pages need them.

Do not move availability/templates/analytics/member lists into global Zustand state without a compelling architectural reason.

---

# 7. Tenant isolation is also a frontend concern

Backend authorization is the real security boundary, but the frontend must not leak Organisation A state into Organisation B.

Every organisation-owned React Query key must include:

```text
organisationId
```

Canonical factory:

```text
src/services/api/queryKeys.ts
```

Examples:

```ts
queryKeys.members(organisationId)
queryKeys.member(organisationId, memberId)
queryKeys.memberModel(organisationId)
queryKeys.attendance(organisationId, attendanceId)
queryKeys.attendances(organisationId)
queryKeys.analytics.root(organisationId)
queryKeys.finance.complianceRoot(organisationId)
```

Do not introduce tenant-owned keys like:

```ts
["members"]
["attendance"]
["analytics"]
```

without the organisation id.

## Mutation invalidation

After a mutation, invalidate only the affected organisation unless the resource is genuinely account-wide.

Good:

```ts
queryClient.invalidateQueries({
  queryKey: queryKeys.members(organisationId),
});
```

Dangerous:

```ts
queryClient.invalidateQueries(["members"]);
```

if that can invalidate or mix unrelated tenant observers.

## Account-wide keys

Some resources are intentionally global, e.g. all organisations and the permission catalogue.

Keep that distinction explicit.

---

# 8. Organisation switching

The selected organisation lives in persisted Zustand state.

Relevant:

```text
src/zStore.ts
src/pages/Organisations.tsx
src/rbac/useSyncSelectedOrg.ts
src/components/ProtectedLayout.tsx
```

`useSyncSelectedOrg()` refreshes the selected organisation from the canonical organisations list.

This matters because selected-org state contains:

- `isOwner`,
- role name,
- permissions,
- attendance settings,
- terminology,
- feature visibility,
- configurable attendance statuses.

## Rules

When a component holds tenant-local UI state that contains ids from one organisation, consider remounting/keying it by `organisationId`.

Example:

```tsx
<FinanceWorkspace
  key={organisation.id}
  organisationId={organisation.id}
/>
```

This prevents stale Organisation A selections from being applied under Organisation B.

## Async save responses

A mutation response for Organisation A must never re-select or overwrite Organisation B if the officer switched organisations while the request was in flight.

`OrganisationSettings.tsx` explicitly guards this with the submitted org id.

Follow that pattern for tenant-sensitive long-running UI operations.

---

# 9. Authentication

Authentication state is stored in Zustand:

```text
user.token
user.id
user.username
user.email
user.needsEmail
```

`Pages` checks token expiration and chooses authenticated vs unauthenticated routing.

Axios automatically attaches:

```text
Authorization: Bearer <token>
```

Do not manually duplicate bearer headers in normal API calls.

## Global 401 handling

The Axios response interceptor handles ordinary `401` responses as authentication failures.

The update-password endpoint is a deliberate exception because a wrong current password can return `401` without meaning the session is dead.

Do not:

- add duplicate 401 logout/toast handling everywhere,
- swallow 401 globally inside individual mutations,
- remove the password-change exception casually.

When a page-specific error handler sees `401`, it commonly returns because the global interceptor already handled it.

---

# 10. RBAC is presentation, not security

Canonical permission areas:

```text
attendance
members
categories
settings
finance
officers
```

Actions:

```text
.view
.manage
```

Types live in:

```text
src/rbac/permissions.ts
```

Use:

```text
usePermissions()
<Can>
<RequirePermission>
```

## Owner behavior

`usePermissions()` treats `organisation.isOwner` as an owner short-circuit.

Do not make owners depend on a normal role permission array.

## UI visibility

Use:

```tsx
<Can perm="attendance.manage">
  ...
</Can>
```

for controls.

Use route config or `RequirePermission` for pages.

## Never mistake frontend RBAC for authorization

Hiding a button is not permission enforcement.

The backend must still enforce the permission.

Do not implement sensitive actions against an unprotected endpoint because "the button is hidden".

---

# 11. Route-level permission guards

Protected route definitions live in:

```text
src/routes/protectedRouteConfig.tsx
src/routes/protectedRoutes.tsx
```

Every protected route may define:

```ts
perm
feature
```

`applyRoutePermissions()` wraps routes so direct URL navigation is checked.

Do not rely only on Dashboard button visibility.

When adding a protected page:

1. add its path to `pagePath.ts`,
2. add it to `protectedRouteConfig.tsx`,
3. assign the correct `perm`,
4. assign `feature` if optional,
5. ensure navigation uses the same contract.

---

# 12. Feature visibility is not authorization

Organisation presentation includes optional feature visibility:

```text
finance
birthdays
analytics
```

A hidden feature:

- disappears from navigation,
- is blocked by `RequireFeature`,
- does **not** change backend permission meaning.

Canonical helper:

```text
src/helpers/organisationPresentation.ts
```

Never do:

```text
featureVisible === true
→ assume authorized
```

Correct conceptual model:

```text
RBAC authorization
+
organisation presentation visibility
```

Both may affect whether a page appears, but they solve different problems.

---

# 13. Organisation terminology is display-only

Organisations can customise words such as:

```text
Member / Members
Attendance / Attendance
Category / Categories
Sub-category / Sub-categories
Officer / Officers
```

Use:

```text
useOrgPresentation()
useTerms()
LABELS
resolveText()
lowerTerm()
withArticle()
```

Do not hardcode `member` or `attendance` in new user-facing copy when an existing terminology helper fits.

## Critical rule

Terminology is never an API identifier.

Do not turn a display term into:

- a field name,
- a query key,
- a permission,
- an endpoint segment,
- an eligibility rule key.

Presentation words are labels only.

---

# 14. Endpoint constants

Canonical endpoint constants live in:

```text
src/services/api/request.ts
```

Use:

```text
authRequest
orgRequest
attendanceRequest
financeRequest
rbacRequest
```

Use:

```ts
convertParamsToString(...)
```

for route parameters.

Do not scatter literal endpoint strings through new components unless there is a strong reason.

When an API endpoint is added or changed, update endpoint constants in the same PR.

---

# 15. HTTP wrappers

Canonical wrappers:

```text
useQueryWrapper
useMutationWrapper
postRequest
putRequest
patchRequest
deleteRequest
```

in:

```text
src/services/api/apiHelper.ts
```

The response convention generally mirrors the backend:

```json
{
  "data": {}
}
```

Errors commonly arrive as:

```json
{
  "error": "Human-readable message"
}
```

Do not introduce a different response envelope client-side.

Use backend error text when useful and safe.

---

# 16. React Query conventions

`QueryClient` currently uses:

```text
refetchOnWindowFocus: true
retry: 0
```

Individual queries override these where appropriate.

## Prefer canonical query keys

Add new server-state keys to:

```text
src/services/api/queryKeys.ts
```

especially for tenant-owned data.

Some older pages still use ad-hoc arrays for export requests. Do not use those older patterns as justification for new tenant-unsafe keys.

## Queries with manual Search buttons

Pages such as Analytics and Birthday intentionally use:

```text
enabled: false
refetch()
```

after required filters are ready.

Preserve that UX where the user explicitly controls when a potentially expensive report runs.

## Mutation failure invalidation

Some hooks intentionally invalidate on `onSettled`, not only success, because a 404/422 can indicate that the cached list is stale.

Do not mechanically replace all `onSettled` invalidation with `onSuccess`.

Understand the domain reason first.

---

# 17. Member model: identity, key and label are different

For configured member fields:

```text
_id   = stable backend identity
name  = permanent storage/API key
label = editable display text
type  = field data type
```

This is one of the most important frontend invariants.

Helpers:

```text
src/helpers/memberFields.ts
src/helpers/memberModelEditor.ts
```

## `_id`

A persisted field's `_id` must be sent back when saving the model.

Do not mint a replacement id in the frontend.

## `name`

`name` is the storage key used by member documents, eligibility, filters, exports and forms.

For persisted fields, do not allow the key to change.

## `label`

The label is what officers see.

It may change without renaming stored data.

Member forms must render `label` but register inputs under `name`.

## `type`

Persisted type is immutable under the normal editor.

Do not enable normal type migration for saved fields unless a dedicated backend migration feature exists.

## Persisted field removal

Normal model editing currently does not remove saved fields.

The UI intentionally prevents removal of persisted fields.

Do not implement omission-as-delete.

## Name field

`name` is pinned and always present.

Treat it as core identity/display data.

---

# 18. Member model payload safety

`memberModelEditor.ts` mirrors backend constraints for new keys.

Reserved examples include:

```text
user
memberId
organisationId
createdBy
updatedBy
createdAt
updatedAt
financialStartDate
_id
id
__v
__proto__
constructor
prototype
```

Frontend validation is convenience, not authority.

The backend remains authoritative.

Do not add client-only keys into model payloads.

---

# 19. Member forms

`AddMember.tsx` renders dynamically from the organisation's member model.

Important:

```text
display label → shown to officer
storage key   → form registration/API field
```

Never register a field under its label.

Member updates are conceptually partial member data updates.

Do not use ordinary member forms to edit server-owned fields such as:

```text
financialStartDate
organisationId
createdBy
updatedBy
```

---

# 20. Member status vs attendance status

These are different domains.

## Member status

A dynamic member/profile field commonly named `status`.

Examples:

```text
active
inactive
alumni
left
```

It describes the member/profile.

## Attendance status

Organisation-configurable session values such as:

```text
Present
Late
Apology
Absent
No Show
```

Each maps to a semantic behavior.

Do not conflate these two status systems.

Filters should clearly indicate which one they affect.

---

# 21. Attendance status configuration

Canonical frontend domain module:

```text
src/helpers/attendanceStatuses.ts
```

Stable behaviors:

```text
present
excused
absent
```

Configured keys/labels can vary by organisation.

## Never hardcode semantic meaning from keys or labels

Bad:

```ts
if (status === "present")
```

when the intent is semantic attendance behavior.

Bad:

```ts
label === "Apology"
```

Correct:

```ts
statuses.resolve(key).behavior === "present"
```

or use structured behavior totals returned by analytics.

## Active/inactive statuses

Historical records may contain statuses that are now inactive.

Render them faithfully.

`legendFor()` deliberately includes inactive/unknown keys that actually occur.

Do not drop historical statuses just because they are no longer selectable.

## Unknown keys

Unknown historical keys use a neutral fallback and fail closed semantically.

Do not crash the UI on unknown historical status keys.

---

# 22. Attendance behavior meanings

Frontend helper documentation matches backend analytics:

```text
present
→ counts as attendance and extends streak

excused
→ counts toward attendance rate but does not extend streak

absent
→ earns no attendance credit and breaks streak
```

Do not redefine these in one page.

If product semantics change, update the shared helper and backend contract deliberately.

---

# 23. Historical attendance is not current configuration

For an existing attendance record:

```text
stored attendance roster is historical truth
```

Do not re-resolve an existing session using:

- current member list,
- current member status,
- current eligibility rules,
- current availability,
- current member-model values,
- current category membership.

Existing `MarkAttendance` update mode loads the saved roster snapshot.

That is intentional.

A current profile becoming archived/unresolvable must not erase the historical attendance entry.

---

# 24. Unresolved historical roster entries

Helpers:

```text
src/helpers/storedRoster.ts
src/components/attendance/UnresolvedRosterEntries.tsx
```

If a stored attendance entry's member profile can no longer resolve:

- keep it in the historical roster,
- display a read-only placeholder,
- do not silently drop it in a way that causes backend deletion,
- preserve its stored status.

Historical records outlive current profiles.

---

# 25. Eligibility rules

Canonical helper:

```text
src/helpers/attendanceEligibility.ts
```

Rule model:

```ts
{
  field: string;
  values: string[];
}
```

Semantics:

```text
values within one rule = OR
multiple rules          = AND
no rules                = Everyone
```

Rules store `field.name`, not field label.

## Eligibility fields

Only option-type member fields with options are valid eligibility criteria.

## Case behavior

Field/value comparison is intentionally tolerant/case-insensitive in the frontend helper to mirror backend compatibility.

## Stale rules

A stored/template rule can become stale if:

- field disappears,
- field is no longer option-type,
- selected option no longer exists.

Do not silently turn a stale rule into Everyone.

That widens scope.

Show it as stale and require deliberate repair where the workflow supports repair.

---

# 26. Eligibility feature setting

Organisation setting:

```text
attendanceEligibilityEnabled
```

Effective frontend rule:

```text
enabled only when explicitly true
```

Legacy/missing values resolve as off.

This setting controls creation UX.

It does not invalidate historical attendance that was created with eligibility rules.

Do not hide/rewrite stored rule metadata just because the setting is later disabled.

---

# 27. Attendance availability / leave

Canonical modules:

```text
src/helpers/attendanceAvailability.ts
src/hooks/useAttendanceAvailability.ts
src/pages/MemberAttendanceAvailability.tsx
```

Availability periods are inclusive:

```text
startDate <= sessionDate <= endDate
```

Business date format:

```text
YYYY-MM-DD
```

For new attendance:

```text
eligibility first
then availability subtraction
```

An unavailable member is:

```text
not expected
not absent
not excused
```

Do not add a stored `N/A` attendance status.

For historical attendance, do not re-run availability.

---

# 28. N/A is presentation semantics, not a status

In Analytics, a blank cell for a session means the member was not on that stored roster.

The UI renders that as conceptually:

```text
N/A
Not applicable
Not on this session roster
```

It is not Present, Excused or Absent.

Do not:

- add `n/a` to attendance status configuration,
- count it as absent,
- send it to backend as an attendance status,
- create a fourth analytics behavior.

---

# 29. Create Attendance workflow

Key pages:

```text
src/pages/CreateAttendance.tsx
src/pages/MarkAttendance.tsx
```

Conceptually:

```text
session details
→ optional template
→ eligibility rules
→ expected current members
→ availability subtraction
→ marking
→ backend create
```

The backend is authoritative.

The frontend pre-computation is UX and stale-request prevention, not a replacement for backend roster validation.

## Loading requirements

Do not enable marking/submission before required member/availability data is ready.

A stale roster should be refreshable without silently broadening scope.

---

# 30. Attendance drafts

`MarkAttendance` uses a persisted local roster draft.

All roster mutations go through the persisted roster hook so rendered state and localStorage remain aligned.

When changing draft shape:

- preserve backward compatibility where possible,
- do not let an old draft widen eligibility,
- reconcile against the canonical new-session roster,
- clear draft data on successful submit,
- keep tenant/session-specific storage keys.

Do not use one global draft key for all organisations/sessions.

---

# 31. Existing attendance editing

Normal update rules are intentionally stricter than creation.

Current backend/frontend design:

```text
existing stored roster stays fixed
```

Normal editing changes session details and statuses for members already on the roster, subject to backend edit limits.

It does not re-resolve eligibility, availability or current members.

Do not add newly-created/currently-eligible members into an old session as a side effect of ordinary editing.

If a dedicated one-session exception feature exists in the current backend, use that explicit contract rather than weakening ordinary PUT semantics.

---

# 32. Attendance edit limits

Organisation setting:

```text
maxAttendanceEdits
```

Frontend may display/edit based on returned record state, but backend is authoritative.

Do not rely solely on a disabled button.

Stale clients can race.

Always handle backend responses such as editing disabled / edit limit reached without optimistic false success.

---

# 33. Attendance templates

Hook:

```text
src/hooks/useAttendanceTemplates.ts
```

Templates are organisation-scoped server state.

Mutations invalidate only that organisation's template list.

Templates can become stale if referenced member-model options/config change.

Do not silently fix or widen a stale template.

Template application should be deliberate and observable.

---

# 34. Quick marking and bulk operations

Attendance marking supports:

- quick-mark mode,
- status cycling,
- visible/search-filtered bulk operations,
- undo.

Bulk operations intentionally affect the relevant visible subset, not arbitrary hidden members.

Do not change bulk semantics casually.

If introducing a special class of attendance row, ensure generic Reset/Bulk actions do not destroy its invariants.

---

# 35. Organisation analytics

Primary page:

```text
src/pages/Analytics.tsx
```

Backend analytics is the source of truth.

Do not recompute attendance analytics from current members, current eligibility or frontend roster guesses.

## Structured behavior totals

Use:

```text
attendanceBehaviorCounts
```

for:

```text
present
excused
absent
```

The old flat `Total Number of ...` aliases exist for compatibility but should not become the preferred new source.

## Session columns

Session cells hold stored status keys.

Resolve them through the effective status config returned with analytics when available.

## Ranking

The backend determines requested analytics sorting/ranking.

Do not invent a different client-only ranking for the same report without an explicit product requirement.

---

# 36. Analytics inclusion / exclusion

Phase 6E is whole-session analytics metadata.

Canonical frontend helper:

```text
src/helpers/attendanceAnalyticsInclusion.ts
```

Missing legacy flag means included.

Excluded attendance:

- remains stored,
- remains visible in All Attendance,
- remains viewable/editable/exportable as a single attendance,
- contributes nothing to analytics.

Do not treat exclusion as an attendance status.

Do not remove excluded records from history views merely because analytics ignore them.

---

# 37. Session summary semantics

Organisation analytics may include:

```ts
sessionSummary: {
  recorded,
  included,
  excluded
}
```

This describes raw attendance records in the selected range.

Do not reinterpret it as per-member expected counts.

Do not client-side alter it for member/status filters.

Collapse behavior and recognition/PDF denominator logic are backend-owned.

---

# 38. Collapse-by-day semantics

Organisation setting:

```text
collapseAttendanceByDay
```

When enabled, backend analytics performs the canonical collapse.

Current semantic grouping includes date + category and per-member verdict resolution.

The frontend must not simplify this to unique date only.

Do not independently reproduce collapse logic unless a task explicitly requires a shared client representation and the backend contract is mirrored exactly.

---

# 39. Recognition and PDF analytics are backend-owned

The full-house PDF and recognition calculations are backend-generated.

Frontend responsibilities are:

- request export,
- open returned URL,
- surface errors.

Do not duplicate Full Presence / Near Perfect calculations in the frontend merely to preview them unless product explicitly requires it.

`Sessions Held` is backend truth.

---

# 40. Member analytics

Member analytics is historical stored-roster analytics.

Preserve:

```text
not on roster = N/A
```

and backend-provided totals/streaks.

Do not infer missed sessions from organisation session counts in the browser.

---

# 41. Birthday feature

Current Birthday page uses the member field:

```text
dob
```

and backend member date-range endpoints.

It is behind:

```text
members.view
```

and optional feature visibility:

```text
birthdays
```

The page supports:

- date-range filtering,
- member status filtering,
- PDF/Excel export,
- share text,
- upcoming/today presentation.

## Caution

The frontend has robust date parsing for display, but backend query behavior is still the source of which members belong in the requested date range.

Do not replace server filtering with client scanning of the entire member dataset without a deliberate product/API decision.

Do not rename `dob` casually; it affects existing data and backend querying.

---

# 42. Finance ownership boundaries

Finance is a distinct domain.

Pages/components include:

```text
Finance.tsx
ObligationsTab
ComplianceTab
PaymentsTab
AccountabilityTab
```

Permission boundary:

```text
finance.view
finance.manage
```

Optional feature:

```text
finance
```

## financialStartDate

`financialStartDate` is system-owned finance data.

Meaning:

```text
null       = not financially accountable
YYYY-MM-DD = financially accountable from that point per backend finance rules
```

It is managed through the finance endpoint.

Do not expose it as an ordinary member-model field.

Do not let ordinary member saves erase it.

## Organisation switching

Finance workspace is keyed by organisation id so selected obligation, selected member, current tab/prefill cannot leak between tenants.

Preserve that pattern.

---

# 43. Critical finance actions need confirmation

Actions that materially change liability/payment state should be deliberate.

Examples:

- setting/clearing financial start date,
- recording payments,
- destructive obligation changes.

Use confirmation UX where current patterns expect it.

Do not make critical finance mutations optimistic if rollback semantics are unclear.

---

# 44. Organisation Settings save semantics

`OrganisationSettings.tsx` edits several settings together:

- name,
- image,
- collapse behavior,
- edit limit,
- attendance statuses,
- eligibility setting,
- terminology,
- feature visibility.

Helper:

```text
src/helpers/orgPayloads.ts
```

## Compatibility behavior

Some fields are sent only when the backend has demonstrated support.

This protects older backend validators from rejecting unknown fields.

Do not remove these compatibility gates without confirming rollout order.

## Merge selected org state

Organisation PUT responses may not contain permissions, `isOwner` or role name.

When updating selected organisation state, merge server settings over the current selected org rather than replacing the whole object blindly.

Otherwise you can erase RBAC state.

---

# 45. Config defaults and legacy persisted state

Zustand is persisted.

A user may open a new frontend build with an older stored organisation object missing newer fields.

Therefore reads should use effective/default helpers, such as:

```text
effectiveTerminology
effectiveFeatureVisibility
isAttendanceEligibilityEnabled
createStatusConfig
```

Do not assume every persisted organisation object contains today's complete schema.

Avoid eager client-side migrations unless necessary.

---

# 46. Dates are business dates unless explicitly timestamps

Attendance, availability, birthdays and finance frequently use calendar dates.

Typical API business date:

```text
YYYY-MM-DD
```

Do not casually convert a business date through local timezone-sensitive logic and send a shifted date.

Use explicit helpers such as `parseISO`, `format` and exact YYYY-MM-DD validation where appropriate.

Timestamps such as `createdAt`, `updatedAt`, `analyticsExcludedAt` are different from calendar dates.

Keep that distinction clear.

---

# 47. Export behavior

Several exports are URL-returning API calls.

Normal pattern:

```text
request export
→ backend generates file
→ response contains URL
→ window.open(...)
```

Do not assume export endpoints return file bytes directly.

Handle:

- missing URL,
- backend `error`,
- 401 globally,
- popup/new-tab behavior.

Keep export query filters aligned with the report currently shown.

---

# 48. Share behavior

Single attendance and birthdays support browser/WhatsApp/share workflows.

Share text is presentation.

Do not let share formatting become a second analytics source of truth.

Use current filtered/stored data deliberately.

---

# 49. Error handling

Use backend error messages when meaningful:

```ts
error?.response?.data?.error
```

Fallback to concise user-facing copy.

## 401

Avoid duplicate toast/logout handling because Axios generally handles it globally.

## Network errors

Do not pretend a mutation succeeded.

## Partial bulk results

When a bulk operation can partially fail, report succeeded count and failed count rather than claiming total success.

---

# 50. Loading and stale-state UX

Server state can refetch while an officer is editing a form.

Do not let background refetches wipe unsaved edits.

Example:

`UserModel.tsx` seeds the editor once from a fresh model and then keeps local unsaved state stable.

Use the same mindset for configuration forms:

```text
server snapshot
→ seed editable form
→ background refetch must not unexpectedly reset officer work
```

unless the task explicitly requires live-reset behavior.

---

# 51. Accessibility

Prefer semantic/keyboard-capable controls.

Examples already present:

- analytics member rows support Enter/Space navigation,
- buttons use labels/icons,
- status cells carry accessible labels,
- hidden module/permission redirects surface a toast.

When making clickable non-button content:

- add keyboard behavior,
- appropriate role,
- focusability.

Do not make important state visible only by color.

Attendance status badges should retain text/accessible labels.

---

# 52. Chakra UI conventions

The project uses Chakra UI v3 (migrated from v2). Write v3 APIs only:
compound parts (`Dialog.Root`, `Field.Root`, `NativeSelect.Root`, `Tabs.Root`,
`Menu.Root`, ...), `open`/`disabled`/`invalid` instead of `isOpen`/`isDisabled`,
`colorPalette` instead of `colorScheme`, `gap` instead of `spacing`.

Theme:

- `src/styles/theme.ts` exports `system` (`createSystem`). Custom button
  variants (`primary`, the default, plus `secondary`, `danger`, `logout`) are a
  recipe; `yarn install` regenerates their types (`postinstall` typegen).
- `src/styles/components/v2Parity.ts` keeps v2 sizes for headings, buttons,
  fields and Container. Medium fields stay 16px so iOS does not zoom on focus.
- Colour mode: `DARK_MODE_ENABLED` in `config/colorMode.ts` keeps users on
  light until every page is dark-safe. `?theme=dark|light|system` previews a
  mode for the current tab (and shows the System/Light/Dark control in the nav
  drawer); `?theme=off` ends it. Import `useColorModeValue` from
  `components/ui/color-mode`, not `@chakra-ui/react`.
- Prefer semantic tokens that flip with the mode (`bg`, `bg.panel`, `fg`,
  `fg.muted`, `border`, `{palette}.fg`, `{palette}.solid`, `primary`) over
  `white`, `black` or fixed `gray.*` shades.
- `PageLoader` (`components/PageLoader`) is the one loading indicator for a
  page, tab or section. Keep small inline spinners only for a refresh next to
  results already on screen.

Shared wrappers in `src/components/ui` (use them instead of the raw parts):

- `Switch` / `FormSwitch`: controlled; `FormSwitch` binds react-hook-form via
  `useController`. Never `register` a switch: v3 does not follow `reset()`.
  Put switches in a `Field.Root` beside a `Field.Label` with no id/htmlFor.
- `FormCheckbox`: a checkbox bound to react-hook-form via `useController`
  (always a boolean). Never `register` a checkbox root: it never reaches the
  hidden input, and `defaultChecked` ignores a later `reset()`.
- `NameAvatar`: initials on a name-derived colour, image when present.
- `DateField` (`ui/date-field`): every date input. Reads and writes
  `YYYY-MM-DD` (no timezone shift), enforces `min`/`max` for typed dates too,
  themed for dark mode. Use `todayValue()` for a "no future dates" cap. Do
  not add native `type="date"` inputs; existing ones move over per batch.
- `AmountInput` (`ui/amount-input`): money entry. Shows `6,000`, hands the
  form `"6000"`, so payloads are unchanged. Not for counts or limits.

v3 traps that type-check but misbehave:

- Inside a `Field.Root`, `NativeSelect` ignores its own `disabled`; put
  `disabled` on the `Field.Root`.
- `Dialog`/`Drawer.CloseTrigger` renders nothing without
  `<CloseButton />`; header text belongs in `Dialog.Title`/`Drawer.Title`.
- `Menu.Item` has no `icon` prop (put the icon in the children) and needs a
  unique `value`, also inside `.map()`.
- `aria-label` for a checkbox goes on `Checkbox.HiddenInput`, not the root.
- Native inputs, textareas and `NativeSelect.Field` keep `onChange`;
  `onValueChange`/`onCheckedChange` belong to Ark components only.
- `onCheckedChange`/`onValueChange` receive a details object
  (`({ checked })`, `({ value })`), not a DOM event: `e.target.checked`
  type-checks loosely but throws at runtime.

Do not introduce a second component framework for one feature.

---

# 53. react-select usage

The project uses `react-select` for multi-select filters.

For dropdowns inside overlays or constrained containers, existing code may use:

```text
menuPortalTarget={document.body}
menuPosition="fixed"
```

with a high z-index.

Follow nearby patterns when adding selects to drawers/modals.

---

# 54. Local component state vs URL state

Current reporting pages largely hold filters in component state and build query strings deliberately.

Do not introduce URL-state synchronization to one page as incidental refactor.

If adding cross-refresh/filter-linking behavior, treat it as a product change and test it.

---

# 55. Code style

TypeScript is strict:

```text
strict: true
noImplicitAny: false
```

There is legacy `any`.

Do not use that as permission to add broad `any` everywhere.

Prefer:

- typed endpoint responses,
- small domain interfaces,
- discriminated unions for mutation payloads,
- readonly arrays where sensible.

Match nearby formatting.

Do not reformat an entire file while making a two-line fix.

---

# 56. Imports

The project uses:

```text
baseUrl: ./src
```

so absolute app imports are common:

```ts
import useGlobalStore from "zStore";
import { queryKeys } from "services/api/queryKeys";
```

Follow existing convention.

Do not mix deep relative imports into areas already using `baseUrl` imports without reason.

---

# 57. Comments

Useful comments explain:

- historical compatibility,
- tenant-cache safety,
- why a setting is conditionally sent,
- why background refetch must not reset state,
- why blank cell means N/A,
- why a route must be guarded twice.

Avoid comments that merely narrate obvious JSX.

A good comment preserves the trap a future agent might otherwise reintroduce.

---

# 58. Test philosophy

Tests are part of the implementation.

Primary stack:

```text
Jest
@testing-library/react
@testing-library/user-event
jest-dom
jsdom
```

Global setup:

```text
src/setupTests.ts
```

## Prefer behavior tests

Test what the officer sees/does:

- controls visible/hidden by permissions,
- routes redirect correctly,
- payload uses storage key not label,
- organisation id appears in query key/request,
- correct cache invalidated,
- stale data does not overwrite local draft,
- backend errors stay visible.

## Chakra v3 in tests

Render through `render` from `test-utils/render` (or `renderRoute`): v3
components throw without a provider. Ark updates are asynchronous, so use
the shared helpers instead of asserting straight after a click:
`toggle()` for checkboxes/switches, `selectTab()` for tabs,
`chooseMenuItem()` for menu items (press, then click), and `findBy*` for
dialogs. Jest is CRA's Jest 27; `package.json` maps Ark's wildcard exports
and transforms v3's ESM-only packages.

## Pure helpers

Use direct tests for:

- eligibility,
- statuses,
- member-model transformations,
- presentation terminology,
- availability,
- inclusion metadata,
- finance calculations.

## Tenant isolation

For hooks/components that cache organisation data, test at least Org A and Org B and prove keys/invalidation/state do not cross.

---

# 59. Attendance test minimums

When changing attendance, test relevant combinations of:

```text
new session
existing session
eligibility on/off
availability
custom statuses
inactive historical status
unresolved member
edit limits
analytics inclusion
different organisation
```

If a change affects roster membership, add explicit historical-roster regression coverage.

If a change affects status meaning, test behavior rather than only default keys.

---

# 60. RBAC test minimums

For protected actions:

```text
owner
viewer
manager
direct route visit
hidden feature where relevant
```

Client tests prove UI behavior only.

Do not describe frontend RBAC tests as proof of backend security.

---

# 61. Build and verification standard

Before handing back a significant PR, report:

```text
Node version
Yarn version
focused tests
full frontend tests
npx tsc --noEmit
changed-file lint
CI=true yarn build
preview/integration status when available
```

Recommended sequence:

```bash
nvm use

CI=true yarn test --watchAll=false path/to/focused.test.tsx

CI=true yarn test --watchAll=false

npx tsc --noEmit

npx eslint <changed files>

CI=true yarn build
```

If the full suite has a pre-existing failure, report:

- exact failure,
- focused result,
- whether it reproduces on base.

Do not hide it.

---

# 62. Build warnings

CRA with `CI=true` may elevate warnings.

Do not claim build success if only development server compilation succeeded.

When a PR adds warnings, distinguish them from existing baseline warnings.

Avoid fixing unrelated historical warnings inside a focused feature PR unless they block build/testing.

---

# 63. Backward compatibility mindset

When changing a frontend/backend contract, ask:

```text
new frontend + old backend?
old frontend + new backend?
legacy persisted Zustand state?
legacy records missing new fields?
```

Examples already handled in the app:

- missing terminology → defaults,
- missing feature visibility → defaults,
- missing attendance status config → defaults,
- missing analyticsIncluded → included,
- older backend not supporting newer org settings → conditionally omit fields.

Preserve this mindset.

---

# 64. Backend-first rollout where appropriate

If a new frontend payload field would be rejected by the old backend:

```text
backend support must land first
```

or the frontend must gate sending it until support is known.

Do not deploy a frontend that starts sending unknown required fields before the backend accepts them.

For additive read-only UI, frontend-first may be safe if missing values have a defined fallback.

Decide explicitly.

---

# 65. New organisation setting checklist

When adding a setting:

1. define backend storage/effective default,
2. add optional field to selected-org type,
3. add effective helper for legacy persisted state,
4. load it from organisation detail,
5. send it only under safe rollout semantics,
6. merge response over RBAC-bearing selected-org state,
7. invalidate only relevant org caches,
8. test old persisted state,
9. test organisation switching during save,
10. test read-only vs manage permission,
11. decide whether it is presentation or authorization.

---

# 66. New tenant-owned query checklist

Before adding a query:

```text
Does the key contain organisationId?
Is enabled false until organisationId exists?
Can data from the previous org remain visible?
What mutation invalidates it?
Does invalidation touch only the current tenant?
```

If the query contains another resource id, organisationId + resourceId should usually both appear in the key.

---

# 67. New mutation checklist

For a mutation:

1. use canonical endpoint constants,
2. use selected/explicit organisation id,
3. avoid spoofable tenant ids where route identity should win,
4. disable accidental repeat submit where needed,
5. show backend errors,
6. invalidate/refetch relevant current-org caches,
7. do not optimistically mutate critical data without reliable rollback,
8. handle stale/racing state,
9. test view/manage permissions in UI,
10. test Org A / Org B invalidation.

---

# 68. New route checklist

1. path constant,
2. lazy page import,
3. route config title,
4. permission,
5. optional feature visibility,
6. navigation entry if appropriate,
7. terminology-aware title if domain words are customizable,
8. direct URL guard test.

Do not add a nav button without route guard.

---

# 69. New member-field feature checklist

If a feature uses a member field:

```text
use `name` for storage/API matching
use `label` for display
```

Do not persist label into business rules.

Handle:

- missing label,
- legacy field without `_id`,
- field option changes,
- stale eligibility/template references.

---

# 70. New attendance feature checklist

Ask:

```text
Does this affect a new session only?
Does it mutate historical attendance?
Does it alter who was expected?
Does it interact with leave?
Does it interact with eligibility?
Does it create a new attendance status or merely presentation?
Does analytics already handle it?
Does the PDF already handle it?
Does collapse change it?
```

Do not touch analytics/PDF merely because an attendance feature exists if stored attendance already naturally flows through current analytics.

---

# 71. Analytics feature checklist

If changing analytics UI:

1. inspect live backend response first,
2. use behavior totals,
3. preserve N/A,
4. preserve inclusion/exclusion,
5. preserve collapse semantics,
6. keep export query filters aligned,
7. do not recompute backend truth,
8. use tenant-scoped keys,
9. test custom status labels/keys,
10. test inactive/unknown historical keys.

---

# 72. Finance feature checklist

1. `finance.view` vs `finance.manage`,
2. feature visibility vs permission,
3. organisation-scoped keys,
4. financialStartDate stays finance-owned,
5. liability-changing actions are confirmed,
6. currency/amount calculations come from backend contract,
7. invalidate compliance after accountability/payment changes,
8. reset org-local selections on organisation change.

---

# 73. Common anti-patterns to avoid

## Do not use labels as identifiers

Bad:

```text
eligibility field = "Voice Part"
```

Correct:

```text
eligibility field = "part"
display label = "Voice Part"
```

## Do not hardcode attendance labels

Bad:

```ts
status === "apology"
```

for semantic logic.

Use behavior.

## Do not turn N/A into Absent

Blank session cell can mean the member was not expected.

## Do not recompute historical rosters

Stored attendance wins.

## Do not treat feature visibility as permission

Hidden != unauthorized and visible != authorized.

## Do not use account-global cache keys for tenant data

Always scope by organisation.

## Do not replace selected-org state with a partial settings response

Preserve RBAC fields.

## Do not expose finance-owned data in generic member forms

`financialStartDate` has its own domain.

## Do not send every new setting to an old backend blindly

Respect compatibility gates.

## Do not let background refetch wipe unsaved edits

Seed forms deliberately.

## Do not assume CRA is Vite

Use `REACT_APP_*`, `react-scripts`, Node 22.

---

# 74. Review priorities

Review frontend PRs in this order:

1. cross-tenant cache/state leak,
2. frontend/backend contract break,
3. historical attendance corruption,
4. permission/route-guard regression,
5. wrong attendance semantics,
6. destructive finance/member behavior,
7. stale/race-state bug,
8. invalidation/query-key bug,
9. functional correctness,
10. test gap,
11. accessibility/UX,
12. maintainability,
13. cosmetic/style.

Do not bury a tenant-cache bug under spacing feedback.

---

# 75. PR description requirements

A useful PR body should include:

## Summary

What changed for the user.

## Contract

API/request/response changes.

## State/cache behavior

What queries are invalidated/refetched.

## RBAC

Required view/manage permission.

## Tenant safety

How Org A / Org B separation is preserved.

## Historical compatibility

What happens to old records and persisted state.

## Rollout

Backend-first/frontend-first order if relevant.

## Verification

Exact test/type/lint/build results.

## Non-goals

What intentionally remains untouched.

Avoid vague PR descriptions like `updated frontend`.

---

# 76. Completion checklist

Before declaring a frontend task complete:

## Scope

- [ ] Only requested behavior changed.
- [ ] PR targets `staging`.
- [ ] No unrelated refactor.

## Tenant safety

- [ ] Tenant query keys include organisation id.
- [ ] Invalidations are tenant-scoped.
- [ ] Local selected ids/state cannot bleed across org switch.
- [ ] Async response cannot overwrite the wrong selected organisation.

## RBAC/presentation

- [ ] Route has correct guard.
- [ ] Action has correct `Can` visibility where applicable.
- [ ] Feature visibility is not confused with authorization.
- [ ] Custom terminology is respected.

## Member model

- [ ] `_id` identity preserved.
- [ ] `name` storage key preserved.
- [ ] `label` display-only.
- [ ] persisted type not mutated accidentally.

## Attendance

- [ ] Historical roster not recomputed.
- [ ] Configurable statuses use behavior.
- [ ] N/A remains neutral.
- [ ] eligibility fail-closed behavior preserved.
- [ ] availability affects new sessions only.
- [ ] analytics inclusion remains session metadata.
- [ ] collapse/PDF/recognition not reimplemented client-side.

## Finance

- [ ] finance-owned fields stay out of generic member form.
- [ ] critical actions confirmed.
- [ ] compliance caches invalidated when liability/payment changes.

## Compatibility

- [ ] Legacy persisted Zustand object still renders.
- [ ] Missing additive fields use effective defaults.
- [ ] Rollout order considered.

## Testing

- [ ] Focused tests pass.
- [ ] Full suite run.
- [ ] TypeScript clean.
- [ ] Changed-file lint reviewed.
- [ ] CRA production build run.
- [ ] Preview/real-backend smoke performed when required.

## Operations

- [ ] Nothing merged without authorization.
- [ ] Nothing deployed without authorization.

---

# 77. Short reference

When you remember nothing else, remember this:

```text
staging is the default integration branch.
Do not merge or deploy without explicit approval.

This is CRA on Node 22 and Yarn 1.22.22, not Vite.

React Query owns server state.
Zustand owns small persisted client/global state.

Every tenant-owned cache key includes organisationId.
Never let Org A state bleed into Org B.

Frontend RBAC is presentation, backend RBAC is security.
Feature visibility is presentation, not authorization.

Member field:
_id = identity
name = permanent storage key
label = editable display text

Attendance status:
key/label may vary
behavior = present | excused | absent
Never infer behavior from a label.

Historical attendance is stored truth.
Do not rebuild old rosters from current members, eligibility or availability.

N/A means not expected.
N/A is not an attendance status and is not absent.

Eligibility:
OR within rule
AND across rules
[] = Everyone
invalid/stale must never silently widen to Everyone.

Availability affects new expected rosters.
Historical rosters stay frozen.

Analytics is backend truth.
Use attendanceBehaviorCounts.
Excluded sessions contribute nothing to analytics but remain in history.
Collapse and Sessions Held are backend-owned.

Terminology is display-only.
Labels never become identifiers.

financialStartDate belongs to Finance, not the member form.

Use tenant-scoped query invalidation.
Preserve unsaved form state across background refetches.

Test permissions, tenant switching, historical data, custom statuses and legacy defaults.

Never merge or deploy unless explicitly asked.
```

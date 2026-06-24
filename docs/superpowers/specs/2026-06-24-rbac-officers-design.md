# Officer RBAC — Frontend Design

**Date:** 2026-06-24
**Status:** Approved (design); ready for implementation planning
**Source brief:** `RBAC.md` (API is live, Phase 1 — no email delivery yet)

## Goal

Add multi-officer roles & permissions to the attendance tracker frontend: a user can own
organisations *and* be an officer of others, with their UI driven by the per-org permission
set the API now returns. Build auth/email changes, permission-gating across the app, an
Officers admin, a Roles admin, and the invite-by-email flow.

## Principles for this work

- **Strong typing, no `any`.** The 12 permission keys are a compile-time union; all RBAC
  request/response shapes are typed interfaces.
- **DRY / proper abstraction.** All permission logic lives behind 3 primitives
  (`usePermissions`, `<Can>`, `<RequirePermission>`); the checkbox permission editor is one
  shared `PermissionGrid` reused by both the role editor and the per-user override editor.
- **Fit existing patterns.** Zustand for global state, axios + React Query wrappers
  (`useQueryWrapper`/`useMutationWrapper`), Chakra UI, react-hook-form, tabbed page like
  Finance, pure payload builders like `financePayloads.ts`.
- **YAGNI.** No role templates, bulk invite, or audit log — not in the brief.

## Non-goals

- Email delivery (Phase 2, server-side).
- Backend changes — the API is live and authoritative; the frontend gates for UX only.
- Introducing i18n (project has none; we stay consistent and centralize copy instead).

---

## 1. Types & permission model — `src/rbac/permissions.ts`

```ts
export const PERMISSION_AREAS =
  ["attendance","members","categories","settings","finance","officers"] as const;
export type PermissionArea   = (typeof PERMISSION_AREAS)[number];
export type PermissionAction = "view" | "manage";
export type PermissionKey    = `${PermissionArea}.${PermissionAction}`; // the 12 keys, typed
```

The **runtime** catalog (`areas`, `permissions`) is still fetched from `GET /api/permissions`
and never hardcoded for rendering the editors. The union above is for compile-time safety on
gating call-sites only.

`zStore.ts` types extended:

```ts
type UserType = {
  token: string; id: string; username: string;
  email: string; needsEmail: boolean;
};
type OrganisationType = {
  id: string; name: string; image: string; owner: string; status: string;
  isOwner: boolean; roleName: string; permissions: PermissionKey[];
};
```

`setUser` and `updateOrganisation` carry the new fields; both remain persisted to
`GLOBAL_STORE`. Defaults for the empty/logged-out state include `email: ""`,
`needsEmail: false`, `isOwner: false`, `roleName: ""`, `permissions: []`.

---

## 2. Gating primitives — `src/rbac/`

- **`usePermissions()`** — reads the selected org from `zStore`; returns a stable, typed API:
  ```ts
  { isOwner: boolean;
    has: (k: PermissionKey) => boolean;
    hasAny: (...k: PermissionKey[]) => boolean;
    hasAll: (...k: PermissionKey[]) => boolean; }
  ```
  Owner short-circuits to `true`. Backed by a `Set<PermissionKey>` memoized on
  `org.permissions`.
- **`<Can perm | anyOf | owner fallback>`** — declarative gate for buttons/sections. Renders
  `children` when allowed, else `fallback` (default `null`). Exactly one of `perm` / `anyOf` /
  `owner` is provided.
- **`<RequirePermission perm>`** — route guard wrapping a route element; if the user lacks
  `perm`, redirect to Dashboard and toast "You don't have access to that." Used for the new
  Officers & Roles route.

These are the only places permission logic lives. Call-sites declare *what they need*, never
inspect the raw array.

---

## 3. API layer

Endpoint constants added in `src/services/api/request.ts` (new `rbacRequest` group; auth
additions to the existing auth group). Typed request/response interfaces in
`src/rbac/types.ts`:

| Concern        | Method & path                                              | Hook              |
| -------------- | ---------------------------------------------------------- | ----------------- |
| Catalog        | `GET /api/permissions`                                     | query             |
| Officers list  | `GET /api/organisations/:id/officers`                      | query             |
| Invite         | `POST /api/organisations/:id/officers/invite`              | mutation          |
| Invites list   | `GET /api/organisations/:id/officers/invites`              | query             |
| Revoke invite  | `DELETE /api/organisations/:id/officers/invites/:inviteId` | mutation          |
| Change role    | `PATCH /api/organisations/:id/officers/:userId/role`       | mutation          |
| Overrides      | `PATCH /api/organisations/:id/officers/:userId/permissions`| mutation          |
| Remove officer | `DELETE /api/organisations/:id/officers/:userId`           | mutation          |
| Roles list     | `GET /api/organisations/:id/roles`                         | query             |
| Create role    | `POST /api/organisations/:id/roles`                        | mutation          |
| Edit role      | `PUT /api/organisations/:id/roles/:roleId`                 | mutation          |
| Delete role    | `DELETE /api/organisations/:id/roles/:roleId`              | mutation          |
| Me             | `GET /api/users/me`                                        | query             |
| Set email      | `PATCH /api/users/me/email`                                | mutation          |

All consumed through the existing `useQueryWrapper`/`useMutationWrapper` — no new fetch
abstraction. Query keys namespaced per org, e.g. `["officers", orgId]`, `["roles", orgId]`,
`["officer-invites", orgId]`, `["permissions-catalog"]`. Mutations invalidate the matching
key(s). Pure payload builders live in `src/rbac/rbacPayloads.ts` (mirrors
`financePayloads.ts`), e.g. building `{ grantedPermissions, revokedPermissions }` from a grid
selection diffed against the role's permissions.

---

## 4. Auth changes

- **Signup** (`POST /users/signup`) — add a required **email** field to the form
  (`react-hook-form` + email validation). Response `{ message, token }`.
- **Login** (`POST /users/login`) — already accepts email-or-username in one field; response
  now includes `email` + `needsEmail`; persist via `setUser`.
- **App boot** — call `GET /users/me` once to refresh `email`/`needsEmail` for the persisted
  session.
- **`SetEmailModal`** — shown when `needsEmail === true` on entry to Organisations/Dashboard.
  `PATCH /users/me/email`; on success flips `needsEmail` to `false`, updates the user, and
  refetches `GET /organisations` (auto-redeemed invites now surface). Dismissible, but
  re-prompts until an email is set.

---

## 5. Org sourcing & freshness

`GET /api/organisations` (now annotated with `isOwner`/`roleName`/`permissions`) is the single
source of truth. The selected org stays in `zStore` (persisted) so gating survives reloads,
but is **reconciled** with the server via `useSyncSelectedOrg()`:

- runs on Dashboard mount, and
- runs after any officer/role mutation,

by refetching the list and re-applying the fresh annotation for the selected org by `id`
(`updateOrganisation`). This keeps gating correct when a role changes under the current user,
without a state-management rewrite. If the selected org is no longer returned (access
revoked), clear it and send the user to the org switcher.

The **org switcher** (`Organisations.tsx`) badges each org with its `roleName` and drives the
delete affordance off `isOwner`.

---

## 6. Gating existing UI

- **Dashboard buttons** wrapped in `<Can>`:
  - Members (Add/View) → `members.view`
  - Create/All Attendance → `attendance.view`
  - Analytics, Birthday → `attendance.view` (read analytics)
  - Finance → `finance.view`
  - **Officers & Roles** (new) → `officers.view`
- **Inside sections**, `.manage` gates mutate affordances (record payment, add/edit/delete
  member, mark/edit attendance, edit categories, org rename/settings).
- **Delete organisation** in `Organisations.tsx` gated to `isOwner === true`.

Server enforces regardless; gating is UX. Any `403` is treated as "shouldn't-have-shown-it".

---

## 7. Officers & Roles admin

New route gated by `<RequirePermission perm="officers.view">`, page
`src/pages/OfficersRoles.tsx` with Chakra `Tabs` (Finance pattern), components under
`src/components/officers/`:

- **Officers tab** — table: name / email / role / effective permissions.
  `<Can perm="officers.manage">` reveals **Invite**, and per-row **Edit Role**,
  **Edit Permissions**, **Remove**. The **owner row never** shows action buttons (and the API
  returns `403` if targeted — defense in depth).
  - *Edit Role* → modal with role `<Select>` (from roles list) → `PATCH …/role`.
  - *Edit Permissions* → modal with shared `PermissionGrid`, pre-checked from the officer's
    role; on save, diff against the role to produce `{ grantedPermissions, revokedPermissions }`
    → `PATCH …/permissions`.
- **Pending Invites tab** — list (email, role, invited-at) + **Revoke**. Empty-state explains
  the no-email-yet flow (invitee must sign up / set email with that exact address).
- **Roles tab** — list roles (system roles badged). Create/Edit via modal using the shared
  `PermissionGrid` (checkbox grid built from `GET /api/permissions`, pre-checked from
  `role.permissions`). Chairman/system roles are **read-only** (no edit/delete). Delete guarded
  (system role or role still assigned → `422`, surface message).

**`PermissionGrid`** (`src/components/officers/PermissionGrid.tsx`) is the single shared
editor: renders areas × {view, manage} from the runtime catalog with friendly labels from
`copy.ts`, controlled selection, used by both the role editor and the override editor.

### Invite flow

1. Officers tab → **Invite** → modal: email + role `<Select>` → `POST …/officers/invite`.
2. Response handling:
   - `{ invited: true }` → toast "Invite pending — they'll join when they sign up with that
     email"; refresh invites list.
   - `{ attached: true, userId }` (200/201) → toast "Officer added"; refresh officers list.
3. No email sent this phase — Pending Invites tab surfaces the state for out-of-band sharing.

---

## 8. Error handling

Centralized through the existing `useMutationWrapper` error path plus a small RBAC-aware map:

| Status | Frontend action                                                       |
| ------ | --------------------------------------------------------------------- |
| 401    | existing global interceptor → logout/login                            |
| 403    | hide-and-toast "not allowed" (gating should prevent reaching it)      |
| 404    | treat as no-access; don't leak existence; clear selected org if it's the org |
| 422    | show server `error` message (bad email, unknown key, duplicate name)  |
| 409    | show server `error` message (conflict)                                |

---

## 9. Copy / labels — `src/rbac/copy.ts`

One map from `PermissionKey` (and area) to human-friendly label + description, so editors and
tables render "Mark / edit / delete sessions" instead of `attendance.manage`. Keeps all
RBAC-facing strings in one place (the consistent substitute for i18n in this project).

---

## 10. Testing

- **`usePermissions`** — owner short-circuit; `has`/`hasAny`/`hasAll`; empty permissions.
- **`<Can>` / `<RequirePermission>`** — renders/hides; guard redirects + toasts.
- **`rbacPayloads`** — override diff (grid selection vs role → granted/revoked); role create/edit
  payloads; unknown-key guarding deferred to server (422 surfaced).
- **`PermissionGrid`** — pre-check from given permissions; emits correct selection on toggle.

Test runner/setup to be confirmed during planning and matched to the existing convention.

---

## File map (new unless noted)

```
src/rbac/permissions.ts        # PERMISSION_AREAS, PermissionKey union
src/rbac/types.ts              # request/response interfaces
src/rbac/copy.ts               # friendly labels/descriptions per key/area
src/rbac/rbacPayloads.ts       # pure payload builders
src/rbac/usePermissions.ts     # hook
src/rbac/Can.tsx               # <Can>
src/rbac/RequirePermission.tsx # route guard
src/rbac/useSyncSelectedOrg.ts # reconcile selected org with server
src/pages/OfficersRoles.tsx    # tabbed admin page
src/components/officers/OfficersTab.tsx
src/components/officers/PendingInvitesTab.tsx
src/components/officers/RolesTab.tsx
src/components/officers/PermissionGrid.tsx       # shared editor
src/components/officers/InviteOfficerModal.tsx
src/components/officers/EditOfficerRoleModal.tsx
src/components/officers/EditOfficerPermissionsModal.tsx
src/components/officers/RoleFormModal.tsx
src/components/auth/SetEmailModal.tsx

# edits to existing files
src/zStore.ts                  # extended UserType/OrganisationType
src/services/api/request.ts    # new endpoint constants
src/pages/Login.tsx            # email handling
src/pages/Signup.tsx           # required email field
src/pages/Dashboard.tsx        # <Can> gating + Officers & Roles button
src/pages/Organisations.tsx    # roleName badge, isOwner delete gate, SetEmailModal
src/routes/pagePath.ts         # OFFICERS_ROLES path
src/routes/protectedRoutes.tsx # gated route
```

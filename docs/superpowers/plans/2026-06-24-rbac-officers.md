# Officer RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-officer roles & permissions to the attendance-tracker frontend — auth/email changes, permission-gated UI, an Officers & Roles admin, and the invite-by-email flow — driven by the per-org `permissions` the API now returns.

**Architecture:** All permission logic lives behind three primitives (`usePermissions`, `<Can>`, `<RequirePermission>`) plus one shared `PermissionGrid` editor reused by the role editor and the per-user override editor. The selected org (with `isOwner`/`roleName`/`permissions`) lives in the persisted Zustand store and is reconciled with `GET /organisations` on Dashboard mount and after admin mutations.

**Tech Stack:** React 18 + TypeScript, CRA (`react-scripts`), Chakra UI v2, Zustand (persisted), TanStack React Query v4, axios, react-hook-form, react-toastify. Tests: `react-scripts test` (Jest) + `@testing-library/react` v13.

## Global Constraints

- **No `any` in new code.** The 12 permission keys are the typed union `PermissionKey`; all RBAC request/response shapes are typed interfaces.
- **DRY / abstraction.** Permission checks only through `usePermissions`/`<Can>`/`<RequirePermission>`; the permission checkbox editor is the single `PermissionGrid`; the empty user/org literals are the single `EMPTY_USER`/`EMPTY_ORG` constants.
- **No i18n** (project has none); RBAC-facing copy + permission labels are centralized in `src/rbac/copy.ts`.
- **Runtime catalog** for editors comes from `GET /api/permissions` — never hardcode the list for rendering.
- **API base** already prefixes nothing extra; existing constants are root-relative (`/users/login`). Endpoint constants follow `request.ts` style. `:organisationId`/`:userId` etc. are string-replaced at call sites (existing convention).
- **Existing wrappers only:** `useQueryWrapper`, `useMutationWrapper`, `postRequest`/`putRequest`/`patchRequest`/`deleteRequest` from `services/api/apiHelper`. No new fetch abstraction.
- **Commit after every task.** Branch off `dev`.

---

## File Structure

```
src/rbac/permissions.ts          # PERMISSION_AREAS, PermissionKey union, helpers
src/rbac/permissions.test.ts
src/rbac/copy.ts                  # friendly labels/descriptions per key/area
src/rbac/types.ts                 # request/response interfaces
src/rbac/rbacPayloads.ts          # pure payload builders (override diff, role)
src/rbac/rbacPayloads.test.ts
src/rbac/usePermissions.ts        # hook
src/rbac/usePermissions.test.tsx
src/rbac/Can.tsx                  # <Can> gate
src/rbac/Can.test.tsx
src/rbac/RequirePermission.tsx    # route guard
src/rbac/RequirePermission.test.tsx
src/rbac/useSyncSelectedOrg.ts    # reconcile selected org with server
src/pages/OfficersRoles.tsx       # tabbed admin page
src/pages/Signup.tsx              # NEW signup page (email required)
src/components/officers/OfficersTab.tsx
src/components/officers/PendingInvitesTab.tsx
src/components/officers/RolesTab.tsx
src/components/officers/PermissionGrid.tsx      # shared editor
src/components/officers/PermissionGrid.test.tsx
src/components/officers/InviteOfficerModal.tsx
src/components/officers/EditOfficerRoleModal.tsx
src/components/officers/EditOfficerPermissionsModal.tsx
src/components/officers/RoleFormModal.tsx
src/components/auth/SetEmailModal.tsx

# modified
src/zStore.ts                     # extended types + EMPTY_USER/EMPTY_ORG
src/services/api/index.ts         # 401 reset uses EMPTY_USER
src/services/api/request.ts       # rbacRequest group + auth additions
src/pages/Login.tsx               # email-or-username label + Signup link
src/pages/Dashboard.tsx           # <Can> gating + Officers&Roles button, EMPTY_*
src/pages/Organisations.tsx       # roleName badge, isOwner delete gate, SetEmailModal, EMPTY_USER
src/pages/Authenticated.tsx       # GET /users/me on boot
src/routes/pagePath.ts            # OFFICERS_ROLES, SIGN_UP paths
src/routes/protectedRoutes.tsx    # gated OfficersRoles route
src/routes/publicRoutes.tsx       # Signup route
```

---

### Task 1: Permission model + copy

**Files:**
- Create: `src/rbac/permissions.ts`
- Create: `src/rbac/copy.ts`
- Test: `src/rbac/permissions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PERMISSION_AREAS: readonly PermissionArea[]`
  - `type PermissionArea`, `type PermissionAction = "view" | "manage"`, `type PermissionKey = \`${PermissionArea}.${PermissionAction}\``
  - `ALL_PERMISSIONS: PermissionKey[]` (all 12, derived)
  - `isPermissionKey(value: string): value is PermissionKey`
  - `splitPermission(key: PermissionKey): { area: PermissionArea; action: PermissionAction }`
  - `PERMISSION_COPY: Record<PermissionKey, { label: string; description: string }>` and `AREA_LABEL: Record<PermissionArea, string>` (from `copy.ts`)

- [ ] **Step 1: Write the failing test** — `src/rbac/permissions.test.ts`

```ts
import {
  PERMISSION_AREAS,
  ALL_PERMISSIONS,
  isPermissionKey,
  splitPermission,
} from "rbac/permissions";

describe("permission model", () => {
  it("derives all 12 permission keys from 6 areas x 2 actions", () => {
    expect(PERMISSION_AREAS).toHaveLength(6);
    expect(ALL_PERMISSIONS).toHaveLength(12);
    expect(ALL_PERMISSIONS).toContain("attendance.view");
    expect(ALL_PERMISSIONS).toContain("officers.manage");
  });

  it("guards permission keys", () => {
    expect(isPermissionKey("finance.view")).toBe(true);
    expect(isPermissionKey("finance.delete")).toBe(false);
    expect(isPermissionKey("nope")).toBe(false);
  });

  it("splits a key into area and action", () => {
    expect(splitPermission("members.manage")).toEqual({
      area: "members",
      action: "manage",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test --watchAll=false src/rbac/permissions.test.ts`
Expected: FAIL — cannot find module `rbac/permissions`.

- [ ] **Step 3: Write `src/rbac/permissions.ts`**

```ts
export const PERMISSION_AREAS = [
  "attendance",
  "members",
  "categories",
  "settings",
  "finance",
  "officers",
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];
export type PermissionAction = "view" | "manage";
export type PermissionKey = `${PermissionArea}.${PermissionAction}`;

const PERMISSION_ACTIONS: readonly PermissionAction[] = ["view", "manage"];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_AREAS.flatMap(
  (area) => PERMISSION_ACTIONS.map((action): PermissionKey => `${area}.${action}`)
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_SET.has(value);
}

export function splitPermission(key: PermissionKey): {
  area: PermissionArea;
  action: PermissionAction;
} {
  const [area, action] = key.split(".") as [PermissionArea, PermissionAction];
  return { area, action };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test --watchAll=false src/rbac/permissions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `src/rbac/copy.ts`** (no test — static data)

```ts
import { PermissionArea, PermissionKey } from "rbac/permissions";

export const AREA_LABEL: Record<PermissionArea, string> = {
  attendance: "Attendance",
  members: "Members",
  categories: "Categories",
  settings: "Org settings",
  finance: "Finance",
  officers: "Officers & roles",
};

export const PERMISSION_COPY: Record<
  PermissionKey,
  { label: string; description: string }
> = {
  "attendance.view": { label: "View", description: "Read sessions & analytics" },
  "attendance.manage": { label: "Manage", description: "Mark / edit / delete sessions" },
  "members.view": { label: "View", description: "Read the member list" },
  "members.manage": { label: "Manage", description: "Create / edit / delete members & model" },
  "categories.view": { label: "View", description: "Read categories" },
  "categories.manage": { label: "Manage", description: "Create / edit / delete categories" },
  "settings.view": { label: "View", description: "Read org settings" },
  "settings.manage": { label: "Manage", description: "Rename org, change settings" },
  "finance.view": { label: "View", description: "Read obligations & compliance" },
  "finance.manage": { label: "Manage", description: "Manage obligations, record payments" },
  "officers.view": { label: "View", description: "Read officers, roles & invites" },
  "officers.manage": { label: "Manage", description: "Invite/remove officers, edit roles" },
};
```

- [ ] **Step 6: Commit**

```bash
git add src/rbac/permissions.ts src/rbac/copy.ts src/rbac/permissions.test.ts
git commit -m "feat(rbac): typed permission model and copy map"
```

---

### Task 2: Extend store types + empty constants

**Files:**
- Modify: `src/zStore.ts`
- Modify: `src/services/api/index.ts:48-54` (401 reset)

**Interfaces:**
- Consumes: `PermissionKey` from Task 1.
- Produces:
  - `UserType` now `{ token; id; username; email: string; needsEmail: boolean }`
  - `OrganisationType` now `{ id; name; image; owner; status: string; isOwner: boolean; roleName: string; permissions: PermissionKey[] }`
  - Exported `EMPTY_USER: UserType` and `EMPTY_ORG: OrganisationType`

- [ ] **Step 1: Edit `src/zStore.ts`** — extend types, export empty constants, use them as defaults

Replace the `UserType`/`OrganisationType` definitions and the store defaults:

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PermissionKey } from "rbac/permissions";

export type currentAttendanceType = {
  name: string;
  categoryId?: string;
  subCategoryId?: string;
  date: Date;
  members?: Array<any>;
};

export type UserType = {
  token: string;
  id: string;
  username: string;
  email: string;
  needsEmail: boolean;
};

export type OrganisationType = {
  name: string;
  image: string;
  owner: string;
  id: string;
  status: string;
  isOwner: boolean;
  roleName: string;
  permissions: PermissionKey[];
};

export const EMPTY_USER: UserType = {
  token: "",
  id: "",
  username: "",
  email: "",
  needsEmail: false,
};

export const EMPTY_ORG: OrganisationType = {
  name: "",
  image: "",
  owner: "",
  id: "",
  status: "",
  isOwner: false,
  roleName: "",
  permissions: [],
};
```

Then in `globalStore`, set `user: EMPTY_USER`, `organisation: EMPTY_ORG`, and keep `setUser`/`updateOrganisation` typed (`(user: UserType) => ...`, `(organisation: OrganisationType) => ...`). Leave `currentAttendance` untouched.

- [ ] **Step 2: Edit `src/services/api/index.ts`** — 401 reset uses `EMPTY_USER`

Replace the inline `user: { token: "", id: "", username: "" }` in `onResponseError` with:

```ts
import useGlobalStore, { EMPTY_USER } from "zStore";
// ...
useGlobalStore.setState({ user: EMPTY_USER });
```

- [ ] **Step 3: Typecheck**

Run: `yarn tsc --noEmit`
Expected: errors ONLY in `src/pages/Dashboard.tsx` and `src/pages/Organisations.tsx` (they still build the old 3-field user/org literals). These are fixed in later tasks (Task 11/Dashboard, Task 14, Task 22). If any OTHER file errors, fix it to use `EMPTY_USER`/`EMPTY_ORG`.

- [ ] **Step 4: Commit**

```bash
git add src/zStore.ts src/services/api/index.ts
git commit -m "feat(rbac): extend user/org store types with email and permissions"
```

> Note: the persisted `GLOBAL_STORE` from before this change lacks the new fields. `GET /users/me` (Task 11) and `useSyncSelectedOrg` (Task 8) repopulate them; missing `permissions` defaults to `[]` via reads that use `org.permissions ?? []`.

---

### Task 3: RBAC endpoints + request/response types

**Files:**
- Modify: `src/services/api/request.ts`
- Create: `src/rbac/types.ts`

**Interfaces:**
- Consumes: `PermissionKey`.
- Produces:
  - `rbacRequest` constant map (paths with `:organisationId` etc.) and auth additions `SET_EMAIL: "/users/me/email"`, `PERMISSIONS: "/permissions"`.
  - Types: `Officer`, `Role`, `Invite`, `PermissionsCatalog`, `InviteResponse`, `MeResponse`, `OrganisationSummary`.

- [ ] **Step 1: Append to `src/services/api/request.ts`**

```ts
export const rbacRequest = {
  PERMISSIONS: "/permissions",
  OFFICERS: "/organisations/:organisationId/officers",
  INVITE: "/organisations/:organisationId/officers/invite",
  INVITES: "/organisations/:organisationId/officers/invites",
  INVITE_ONE: "/organisations/:organisationId/officers/invites/:inviteId",
  OFFICER_ROLE: "/organisations/:organisationId/officers/:userId/role",
  OFFICER_PERMISSIONS:
    "/organisations/:organisationId/officers/:userId/permissions",
  OFFICER_ONE: "/organisations/:organisationId/officers/:userId",
  ROLES: "/organisations/:organisationId/roles",
  ROLE_ONE: "/organisations/:organisationId/roles/:roleId",
};
```

And add to the existing `authRequest` object:

```ts
  SET_EMAIL: "/users/me/email",
```

- [ ] **Step 2: Create `src/rbac/types.ts`**

```ts
import { PermissionArea, PermissionKey } from "rbac/permissions";

export interface PermissionsCatalog {
  areas: PermissionArea[];
  permissions: PermissionKey[];
}

export interface Officer {
  userId: string;
  username: string;
  email: string;
  roleId: string;
  roleName: string;
  permissions: PermissionKey[];
}

export interface Role {
  id: string;
  organisationId: string;
  name: string;
  permissions: PermissionKey[];
  isSystem: boolean;
  status: string;
}

export interface Invite {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  createdAt: string;
}

export interface OrganisationSummary {
  id: string;
  name: string;
  image: string;
  owner: string;
  status: string;
  isOwner: boolean;
  roleName: string;
  permissions: PermissionKey[];
}

export interface MeResponse {
  id: string;
  username: string;
  email: string;
  needsEmail: boolean;
}

export type InviteResponse =
  | { invited: true }
  | { attached: true; userId: string };
```

- [ ] **Step 3: Typecheck & commit**

Run: `yarn tsc --noEmit` (same expected pre-existing errors as Task 2).

```bash
git add src/services/api/request.ts src/rbac/types.ts
git commit -m "feat(rbac): add RBAC endpoints and API types"
```

---

### Task 4: Payload builders (override diff + role)

**Files:**
- Create: `src/rbac/rbacPayloads.ts`
- Test: `src/rbac/rbacPayloads.test.ts`

**Interfaces:**
- Consumes: `PermissionKey`, `ALL_PERMISSIONS`.
- Produces:
  - `buildOverridePayload(rolePermissions: PermissionKey[], selected: PermissionKey[]): { grantedPermissions: PermissionKey[]; revokedPermissions: PermissionKey[] }`
  - `buildRolePayload(input: { name: string; permissions: PermissionKey[] }): { name: string; permissions: PermissionKey[] }`

- [ ] **Step 1: Write the failing test** — `src/rbac/rbacPayloads.test.ts`

```ts
import { buildOverridePayload, buildRolePayload } from "rbac/rbacPayloads";

describe("rbac payload builders", () => {
  it("grants what's selected-but-not-in-role and revokes what's in-role-but-unselected", () => {
    const role = ["finance.view", "finance.manage"] as const;
    const selected = ["finance.view", "members.view"] as const;
    expect(buildOverridePayload([...role], [...selected])).toEqual({
      grantedPermissions: ["members.view"],
      revokedPermissions: ["finance.manage"],
    });
  });

  it("returns empty arrays when selection equals the role", () => {
    const role = ["officers.view"] as const;
    expect(buildOverridePayload([...role], [...role])).toEqual({
      grantedPermissions: [],
      revokedPermissions: [],
    });
  });

  it("builds a role payload passing name and permissions through", () => {
    expect(
      buildRolePayload({ name: "Treasurer", permissions: ["finance.view"] })
    ).toEqual({ name: "Treasurer", permissions: ["finance.view"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test --watchAll=false src/rbac/rbacPayloads.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/rbac/rbacPayloads.ts`**

```ts
import { PermissionKey } from "rbac/permissions";

export function buildOverridePayload(
  rolePermissions: PermissionKey[],
  selected: PermissionKey[]
): { grantedPermissions: PermissionKey[]; revokedPermissions: PermissionKey[] } {
  const role = new Set(rolePermissions);
  const sel = new Set(selected);
  return {
    grantedPermissions: selected.filter((p) => \!role.has(p)),
    revokedPermissions: rolePermissions.filter((p) => \!sel.has(p)),
  };
}

export function buildRolePayload(input: {
  name: string;
  permissions: PermissionKey[];
}): { name: string; permissions: PermissionKey[] } {
  return { name: input.name.trim(), permissions: input.permissions };
}
```

> Note: `buildRolePayload` trims the name; the test passes `"Treasurer"` (already trimmed) so it stays green. Trimming matches the existing `stringManipulations` convention.

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test --watchAll=false src/rbac/rbacPayloads.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rbac/rbacPayloads.ts src/rbac/rbacPayloads.test.ts
git commit -m "feat(rbac): override-diff and role payload builders"
```

---

### Task 5: `usePermissions` hook

**Files:**
- Create: `src/rbac/usePermissions.ts`
- Test: `src/rbac/usePermissions.test.tsx`

**Interfaces:**
- Consumes: `useGlobalStore` (selected `organisation`), `PermissionKey`.
- Produces: `usePermissions(): { isOwner: boolean; has(k: PermissionKey): boolean; hasAny(...k: PermissionKey[]): boolean; hasAll(...k: PermissionKey[]): boolean }`

- [ ] **Step 1: Write the failing test** — `src/rbac/usePermissions.test.tsx`

```tsx
import { renderHook } from "@testing-library/react";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { usePermissions } from "rbac/usePermissions";

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

describe("usePermissions", () => {
  it("owner has every permission regardless of the array", () => {
    setOrg({ isOwner: true, permissions: [] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.has("finance.manage")).toBe(true);
    expect(result.current.hasAll("officers.manage", "settings.manage")).toBe(true);
  });

  it("non-owner is gated by the permissions array", () => {
    setOrg({ isOwner: false, permissions: ["finance.view"] });
    const { result } = renderHook(() => usePermissions());
    expect(result.current.has("finance.view")).toBe(true);
    expect(result.current.has("finance.manage")).toBe(false);
    expect(result.current.hasAny("finance.manage", "finance.view")).toBe(true);
    expect(result.current.hasAll("finance.view", "members.view")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test --watchAll=false src/rbac/usePermissions.test.tsx`
Expected: FAIL — cannot find module `rbac/usePermissions`.

- [ ] **Step 3: Write `src/rbac/usePermissions.ts`**

```ts
import { useMemo } from "react";
import useGlobalStore from "zStore";
import { PermissionKey } from "rbac/permissions";

export interface PermissionApi {
  isOwner: boolean;
  has: (k: PermissionKey) => boolean;
  hasAny: (...k: PermissionKey[]) => boolean;
  hasAll: (...k: PermissionKey[]) => boolean;
}

export function usePermissions(): PermissionApi {
  const organisation = useGlobalStore((s) => s.organisation);

  return useMemo<PermissionApi>(() => {
    const isOwner = \!\!organisation.isOwner;
    const set = new Set<PermissionKey>(organisation.permissions ?? []);
    const has = (k: PermissionKey) => isOwner || set.has(k);
    return {
      isOwner,
      has,
      hasAny: (...keys) => keys.some(has),
      hasAll: (...keys) => keys.every(has),
    };
  }, [organisation.isOwner, organisation.permissions]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test --watchAll=false src/rbac/usePermissions.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rbac/usePermissions.ts src/rbac/usePermissions.test.tsx
git commit -m "feat(rbac): usePermissions hook"
```

---

### Task 6: `<Can>` gate component

**Files:**
- Create: `src/rbac/Can.tsx`
- Test: `src/rbac/Can.test.tsx`

**Interfaces:**
- Consumes: `usePermissions`, `PermissionKey`.
- Produces: `<Can perm?={PermissionKey} anyOf?={PermissionKey[]} owner?={boolean} fallback?={ReactNode}>` — renders children when allowed, else `fallback` (default `null`). Exactly one of `perm`/`anyOf`/`owner` should be set.

- [ ] **Step 1: Write the failing test** — `src/rbac/Can.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { Can } from "rbac/Can";

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

describe("<Can>", () => {
  it("renders children when the single perm is held", () => {
    setOrg({ permissions: ["finance.view"] });
    render(<Can perm="finance.view">ok</Can>);
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders fallback when perm is missing", () => {
    setOrg({ permissions: [] });
    render(<Can perm="finance.manage" fallback={<span>nope</span>}>ok</Can>);
    expect(screen.queryByText("ok")).not.toBeInTheDocument();
    expect(screen.getByText("nope")).toBeInTheDocument();
  });

  it("owner gate renders only for owners", () => {
    setOrg({ isOwner: false });
    const { rerender } = render(<Can owner>del</Can>);
    expect(screen.queryByText("del")).not.toBeInTheDocument();
    setOrg({ isOwner: true });
    rerender(<Can owner>del</Can>);
    expect(screen.getByText("del")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test --watchAll=false src/rbac/Can.test.tsx`
Expected: FAIL — cannot find module `rbac/Can`.

- [ ] **Step 3: Write `src/rbac/Can.tsx`**

```tsx
import { ReactNode } from "react";
import { usePermissions } from "rbac/usePermissions";
import { PermissionKey } from "rbac/permissions";

interface CanProps {
  perm?: PermissionKey;
  anyOf?: PermissionKey[];
  owner?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ perm, anyOf, owner, fallback = null, children }: CanProps) {
  const p = usePermissions();
  let allowed = false;
  if (owner) allowed = p.isOwner;
  else if (perm) allowed = p.has(perm);
  else if (anyOf) allowed = p.hasAny(...anyOf);
  return <>{allowed ? children : fallback}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test --watchAll=false src/rbac/Can.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rbac/Can.tsx src/rbac/Can.test.tsx
git commit -m "feat(rbac): <Can> gate component"
```

---

### Task 7: `<RequirePermission>` route guard

**Files:**
- Create: `src/rbac/RequirePermission.tsx`
- Test: `src/rbac/RequirePermission.test.tsx`

**Interfaces:**
- Consumes: `usePermissions`, `PermissionKey`, `PROTECTED_PATHS`, react-router `Navigate`, react-toastify `toast`.
- Produces: `<RequirePermission perm={PermissionKey}>{children}</RequirePermission>` — renders children when allowed, else toasts and `<Navigate to={DASHBOARD} replace />`.

- [ ] **Step 1: Write the failing test** — `src/rbac/RequirePermission.test.tsx`

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import { RequirePermission } from "rbac/RequirePermission";

jest.mock("react-toastify", () => ({ toast: { error: jest.fn() } }));

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

const renderAt = () =>
  render(
    <MemoryRouter initialEntries={["/officers"]}>
      <Routes>
        <Route
          path="/officers"
          element={
            <RequirePermission perm="officers.view">
              <div>officers page</div>
            </RequirePermission>
          }
        />
        <Route path="/dashboard" element={<div>dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("<RequirePermission>", () => {
  it("renders the page when permitted", () => {
    setOrg({ permissions: ["officers.view"] });
    renderAt();
    expect(screen.getByText("officers page")).toBeInTheDocument();
  });

  it("redirects to dashboard when not permitted", () => {
    setOrg({ permissions: [] });
    renderAt();
    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.queryByText("officers page")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test --watchAll=false src/rbac/RequirePermission.test.tsx`
Expected: FAIL — cannot find module `rbac/RequirePermission`.

- [ ] **Step 3: Write `src/rbac/RequirePermission.tsx`**

```tsx
import { ReactNode, useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { toast } from "react-toastify";
import { usePermissions } from "rbac/usePermissions";
import { PermissionKey } from "rbac/permissions";
import { PROTECTED_PATHS } from "routes/pagePath";

interface RequirePermissionProps {
  perm: PermissionKey;
  children: ReactNode;
}

export function RequirePermission({ perm, children }: RequirePermissionProps) {
  const { has } = usePermissions();
  const allowed = has(perm);
  const toasted = useRef(false);

  useEffect(() => {
    if (\!allowed && \!toasted.current) {
      toasted.current = true;
      toast.error("You don't have access to that.");
    }
  }, [allowed]);

  if (\!allowed) return <Navigate to={PROTECTED_PATHS.DASHBOARD} replace />;
  return <>{children}</>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test --watchAll=false src/rbac/RequirePermission.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rbac/RequirePermission.tsx src/rbac/RequirePermission.test.tsx
git commit -m "feat(rbac): <RequirePermission> route guard"
```

---

### Task 8: `useSyncSelectedOrg` reconciliation hook

**Files:**
- Create: `src/rbac/useSyncSelectedOrg.ts`

**Interfaces:**
- Consumes: `useQueryWrapper`, `orgRequest.ORGANISATIONS`, `useGlobalStore` (`organisation`, `updateOrganisation`), `EMPTY_ORG`, `OrganisationSummary`.
- Produces: `useSyncSelectedOrg(): { refresh: () => void }` — on mount and on `refresh()`, refetch `/organisations`, find the selected org by id, and `updateOrganisation` with the fresh annotation; if not found, set `EMPTY_ORG`.

- [ ] **Step 1: Write `src/rbac/useSyncSelectedOrg.ts`**

```ts
import { useQueryWrapper } from "services/api/apiHelper";
import { orgRequest } from "services";
import useGlobalStore, { EMPTY_ORG, OrganisationType } from "zStore";
import { OrganisationSummary } from "rbac/types";

export function useSyncSelectedOrg(): { refresh: () => void } {
  const [organisation, updateOrganisation] = useGlobalStore((s) => [
    s.organisation,
    s.updateOrganisation,
  ]);

  const reconcile = (data: { data: OrganisationSummary[] }) => {
    if (\!organisation.id) return;
    const fresh = data.data.find((o) => o.id === organisation.id);
    updateOrganisation((fresh as OrganisationType) ?? EMPTY_ORG);
  };

  const { refetch } = useQueryWrapper(
    ["all-organisations"],
    orgRequest.ORGANISATIONS,
    { onSuccess: reconcile, enabled: \!\!organisation.id }
  );

  return { refresh: () => void refetch() };
}
```

> No dedicated test: this is glue over `useQueryWrapper` (already covered by the library); its effect is exercised through the Dashboard/admin flows. Keeping it untested avoids brittle network-mock tests, consistent with the codebase (no existing hook tests).

- [ ] **Step 2: Typecheck & commit**

Run: `yarn tsc --noEmit` (pre-existing Dashboard/Organisations errors still expected until their tasks).

```bash
git add src/rbac/useSyncSelectedOrg.ts
git commit -m "feat(rbac): reconcile selected org with server permissions"
```

---

### Task 9: Login accepts email-or-username

**Files:**
- Modify: `src/pages/Login.tsx`

The login response now includes `email`/`needsEmail`; `setUser(data.data)` already persists whatever the server returns, so no logic change is needed there. The only UI change: relabel the identifier field and add a Signup link (the link target is created in Task 10; this task wires the label + a placeholder link to `PUBLIC_PATHS.SIGN_UP`).

- [ ] **Step 1: Edit `src/pages/Login.tsx`** — relabel field and add Signup link

- Change the `FormLabel` text from `Username` to `Username or email`.
- Change the input `autoComplete` to `"username"` (unchanged) and keep `setUserName`.
- Below the form, add (inside the `Box`, after the `</form>`):

```tsx
import { Link as RouterLink } from "react-router-dom";
import { PUBLIC_PATHS } from "routes/pagePath";
// ...
<Text mt={4} textAlign="center" fontSize="sm">
  New here?{" "}
  <Link as={RouterLink} to={PUBLIC_PATHS.SIGN_UP} color="blue.400">
    Create an account
  </Link>
</Text>
```

(`Link` is already imported from Chakra; alias the router link as `RouterLink`.)

- [ ] **Step 2: Verify it compiles**

Run: `yarn tsc --noEmit`
Expected: a new error only if `PUBLIC_PATHS.SIGN_UP` doesn't exist yet — it's added in Task 10. If doing Task 10 first, no error. (Order Task 10 before Task 9, or add the path now.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/Login.tsx
git commit -m "feat(auth): label login as email-or-username, add signup link"
```

---

### Task 10: Signup page (email required)

**Files:**
- Modify: `src/routes/pagePath.ts`
- Create: `src/pages/Signup.tsx`
- Modify: `src/routes/publicRoutes.tsx`

**Interfaces:**
- Consumes: `authRequest.SIGN_UP`, `postRequest`, `useMutationWrapper`, `setUser`, react-hook-form.
- Produces: `PUBLIC_PATHS.SIGN_UP = "/signup"`; a public `/signup` route.

- [ ] **Step 1: Add the path** — `src/routes/pagePath.ts`

In `PUBLIC_PATHS` add:

```ts
  SIGN_UP: "/signup",
```

- [ ] **Step 2: Create `src/pages/Signup.tsx`**

```tsx
import {
  Flex, Box, FormControl, FormLabel, FormErrorMessage, Input, Stack,
  Button, Heading, Link, useColorModeValue,
} from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import { authRequest } from "services";
import { postRequest, useMutationWrapper } from "services/api/apiHelper";
import { PUBLIC_PATHS } from "routes/pagePath";
import useGlobalStore from "zStore";

interface SignupInputs {
  username: string;
  email: string;
  password: string;
}

const Signup = () => {
  const navigate = useNavigate();
  const [setUser] = useGlobalStore((s) => [s.setUser]);
  const {
    register, handleSubmit, formState: { errors },
  } = useForm<SignupInputs>();

  const onSuccess = (res: { data: { token: string } }) => {
    // signup returns { message, token } only; hydrate minimally then /users/me refreshes the rest
    setUser({
      token: res.data.token,
      id: "",
      username: "",
      email: "",
      needsEmail: false,
    });
    navigate("/");
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const onSubmit: SubmitHandler<SignupInputs> = (data) =>
    mutate({ url: authRequest.SIGN_UP, data });

  return (
    <Flex minH="100vh" align="center" justify="center" bg={useColorModeValue("gray.50", "gray.800")}>
      <Stack spacing={8} mx="auto" maxW="lg" pb={12} px={6}>
        <Heading fontSize="4xl" textAlign="center">Create your account</Heading>
        <Box rounded="lg" bg={useColorModeValue("white", "gray.700")} boxShadow="lg" p={8}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack spacing={4}>
              <FormControl isInvalid={\!\!errors.username}>
                <FormLabel>Username</FormLabel>
                <Input {...register("username", { required: "Username is required" })} />
                <FormErrorMessage>{errors.username?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={\!\!errors.email}>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  {...register("email", {
                    required: "Email is required",
                    pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
                  })}
                />
                <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
              </FormControl>
              <FormControl isInvalid={\!\!errors.password}>
                <FormLabel>Password</FormLabel>
                <Input
                  type="password"
                  {...register("password", { required: "Password is required" })}
                />
                <FormErrorMessage>{errors.password?.message}</FormErrorMessage>
              </FormControl>
              <Button type="submit" bg="blue.400" color="white" isLoading={isLoading} _hover={{ bg: "blue.500" }}>
                Sign up
              </Button>
              <Link as={RouterLink} to={PUBLIC_PATHS.LOGIN} color="blue.400" textAlign="center">
                Already have an account? Sign in
              </Link>
            </Stack>
          </form>
        </Box>
      </Stack>
    </Flex>
  );
};

export default Signup;
```

- [ ] **Step 3: Register the route** — `src/routes/publicRoutes.tsx`

Add the lazy import and route entry:

```tsx
const Signup = WithSuspense(lazy(() => import("pages/Signup")));
const { LOGIN, SIGN_UP } = PUBLIC_PATHS;
// ...in PUBLIC_ROUTES, before the protected-redirect spread:
  { path: SIGN_UP, element: <Signup /> },
```

> Important: the existing `...Object.values(PROTECTED_PATHS).map(...)` redirect spread does NOT include `PUBLIC_PATHS`, so `/signup` is reachable while logged out. Confirm `SIGN_UP` is added under `PUBLIC_PATHS` (not `PROTECTED_PATHS`).

- [ ] **Step 4: Verify build + manual check**

Run: `yarn tsc --noEmit` then `yarn start`, visit `/signup`, confirm the form renders and validation fires on empty submit.
Expected: clean typecheck; form shows "Email is required" on empty submit.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Signup.tsx src/routes/pagePath.ts src/routes/publicRoutes.tsx
git commit -m "feat(auth): signup page with required email"
```

---

### Task 11: Refresh session via `GET /users/me` on boot + Dashboard logout fix

**Files:**
- Modify: `src/pages/Authenticated.tsx`
- Modify: `src/pages/Dashboard.tsx:51-63` (logout uses `EMPTY_USER`/`EMPTY_ORG`)

**Interfaces:**
- Consumes: `useQueryWrapper`, `authRequest.GET_ME`, `MeResponse`, `useGlobalStore`, `EMPTY_USER`, `EMPTY_ORG`.

- [ ] **Step 1: Edit `src/pages/Authenticated.tsx`** — call `/users/me` once on mount and merge into user

```tsx
import ScrollToTop from "components/ScrollToTop";
import { BrowserRouter as Router, useRoutes } from "react-router-dom";
import PROTECTED_ROUTES from "routes/protectedRoutes";
import { useQueryWrapper } from "services/api/apiHelper";
import { authRequest } from "services";
import useGlobalStore from "zStore";
import { MeResponse } from "rbac/types";

const AppWrapper = () => useRoutes(PROTECTED_ROUTES);

const Authenticated = () => {
  const [user, setUser] = useGlobalStore((s) => [s.user, s.setUser]);

  useQueryWrapper(["me"], authRequest.GET_ME, {
    onSuccess: (res: { data: MeResponse }) =>
      setUser({ ...user, ...res.data }),
  });

  return (
    <Router>
      <ScrollToTop />
      <AppWrapper />
    </Router>
  );
};
export default Authenticated;
```

- [ ] **Step 2: Edit `src/pages/Dashboard.tsx`** — replace the two reset literals in `handleLogout`

```tsx
import useGlobalStore, { EMPTY_USER, EMPTY_ORG } from "zStore";
// ...
  function handleLogout() {
    setUser(EMPTY_USER);
    updateOrganisation(EMPTY_ORG);
  }
```

- [ ] **Step 3: Verify build**

Run: `yarn tsc --noEmit`
Expected: Dashboard's logout error from Task 2 is gone; `Organisations.tsx` may still error until Task 22.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Authenticated.tsx src/pages/Dashboard.tsx
git commit -m "feat(auth): refresh session via /users/me; use EMPTY_USER on logout"
```

---

### Task 12: SetEmailModal for legacy `needsEmail` accounts

**Files:**
- Create: `src/components/auth/SetEmailModal.tsx`

**Interfaces:**
- Consumes: `authRequest.SET_EMAIL`, `patchRequest`, `useMutationWrapper`, `useGlobalStore`, `queryClient`, react-hook-form, Chakra `Modal`.
- Produces: `<SetEmailModal />` — self-contained; renders a blocking-ish modal when `user.needsEmail`; on success patches email, flips `needsEmail` false, invalidates `["all-organisations"]`.

- [ ] **Step 1: Create `src/components/auth/SetEmailModal.tsx`**

```tsx
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  FormControl, FormLabel, FormErrorMessage, Input, Button, Text,
} from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { authRequest } from "services";
import { patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import useGlobalStore from "zStore";
import { MeResponse } from "rbac/types";

interface EmailInput { email: string; }

const SetEmailModal = () => {
  const [user, setUser] = useGlobalStore((s) => [s.user, s.setUser]);
  const { register, handleSubmit, formState: { errors } } = useForm<EmailInput>();

  const onSuccess = (res: { data: MeResponse }) => {
    setUser({ ...user, email: res.data.email, needsEmail: false });
    queryClient.invalidateQueries({ queryKey: ["all-organisations"] });
  };
  const { mutate, isLoading } = useMutationWrapper(patchRequest, onSuccess);

  const onSubmit: SubmitHandler<EmailInput> = (data) =>
    mutate({ url: authRequest.SET_EMAIL, data });

  return (
    <Modal isOpen={\!\!user.token && user.needsEmail} onClose={() => {}} closeOnOverlayClick={false} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Add your email</ModalHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <Text mb={3} fontSize="sm" color="gray.600">
              Set an email to unlock officer features and to redeem any pending invites.
            </Text>
            <FormControl isInvalid={\!\!errors.email}>
              <FormLabel>Email</FormLabel>
              <Input
                type="email"
                {...register("email", {
                  required: "Email is required",
                  pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
                })}
              />
              <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button type="submit" variant="primary" isLoading={isLoading}>Save email</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default SetEmailModal;
```

- [ ] **Step 2: Mount it on the org switcher** — edit `src/pages/Organisations.tsx`

Add `import SetEmailModal from "components/auth/SetEmailModal";` and render `<SetEmailModal />` once inside the top-level `Box` (e.g. right after the opening `<Box ...>`). (The rest of `Organisations.tsx` is changed in Task 22; this step only adds the modal mount + import.)

- [ ] **Step 3: Verify build + manual**

Run: `yarn tsc --noEmit`. Manually: set `needsEmail: true` via devtools store, confirm the modal blocks and a valid email submit closes it.
Expected: modal appears only when `needsEmail` is true.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/SetEmailModal.tsx src/pages/Organisations.tsx
git commit -m "feat(auth): set-email modal for legacy accounts"
```

---

### Task 13: Shared `PermissionGrid` editor

**Files:**
- Create: `src/components/officers/PermissionGrid.tsx`
- Test: `src/components/officers/PermissionGrid.test.tsx`

**Interfaces:**
- Consumes: `PermissionKey`, `PermissionArea`, `AREA_LABEL`, `PERMISSION_COPY`, `splitPermission`.
- Produces: `<PermissionGrid areas={PermissionArea[]} value={PermissionKey[]} onChange={(next: PermissionKey[]) => void} disabled?={boolean} />` — one checkbox per `${area}.${action}` present in `areas`; checked when in `value`; toggling calls `onChange` with the next selection. Rendered from the runtime catalog's `areas` (caller passes them).

- [ ] **Step 1: Write the failing test** — `src/components/officers/PermissionGrid.test.tsx`

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import PermissionGrid from "components/officers/PermissionGrid";
import { PERMISSION_AREAS } from "rbac/permissions";

describe("<PermissionGrid>", () => {
  it("pre-checks the provided permissions", () => {
    render(
      <PermissionGrid
        areas={[...PERMISSION_AREAS]}
        value={["finance.view"]}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText("finance.view")).toBeChecked();
    expect(screen.getByLabelText("finance.manage")).not.toBeChecked();
  });

  it("adds a permission when an unchecked box is toggled", () => {
    const onChange = jest.fn();
    render(
      <PermissionGrid areas={["finance"]} value={["finance.view"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("finance.manage"));
    expect(onChange).toHaveBeenCalledWith(["finance.view", "finance.manage"]);
  });

  it("removes a permission when a checked box is toggled", () => {
    const onChange = jest.fn();
    render(
      <PermissionGrid areas={["finance"]} value={["finance.view", "finance.manage"]} onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText("finance.view"));
    expect(onChange).toHaveBeenCalledWith(["finance.manage"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test --watchAll=false src/components/officers/PermissionGrid.test.tsx`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `src/components/officers/PermissionGrid.tsx`**

```tsx
import { Box, Checkbox, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { PermissionAction, PermissionArea, PermissionKey } from "rbac/permissions";
import { AREA_LABEL, PERMISSION_COPY } from "rbac/copy";

const ACTIONS: PermissionAction[] = ["view", "manage"];

interface PermissionGridProps {
  areas: PermissionArea[];
  value: PermissionKey[];
  onChange: (next: PermissionKey[]) => void;
  disabled?: boolean;
}

const PermissionGrid = ({ areas, value, onChange, disabled }: PermissionGridProps) => {
  const selected = new Set(value);

  const toggle = (key: PermissionKey) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(Array.from(next));
  };

  return (
    <Stack spacing={4}>
      {areas.map((area) => (
        <Box key={area} borderWidth="1px" borderRadius="md" p={3}>
          <Text fontWeight="bold" mb={2}>{AREA_LABEL[area]}</Text>
          <SimpleGrid columns={2} spacing={2}>
            {ACTIONS.map((action) => {
              const key: PermissionKey = `${area}.${action}`;
              return (
                <Checkbox
                  key={key}
                  aria-label={key}
                  isChecked={selected.has(key)}
                  isDisabled={disabled}
                  onChange={() => toggle(key)}
                >
                  {PERMISSION_COPY[key].label} — {PERMISSION_COPY[key].description}
                </Checkbox>
              );
            })}
          </SimpleGrid>
        </Box>
      ))}
    </Stack>
  );
};

export default PermissionGrid;
```

> Note: `onChange` emits keys in insertion order (existing-then-added), matching the test expectations. The `aria-label` is the raw key so tests and screen readers can target each box.

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test --watchAll=false src/components/officers/PermissionGrid.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/officers/PermissionGrid.tsx src/components/officers/PermissionGrid.test.tsx
git commit -m "feat(rbac): shared PermissionGrid editor"
```

---

### Task 14: Officers & Roles page shell + gated route + Dashboard button

**Files:**
- Modify: `src/routes/pagePath.ts`
- Create: `src/pages/OfficersRoles.tsx`
- Modify: `src/routes/protectedRoutes.tsx`
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `RequirePermission`, `Can`, Chakra `Tabs`, the three tab components (built in Tasks 15/19/20 — import them now; if a worker builds this task first, stub each tab as `() => null` and replace in its task).
- Produces: `PROTECTED_PATHS.OFFICERS_ROLES = "/officers-roles"`; a guarded route; a gated Dashboard button.

- [ ] **Step 1: Add the path** — `src/routes/pagePath.ts`, in `PROTECTED_PATHS`:

```ts
  OFFICERS_ROLES: "/officers-roles",
```

- [ ] **Step 2: Create `src/pages/OfficersRoles.tsx`**

```tsx
import {
  Box, Flex, Text, Tabs, TabList, TabPanels, Tab, TabPanel, useColorModeValue,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import BackButton from "components/BackButton";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import OfficersTab from "components/officers/OfficersTab";
import PendingInvitesTab from "components/officers/PendingInvitesTab";
import RolesTab from "components/officers/RolesTab";

const OfficersRoles = () => {
  const navigate = useNavigate();
  const [organisation] = useGlobalStore((s) => [s.organisation]);

  return (
    <RequirePermission perm="officers.view">
      <Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>
        <Flex bg="blue.500" justifyContent="space-between" alignItems="center" p="4">
          <Text fontWeight="bold" color="#fff">Officers &amp; Roles</Text>
        </Flex>
        <BackButton handleClick={() => navigate(-1)} />
        <Box p={4}>
          <Tabs variant="enclosed" colorScheme="blue">
            <TabList>
              <Tab>Officers</Tab>
              <Tab>Pending Invites</Tab>
              <Tab>Roles</Tab>
            </TabList>
            <TabPanels>
              <TabPanel><OfficersTab organisationId={organisation.id} /></TabPanel>
              <TabPanel><PendingInvitesTab organisationId={organisation.id} /></TabPanel>
              <TabPanel><RolesTab organisationId={organisation.id} /></TabPanel>
            </TabPanels>
          </Tabs>
        </Box>
      </Box>
    </RequirePermission>
  );
};

export default OfficersRoles;
```

> If building this before Tasks 15/19/20, create the three tab files as `const X = (_: { organisationId: string }) => null; export default X;` stubs so this compiles, then flesh them out in their tasks.

- [ ] **Step 3: Register the route** — `src/routes/protectedRoutes.tsx`

Add lazy import and destructure + route entry:

```tsx
const OfficersRoles = WithSuspense(lazy(() => import("pages/OfficersRoles")));
// add OFFICERS_ROLES to the destructured PROTECTED_PATHS
// add to PROTECTED_ROUTES (before the "/" navigate):
  { path: OFFICERS_ROLES, element: <OfficersRoles /> },
```

> The route element itself wraps in `<RequirePermission>`, so direct URL access is also gated.

- [ ] **Step 4: Add the gated Dashboard button** — `src/pages/Dashboard.tsx`

The current `DASHBOARD_ACTIONS.map(...)` renders plain buttons. Replace the action model so each action carries an optional `perm`, and wrap each button in `<Can>`. Edit the type and array:

```tsx
import { FaUserShield } from "react-icons/fa";
import { Can } from "rbac/Can";
import { PermissionKey } from "rbac/permissions";

type DashboardAction = {
  label: string;
  icon: IconType;
  colorScheme: string;
  path: string;
  perm: PermissionKey;
};

const DASHBOARD_ACTIONS: DashboardAction[] = [
  { label: "Add Member", icon: FaUserPlus, colorScheme: "teal", path: PROTECTED_PATHS.ADD_MEMBER, perm: "members.view" },
  { label: "View Members", icon: FaEye, colorScheme: "blue", path: PROTECTED_PATHS.VIEW_MEMBER, perm: "members.view" },
  { label: "Create Attendance", icon: FaCalendarPlus, colorScheme: "yellow", path: PROTECTED_PATHS.CREATE_ATTENDANCE, perm: "attendance.view" },
  { label: "All Attendance", icon: FaClipboardList, colorScheme: "purple", path: PROTECTED_PATHS.ALL_ATTENDANCE, perm: "attendance.view" },
  { label: "Analytics", icon: FaChartBar, colorScheme: "orange", path: PROTECTED_PATHS.ANALYTICS, perm: "attendance.view" },
  { label: "Birthday", icon: FaBirthdayCake, colorScheme: "pink", path: PROTECTED_PATHS.BIRTHDAY, perm: "members.view" },
  { label: "Finance", icon: FaMoneyBillWave, colorScheme: "green", path: PROTECTED_PATHS.FINANCE, perm: "finance.view" },
  { label: "Officers & Roles", icon: FaUserShield, colorScheme: "blue", path: PROTECTED_PATHS.OFFICERS_ROLES, perm: "officers.view" },
];
```

And wrap each rendered button:

```tsx
{DASHBOARD_ACTIONS.map(({ label, icon: Icon, colorScheme, path, perm }) => (
  <Can key={label} perm={perm}>
    <Button leftIcon={<Icon />} colorScheme={colorScheme} variant="outline" onClick={() => navigate(path)}>
      {label}
    </Button>
  </Can>
))}
```

- [ ] **Step 5: Add Dashboard mount reconciliation** — call `useSyncSelectedOrg()` at the top of `Dashboard`

```tsx
import { useSyncSelectedOrg } from "rbac/useSyncSelectedOrg";
// inside Dashboard component body:
useSyncSelectedOrg();
```

- [ ] **Step 6: Verify build + manual**

Run: `yarn tsc --noEmit` then `yarn start`. As an owner, confirm the "Officers & Roles" button shows and opens the tabbed page. Temporarily set `organisation.permissions` to `[]` and `isOwner:false` in devtools — confirm gated buttons disappear and visiting `/officers-roles` redirects to the dashboard with a toast.
Expected: clean typecheck; gating visibly works.

- [ ] **Step 7: Commit**

```bash
git add src/routes/pagePath.ts src/pages/OfficersRoles.tsx src/routes/protectedRoutes.tsx src/pages/Dashboard.tsx
git commit -m "feat(rbac): gated Officers & Roles page, route, and dashboard entry"
```

---

### Task 15: Officers tab (list table)

**Files:**
- Create: `src/components/officers/OfficersTab.tsx`

**Interfaces:**
- Consumes: `useQueryWrapper`, `rbacRequest.OFFICERS`, `convertParamsToString`, `Officer`, `Can`, `useGlobalStore` (to know the owner id), `LoadingSpinner`. Renders the three per-row modals (Tasks 16–18) — import them; build this after those or stub the row buttons' `onClick` to `noop` and wire in their tasks.
- Produces: `<OfficersTab organisationId={string} />`; query key `["officers", organisationId]`.

- [ ] **Step 1: Create `src/components/officers/OfficersTab.tsx`**

```tsx
import { useState } from "react";
import {
  Box, Button, Flex, HStack, Table, Thead, Tbody, Tr, Th, Td, Text, Badge, Wrap, WrapItem,
} from "@chakra-ui/react";
import { useQueryWrapper } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import LoadingSpinner from "components/LoadingSpinner";
import useGlobalStore from "zStore";
import { Can } from "rbac/Can";
import { Officer } from "rbac/types";
import InviteOfficerModal from "components/officers/InviteOfficerModal";
import EditOfficerRoleModal from "components/officers/EditOfficerRoleModal";
import EditOfficerPermissionsModal from "components/officers/EditOfficerPermissionsModal";

interface Props { organisationId: string; }

const OfficersTab = ({ organisationId }: Props) => {
  const [organisation] = useGlobalStore((s) => [s.organisation]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Officer | null>(null);
  const [permsTarget, setPermsTarget] = useState<Officer | null>(null);

  const url = convertParamsToString(rbacRequest.OFFICERS, { organisationId });
  const { data, isLoading } = useQueryWrapper(["officers", organisationId], url);
  const officers: Officer[] = data?.data ?? [];

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Flex justify="flex-end" mb={3}>
        <Can perm="officers.manage">
          <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite officer</Button>
        </Can>
      </Flex>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Permissions</Th><Th></Th></Tr>
          </Thead>
          <Tbody>
            {officers.map((o) => {
              const isOwnerRow = o.userId === organisation.owner;
              return (
                <Tr key={o.userId}>
                  <Td>{o.username}</Td>
                  <Td>{o.email}</Td>
                  <Td><Badge>{o.roleName}</Badge></Td>
                  <Td>
                    <Wrap>
                      {o.permissions.map((p) => (
                        <WrapItem key={p}><Badge colorScheme="green" variant="subtle">{p}</Badge></WrapItem>
                      ))}
                    </Wrap>
                  </Td>
                  <Td>
                    {\!isOwnerRow && (
                      <Can perm="officers.manage">
                        <HStack spacing={2}>
                          <Button size="xs" onClick={() => setRoleTarget(o)}>Role</Button>
                          <Button size="xs" onClick={() => setPermsTarget(o)}>Permissions</Button>
                        </HStack>
                      </Can>
                    )}
                  </Td>
                </Tr>
              );
            })}
            {officers.length === 0 && (
              <Tr><Td colSpan={5}><Text color="gray.500">No officers yet.</Text></Td></Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      <InviteOfficerModal
        organisationId={organisationId}
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <EditOfficerRoleModal
        organisationId={organisationId}
        officer={roleTarget}
        onClose={() => setRoleTarget(null)}
      />
      <EditOfficerPermissionsModal
        organisationId={organisationId}
        officer={permsTarget}
        onClose={() => setPermsTarget(null)}
      />
    </Box>
  );
};

export default OfficersTab;
```

> The Remove action is added in Task 18's commit area to keep this task's surface small — actually Remove is simple; include it here as a third `<Button size="xs" colorScheme="red">Remove</Button>` calling a `deleteRequest` mutation (`rbacRequest.OFFICER_ONE`) with a `confirmAlert` (existing pattern in `Organisations.tsx`). Invalidate `["officers", organisationId]` on success.

- [ ] **Step 2: Add the Remove action** — within the owner-guarded `HStack`, add:

```tsx
<Button size="xs" colorScheme="red" onClick={() => handleRemove(o)}>Remove</Button>
```

and at the top of the component:

```tsx
import { deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { confirmAlert } from "react-confirm-alert";
// ...
const { mutate: removeMutate } = useMutationWrapper(deleteRequest, () =>
  queryClient.invalidateQueries(["officers", organisationId])
);
const handleRemove = (o: Officer) =>
  confirmAlert({
    title: "Remove officer",
    message: `Remove ${o.username} from this organisation?`,
    buttons: [
      { label: "Yes", className: "confirm-alert-button confirm-alert-button-yes",
        onClick: () => removeMutate({ url: convertParamsToString(rbacRequest.OFFICER_ONE, { organisationId, userId: o.userId }) }) },
      { label: "No", className: "confirm-alert-button confirm-alert-button-no" },
    ],
  });
```

- [ ] **Step 3: Verify build + manual**

Run: `yarn tsc --noEmit` (requires the three modal files to exist — build Tasks 16–18 first, or stub them). Manually open the Officers tab as owner: the table lists officers, owner row has no action buttons, others show Role/Permissions/Remove.
Expected: clean typecheck; table renders.

- [ ] **Step 4: Commit**

```bash
git add src/components/officers/OfficersTab.tsx
git commit -m "feat(rbac): officers list with manage actions"
```

---

### Task 16: Invite officer modal

**Files:**
- Create: `src/components/officers/InviteOfficerModal.tsx`

**Interfaces:**
- Consumes: `postRequest`, `useMutationWrapper`, `queryClient`, `rbacRequest.INVITE` + `rbacRequest.ROLES`, `useQueryWrapper`, `convertParamsToString`, `Role`, `InviteResponse`, react-hook-form, react-toastify, Chakra `Modal`/`Select`.
- Produces: `<InviteOfficerModal organisationId={string} isOpen={boolean} onClose={() => void} />`.

- [ ] **Step 1: Create `src/components/officers/InviteOfficerModal.tsx`**

```tsx
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, FormErrorMessage, Input, Select, Button,
} from "@chakra-ui/react";
import { useForm, SubmitHandler } from "react-hook-form";
import { toast } from "react-toastify";
import { useQueryWrapper, postRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { Role, InviteResponse } from "rbac/types";

interface Props { organisationId: string; isOpen: boolean; onClose: () => void; }
interface InviteInputs { email: string; roleId: string; }

const InviteOfficerModal = ({ organisationId, isOpen, onClose }: Props) => {
  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(["roles", organisationId], rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteInputs>();

  const onSuccess = (res: { data: InviteResponse }) => {
    if ("attached" in res.data) toast.success("Officer added");
    else toast.success("Invite pending — they'll join when they sign up with that email");
    queryClient.invalidateQueries(["officers", organisationId]);
    queryClient.invalidateQueries(["officer-invites", organisationId]);
    reset();
    onClose();
  };
  const { mutate, isLoading } = useMutationWrapper(postRequest, onSuccess);

  const onSubmit: SubmitHandler<InviteInputs> = (data) =>
    mutate({ url: convertParamsToString(rbacRequest.INVITE, { organisationId }), data });

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Invite officer</ModalHeader>
        <ModalCloseButton />
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <FormControl isInvalid={\!\!errors.email} mb={3}>
              <FormLabel>Email</FormLabel>
              <Input type="email" {...register("email", {
                required: "Email is required",
                pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: "Enter a valid email" },
              })} />
              <FormErrorMessage>{errors.email?.message}</FormErrorMessage>
            </FormControl>
            <FormControl isInvalid={\!\!errors.roleId}>
              <FormLabel>Role</FormLabel>
              <Select placeholder="Select role" {...register("roleId", { required: "Role is required" })}>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
              <FormErrorMessage>{errors.roleId?.message}</FormErrorMessage>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isLoading}>Send invite</Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default InviteOfficerModal;
```

- [ ] **Step 2: Verify build + manual**

Run: `yarn tsc --noEmit`. Manually: invite an existing user's email → "Officer added" + appears in list; invite an unknown email → "Invite pending" + appears under Pending Invites.
Expected: both response branches toast correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/officers/InviteOfficerModal.tsx
git commit -m "feat(rbac): invite-officer modal"
```

---

### Task 17: Edit officer role modal

**Files:**
- Create: `src/components/officers/EditOfficerRoleModal.tsx`

**Interfaces:**
- Consumes: `patchRequest`, `useMutationWrapper`, `queryClient`, `rbacRequest.OFFICER_ROLE` + `ROLES`, `useQueryWrapper`, `convertParamsToString`, `Officer`, `Role`, Chakra `Modal`/`Select`.
- Produces: `<EditOfficerRoleModal organisationId={string} officer={Officer | null} onClose={() => void} />` — open when `officer` is non-null.

- [ ] **Step 1: Create `src/components/officers/EditOfficerRoleModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Select, Button,
} from "@chakra-ui/react";
import { useQueryWrapper, patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import { Officer, Role } from "rbac/types";

interface Props { organisationId: string; officer: Officer | null; onClose: () => void; }

const EditOfficerRoleModal = ({ organisationId, officer, onClose }: Props) => {
  const isOpen = \!\!officer;
  const [roleId, setRoleId] = useState("");

  useEffect(() => { setRoleId(officer?.roleId ?? ""); }, [officer]);

  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(["roles", organisationId], rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { mutate, isLoading } = useMutationWrapper(patchRequest, () => {
    queryClient.invalidateQueries(["officers", organisationId]);
    onClose();
  });

  const onSave = () => {
    if (\!officer) return;
    mutate({
      url: convertParamsToString(rbacRequest.OFFICER_ROLE, { organisationId, userId: officer.userId }),
      data: { roleId },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Change role — {officer?.username}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl>
            <FormLabel>Role</FormLabel>
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </FormControl>
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={isLoading} isDisabled={\!roleId} onClick={onSave}>Save</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default EditOfficerRoleModal;
```

- [ ] **Step 2: Verify build + commit**

Run: `yarn tsc --noEmit`. Manually change an officer's role and confirm the list updates.

```bash
git add src/components/officers/EditOfficerRoleModal.tsx
git commit -m "feat(rbac): change-officer-role modal"
```

---

### Task 18: Edit officer permissions (overrides) modal

**Files:**
- Create: `src/components/officers/EditOfficerPermissionsModal.tsx`

**Interfaces:**
- Consumes: `PermissionGrid`, `buildOverridePayload`, `useQueryWrapper` (`rbacRequest.PERMISSIONS` + `ROLES`), `patchRequest`, `useMutationWrapper`, `queryClient`, `convertParamsToString`, `Officer`, `Role`, `PermissionsCatalog`.
- Produces: `<EditOfficerPermissionsModal organisationId={string} officer={Officer | null} onClose={() => void} />`.

The grid is seeded from the officer's **effective** permissions (`officer.permissions`); on save we diff against the officer's **role** permissions to compute `grantedPermissions`/`revokedPermissions`.

- [ ] **Step 1: Create `src/components/officers/EditOfficerPermissionsModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton, Button,
} from "@chakra-ui/react";
import { useQueryWrapper, patchRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import PermissionGrid from "components/officers/PermissionGrid";
import { buildOverridePayload } from "rbac/rbacPayloads";
import { PermissionKey } from "rbac/permissions";
import { Officer, Role, PermissionsCatalog } from "rbac/types";

interface Props { organisationId: string; officer: Officer | null; onClose: () => void; }

const EditOfficerPermissionsModal = ({ organisationId, officer, onClose }: Props) => {
  const isOpen = \!\!officer;
  const [selected, setSelected] = useState<PermissionKey[]>([]);

  useEffect(() => { setSelected(officer?.permissions ?? []); }, [officer]);

  const { data: catalogData } = useQueryWrapper(["permissions-catalog"], rbacRequest.PERMISSIONS, { enabled: isOpen });
  const catalog: PermissionsCatalog | undefined = catalogData?.data;

  const rolesUrl = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data: rolesData } = useQueryWrapper(["roles", organisationId], rolesUrl, { enabled: isOpen });
  const roles: Role[] = rolesData?.data ?? [];

  const { mutate, isLoading } = useMutationWrapper(patchRequest, () => {
    queryClient.invalidateQueries(["officers", organisationId]);
    onClose();
  });

  const onSave = () => {
    if (\!officer) return;
    const role = roles.find((r) => r.id === officer.roleId);
    const data = buildOverridePayload(role?.permissions ?? [], selected);
    mutate({
      url: convertParamsToString(rbacRequest.OFFICER_PERMISSIONS, { organisationId, userId: officer.userId }),
      data,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Permissions — {officer?.username}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {catalog && (
            <PermissionGrid areas={catalog.areas} value={selected} onChange={setSelected} />
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={isLoading} onClick={onSave}>Save</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default EditOfficerPermissionsModal;
```

- [ ] **Step 2: Verify build + manual**

Run: `yarn tsc --noEmit`. Manually grant an extra permission beyond the role and confirm the officer's permission badges update after save.
Expected: override saved; effective permissions reflect role ∪ granted − revoked.

- [ ] **Step 3: Commit**

```bash
git add src/components/officers/EditOfficerPermissionsModal.tsx
git commit -m "feat(rbac): per-officer permission override modal"
```

---

### Task 19: Pending Invites tab

**Files:**
- Create: `src/components/officers/PendingInvitesTab.tsx`

**Interfaces:**
- Consumes: `useQueryWrapper` (`rbacRequest.INVITES`), `deleteRequest`, `useMutationWrapper`, `queryClient`, `convertParamsToString`, `Invite`, `Can`, `confirmAlert`, `LoadingSpinner`.
- Produces: `<PendingInvitesTab organisationId={string} />`; query key `["officer-invites", organisationId]`.

- [ ] **Step 1: Create `src/components/officers/PendingInvitesTab.tsx`**

```tsx
import {
  Box, Button, Table, Thead, Tbody, Tr, Th, Td, Text, Badge,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { Invite } from "rbac/types";

interface Props { organisationId: string; }

const PendingInvitesTab = ({ organisationId }: Props) => {
  const url = convertParamsToString(rbacRequest.INVITES, { organisationId });
  const { data, isLoading } = useQueryWrapper(["officer-invites", organisationId], url);
  const invites: Invite[] = data?.data ?? [];

  const { mutate } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries(["officer-invites", organisationId])
  );

  const revoke = (inv: Invite) =>
    confirmAlert({
      title: "Revoke invite",
      message: `Revoke the invite for ${inv.email}?`,
      buttons: [
        { label: "Yes", className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => mutate({ url: convertParamsToString(rbacRequest.INVITE_ONE, { organisationId, inviteId: inv.id }) }) },
        { label: "No", className: "confirm-alert-button confirm-alert-button-no" },
      ],
    });

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Text mb={3} fontSize="sm" color="gray.600">
        No emails are sent yet. Share the org name with the person and ask them to sign up (or set their email) with this exact address — they'll appear as an officer automatically.
      </Text>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>Email</Th><Th>Role</Th><Th></Th></Tr></Thead>
          <Tbody>
            {invites.map((inv) => (
              <Tr key={inv.id}>
                <Td>{inv.email}</Td>
                <Td><Badge>{inv.roleName}</Badge></Td>
                <Td>
                  <Can perm="officers.manage">
                    <Button size="xs" colorScheme="red" onClick={() => revoke(inv)}>Revoke</Button>
                  </Can>
                </Td>
              </Tr>
            ))}
            {invites.length === 0 && (
              <Tr><Td colSpan={3}><Text color="gray.500">No pending invites.</Text></Td></Tr>
            )}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
};

export default PendingInvitesTab;
```

- [ ] **Step 2: Verify build + commit**

Run: `yarn tsc --noEmit`. Manually revoke a pending invite and confirm it disappears.

```bash
git add src/components/officers/PendingInvitesTab.tsx
git commit -m "feat(rbac): pending invites tab with revoke"
```

---

### Task 20: Roles tab + role form modal

**Files:**
- Create: `src/components/officers/RoleFormModal.tsx`
- Create: `src/components/officers/RolesTab.tsx`

**Interfaces:**
- Consumes: `PermissionGrid`, `buildRolePayload`, `useQueryWrapper`/`postRequest`/`putRequest`/`deleteRequest`, `useMutationWrapper`, `queryClient`, `convertParamsToString`, `Role`, `PermissionsCatalog`, `Can`, `confirmAlert`, `PermissionKey`.
- Produces:
  - `<RoleFormModal organisationId={string} role={Role | null} isOpen={boolean} onClose={() => void} />` — `role=null` ⇒ create, else edit.
  - `<RolesTab organisationId={string} />`; query key `["roles", organisationId]`.

- [ ] **Step 1: Create `src/components/officers/RoleFormModal.tsx`**

```tsx
import { useEffect, useState } from "react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, FormErrorMessage, Input, Button,
} from "@chakra-ui/react";
import {
  useQueryWrapper, postRequest, putRequest, useMutationWrapper, queryClient,
} from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import PermissionGrid from "components/officers/PermissionGrid";
import { buildRolePayload } from "rbac/rbacPayloads";
import { PermissionKey } from "rbac/permissions";
import { Role, PermissionsCatalog } from "rbac/types";

interface Props { organisationId: string; role: Role | null; isOpen: boolean; onClose: () => void; }

const RoleFormModal = ({ organisationId, role, isOpen, onClose }: Props) => {
  const isEdit = \!\!role;
  const [name, setName] = useState("");
  const [perms, setPerms] = useState<PermissionKey[]>([]);
  const [touchedName, setTouchedName] = useState(false);

  useEffect(() => {
    setName(role?.name ?? "");
    setPerms(role?.permissions ?? []);
    setTouchedName(false);
  }, [role, isOpen]);

  const { data: catalogData } = useQueryWrapper(["permissions-catalog"], rbacRequest.PERMISSIONS, { enabled: isOpen });
  const catalog: PermissionsCatalog | undefined = catalogData?.data;

  const onSuccess = () => {
    queryClient.invalidateQueries(["roles", organisationId]);
    onClose();
  };
  const { mutate: create, isLoading: creating } = useMutationWrapper(postRequest, onSuccess);
  const { mutate: update, isLoading: updating } = useMutationWrapper(putRequest, onSuccess);

  const onSave = () => {
    const data = buildRolePayload({ name, permissions: perms });
    if (isEdit && role) {
      update({ url: convertParamsToString(rbacRequest.ROLE_ONE, { organisationId, roleId: role.id }), data });
    } else {
      create({ url: convertParamsToString(rbacRequest.ROLES, { organisationId }), data });
    }
  };

  const nameInvalid = touchedName && name.trim().length === 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? "Edit role" : "Create role"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <FormControl isInvalid={nameInvalid} mb={4}>
            <FormLabel>Role name</FormLabel>
            <Input value={name} onChange={(e) => { setName(e.target.value); setTouchedName(true); }} />
            <FormErrorMessage>Name is required</FormErrorMessage>
          </FormControl>
          {catalog && <PermissionGrid areas={catalog.areas} value={perms} onChange={setPerms} />}
        </ModalBody>
        <ModalFooter>
          <Button variant="secondary" mr={3} onClick={onClose}>Cancel</Button>
          <Button variant="primary" isLoading={creating || updating}
            isDisabled={name.trim().length === 0} onClick={onSave}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RoleFormModal;
```

- [ ] **Step 2: Create `src/components/officers/RolesTab.tsx`**

```tsx
import { useState } from "react";
import {
  Box, Button, Flex, HStack, Table, Thead, Tbody, Tr, Th, Td, Text, Badge, Wrap, WrapItem,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import { useQueryWrapper, deleteRequest, useMutationWrapper, queryClient } from "services/api/apiHelper";
import { rbacRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import LoadingSpinner from "components/LoadingSpinner";
import { Can } from "rbac/Can";
import { Role } from "rbac/types";
import RoleFormModal from "components/officers/RoleFormModal";

interface Props { organisationId: string; }

const RolesTab = ({ organisationId }: Props) => {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);

  const url = convertParamsToString(rbacRequest.ROLES, { organisationId });
  const { data, isLoading } = useQueryWrapper(["roles", organisationId], url);
  const roles: Role[] = data?.data ?? [];

  const { mutate: remove } = useMutationWrapper(deleteRequest, () =>
    queryClient.invalidateQueries(["roles", organisationId])
  );

  const openCreate = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (r: Role) => { setEditing(r); setFormOpen(true); };

  const handleDelete = (r: Role) =>
    confirmAlert({
      title: "Delete role",
      message: `Delete the "${r.name}" role?`,
      buttons: [
        { label: "Yes", className: "confirm-alert-button confirm-alert-button-yes",
          onClick: () => remove({ url: convertParamsToString(rbacRequest.ROLE_ONE, { organisationId, roleId: r.id }) }) },
        { label: "No", className: "confirm-alert-button confirm-alert-button-no" },
      ],
    });

  if (isLoading) return <LoadingSpinner />;

  return (
    <Box>
      <Flex justify="flex-end" mb={3}>
        <Can perm="officers.manage">
          <Button variant="primary" onClick={openCreate}>Create role</Button>
        </Can>
      </Flex>
      <Box overflowX="auto">
        <Table size="sm">
          <Thead><Tr><Th>Role</Th><Th>Permissions</Th><Th></Th></Tr></Thead>
          <Tbody>
            {roles.map((r) => (
              <Tr key={r.id}>
                <Td>{r.name}{r.isSystem && <Badge ml={2} colorScheme="purple">system</Badge>}</Td>
                <Td>
                  <Wrap>
                    {r.permissions.map((p) => (
                      <WrapItem key={p}><Badge colorScheme="green" variant="subtle">{p}</Badge></WrapItem>
                    ))}
                  </Wrap>
                </Td>
                <Td>
                  <Can perm="officers.manage">
                    <HStack spacing={2}>
                      <Button size="xs" onClick={() => openEdit(r)} isDisabled={r.isSystem}>Edit</Button>
                      <Button size="xs" colorScheme="red" onClick={() => handleDelete(r)} isDisabled={r.isSystem}>Delete</Button>
                    </HStack>
                  </Can>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
      <RoleFormModal organisationId={organisationId} role={editing} isOpen={formOpen} onClose={() => setFormOpen(false)} />
    </Box>
  );
};

export default RolesTab;
```

> System roles (incl. Chairman) are read-only here (`isDisabled`). The server still rejects edits/deletes of system or in-use roles with `422`/`403`; those messages surface via `useMutationWrapper`.

- [ ] **Step 3: Verify build + manual**

Run: `yarn tsc --noEmit`. Manually create a custom role, edit it, and confirm system roles' Edit/Delete are disabled. Attempt deleting an in-use role → server `422` toast.
Expected: CRUD works; system roles locked.

- [ ] **Step 4: Commit**

```bash
git add src/components/officers/RoleFormModal.tsx src/components/officers/RolesTab.tsx
git commit -m "feat(rbac): roles tab with create/edit/delete and shared grid"
```

---

### Task 21: Gate existing section UIs + org-switcher

**Files:**
- Modify: `src/pages/Organisations.tsx`
- Modify: `src/components/finance/ObligationsTab.tsx` (and the other finance mutate buttons)
- Modify: `src/pages/ViewMembers.tsx` (add/edit/delete member buttons)

**Interfaces:**
- Consumes: `Can`, `usePermissions`, `EMPTY_USER`.

This task applies the gating primitives to existing screens. It is intentionally last so the primitives are proven first.

- [ ] **Step 1: Org switcher** — `src/pages/Organisations.tsx`

- Update the `OrgType` to include `isOwner: boolean; roleName: string;` (and `status`, `permissions` if you reuse the store type — simplest: import `OrganisationSummary` from `rbac/types` and type `allOrg` as `OrganisationSummary[]`).
- Replace the logout literal `{ token: "", id: "", username: "" }` with `EMPTY_USER` (`import useGlobalStore, { EMPTY_USER } from "zStore"`).
- Badge each org row with its role: next to the name, `{org.roleName && <Badge ml={2}>{org.roleName}</Badge>}`.
- Gate the delete button to owners only: wrap the existing delete `<Button>` in `{org.isOwner && ( ... )}` (per-row owner flag, NOT the global `usePermissions`, since this list spans multiple orgs).

- [ ] **Step 2: Finance manage buttons** — `src/components/finance/ObligationsTab.tsx` and siblings

Wrap mutate affordances in `<Can perm="finance.manage">`:
- ObligationsTab: the "Add obligation"/create/edit/delete/rename buttons.
- PaymentsTab / RecordPaymentModal trigger: the "Record payment" button.
- AccountabilityTab: the "Set start date" action.
Read-only viewing stays available with just `finance.view` (the Finance dashboard button already requires it).

Example (ObligationsTab add button):

```tsx
import { Can } from "rbac/Can";
// ...
<Can perm="finance.manage">
  <Button variant="primary" onClick={openCreate}>Add obligation</Button>
</Can>
```

- [ ] **Step 3: Members manage buttons** — `src/pages/ViewMembers.tsx` (+ Dashboard already gates the Add Member button via Task 14)

Wrap edit/delete/model-config affordances in `<Can perm="members.manage">`. Leave the list visible under `members.view`.

- [ ] **Step 4: Verify build + manual**

Run: `yarn tsc --noEmit`. Manually, as a `finance.view`-only officer (set store perms in devtools), confirm: Finance opens, but Add/Record/Edit are hidden; the org you don't own shows no delete button; the role badge shows on the switcher.
Expected: view works, manage hidden, delete owner-only.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Organisations.tsx src/components/finance/ObligationsTab.tsx src/components/finance/PaymentsTab.tsx src/components/finance/AccountabilityTab.tsx src/pages/ViewMembers.tsx
git commit -m "feat(rbac): gate finance/member mutate actions and owner-only delete"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `CI=true yarn test --watchAll=false`
Expected: all RBAC tests pass (permissions, rbacPayloads, usePermissions, Can, RequirePermission, PermissionGrid) plus the existing finance/app tests still green.

- [ ] **Typecheck the whole app**

Run: `yarn tsc --noEmit`
Expected: no errors.

- [ ] **Manual happy-path smoke (owner)**

Log in as an org owner → Dashboard shows all buttons incl. Officers & Roles → open it → invite an officer by email → create a custom role → assign it → set an override → revoke a pending invite. Confirm no console errors and each list refreshes.

---

## Notes for the implementer

- **Build order:** Tasks 1–8 (foundation/primitives) → 9–12 (auth) → 13 (grid) → 14 (shell; stub tabs) → 15–20 (tabs/modals) → 21 (gate existing). Within 14–20, create the three tab files as `() => null` stubs when wiring the shell, then fill them in.
- **`yarn` vs `npm`:** the repo uses CRA; use whichever the lockfile dictates (`yarn.lock` ⇒ `yarn`). Test command shown as `yarn test`; substitute `npm test --` if needed.
- **No new deps.** Everything uses libraries already in `package.json`.

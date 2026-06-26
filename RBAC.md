# Officer RBAC — Frontend Handoff

A self-contained brief for building the multi-officer / roles-&-permissions feature. Everything here is live on the API (Phase 1). **No emails are sent yet** — invites are matched when the invited person signs up or sets their email (Phase 2 adds delivery).

Base URL: `{{baseUrl}}` (all routes under `/api`). Auth: `Authorization: Bearer <token>`.
Success responses are `{ "data": ... }`; errors are `{ "error": "..." }`.

---

## 1. The mental model

- **User** = an app login (Chairman, officers). NOT the same as a tracked **Member** (e.g. a choir member).
- **Organisation** — created by a user, who becomes its **Chairman** (owner). A user can now also be an **officer** of orgs they don't own.
- **Role** — a named, org-scoped bundle of permissions. 3 are seeded per org and are editable; you can also create custom roles.
- **Permission** — a `<area>.<view|manage>` key. A user's effective permissions come from their role, plus per-user **overrides**.
- **Chairman / owner** — always has every permission, can never be demoted or removed. The "Chairman" role itself cannot be edited.

### Permission catalog (12 keys, 6 areas)

| Area         | `.view` lets you…              | `.manage` lets you…                                          |
| ------------ | ------------------------------ | ------------------------------------------------------------ |
| `attendance` | read sessions & analytics      | mark / edit / delete sessions                                |
| `members`    | read member list               | create / edit / delete members, configure the member model   |
| `categories` | read categories                | create / edit / delete categories                            |
| `settings`   | read org settings              | rename org, change settings                                  |
| `finance`    | read obligations & compliance  | create/edit/delete obligations, record payments              |
| `officers`   | read officers, roles & invites | invite/remove officers, change roles, edit roles & overrides |

Fetch the canonical list at runtime (don't hardcode):

```
GET /api/permissions
→ { "data": { "areas": ["attendance","members","categories","settings","finance","officers"],
              "permissions": ["attendance.view","attendance.manage", ...12 total ] } }
```

### Default seeded roles

| Role                    | Permissions                                    |
| ----------------------- | ---------------------------------------------- |
| **Chairman**            | all (owner's role — not editable/deletable)    |
| **General Secretary**   | everything except `finance.*` and `officers.*` |
| **Financial Secretary** | `finance.view`, `finance.manage` only          |

---

## 2. Auth changes (do these first)

| Method | Path                  | Body                              | Response                                                   |
| ------ | --------------------- | --------------------------------- | ---------------------------------------------------------- |
| POST   | `/api/users/signup`   | `{ username, email, password }`   | `201 { data: { message, token } }`                         |
| POST   | `/api/users/login`    | `{ username \| email, password }` | `201 { data: { id, username, email, needsEmail, token } }` |
| GET    | `/api/users/me`       | —                                 | `200 { data: { id, username, email, needsEmail } }`        |
| PATCH  | `/api/users/me/email` | `{ email }`                       | `200 { data: { id, username, email, needsEmail: false } }` |

- **`email` is now required on signup.** Signup auto-redeems any pending officer invite matching that email.
- **Login accepts email or username** in either field — you may send `{ email, password }`, `{ username, password }`, or just put the email in the `username` field.
- **`needsEmail`** is `true` for legacy accounts created before this feature (username only). When `true`, prompt the user to set an email via `PATCH /api/users/me/email` before they can be invited / use officer features. Setting it also redeems any pending invites for that email.

```json
// POST /api/users/login → 201
{
  "data": {
    "id": "66...",
    "username": "knight",
    "email": "knight@vob.com",
    "needsEmail": false,
    "token": "eyJ..."
  }
}
```

---

## 3. Driving the UI from permissions

`GET /api/organisations` now returns **every org the user owns OR is an officer of**, each annotated:

```json
// GET /api/organisations → 200
{ "data": [
  { "id": "org1", "name": "VOB Choir", "image": "...", "owner": "66...", "status": "active",
    "isOwner": true,  "roleName": "Chairman",            "permissions": ["attendance.view","attendance.manage", ... all 12 ] },
  { "id": "org2", "name": "Diocese Mass", "owner": "77...","status": "active",
    "isOwner": false, "roleName": "Financial Secretary", "permissions": ["finance.view","finance.manage"] }
] }
```

**Use the `permissions` array of the currently-selected org to gate navigation and buttons.** Suggested mapping:

| Show this UI when permissions include…                                               |
| ------------------------------------------------------------------------------------ |
| Attendance tab → `attendance.view`; mark/edit/delete buttons → `attendance.manage`   |
| Members tab → `members.view`; add/edit/delete + model config → `members.manage`      |
| Categories management → `categories.view` / `categories.manage`                      |
| Org settings (rename, etc.) → `settings.view` / `settings.manage`                    |
| Finance tab → `finance.view`; record payment / manage obligations → `finance.manage` |
| Officers & Roles admin → `officers.view` / `officers.manage`                         |
| Delete organisation → **owner only** (`isOwner === true`)                            |

The server enforces this regardless of the UI, so gating is purely UX. See error semantics below.

---

## 4. Officer management

All under `/api/organisations/:organisationId`. Require the noted permission.

| Method | Path                            | Body                                         | Requires          | Notes                       |
| ------ | ------------------------------- | -------------------------------------------- | ----------------- | --------------------------- |
| GET    | `/officers`                     | —                                            | `officers.view`   | list officers               |
| POST   | `/officers/invite`              | `{ email, roleId }`                          | `officers.manage` | invite by email             |
| GET    | `/officers/invites`             | —                                            | `officers.view`   | pending invites             |
| DELETE | `/officers/invites/:inviteId`   | —                                            | `officers.manage` | revoke a pending invite     |
| PATCH  | `/officers/:userId/role`        | `{ roleId }`                                 | `officers.manage` | change an officer's role    |
| PATCH  | `/officers/:userId/permissions` | `{ grantedPermissions, revokedPermissions }` | `officers.manage` | per-user overrides          |
| DELETE | `/officers/:userId`             | —                                            | `officers.manage` | remove (archive) an officer |

```json
// GET /api/organisations/:id/officers → 200
{ "data": [
  { "userId": "66...", "username": "knight", "email": "knight@vob.com",
    "roleId": "r1", "roleName": "Chairman", "permissions": [ ...all ] },
  { "userId": "88...", "username": "finsec", "email": "fs@vob.com",
    "roleId": "r3", "roleName": "Financial Secretary", "permissions": ["finance.view","finance.manage"] }
] }
```

- **Invite responses:** `201 { data: { invited: true } }` (no account yet → pending) or `{ data: { attached: true, userId } }` (existing user attached immediately; `200` if they were already a member and got re-activated).
- **Overrides:** effective permissions = role ∪ `grantedPermissions` − `revokedPermissions`. Unknown keys → `422`. Build the override editor from `GET /api/permissions`, pre-checking the role's permissions.
- The **owner** cannot be targeted by role/permission/remove calls → `403`.

---

## 5. Role management

All under `/api/organisations/:organisationId`. Require the noted permission.

| Method | Path             | Body                        | Requires          | Notes              |
| ------ | ---------------- | --------------------------- | ----------------- | ------------------ |
| GET    | `/roles`         | —                           | `officers.view`   | list roles         |
| POST   | `/roles`         | `{ name, permissions[] }`   | `officers.manage` | create custom role |
| PUT    | `/roles/:roleId` | `{ name?, permissions[]? }` | `officers.manage` | edit role          |
| DELETE | `/roles/:roleId` | —                           | `officers.manage` | delete custom role |

```json
// GET /api/organisations/:id/roles → 200
{ "data": [
  { "id": "r1", "organisationId": "org1", "name": "Chairman",
    "permissions": [ ...all ], "isSystem": true, "status": "active" },
  { "id": "r3", "organisationId": "org1", "name": "Financial Secretary",
    "permissions": ["finance.view","finance.manage"], "isSystem": true, "status": "active" }
] }
```

- Role editor: render a checkbox grid from `GET /api/permissions`; pre-check `role.permissions`. Invalid keys → `422`.
- **Chairman role** cannot be edited → `403`. Duplicate name in the org → `422`.
- **Delete** rejects system roles (`422`) and roles still assigned to an officer (`422`).

---

## 6. Invite-by-email flow (what to build)

1. Admin opens **Officers → Invite**, enters an email + picks a role → `POST /officers/invite`.
2. If that email already has an account, they become an officer immediately. Otherwise a **pending invite** is stored (shown in the pending list).
3. When that person **signs up** with the same email — or an existing user **sets their email** via `PATCH /api/users/me/email` — the invite is redeemed automatically and they appear in the officers list.
4. **No email is sent in this phase.** You'll want to surface the pending state and let admins copy/share an invite out-of-band, and let an invited user know to sign up with that exact email. (Automated delivery is Phase 2.)

---

## 7. Error semantics (important)

| Status | Meaning                                                              | Frontend action                                                          |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `401`  | missing/expired token                                                | send to login                                                            |
| `403`  | authenticated but lacks the permission for this org                  | you shouldn't have shown the action — hide it; show "not allowed" if hit |
| `404`  | not a member of the org, or org/resource not found                   | treat as no-access; don't leak existence                                 |
| `422`  | validation (bad email, unknown permission key, duplicate name, etc.) | show the `error` message                                                 |
| `409`  | conflict (e.g. an active dues plan already exists for the year)      | show the `error` message                                                 |

Gate buttons on the `permissions` array so users rarely see a `403`; treat any `403` as a "shouldn't-have-shown-it" signal.

---

## 8. Suggested screens

- **Org switcher** — from `GET /api/organisations`; badge each with `roleName`; drive the whole nav off that org's `permissions`.
- **Set-email prompt** — if `needsEmail`, a one-time modal to capture email before officer features unlock.
- **Officers admin** (gated by `officers.view`) — table of officers (name/email/role/permissions), Invite button, per-row Edit Role / Edit Permissions / Remove (hide all of these unless `officers.manage`; never offer them for the owner row).
- **Pending invites** — list with Revoke.
- **Roles admin** — list roles; create/edit with a permission checkbox grid from `GET /api/permissions`; Chairman role read-only.

---

## 9. Reference

- Live request examples: the **Bruno collection** in `presence-pro-bruno/` (folders **Auth**, **Officers**, **Roles**, **Permissions**).
- Fuller API guide: `FRONTEND_API.md` (§11 covers RBAC).

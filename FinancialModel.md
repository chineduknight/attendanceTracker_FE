# Presence Pro — Frontend Integration Guide

A practical contract for building the frontend against the Attendance Tracker API.
For an interactive, runnable reference see the Bruno collection in
[`presence-pro-bruno/`](presence-pro-bruno/).

---

## 1. Basics

- **Base URL:** `http://localhost:3434` in dev (configurable). All routes are under `/api`.
- **Content type:** `application/json` for request bodies.
- **Dates:** always `"YYYY-MM-DD"` strings (never ISO timestamps).
- **IDs:** Mongo ObjectId strings, exposed as `id` (the API maps `_id → id`).

### Response envelope

Success responses are wrapped:

```json
{ "data": <payload> }
```

Errors are:

```json
{ "error": "Human readable message" }
```

Auth failures (missing/invalid/expired token) return `401` as:

```json
{ "status": "error", "error": "..." }
```

### Status codes you'll handle

| Code | Meaning                                               |
| ---- | ----------------------------------------------------- |
| 200  | OK                                                    |
| 201  | Created (also used by signup/login)                   |
| 401  | Not authenticated (token missing/invalid/expired)     |
| 404  | Resource not found / not owned by you                 |
| 409  | Conflict (e.g. duplicate active dues plan for a year) |
| 422  | Validation error (message in `error`)                 |

---

## 2. Authentication

JWT bearer tokens. Token lifetime is **24 hours**.

| Method | Path                | Body                     | Notes                                               |
| ------ | ------------------- | ------------------------ | --------------------------------------------------- |
| POST   | `/api/users/signup` | `{ username, password }` | `password` ≥ 6 chars. Returns `{ message, token }`. |
| POST   | `/api/users/login`  | `{ username, password }` | Returns `{ id, username, token }`.                  |
| GET    | `/api/users/me`     | —                        | Returns `{ id, username }`. Requires auth.          |

**Auth header for every other request:**

```
Authorization: Bearer <token>
```

Flow: login → store `data.token` → attach as bearer on all calls → on `401`, send the user back to login.

```json
// POST /api/users/login → 201
{ "data": { "id": "66...", "username": "knight", "token": "eyJ..." } }
```

---

## 3. Core concepts

- **Organisation** — owned by the logged-in user. Everything else is scoped to an organisation, and the API enforces ownership (you only ever see your own orgs/data).
- **Member model** — each organisation defines its _own_ member fields (a dynamic schema). The frontend must render member forms **from this config**, not from a hardcoded shape.
- **Member** — a person in an org. Has the dynamic model fields **plus** system fields (`status`, `financialStartDate`).
- **Category / Sub-category** — used to group attendance sessions (e.g. "Sunday Service" → "First Mass").
- **Attendance** — a dated session recording each member's `present` / `absent` / `apology`.
- **Finance** — financial obligations (yearly **dues** or one-off **levy**) and per-member payment compliance.

---

## 4. Organisations

| Method | Path                     | Body                                         |
| ------ | ------------------------ | -------------------------------------------- |
| POST   | `/api/organisations`     | `{ name, image? }`                           |
| GET    | `/api/organisations`     | — (list your orgs)                           |
| GET    | `/api/organisations/:id` | —                                            |
| PUT    | `/api/organisations/:id` | `{ name, image?, collapseAttendanceByDay? }` |
| DELETE | `/api/organisations/:id` | — (soft delete)                              |

- `image` must be a URL.
- `collapseAttendanceByDay` (bool): when true, multiple same-day, same-category attendance sessions collapse into a single verdict per member in analytics (present wins, then apology, then absent).

---

## 5. The dynamic member model (important for FE forms)

Each org has a member-field config. **Render member create/edit forms from this.**

| Method | Path                                       | Body                |
| ------ | ------------------------------------------ | ------------------- |
| GET    | `/api/organisations/:organisationId/model` | —                   |
| POST   | `/api/organisations/:organisationId/model` | `{ fields: [...] }` |

A field looks like:

```json
{
  "name": "part",
  "type": "option",
  "options": ["soprano", "alto", "tenor", "bass"],
  "required": true
}
```

**Field types → form controls:**

| `type`   | Render as      | Notes                    |
| -------- | -------------- | ------------------------ |
| `text`   | text input     |                          |
| `number` | number input   |                          |
| `date`   | date picker    | submit as `"YYYY-MM-DD"` |
| `option` | select / radio | choices from `options[]` |

A real example config (choir): `name` (text, req), `dob` (date, req), `phone` (number),
`part` (option, req), `gender` (option, req), `status` (option: active/inactive/alumni/left, req),
`email` (text), `profession` (text), `joindate` (date), `probationstatus` (option: probation/graduated/repeated/pending, req).

> Note: the member's `status` field doubles as both the configurable membership status
> _and_ the lifecycle flag. Deleting a member sets `status: "archived"`; archived members
> are excluded from lists/analytics. Don't offer "archived" as a selectable option in forms.

---

## 6. Members

| Method | Path                                                               | Body / Notes                                                    |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| POST   | `/api/organisations/:organisationId/members`                       | Member fields per the model. Include `id`/`memberId` to update. |
| GET    | `/api/organisations/:organisationId/members`                       | List. Supports `?sort=` and `?status=`/`?statuses=` filters.    |
| GET    | `/api/organisations/:organisationId/members/:id`                   | One member.                                                     |
| DELETE | `/api/organisations/:organisationId/members/:id`                   | Soft delete.                                                    |
| GET    | `/api/organisations/:organisationId/members/birthday`              | Members by birthday.                                            |
| GET    | `/api/organisations/:organisationId/members/export`                | Excel → returns a URL in `data`.                                |
| GET    | `/api/organisations/:organisationId/members/export/pdf`            | PDF → returns a URL.                                            |
| GET    | `/api/organisations/:organisationId/members/birthday/export[/pdf]` | Birthday exports.                                               |

- **A member model must exist before adding members** — otherwise you get `422 "No model attached to this organisation"`.
- Validation enforces required model fields and valid `option` values; the error message names the field.
- **Update is a partial merge** (`$set`): fields you omit are preserved. So editing a member without sending `financialStartDate` will **not** wipe it.

---

## 7. `financialStartDate` (member ↔ finance link) — read this

- It's a **system field on every member**, defaulting to `null`. It is **not** part of the dynamic member model and is **not** required to create/update a member.
- **`null` = the member is not financially accountable.** A date = accountable **from that month onward**.
- It is the _single source of truth_ for finance liability. Set it explicitly when a member becomes accountable (e.g. graduates).

**Manage it via the finance endpoint, not the member form:**

```
PATCH /api/finance/members/:memberId/financial-start-date
{ "organisationId": "...", "financialStartDate": "2026-01-01" }   // send null to clear
```

FE guidance: surface this in the **finance area** (a date picker / "mark as accountable" control per member), not in the generic member form.

---

## 8. Categories

| Method | Path                                              | Body                            |
| ------ | ------------------------------------------------- | ------------------------------- |
| POST   | `/api/organisations/:organisationId/category`     | `{ name }`                      |
| POST   | `/api/organisations/:organisationId/sub-category` | `{ name, parentCategoryId }`    |
| GET    | `/api/organisations/:organisationId/category`     | —                               |
| PUT    | `/api/organisations/:organisationId/category`     | `{ categoryId, name }` (rename) |
| DELETE | `/api/organisations/:organisationId/category/:id` | — (soft delete)                 |

---

## 9. Attendance

| Method | Path                                                     | Body / Notes                                                                        |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/api/attendance`                                        | Mark a session (see below).                                                         |
| PUT    | `/api/attendance/:id`                                    | Update a session. **Editable only once** (`hasBeenUpdated` guard → 400 after that). |
| GET    | `/api/attendance/:organisationId`                        | List sessions (without per-member rows).                                            |
| GET    | `/api/attendance/:organisationId/:id`                    | One session with per-member rows (members populated).                               |
| DELETE | `/api/attendance/:organisationId/:id`                    | Soft delete.                                                                        |
| GET    | `/api/attendance/:organisationId/analytics`              | Analytics grid (see below).                                                         |
| GET    | `/api/attendance/:organisationId/analytics/export/excel` | Excel → URL.                                                                        |
| GET    | `/api/attendance/:organisationId/analytics/export/pdf`   | PDF → URL.                                                                          |
| GET    | `/api/attendance/export/:organisationId/:id`             | Export one session's rows → URL.                                                    |

**Mark attendance body:**

```json
{
  "organisationId": "...",
  "name": "First Mass",
  "date": "2026-06-07",
  "categoryId": "...", // optional
  "subCategoryId": "...", // optional
  "presentMembers": ["memberId1", "memberId2"], // required, min 1
  "apologisedMembers": ["memberId3"] // optional
}
```

You only send present and apologised member ids; **everyone else in the org is auto-marked absent**.

**Analytics** (`GET .../analytics`) query params (all optional):

- `fromDate`, `toDate` — `YYYY-MM-DD` range
- `sort` — `name|present|absent|apology` + `:asc|:desc` (e.g. `present:desc`)
- `attendanceStatus` — filter cells to `present|absent|apology`
- `status` / `statuses` — filter members by their membership status value(s)

Response shape:

```json
{
  "data": {
    "keys": [
      "name",
      "Total Number of Times Present",
      "Sunday Service On 2026-06-07",
      "..."
    ],
    "analytics": [
      {
        "name": "Ada Lovelace",
        "Total Number of Times Present": 8,
        "Total Number of Times Absent": 1,
        "Total Number of  Apology": 1,
        "Sunday Service On 2026-06-07": "present"
      }
    ]
  }
}
```

`keys` is the union of all columns across rows (member fields + per-session columns) — use it to build the table headers; rows are sparse, so default missing cells to empty.

---

## 10. Finance

### Obligations

| Method | Path                                           | Body / Notes                                                                               |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/api/finance/obligations`                     | Create. Dues or levy (see below). 409 if an active dues plan already exists for that year. |
| GET    | `/api/finance/:organisationId/obligations`     | List active obligations.                                                                   |
| GET    | `/api/finance/:organisationId/obligations/:id` | One obligation.                                                                            |
| PUT    | `/api/finance/obligations/:id`                 | `{ organisationId, name }` — **name only** (amounts are immutable).                        |
| DELETE | `/api/finance/:organisationId/obligations/:id` | Soft delete.                                                                               |

```json
// Dues (yearly plan, 12-month grid)
{ "organisationId": "...", "type": "dues", "name": "2026 Monthly Dues", "year": 2026, "amountPerMonth": 500 }

// Levy (one-off)
{ "organisationId": "...", "type": "levy", "name": "Building Levy", "amount": 10000, "date": "2026-06-18" }
```

### Payments

| Method | Path                    | Body / Notes                   |
| ------ | ----------------------- | ------------------------------ |
| POST   | `/api/finance/payments` | Record a payment.              |
| PUT    | `/api/finance/payments` | Correct (overwrite) a payment. |

**Record** `{ organisationId, obligationId, memberId, amount }`:

- Dues: the amount **auto-fills the earliest unpaid months sequentially** and carries the remainder forward (no gaps). A lump sum of 1500 at 500/mo fills 3 months.
- Levy: adds to the cumulative amount paid.
- **422** if: overpaying beyond the outstanding balance (message names the balance), the member has no `financialStartDate`, or the member isn't liable (dues year before their start, or levy dated before their start).

**Correct** (admin fix) `{ organisationId, obligationId, memberId, monthlyPaid?, amountPaid? }`:

- Dues: send `monthlyPaid` as a map, e.g. `{ "1": 500, "2": 500 }`.
- Levy: send `amountPaid` (number).

### Compliance report

```
GET /api/finance/:organisationId/obligations/:id/compliance
```

```json
{
  "data": {
    "obligation": {
      "id": "...",
      "type": "dues",
      "year": 2026,
      "amountPerMonth": 500,
      "...": "..."
    },
    "summary": {
      "totalMembers": 10,
      "accountableMembers": 8,
      "totalCollected": 4200,
      "totalOutstanding": 35800
    },
    "rows": [
      {
        "memberId": "...",
        "name": "Ada Lovelace",
        "accountable": true,
        "months": {
          "1": "paid",
          "2": "partial",
          "3": "unpaid",
          "4": "not-due",
          "...": "not-due"
        },
        "totalExpected": 6000,
        "totalPaid": 1200,
        "balance": 4800,
        "paidUpToMonth": 1,
        "compliance": 17,
        "creditMonths": []
      },
      { "memberId": "...", "name": "On Probation", "accountable": false }
    ]
  }
}
```

- Month status values: **`paid` / `partial` / `unpaid` / `not-due`** (use these for cell colours).
- `accountable: false` rows have no grid — render them as "not accountable" and exclude from compliance math (the API already excludes them from `summary`).
- `compliance` is a percentage (0–100). `paidUpToMonth` is the last fully-paid consecutive month. `creditMonths` (if present) = months paid that are now `not-due` (a credit/over-pay signal).
- **Levy** rows look like: `{ memberId, name, accountable, liable, expected, paid, balance, status }` (single cell, no `months`).

### Exports

```
GET /api/finance/:organisationId/obligations/:id/compliance/export/excel
GET /api/finance/:organisationId/obligations/:id/compliance/export/pdf
```

Both return a downloadable file **URL** in `data` (not the file bytes). All export endpoints across the API follow this pattern — show it as a download link.

### Set member financial start date

```
PATCH /api/finance/members/:memberId/financial-start-date
{ "organisationId": "...", "financialStartDate": "2026-01-01" }   // null to clear
```

See section 7.

---

## 11. Suggested screens / flows

1. **Auth** — login/signup → store token → bearer on all calls → handle 401.
2. **Org switcher** — list orgs; create org; first-run requires configuring the member model.
3. **Member model setup** — builder for the dynamic fields (must exist before adding members).
4. **Members** — list (with sort/status filter), add/edit via dynamic form, export.
5. **Attendance** — pick category/date → mark present/apology (rest auto-absent) → analytics grid + exports.
6. **Finance** —
   - Set each member's `financialStartDate` (accountability) in this area.
   - Create dues plan / levy.
   - Record payments (lump sums auto-fill months).
   - Compliance grid (per-member months, colour by status) + summary + Excel/PDF export.

---

## 12. Gotchas

- **Bearer format is exact:** `Authorization: Bearer <token>` — two parts, the word `Bearer`, or you get 401.
- **Member model first:** adding members before configuring the model returns 422.
- **Attendance edits once:** a session can be updated only a single time.
- **`financialStartDate` is finance-only** and defaults to null — it's not in the member model and not required on member forms (see §7).
- **Exports return URLs**, not files.
- **Everything is ownership-scoped:** a wrong/foreign `organisationId` returns 404, not 403.

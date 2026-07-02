# Forgot / Reset Password — Frontend Handoff

A self-contained brief for building the forgot-password and reset-password screens. Both endpoints are live on the API.

Base URL: `{{baseUrl}}` (all routes under `/api`). No auth required for either endpoint.
Success responses are `{ "data": ... }`; errors are `{ "error": "..." }`.

---

## The flow

1. User submits their email on the **Forgot Password** screen → `POST /api/users/forgot-password`.
2. If an account exists, the API emails a reset link: `{FRONTEND_URL}/reset-password?token=<token>`.
3. User clicks the link, landing on your **Reset Password** screen, which reads `token` from the query string.
4. User enters a new password → `POST /api/users/reset-password` with the token + password.
5. On success, redirect to login.

---

## 1. Forgot Password screen

### Request

```
POST /api/users/forgot-password
Content-Type: application/json

{ "email": "user@example.com" }
```

### Response — always `200`, always the same body

```json
{ "data": { "message": "If an account exists, a reset link has been sent." } }
```

This is intentional: the response is identical whether or not the email belongs to a real account (prevents account enumeration).

### FE behavior

- Show the generic confirmation (e.g. "If that email is registered, we've sent a reset link") **regardless** of whether the account exists. Never reveal that an email is/isn't registered.
- **Rate limit: 5 requests / hour per IP.** Exceeding it returns `429` — show "Too many attempts, please try again later."
- After submit, show a "check your inbox" confirmation state.

---

## 2. Reset Password screen

The email link points to **`{FRONTEND_URL}/reset-password?token=<token>`**, so you need a route at `/reset-password` that reads the token from the query string:

```js
const token = new URLSearchParams(location.search).get("token");
```

### Request

```
POST /api/users/reset-password
Content-Type: application/json

{ "token": "<from the URL>", "password": "<new password>" }
```

### Responses

| Status | Body                                                                | Meaning                              |
| ------ | ------------------------------------------------------------------- | ------------------------------------ |
| `200`  | `{ "data": { "message": "Password has been reset" } }`              | Success → redirect to login          |
| `422`  | `{ "error": "Invalid or expired reset link" }`                      | Bad / used / expired token           |
| `422`  | `{ "error": "password length must be at least 6 characters long" }` | Validation failed (message may vary) |
| `429`  | rate-limit error                                                    | Too many attempts                    |

### FE behavior

- **Password minimum length is 6 characters** (enforced server-side). Validate client-side too.
- **The token expires after 1 hour** and is **single-use** — it's cleared on success, so re-submitting the same token returns `422`. Handle the "invalid or expired" case with a clear message and a link back to "request a new reset link."
- Errors are returned as `{ "error": "..." }` (a string) — same shape as the rest of the API, so reuse your existing error display.
- **Rate limit: 10 requests / 15 min per IP.**
- Don't auto-submit on page load; require the user to type the new password.

---

## Security notes (handled server-side — context only)

- The raw token only ever exists in the email link; the database stores a SHA-256 hash of it. **The link is the secret** — avoid logging full reset URLs.
- The reset link's domain comes from the server's `FRONTEND_URL` env var, not from anything the client sends.

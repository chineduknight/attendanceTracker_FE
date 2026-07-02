# Tester Guide — Attendance Tracker

A walkthrough of everything to exercise, plus the gotchas that will trip you up if you don't know about them up front. Read **Section 1 and 2 first** — they explain how the app is structured and why some things behave the way they do. Then work through the feature checklists.

---

## 1. Before you start

- **You need an account.** Sign up at `/signup` (username + email + password), or use credentials you've been given.
- **Everything lives inside an Organisation.** After login you land on the **Organisations** list. You must create or select an org before any feature (members, attendance, finance, etc.) is available. Think of the org as the "workspace" — all data is scoped to it.
- **Test with at least two accounts** if you can: one **owner/admin** and one **limited officer**. A lot of the app's behaviour depends on permissions (see §2.1), and you can only verify it properly by comparing the two.
- **Report what you did, not just what broke.** Note the org, the role you were using, and the steps — permissions and org-scoping mean the same button can behave differently for different testers.

---

## 2. Key concepts — read these or you'll file false bugs

### 2.1 Permissions hide things (this is intentional)
The app uses role-based permissions. **If you don't have permission for an action, the button/field simply won't appear** — there's no error message, it's just gone. So "I can't find the delete button" may be correct behaviour, not a bug. Always note **which role** you were testing as.

- Owners see everything.
- Officers see only what their role/permissions allow (e.g. a "view-only" finance role won't see Create/Edit/Delete on obligations).

### 2.2 The org owner is protected
On the Officers screen, the owner's row has **no edit/remove buttons**. You can't demote or remove the owner — expected.

### 2.3 Forgot/Reset password has deliberate "weird" behaviour
- **Forgot password always shows the same "check your inbox" message** — whether or not the email is real. This is on purpose (so attackers can't discover which emails are registered). Don't report "it said success for an email that doesn't exist" as a bug.
- **Reset links are single-use and expire after 1 hour.** Clicking an old/used link, or reloading and resubmitting after it worked once, correctly shows "this reset link is invalid or expired." That's expected.
- You can only reach the reset screen via the link in the reset email (`/reset-password?token=...`). There's no menu item for it.
- Both screens are **rate-limited** (forgot: 5/hour, reset: 10/15min per IP). Hammering them shows a "Too many attempts" message — expected.

### 2.4 The "Set your email" popup can't be dismissed
If your account has no email set, a popup appears on the Organisations screen and **cannot be closed** until you enter an email. This is intentional (officer invites are matched by email). Not a bug.

### 2.5 Marking attendance is auto-saved as a draft
While marking attendance, your selections are saved to the browser automatically. If you refresh mid-way, your progress should still be there. The draft is **cleared once you successfully submit**. Worth testing: refresh mid-marking, confirm nothing is lost.

### 2.6 Session / login behaviour
- If your session expires or the token becomes invalid, the app logs you out automatically and shows an error — you'll be sent back to login. Expected.
- "Remember me" on the login screen currently does nothing — don't test it as a feature.

---

## 3. What to test, by area

For each item below: try the **happy path**, then try to **break it** (empty fields, invalid input, double-clicks, slow network, no permission).

### Authentication
- Login with valid credentials → lands on Organisations.
- Login with wrong credentials → clear error, no crash.
- Sign up (new username + email + password) → account created, logged in.
- Forgot password → "check your inbox" state (see §2.3).
- Reset password via the email link → sets new password → redirects to login. Test: password under 6 characters is rejected; the two password fields must match; **eye icon** reveals/hides the password.
- Log out → returns to login, can't go "back" into the app.

### Organisations
- Create an org (name).
- Switch between orgs → data changes to match the selected org.
- Delete an org (owner only) → confirmation prompt → removed from list.
- Confirm a non-owner does **not** see the delete option.

### Members
- Define the member fields first via the **member model / user-model** screen (field name, type, required, options). This controls what the Add Member form looks like.
- Add a member → the form should match the fields you defined (text, number, date, dropdown, checkbox, etc.).
- Edit an existing member → form pre-fills with their current values.
- View members → search by name filters the list live.
- Export the member list to **Excel** and **PDF**, with field selection and status filter — check the exported file actually contains the chosen fields.

### Categories & Sub-categories
- Create a category.
- Create a sub-category under a parent category.
- Confirm they then appear as options when creating attendance.

### Attendance
- Create an attendance session (name, date, category, sub-category).
- Mark members present / absent / apology → the running counts at the top update.
- Search members by name while marking.
- Refresh mid-marking → draft is preserved (§2.5).
- Submit → success, draft cleared.
- View all attendance → sorted newest first; open one to see details.
- Edit a past attendance session.
- Export a session to Excel/PDF.
- Delete a session (with confirmation).

### Analytics
- Pick a date range (you can't run it until both dates are set).
- Try the presets (This Month, Last Month, This Quarter, etc.).
- Filter by member status.
- Export Excel/PDF and confirm the filters are reflected in the file.

### Birthdays
- Pick a date range / use presets (This Month, Next Month, 3 Months).
- Confirm "Today" and "Coming up" columns look right.
- Filter by status.
- Export Excel/PDF.
- Share → WhatsApp link opens with a pre-formatted birthday list; "Copy to clipboard" works.

### Finance (tabs: Obligations, Compliance, Payments, Accountability)
- **Obligations:** create a *Dues* obligation (name, year, amount/month) and a *Levy* (name, amount, date). Rename one. Delete one. Confirm view-only roles can't create/edit/delete.
- **Compliance:** select an obligation → member grid shows paid / partial / unpaid (colour-coded). On a narrow screen, the table scrolls sideways while the name column and header stay pinned — check this works.
- **Payments:** select an obligation + member → record a payment → compliance updates.
- **Accountability:** set a member's financial start date individually, and try the bulk apply (select several members + a date). Confirm the success/failure summary makes sense.

### Officers & Roles (admin area)
- **Officers:** invite by email + role. If the email belongs to an existing user → added immediately; if not → shows as a *pending invite* (they auto-join when they sign up with that exact email). Edit an officer's role and their individual permissions. Remove an officer.
- **Pending invites:** view and revoke a pending invite.
- **Roles:** create a custom role with a set of permissions; edit and delete it. Confirm **system roles can't be edited or deleted**.
- Then **log in as an officer with a limited role** and confirm the restricted buttons/screens are hidden (§2.1).

---

## 4. Cross-cutting things to check everywhere

- **Permissions:** repeat key flows as a limited officer — restricted actions should be hidden, not just disabled.
- **Validation:** every form should reject empty required fields and bad input (e.g. invalid email) with a visible message.
- **Toasts:** successful actions show a green success message; failures show a red error. They auto-dismiss.
- **Loading:** spinners while data loads; buttons disable while submitting (try double-clicking submit — it shouldn't double-submit).
- **Empty states:** a fresh org with no data should show friendly "nothing here yet" messages, not blank screens or errors.
- **Exports:** the Excel/PDF buttons generally open the file in a new browser tab — make sure pop-ups aren't blocked. Check the file contents match the filters you set.
- **Responsive:** test on a phone-width screen (~375px), tablet (~768px), and desktop. Layouts should stack on mobile; tables should scroll rather than overflow the page.
- **Light/Dark mode:** if you can toggle the theme, check text stays readable in both.

---

## 5. Known rough edges (don't bother re-reporting these)

- "Remember me" on login is not wired up.
- There's no delete-member button in the UI (by current design).
- Error wording occasionally reads "An error occured" (typo) — note it once, but it's known.
- If submitting marked attendance fails mid-request, the draft has already been handed off — re-check your data after a failed submit.

---

## 6. How to file a good bug report

Include:
1. **Account / role** you were using (owner vs which officer role).
2. **Organisation** name.
3. **Steps** to reproduce, in order.
4. **What you expected** vs **what happened**.
5. **Screenshot** + browser/device + screen size.
6. Whether it's **repeatable** or happened once.

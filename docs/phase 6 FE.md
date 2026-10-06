# Presence Pro | Phase 6A Frontend Agent Brief
## Member model builder with stable identity and safe display labels

**Repository:** `chineduknight/attendanceTracker_FE`  
**Base / PR target:** latest `staging` (Phase 5 FE #61 is already merged)  
**Do not merge/deploy.** Return one focused PR and test evidence.

## Dependency

Work against the Phase 6A backend contract in the separate backend agent brief. For final integration verification, backend Phase 6A must first be deployed to **staging**. Do not release a frontend that sends new field metadata to an older backend validator, which would return `422`.

## Problem and architecture

Today `src/pages/UserModel.tsx` uses subdocument `_id` as the React key but **strips it before saving**, causing new identities on every model update. The same field's `name` serves as the stored member-document property, Phase 5 eligibility rule key, filter/sort/export key, and form-registration key. Editing the title today changes that storage key without migrating existing values.

Phase 6A preserves the backend's existing field `_id` and separates:

- **Display label**: user-facing text, editable (example `Voice Part`).
- **Storage key** (`name`): stable API/DB key, locked once saved (example `part`).
- **Stable `_id`**: existing Mongo subdocument ID for saved fields; never invent a second persistent field ID.

Example `fields` entry:

```ts
{
  _id: "<from backend>",       // existing fields only
  name: "part",                // immutable once persisted
  label: "Voice Part",         // editable
  type: "option",              // immutable once persisted in 6A
  required: false,
  options: ["Soprano", "Alto", "Tenor", "Bass"]
}
```

The POST body remains `{ fields: [...] }` on the existing org-model endpoint. Reuse existing organisation query keys and `members.manage` permission.

## 1. Model-builder UX (`src/pages/UserModel.tsx`)

- Keep the existing `name` storage key and `_id` for every persisted field in local state and POST payload. **Remove the `_.omit(field, ["_id"])` behavior for persisted fields.**
- Two distinct inputs for each field:
  - `Display label` (editable for existing and new fields)
  - `Internal field key` (read-only for existing; new fields can choose it before first save). Explain `Internal key is used by stored member records and eligibility rules and cannot be renamed after saving.`
- Existing field `type` is read-only in 6A; new-field type remains editable before first save.
- Existing fields must not show a working Remove action; show a brief reason or disabled state. Field removal requires a separate future migration/retirement workflow.
- The first `name` field remains pinned and protected.
- Every new unsaved field has a **client-only** `draftId` for React keys. Do not submit `draftId`, `field-0`, a random `_id`, or a generated Mongo ObjectId to the backend. The backend creates its persistent `_id` after save.
- Keep option-editor comma-separated UX but normalize to the configured `options: string[]` at submit; do not erase options inadvertently when a model is loaded, type switched for a new field, or labels are edited.
- Use controlled values for `required` checkbox (not `defaultChecked`) so a loaded model accurately displays persisted configuration.
- Validate clear labels (nonempty, sensible max), duplicate/unsafe new internal keys, and required values locally; backend validation remains authoritative.
- Show backend `422` model validation errors visibly. Do not navigate on an error.
- After successful save invalidate `queryKeys.memberModel(org.id)` and relevant org-scoped member/template views, then navigate appropriately. Do not invalidate all organisations indiscriminately.
- Remount/clear field-editor state on organisation switch so fields, draft IDs and unsaved edits cannot leak across tenants.
- Respect `members.manage` for editing and `members.view` elsewhere.

## 2. Member entry and display

`src/pages/AddMember.tsx` must show `field.label || field.name` to users but continue to call `react-hook-form.register(field.name)` and submit only existing storage keys/values. Do **not** include `_id` or `label` in member-data requests. Confirm existing member edit prefills still work after a cosmetic rename.

Where straightforward, adapt labels in generic member browsing/filter controls (`src/pages/ViewMembers.tsx`) and eligibility criteria editor (`src/components/attendance/AttendanceEligibilityEditor.tsx`) to show display labels while retaining `field.name` as all query/rule keys.

Prefer a shared formatter `displayMemberFieldLabel(field)` and backward-compatible optional `label` on `MemberModelField`; older model responses without `label` still render correctly. Do not edit historical attendance objects, member values or stored rules.

## 3. Phase 5 eligibility and templates

- `AttendanceEligibilityRule.field` must **remain the storage key** (`part`), not the UI label (`Voice Part`) and not the field `_id`.
- Option matching, AND/OR, tenant isolation and archived-member exclusion stay exactly as Phase 5 implemented them.
- Eligibility UI may label a criterion `Voice Part`, but save `{ field: "part", values: [...] }`.
- A label-only change never marks a template as stale. Option/field changes still retain current stale detection.
- Read-only historical summaries must remain truthful even if a label has since changed; do not rebuild stored session rosters.
- Display labels must never change member-filter query params or API payload keys.

## 4. Compatibility

- Legacy model fields with no `label` use a fallback label based on their `name`.
- Backend GET uses existing `_id`; new drafts use a separate local-only identifier.
- Beware `name` is both a configurable initial field and a member property; do not allow a display rename to change the member's `name` value.
- The existing `status` field is a special directory/lifecycle overlap; do not change its saved values or archived-member semantics in this PR.
- Do not turn this into a rewrite of all reports, export headers, analytics, finance or RBAC.

## 5. Automated tests

**UserModel:**
- Existing `_id` sent unchanged on update; no identity churn.
- Existing key locked; label editable; type locked; existing field removal blocked.
- New field uses client-only draft ID but sends no fabricated persistent `_id`; after save/reload it has backend ID.
- Updating label preserves key, options and required setting; checkbox is controlled.
- Duplicate/unsafe new keys are flagged; backend `422` is surfaced.
- A second organisation gets its own fields and no draft state from first org.
- No `label` from older backend response uses fallback.

**AddMember:**
- Display label `Voice Part` shown, but payload still uses `part` key.
- Editing member after a label-only change shows saved `part` option and preserves the value.

**Eligibility/templates:**
- Eligibility criterion displays `Voice Part`, but rules sent use `part`.
- Changing label does not mark saved `part` template stale or affect expected-roster preview.
- Changing an option still marks a genuinely stale rule.
- Existing historical attendance remains unchanged.

**Regression:** All Phase 1–5 auth/tenant, quick mark/bulk, template and attendance payload tests must still pass.

## 6. Manual verification

Use two staging or isolated local test organisations:

1. Org A has `part` options and multiple member records; read its current field `_id`.
2. Change its label from `Part` to `Voice Part`; save and reload. Confirm `_id` and `name:part` unchanged.
3. Reopen existing members; labels change, values don't.
4. Create a Phase 5 filtered session: `Voice Part=Soprano`; API body still uses `field:part`, result roster unchanged.
5. An existing session template using `part` remains usable, not marked stale.
6. Attempt to edit a saved internal key/type or remove a saved field; UI prevents it and backend rejects forged requests.
7. Add a brand-new field; confirm it gets a persistent `_id` on reload.
8. Org B's same-named field has its own `_id` and label; switch A→B→A with no leakage.
9. Repeat at ~420px, light and dark mode; show helpful labels and locked-field copy.
10. Run one compatibility request from old frontend behavior (fields without `_id`) against the new staging backend and verify existing IDs persist.

## Verification

Use `.nvmrc` and existing Yarn version:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false
CI=true yarn build
```

Report exact Node/Yarn, test counts, warnings and TypeScript/build outcome. Add screenshot(s) or concise manual matrix to the PR. Return one PR into `staging`; do not merge/deploy.

## Out of scope

No real storage-key rename or migration, deleting/retiring persisted fields, member-value transformation, editable option identifiers, organisation feature toggles, global terminology system, CSV import, PWA, audit-history redesign, or production-data operations.

**Acceptance:** A display-only member-field rename changes the words officers see, while identifiers, member data, Phase 5 eligibility, templates and historical attendance all remain stable.

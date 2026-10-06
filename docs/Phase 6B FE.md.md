# Presence Pro — Frontend Phase 6B
## Organisation Terminology + Feature Visibility v1

### Goal
Let each organisation customise the words officers see and hide optional modules that are irrelevant to it.

Repo: `chineduknight/attendanceTracker_FE`  
Base: `staging`  
Return one PR into `staging`. Do not merge or deploy.

## Product invariants

**Terminology is display-only.** Labels must never become API identifiers. Keep storage keys, eligibility fields, query params, permission keys, routes and payload properties unchanged.

**Feature visibility is separate from RBAC.** A module appears only when visible for the org and permitted for the user. Permissions remain the authorization boundary.

## Types/defaults
Add organisation terminology and visibility types matching backend Phase 6B exactly:

```ts
interface OrganisationTerminology {
  memberSingular: string;
  memberPlural: string;
  attendanceSingular: string;
  attendancePlural: string;
  categorySingular: string;
  categoryPlural: string;
  subCategorySingular: string;
  subCategoryPlural: string;
  officerSingular: string;
  officerPlural: string;
}

interface OrganisationFeatureVisibility {
  finance: boolean;
  birthdays: boolean;
  analytics: boolean;
}
```

Defaults must preserve today's UI exactly: Member/Members, Attendance/Attendance, Category/Categories, Sub-category/Sub-categories, Officer/Officers, all three optional modules visible.

Extend `OrganisationType`, `EMPTY_ORG`, and `OrganisationSummary`. Old cached org objects without new fields must safely fall back to defaults.

## Shared helper
Create `src/helpers/organisationPresentation.ts` as the single presentation resolver.

It should provide effective terminology, effective visibility and `isFeatureVisible(org, feature)` or equivalent. Do not scatter `?.foo ?? true` across the app.

## Settings UI
Add two sections to Organisation Settings.

### Terminology
Editable values:
- Member singular / plural
- Attendance singular / plural
- Category singular / plural
- Sub-category singular / plural
- Officer singular / plural

Helper copy: `These labels change what officers see. They do not rename stored data or API fields.`

Validation: required, trim, 1–40 chars.

### Visible modules
Toggles:
- Finance
- Birthdays
- Analytics

Helper copy: `Hidden modules are removed from this organisation's navigation. Permissions are unchanged.`

`settings.view` sees read-only controls. `settings.manage` can edit.

## Settings payload
Extend `OrgSettingsForm` and `buildOrgUpdatePayload` so new FE saves send complete effective `terminology` and `featureVisibility` alongside name, image, collapse-by-day, max edit count and attendance statuses.

Do not send `permissions`, `isOwner`, or `roleName`.

After success, merge the returned organisation over the selected org while preserving RBAC annotations not returned by PUT. Navigation must update immediately.

## Navigation
Refactor `NAV_ACTIONS` so labels are presentation-aware while paths and permission keys remain static.

Examples:
- Add Member -> Add Student
- View Members -> View Students
- Create Attendance -> Create Session
- All Attendance -> All Sessions
- Officers & Roles -> Coordinators & Roles

Optional feature mapping:
- Finance -> `finance`
- Birthday -> `birthdays`
- Analytics -> `analytics`

Dashboard and NavDrawer must use the same resolver/filter logic.

## Hidden routes
Add a frontend-only feature guard for:
- `/finance` -> finance
- `/birthday` -> birthdays
- `/analytics` -> analytics
- `/analytics/member/:memberId` -> analytics

Direct navigation to a hidden feature redirects to Dashboard. A neutral toast such as `This feature is hidden for this organisation.` is fine. Do not describe it as a permission error.

RBAC must still guard visible routes.

## Terminology coverage
Do a focused sweep of primary organisation-domain UI text.

### Member terms
Use on Add/Update Member titles, Add/View Members navigation, list headings/counts, Member Analytics title, and ordinary user-facing member copy where practical.

Never alter `field.name`, member payload keys, query params, eligibility `rule.field`, React Query keys or permissions.

### Attendance terms
Use on Create/All/View Attendance titles and buttons and Attendance Analytics title. Do not alter configured attendance status labels.

### Category terms
Use on Category/Sub-category page headings and attendance details labels. Keep `categoryId`/`subCategoryId` unchanged.

### Officer terms
Use on Officers & Roles and primary officer/invite headings. Keep `officers.view`/`officers.manage` unchanged.

## Route titles
`PAGE_ROUTES` currently has static titles. Refactor title resolution so a title can be derived from selected-org terminology while route paths stay unchanged. `ProtectedLayout` should resolve the current label.

## Feature-disabled entry points
When analytics is hidden, also hide member analytics drill-down entry points. Hiding a module must never delete data or clear server-side state. Turning it back on restores entry points.

## Org switching
Test two orgs with different vocabulary/visibility. Switching A -> B -> A must immediately swap labels and navigation with no cached leakage. Hidden-route checks must use the current org.

## Tests
At minimum:
- helper defaults + partial legacy config
- exact settings payload
- settings read-only vs manage
- successful save updates global org
- default org preserves current actions
- terminology changes Add/View Member and Officers labels
- Finance/Birthday/Analytics visibility
- permissions still independently hide actions
- direct hidden routes redirect
- visible route without permission still uses RBAC denial
- route header titles use current org terminology
- category display changes without changing category IDs
- API/eligibility identifiers remain unchanged
- Org A/B switching isolation
- stale cached org fallback

## Manual verification
Use Org A:

```text
Member: Student / Students
Attendance: Session / Sessions
Category: Activity / Activities
Sub-category: Activity type / Activity types
Officer: Coordinator / Coordinators
Finance OFF
Birthdays OFF
Analytics ON
```

Verify:
1. Dashboard/drawer say Add Student / View Students.
2. Create Session / All Sessions use display terms.
3. Activity / Activity type appears in category-facing UI.
4. Coordinators & Roles appears.
5. Finance and Birthday are absent.
6. Analytics remains.
7. Pasting `/finance` or `/birthday` redirects to Dashboard.
8. Existing stored member values, attendance, category IDs, eligibility rules and permissions are unchanged.
9. Switch to default Org B and all default labels/modules return.
10. Switch back and Org A settings return.
11. Limited officer still obeys RBAC independent of visibility.
12. Check Dashboard, drawer and Settings around 420px in light/dark mode.

## Verification
Run:

```bash
npx tsc --noEmit
CI=true yarn test --watchAll=false
CI=true yarn build
```

Report exact test counts, TypeScript/build results, warnings, manual matrix and preview URL.

## Non-goals
No API/storage-key renaming, permission renaming, route renaming, backend feature blocking, core-module toggles, category hiding, custom arbitrary nav, i18n framework, CSV import, PWA/offline, or analytics redesign.

## Expected result
Presence Pro can look natural to a choir, school, club, care home or association while its data and security contracts remain stable.

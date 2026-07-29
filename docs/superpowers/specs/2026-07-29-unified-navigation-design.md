# Unified Navigation Design

## Problem

Navigation across the app is not actually a shared system — it's 16+ independent copies of similar-looking markup, plus one real shared component (`AppHeader`) that only two pages use.

Audit findings (full detail in PR/commit history, summarized here):

- **`AppHeader.tsx`** is the only component with logout, profile info, and an account menu. It's used on exactly 2 of 18 protected pages (`Dashboard`, `Organisations`). On the other 16 pages, a user cannot log out or see their account without navigating back to Dashboard first.
- The other 16 pages each hand-roll their own header: a `Flex bg="blue.500"` bar with a `Text` title, copy-pasted independently in every page file.
- **Back button** has four different implementations: `BackButton.tsx` (used in 3 pages), inline copies of the same markup (~9 pages), and one page (`UserModel.tsx`) using a completely different style with no icon. Back *destinations* are also inconsistent — some pages do `navigate(-1)`, others hardcode a route.
- **Color drift**: every header hardcodes Chakra's stock `blue.500`. The theme file declares brand colors (`#ffdd00` yellow, `#3f51b5` indigo) that nav never actually uses. `Birthday.tsx` breaks the convention entirely with `pink.400`.
- **Navigation is really the Dashboard button-grid** (`DASHBOARD_ACTIONS`, 9 permission-gated buttons). It's the de facto main menu, but it's page content — you can only reach other sections by first returning to Dashboard.
- Two dead pages (`Orglist.tsx`, `loginUser.tsx`) contain orphaned, older header markup and aren't reachable from any route.
- No hamburger menu, drawer, sidebar, or bottom nav exists anywhere today.

## Goal

Introduce one global header + hamburger drawer (profile card, full nav links, logout) present on every page, so:
- Logout and profile are reachable from anywhere, not just 2 pages.
- Users can jump between sections without returning to Dashboard first.
- The Dashboard button-grid is preserved as-is (visual landing page), not replaced — the drawer supplements it rather than removing existing design investment.

## Architecture

**`AppHeader`** (existing component, extended) becomes the single header used by all 18 protected pages, replacing each page's hand-rolled `Flex bg="blue.500"` bar. Layout: `[back chevron (conditional)] [hamburger icon] [page title]`.

Props: `title: string`, `showBack?: boolean` (default `true`; set to `false` only on `Dashboard` and `Organisations`, the two top-of-hierarchy pages).

No new router/layout wrapper is introduced — pages keep importing `AppHeader` directly (as `Dashboard`/`Organisations` already do today), now also passing `title`.

**`NavDrawer`** (new component): a Chakra `Drawer` (left placement), opened by the hamburger button inside `AppHeader`. Contents, top to bottom:
1. Profile card — avatar, name, email, role badge (same info `AppHeader`'s current dropdown shows)
2. Nav links list, permission-gated, sourced from the shared nav config (see below)
3. Divider
4. "Organisations" link, "Change password" (opens existing `ChangePasswordModal`), "Logout" (red)

## Shared nav config

`DASHBOARD_ACTIONS` moves out of `Dashboard.tsx` into `src/config/navActions.ts`. Both `Dashboard.tsx` (renders as the button grid) and `NavDrawer.tsx` (renders as a link list) import from this single source, so the permission-gating (`<Can perm=...>`) is defined once and both surfaces always agree on what's navigable for the current user's role.

## Back button behavior

`AppHeader` owns back navigation internally: clicking the chevron calls `navigate(-1)` (browser back), always — no per-page override, no hardcoded destinations. This replaces `BackButton.tsx` and every inline copy of it, and resolves `UserModel.tsx`'s outlier styling.

## Color

`theme.ts`'s `colors.primary` is updated to the blue already used everywhere (`blue.500`'s value), and `AppHeader` reads `theme.colors.primary` instead of hardcoding `blue.500`. No visual change for users; `Birthday.tsx`'s `pink.400` outlier is fixed automatically by migrating onto the shared component.

## Migration plan (incremental, page-by-page)

1. Build `AppHeader` v2 (hamburger + drawer + back chevron), `NavDrawer`, extract `navActions.ts`, update the theme token.
2. Wire into `Dashboard.tsx` and `Organisations.tsx` first (lowest risk — already using `AppHeader`).
3. Migrate the remaining 16 pages one at a time: swap hand-rolled header + inline back button for `<AppHeader title="..." />`, deleting the old markup per page as it's replaced.
4. Delete `BackButton.tsx` (superseded), `Orglist.tsx`, `loginUser.tsx` (confirmed unreferenced by any route or component).

## Out of scope

- No change to the Dashboard button-grid's visual design or its permission logic beyond relocating the config it reads from.
- No new "upgrade/subscribe/donate"-style CTA — nothing like that exists in this app today and none was requested.
- No IA/route changes — same 18 protected routes, same URLs.

## Verification

No automated navigation tests exist today. Plan is a manual pass after each page migration: confirm title, back chevron, and hamburger all render and function correctly. After full rollout, verify drawer permission-gating under at least two different roles, since drawer links are now reachable from every page instead of only Dashboard.

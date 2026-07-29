# Unified Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 16+ independent hand-rolled page headers and 4 different "Back" button implementations with one route-driven header (hamburger + back chevron + title) and a global nav drawer (profile, permission-gated nav links, logout) present on every protected page.

**Architecture:** A new `ProtectedLayout` route wraps all protected pages via React Router's layout-route pattern (`element` + `children` + `<Outlet />`). Each route's `title`/`showBack` lives in a config array (`PAGE_ROUTES`) that `ProtectedLayout` matches against the current URL and feeds into `AppHeader`. `AppHeader` renders the header bar and owns a `NavDrawer` (Chakra `Drawer`) opened by its hamburger button. `NAV_ACTIONS` (renamed from `DASHBOARD_ACTIONS`) becomes the single source both the Dashboard button-grid and the drawer's link list read from.

**Tech Stack:** React 18 + TypeScript, Chakra UI, React Router DOM 6.3 (`useRoutes`, layout routes, `matchPath`), Zustand (`zStore`), CRA + Jest + `@testing-library/react`.

## Global Constraints

- No IA/route changes: the same 20 route paths (18 distinct page components) resolve to the same URLs as before.
- No new dependencies — `Drawer`, `IconButton`, `useDisclosure` all come from the `@chakra-ui/react` already in use; hamburger icon uses `FaBars` from `react-icons/fa` (the icon set already used in 21+ files), back chevron reuses `FaArrowCircleLeft` (already the app's existing back-icon convention).
- `theme.colors.primary` (currently `"#ffdd00"`, confirmed unused anywhere in `src/`) is repointed to `"#3182CE"` (Chakra's `blue.500` value, the color every header already uses) — zero visual change, just gives nav a real token to reference instead of hardcoding `blue.500`.
- Standalone "Back" buttons positioned directly under a page header are deleted (the header chevron replaces them). Submit/Cancel button *pairs* embedded inside a form (`MarkAttendance`'s bottom Cancel button, `UserModel`'s bottom Cancel button) are **left alone** — they're form actions, not page-header navigation, and are out of scope.
- Every deletion that removes the only remaining `navigate(...)` call in a file must also remove the now-unused `useNavigate` import/declaration (and any icon import that becomes unused), so the app still typechecks and lints clean.

---

## Task 1: Add the brand color token

**Files:**
- Modify: `src/styles/theme.ts:13-16`

**Interfaces:**
- Produces: `theme.colors.primary === "#3182CE"`, consumed by `AppHeader` (Task 4) and `NavDrawer` (Task 3) via `bg="primary"`.

- [ ] **Step 1: Update the color token**

In `src/styles/theme.ts`, change:
```ts
  colors: {
    primary: "#ffdd00",
    secondary: "#2FA07224",
  },
```
to:
```ts
  colors: {
    primary: "#3182CE", // blue.500 — the color every header already uses
    secondary: "#2FA07224",
  },
```

- [ ] **Step 2: Verify nothing else referenced the old yellow**

Run: `grep -rn 'colors.primary\|bg="primary"\|color="primary"' src/`
Expected: only the `theme.ts` definition itself and (after Tasks 3-4) `AppHeader.tsx`/`NavDrawer.tsx` — nothing currently in the codebase renders yellow via this token, so this is a safe rename in place.

- [ ] **Step 3: Commit**

```bash
git add src/styles/theme.ts
git commit -m "feat(theme): point primary color token at the app's actual brand blue"
```

---

## Task 2: Extract shared nav config

**Files:**
- Create: `src/config/navActions.ts`
- Modify: `src/pages/Dashboard.tsx:1-46`

**Interfaces:**
- Produces: `NAV_ACTIONS: NavAction[]` where `NavAction = { label: string; icon: IconType; colorScheme: string; path: string; perm: PermissionKey }`. Consumed by `Dashboard.tsx` (this task) and `NavDrawer.tsx` (Task 3).

- [ ] **Step 1: Create `src/config/navActions.ts`**

```ts
import { IconType } from "react-icons";
import {
  FaUserPlus,
  FaCalendarPlus,
  FaClipboardList,
  FaEye,
  FaChartBar,
  FaBirthdayCake,
  FaMoneyBillWave,
  FaUserShield,
  FaCog,
} from "react-icons/fa";
import { PROTECTED_PATHS } from "routes/pagePath";
import { PermissionKey } from "rbac/permissions";

export type NavAction = {
  label: string;
  icon: IconType;
  colorScheme: string;
  path: string;
  perm: PermissionKey;
};

export const NAV_ACTIONS: NavAction[] = [
  { label: "Add Member", icon: FaUserPlus, colorScheme: "teal", path: PROTECTED_PATHS.ADD_MEMBER, perm: "members.view" },
  { label: "View Members", icon: FaEye, colorScheme: "blue", path: PROTECTED_PATHS.VIEW_MEMBER, perm: "members.view" },
  { label: "Create Attendance", icon: FaCalendarPlus, colorScheme: "yellow", path: PROTECTED_PATHS.CREATE_ATTENDANCE, perm: "attendance.view" },
  { label: "All Attendance", icon: FaClipboardList, colorScheme: "purple", path: PROTECTED_PATHS.ALL_ATTENDANCE, perm: "attendance.view" },
  { label: "Analytics", icon: FaChartBar, colorScheme: "orange", path: PROTECTED_PATHS.ANALYTICS, perm: "attendance.view" },
  { label: "Birthday", icon: FaBirthdayCake, colorScheme: "pink", path: PROTECTED_PATHS.BIRTHDAY, perm: "members.view" },
  { label: "Finance", icon: FaMoneyBillWave, colorScheme: "green", path: PROTECTED_PATHS.FINANCE, perm: "finance.view" },
  { label: "Officers & Roles", icon: FaUserShield, colorScheme: "blue", path: PROTECTED_PATHS.OFFICERS_ROLES, perm: "officers.view" },
  { label: "Settings", icon: FaCog, colorScheme: "gray", path: PROTECTED_PATHS.SETTINGS, perm: "settings.view" },
];
```

- [ ] **Step 2: Update `Dashboard.tsx` to import from the shared config**

Remove the local type + array (current lines 8-18 icon imports, 21 `IconType` import, 28-46 `DashboardAction`/`DASHBOARD_ACTIONS`):
```tsx
import {
  FaUserPlus,
  FaCalendarPlus,
  FaClipboardList,
  FaEye,
  FaChartBar,
  FaBirthdayCake,
  FaMoneyBillWave,
  FaUserShield,
  FaCog,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import { IconType } from "react-icons";
import useGlobalStore from "zStore";
import AppHeader from "components/AppHeader";
import { Can } from "rbac/Can";
import { PermissionKey } from "rbac/permissions";
import { useSyncSelectedOrg } from "rbac/useSyncSelectedOrg";

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
  { label: "Settings", icon: FaCog, colorScheme: "gray", path: PROTECTED_PATHS.SETTINGS, perm: "settings.view" },
];
```
Replace with:
```tsx
import { useNavigate } from "react-router-dom";
import useGlobalStore from "zStore";
import { Can } from "rbac/Can";
import { useSyncSelectedOrg } from "rbac/useSyncSelectedOrg";
import { NAV_ACTIONS } from "config/navActions";
```
(Note: `AppHeader` import is dropped here too — that's handled in Task 8, don't remove it yet if doing this task standalone; if doing Tasks 2 and 8 together, drop it now.)

Then update the render loop (was `DASHBOARD_ACTIONS.map(...)`) to `NAV_ACTIONS.map(...)` — same destructuring, same JSX, just the source array name changes:
```tsx
        {NAV_ACTIONS.map(({ label, icon: Icon, colorScheme, path, perm }) => (
          <Can key={label} perm={perm}>
            <Button
              leftIcon={<Icon />}
              colorScheme={colorScheme}
              variant="outline"
              onClick={() => navigate(path)}
            >
              {label}
            </Button>
          </Can>
        ))}
```

- [ ] **Step 3: Run the app's test suite to confirm nothing broke**

Run: `npm test -- --watchAll=false`
Expected: PASS (no existing test asserts on `DASHBOARD_ACTIONS` by name; `App.test.tsx` smoke-renders the whole app and should still pass since the grid's rendered output is unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/config/navActions.ts src/pages/Dashboard.tsx
git commit -m "refactor: extract Dashboard's nav actions into a shared config"
```

---

## Task 3: Build `NavDrawer`

**Files:**
- Create: `src/components/NavDrawer.tsx`
- Test: `src/components/NavDrawer.test.tsx`

**Interfaces:**
- Consumes: `NAV_ACTIONS` from `config/navActions` (Task 2); `useGlobalStore`, `EMPTY_USER`, `EMPTY_ORG` from `zStore`; `Can` from `rbac/Can`; `ChangePasswordModal` from `components/auth/ChangePasswordModal` (existing, props `{ isOpen: boolean; onClose: () => void }`).
- Produces: `NavDrawer({ isOpen: boolean; onClose: () => void })` — a Chakra `Drawer`. Consumed by `AppHeader` (Task 4).

- [ ] **Step 1: Write the component**

```tsx
import {
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerBody,
  Box,
  Text,
  Avatar,
  Badge,
  VStack,
  Button,
  Divider,
  useDisclosure,
} from "@chakra-ui/react";
import { FaArrowLeft, FaKey, FaSignOutAlt } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { EMPTY_USER, EMPTY_ORG } from "zStore";
import { Can } from "rbac/Can";
import { NAV_ACTIONS } from "config/navActions";
import ChangePasswordModal from "components/auth/ChangePasswordModal";

interface NavDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const NavDrawer = ({ isOpen, onClose }: NavDrawerProps) => {
  const navigate = useNavigate();
  const changePassword = useDisclosure();
  const [user, organisation, setUser, updateOrganisation] = useGlobalStore((s) => [
    s.user,
    s.organisation,
    s.setUser,
    s.updateOrganisation,
  ]);

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  const handleLogout = () => {
    onClose();
    setUser(EMPTY_USER);
    updateOrganisation(EMPTY_ORG);
  };

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} placement="left">
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerBody p={0}>
            <Box bg="primary" color="#fff" p={4} pt={10}>
              <Avatar size="md" name={user.username} mb={2} />
              <Text fontWeight="bold" noOfLines={1}>
                {user.username || "Account"}
              </Text>
              {user.email && (
                <Text fontSize="sm" noOfLines={1}>
                  {user.email}
                </Text>
              )}
              {organisation.roleName && (
                <Badge mt={2} colorScheme="blue">
                  {organisation.roleName}
                </Badge>
              )}
            </Box>

            <VStack align="stretch" spacing={0} py={2}>
              {NAV_ACTIONS.map(({ label, icon: Icon, path, perm }) => (
                <Can key={label} perm={perm}>
                  <Button
                    variant="ghost"
                    justifyContent="flex-start"
                    leftIcon={<Icon />}
                    borderRadius={0}
                    onClick={() => goTo(path)}
                  >
                    {label}
                  </Button>
                </Can>
              ))}
            </VStack>

            <Divider />

            <VStack align="stretch" spacing={0} py={2}>
              <Button
                variant="ghost"
                justifyContent="flex-start"
                leftIcon={<FaArrowLeft />}
                borderRadius={0}
                onClick={() => goTo(PROTECTED_PATHS.ALL_ORG)}
              >
                Organisations
              </Button>
              <Button
                variant="ghost"
                justifyContent="flex-start"
                leftIcon={<FaKey />}
                borderRadius={0}
                onClick={changePassword.onOpen}
              >
                Change password
              </Button>
              <Button
                variant="ghost"
                justifyContent="flex-start"
                leftIcon={<FaSignOutAlt />}
                borderRadius={0}
                color="red.500"
                onClick={handleLogout}
              >
                Logout
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <ChangePasswordModal
        isOpen={changePassword.isOpen}
        onClose={changePassword.onClose}
      />
    </>
  );
};

export default NavDrawer;
```

- [ ] **Step 2: Write the test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useGlobalStore, { EMPTY_ORG, EMPTY_USER } from "zStore";
import NavDrawer from "components/NavDrawer";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const setState = (over: { organisation?: Partial<typeof EMPTY_ORG> }) =>
  useGlobalStore.setState({
    user: { ...EMPTY_USER, username: "Ada Lovelace", email: "ada@example.com" },
    organisation: { ...EMPTY_ORG, ...over.organisation },
  });

const renderDrawer = (onClose = jest.fn()) =>
  render(
    <MemoryRouter>
      <NavDrawer isOpen onClose={onClose} />
    </MemoryRouter>
  );

describe("<NavDrawer>", () => {
  it("shows the signed-in user's profile info", () => {
    setState({});
    renderDrawer();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  });

  it("only shows nav links the user has permission for", () => {
    setState({ organisation: { permissions: ["finance.view"] } });
    renderDrawer();
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.queryByText("Officers & Roles")).not.toBeInTheDocument();
  });

  it("logs out and closes the drawer on Logout click", () => {
    setState({});
    const onClose = jest.fn();
    renderDrawer(onClose);
    fireEvent.click(screen.getByText("Logout"));
    expect(useGlobalStore.getState().user).toEqual(EMPTY_USER);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- NavDrawer --watchAll=false`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/NavDrawer.tsx src/components/NavDrawer.test.tsx
git commit -m "feat: add NavDrawer with profile, permission-gated nav links, and logout"
```

---

## Task 4: Rebuild `AppHeader`

**Files:**
- Modify: `src/components/AppHeader.tsx` (full rewrite)
- Test: `src/components/AppHeader.test.tsx`

**Interfaces:**
- Consumes: `NavDrawer` from `components/NavDrawer` (Task 3).
- Produces: `AppHeader({ title: string; showBack?: boolean })` — **breaking change**: the old `inOrg?: boolean` prop is removed. Consumed by `ProtectedLayout` (Task 6). (Task 8 removes the old direct `<AppHeader inOrg />` / `<AppHeader />` calls from `Dashboard.tsx` / `Organisations.tsx` so nothing is left passing the old prop.)

- [ ] **Step 1: Replace the entire file**

```tsx
import { Flex, Text, IconButton, useDisclosure } from "@chakra-ui/react";
import { FaBars, FaArrowCircleLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import NavDrawer from "components/NavDrawer";

interface AppHeaderProps {
  title: string;
  showBack?: boolean;
}

const AppHeader = ({ title, showBack = true }: AppHeaderProps) => {
  const navigate = useNavigate();
  const drawer = useDisclosure();

  return (
    <Flex bg="primary" alignItems="center" p="4" gap={2}>
      {showBack && (
        <IconButton
          aria-label="Back"
          icon={<FaArrowCircleLeft />}
          onClick={() => navigate(-1)}
          variant="ghost"
          color="#fff"
          _hover={{ bg: "blue.600" }}
          size="sm"
        />
      )}
      <IconButton
        aria-label="Open menu"
        icon={<FaBars />}
        onClick={drawer.onOpen}
        variant="ghost"
        color="#fff"
        _hover={{ bg: "blue.600" }}
        size="sm"
      />
      <Text fontWeight="bold" color="#fff">
        {title}
      </Text>
      <NavDrawer isOpen={drawer.isOpen} onClose={drawer.onClose} />
    </Flex>
  );
};

export default AppHeader;
```

- [ ] **Step 2: Write the test**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AppHeader from "components/AppHeader";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe("<AppHeader>", () => {
  it("renders the given title", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Finance" />
      </MemoryRouter>
    );
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("hides the back button when showBack is false", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Dashboard" showBack={false} />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText("Back")).not.toBeInTheDocument();
  });

  it("shows the back button by default", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Category" />
      </MemoryRouter>
    );
    expect(screen.getByLabelText("Back")).toBeInTheDocument();
  });

  it("opens the nav drawer when the hamburger is clicked", () => {
    render(
      <MemoryRouter>
        <AppHeader title="Category" />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByText("Change password")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- AppHeader --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/AppHeader.tsx src/components/AppHeader.test.tsx
git commit -m "feat: rebuild AppHeader as a route-driven title/back/hamburger bar"
```

---

## Task 5: Extract `protectedRouteConfig.tsx`

**Files:**
- Create: `src/routes/protectedRouteConfig.tsx`

**Interfaces:**
- Produces: `PAGE_ROUTES: PageRouteConfig[]` where `PageRouteConfig = { path: string; element: JSX.Element; title: string; showBack?: boolean }`. Consumed by `ProtectedLayout` (Task 6) and `protectedRoutes.tsx` (Task 7).

- [ ] **Step 1: Create the file**

```tsx
import WithSuspense from "components/HOC/WithSuspense";
import { lazy } from "react";
import { PROTECTED_PATHS } from "./pagePath";

const Dashboard = WithSuspense(lazy(() => import("pages/Dashboard")));
const UserModel = WithSuspense(lazy(() => import("pages/UserModel")));
const Category = WithSuspense(lazy(() => import("pages/Category")));
const SubCategory = WithSuspense(lazy(() => import("pages/SubCategory")));
const MarkAttendance = WithSuspense(lazy(() => import("pages/MarkAttendance")));
const CreateAttendance = WithSuspense(
  lazy(() => import("pages/CreateAttendance"))
);
const AddMember = WithSuspense(lazy(() => import("pages/AddMember")));
const Attendance = WithSuspense(lazy(() => import("pages/ViewAttendance")));
const OrgList = WithSuspense(lazy(() => import("pages/Organisations")));
const AllAttendance = WithSuspense(lazy(() => import("pages/AllAttendance")));
const ViewMembers = WithSuspense(lazy(() => import("pages/ViewMembers")));
const Analytics = WithSuspense(lazy(() => import("pages/Analytics")));
const MemberAnalytics = WithSuspense(lazy(() => import("pages/MemberAnalytics")));
const Birthday = WithSuspense(lazy(() => import("pages/Birthday")));
const Finance = WithSuspense(lazy(() => import("pages/Finance")));
const OfficersRoles = WithSuspense(lazy(() => import("pages/OfficersRoles")));
const AddOrganisation = WithSuspense(
  lazy(() => import("pages/AddOrganisation"))
);
const OrganisationSettings = WithSuspense(
  lazy(() => import("pages/OrganisationSettings"))
);

const {
  DASHBOARD,
  ADD_ORG,
  ALL_ORG,
  USER_MODEL,
  CATEGORY,
  SUB_CATEGORY,
  ADD_MEMBER,
  UPDATE_MEMBER,
  CREATE_ATTENDANCE,
  MARK_ATTENANCE,
  ATTENDANCE,
  ALL_ATTENDANCE,
  VIEW_MEMBER,
  UPDATE_ATTENANCE,
  ANALYTICS,
  MEMBER_ANALYTICS,
  BIRTHDAY,
  FINANCE,
  OFFICERS_ROLES,
  SETTINGS,
} = PROTECTED_PATHS;

export type PageRouteConfig = {
  path: string;
  element: JSX.Element;
  title: string;
  showBack?: boolean;
};

export const PAGE_ROUTES: PageRouteConfig[] = [
  { path: ALL_ORG, element: <OrgList />, title: "Organisations", showBack: false },
  { path: DASHBOARD, element: <Dashboard />, title: "Dashboard", showBack: false },
  { path: ADD_ORG, element: <AddOrganisation />, title: "New Organisation" },
  { path: USER_MODEL, element: <UserModel />, title: "User Model" },
  { path: CATEGORY, element: <Category />, title: "Create Category" },
  { path: SUB_CATEGORY, element: <SubCategory />, title: "Create Sub-Category" },
  { path: ADD_MEMBER, element: <AddMember />, title: "Add Member" },
  { path: UPDATE_MEMBER, element: <AddMember />, title: "Update Member" },
  { path: MARK_ATTENANCE, element: <MarkAttendance />, title: "Mark Attendance" },
  { path: UPDATE_ATTENANCE, element: <MarkAttendance />, title: "Mark Attendance" },
  { path: CREATE_ATTENDANCE, element: <CreateAttendance />, title: "Create Attendance" },
  { path: ATTENDANCE, element: <Attendance />, title: "View Attendance" },
  { path: ALL_ATTENDANCE, element: <AllAttendance />, title: "All Attendance" },
  { path: VIEW_MEMBER, element: <ViewMembers />, title: "View Members" },
  { path: ANALYTICS, element: <Analytics />, title: "Attendance Analytics" },
  { path: MEMBER_ANALYTICS, element: <MemberAnalytics />, title: "Member Analytics" },
  { path: BIRTHDAY, element: <Birthday />, title: "Birthdays" },
  { path: FINANCE, element: <Finance />, title: "Finance" },
  { path: OFFICERS_ROLES, element: <OfficersRoles />, title: "Officers & Roles" },
  { path: SETTINGS, element: <OrganisationSettings />, title: "Organisation Settings" },
];
```

Note: `ALL_ATTENDANCE`'s title is set to `"All Attendance"` — the current page (`AllAttendance.tsx:82`) actually renders the literal text `"Attendance Tracker"` in its header, a pre-existing mislabel. This corrects it as part of unifying titles.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (this file isn't imported anywhere yet, so it should typecheck in isolation).

- [ ] **Step 3: Commit**

```bash
git add src/routes/protectedRouteConfig.tsx
git commit -m "feat: extract protected route config with per-route title/showBack"
```

---

## Task 6: Build `ProtectedLayout`

**Files:**
- Create: `src/components/ProtectedLayout.tsx`
- Test: `src/components/ProtectedLayout.test.tsx`

**Interfaces:**
- Consumes: `PAGE_ROUTES` from `routes/protectedRouteConfig` (Task 5); `AppHeader` from `components/AppHeader` (Task 4).
- Produces: `ProtectedLayout` — a layout route component rendering `<AppHeader />` + `<Outlet />`. Consumed by `protectedRoutes.tsx` (Task 7).

- [ ] **Step 1: Write the component**

```tsx
import { Outlet, useLocation, matchPath } from "react-router-dom";
import AppHeader from "components/AppHeader";
import { PAGE_ROUTES } from "routes/protectedRouteConfig";

const ProtectedLayout = () => {
  const location = useLocation();
  const current = PAGE_ROUTES.find((route) =>
    matchPath({ path: route.path, end: true }, location.pathname)
  );

  return (
    <>
      <AppHeader
        title={current?.title ?? "Attendance Tracker"}
        showBack={current?.showBack ?? true}
      />
      <Outlet />
    </>
  );
};

export default ProtectedLayout;
```

- [ ] **Step 2: Write the test**

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedLayout from "components/ProtectedLayout";

jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

describe("<ProtectedLayout>", () => {
  it("shows the matched route's title and its child content", () => {
    render(
      <MemoryRouter initialEntries={["/finance"]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/finance" element={<div>finance page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Finance")).toBeInTheDocument();
    expect(screen.getByText("finance page content")).toBeInTheDocument();
  });

  it("resolves titles for dynamic route segments", () => {
    render(
      <MemoryRouter initialEntries={["/attendance/abc123"]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/attendance/:id" element={<div>attendance detail</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("View Attendance")).toBeInTheDocument();
  });

  it("hides the back button on Dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<div>dashboard content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByLabelText("Back")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- ProtectedLayout --watchAll=false`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/ProtectedLayout.tsx src/components/ProtectedLayout.test.tsx
git commit -m "feat: add ProtectedLayout to render AppHeader from route config"
```

---

## Task 7: Wire `protectedRoutes.tsx` to the new layout

**Files:**
- Modify: `src/routes/protectedRoutes.tsx` (full rewrite)

**Interfaces:**
- Consumes: `PAGE_ROUTES` from `routes/protectedRouteConfig` (Task 5); `ProtectedLayout` from `components/ProtectedLayout` (Task 6).

- [ ] **Step 1: Replace the entire file**

```tsx
import { Navigate } from "react-router-dom";
import { PROTECTED_PATHS, PUBLIC_PATHS } from "./pagePath";
import { PAGE_ROUTES } from "./protectedRouteConfig";
import ProtectedLayout from "components/ProtectedLayout";

const PROTECTED_ROUTES = [
  {
    element: <ProtectedLayout />,
    children: PAGE_ROUTES,
  },
  { path: "/", element: <Navigate to={PROTECTED_PATHS.ALL_ORG} /> },
  // this enables you not to access the public routes when logged in
  ...Object.values(PUBLIC_PATHS).map((route) => {
    return {
      path: route,
      element: <Navigate to="/" />,
    };
  }),
  { path: "*", element: <div>Page not found</div> },
];

export default PROTECTED_ROUTES;
```

- [ ] **Step 2: Smoke-test the whole app**

Run: `npm test -- App.test --watchAll=false`
Expected: PASS — `App.test.tsx` renders `<App />` end-to-end, which now resolves through the nested `ProtectedLayout` route tree.

- [ ] **Step 3: Manually verify one dynamic route**

Run: `npm start`, log in, navigate to a URL like `/attendance/<some-id>` and to `/dashboard`.
Expected: `/dashboard` shows header title "Dashboard" with no back button; `/attendance/<id>` shows header title "View Attendance" with a back button — confirming `matchPath` resolves dynamic segments correctly through the real router (not just the isolated `ProtectedLayout` test).

- [ ] **Step 4: Commit**

```bash
git add src/routes/protectedRoutes.tsx
git commit -m "feat: nest protected routes under ProtectedLayout"
```

---

## Task 8: Remove the old direct `AppHeader` usages

**Files:**
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/pages/Organisations.tsx`

**Interfaces:**
- Consumes: nothing new — this just stops these two pages from double-rendering a header now that `ProtectedLayout` renders one for every route.

- [ ] **Step 1: Remove from `Dashboard.tsx`**

Remove the import (if not already removed in Task 2):
```tsx
import AppHeader from "components/AppHeader";
```
Remove the render call:
```tsx
      <AppHeader inOrg />
```
(the `<Box minH={"100vh"} ...>` wrapper stays; the `<Heading>` showing the org name stays — only the `AppHeader` line goes).

- [ ] **Step 2: Remove from `Organisations.tsx`**

Remove the import:
```tsx
import AppHeader from "components/AppHeader";
```
Remove the render call:
```tsx
      <AppHeader />
```
(`<SetEmailModal />` stays — it's unrelated to the header).

- [ ] **Step 3: Verify no duplicate header renders**

Run: `npm start`, log in, visit `/organisations` and `/dashboard`.
Expected: exactly one header bar on each page (previously there would now be two — one from `ProtectedLayout`, one from the page's own `<AppHeader />` call — if this step were skipped).

- [ ] **Step 4: Run the full test suite**

Run: `npm test -- --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Organisations.tsx
git commit -m "refactor: stop rendering AppHeader directly now that ProtectedLayout owns it"
```

---

## Task 9: Migrate `Category.tsx`

**Files:**
- Modify: `src/pages/Category.tsx`

- [ ] **Step 1: Remove the header block, the BackButton, and their now-unused imports**

Remove import:
```tsx
import BackButton from "components/BackButton";
```
Remove the `navigate` declaration and its `useNavigate` import (this file's only `navigate(...)` call is the one being deleted):
```tsx
import { useNavigate } from "react-router-dom";
```
```tsx
  const navigate = useNavigate();
```
Remove the header + back button block:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Create Category
        </Text>
      </Flex>

      <BackButton handleClick={() => navigate(-1)} />

```
so the return starts directly with:
```tsx
  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex
        align={"center"}
        justify={"center"}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (no leftover references to `navigate`, `BackButton`, or `useNavigate`).

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/category`.
Expected: header shows hamburger + back chevron + "Create Category"; no duplicate header/back button below it; form still submits.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Category.tsx
git commit -m "refactor(nav): migrate Category page onto the shared AppHeader"
```

---

## Task 10: Migrate `SubCategory.tsx`

**Files:**
- Modify: `src/pages/SubCategory.tsx`

- [ ] **Step 1: Remove the header block, the BackButton, and their now-unused imports**

Remove import:
```tsx
import BackButton from "components/BackButton";
```
Remove the `useNavigate` import and `navigate` declaration (only usage in this file is the deleted back button):
```tsx
import { useNavigate } from "react-router-dom";
```
```tsx
  const navigate = useNavigate();
```
Remove the header + back button block:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Create Sub-Category
        </Text>
      </Flex>
      <BackButton handleClick={() => navigate(-1)} />
```
so the return goes directly from `<Box minH={"100vh"} bg={"gray.50"}>` to `<Flex align={"center"} justify={"center"} bg="gray.50">`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/sub-category`.
Expected: header shows "Create Sub-Category" with back chevron; form still works.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SubCategory.tsx
git commit -m "refactor(nav): migrate SubCategory page onto the shared AppHeader"
```

---

## Task 11: Migrate `OfficersRoles.tsx`

**Files:**
- Modify: `src/pages/OfficersRoles.tsx`

- [ ] **Step 1: Remove the header block, the BackButton, and their now-unused imports**

Remove import:
```tsx
import BackButton from "components/BackButton";
```
Remove the `useNavigate` import and `navigate` declaration:
```tsx
import { useNavigate } from "react-router-dom";
```
```tsx
  const navigate = useNavigate();
```
Remove the header + back button:
```tsx
        <Flex bg="blue.500" justifyContent="space-between" alignItems="center" p="4">
          <Text fontWeight="bold" color="#fff">Officers &amp; Roles</Text>
        </Flex>
        <BackButton handleClick={() => navigate(-1)} />
```
so `<Box minH="100vh" bg={useColorModeValue("gray.50", "gray.800")}>` is directly followed by `<Box p={4}>`.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/officers-roles`.
Expected: header shows "Officers & Roles" with back chevron; tabs still work.

- [ ] **Step 4: Commit**

```bash
git add src/pages/OfficersRoles.tsx
git commit -m "refactor(nav): migrate OfficersRoles page onto the shared AppHeader"
```

---

## Task 12: Migrate `Finance.tsx`

**Files:**
- Modify: `src/pages/Finance.tsx`

- [ ] **Step 1: Remove the header block, the BackButton, and their now-unused imports**

Remove import:
```tsx
import BackButton from "components/BackButton";
```
Remove the `useNavigate` import and `navigate` declaration (this file's only `navigate(...)` call is the one being deleted):
```tsx
import { useNavigate } from "react-router-dom";
```
```tsx
  const navigate = useNavigate();
```
Remove the header + back button block:
```tsx
      <Flex bg="blue.500" justifyContent="space-between" alignItems="center" p="4">
        <Text fontWeight="bold" color="#fff">
          Finance
        </Text>
      </Flex>

      <BackButton handleClick={() => navigate(-1)} />

```
so `<Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>` is directly followed by `<Box p={4}>`.

- [ ] **Step 2: Run the existing Finance test**

Run: `npm test -- Finance --watchAll=false`
Expected: PASS — `Finance.test.tsx` only asserts the four tab labels render, which is unaffected by the header change.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Finance.tsx
git commit -m "refactor(nav): migrate Finance page onto the shared AppHeader"
```

---

## Task 13: Migrate `AddMember.tsx`

**Files:**
- Modify: `src/pages/AddMember.tsx`

- [ ] **Step 1: Remove the header block and the standalone Back button**

Remove `FaArrowCircleLeft` from its import (keep the other icons on that line):
```tsx
import { FaArrowCircleLeft, FaPlusSquare, FaTrash } from "react-icons/fa";
```
becomes:
```tsx
import { FaPlusSquare, FaTrash } from "react-icons/fa";
```
Remove the header + standalone Back button (keep the "Update Model" button — it's a real navigation action, not a duplicate of the header's back chevron):
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff" fontWeight="bold">
          {isUpdating ? "Update Member" : "Add Member"}
        </Text>
      </Flex>
      <Flex justify="space-between" alignItems="center" mx="6" mt="4">
        <Button
          variant="logout"
          colorScheme="blue"
          onClick={() => navigate(-1)}
          leftIcon={<FaArrowCircleLeft />}
        >
          Back
        </Button>
        {!isGettingMembers && membersModel.length !== 0 && (
          <Button
            leftIcon={<FaPlusSquare />}
            colorScheme="blue"
            variant="outline"
            onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}
          >
            Update Model
          </Button>
        )}
      </Flex>
```
becomes:
```tsx
      <Flex justify="flex-end" alignItems="center" mx="6" mt="4">
        {!isGettingMembers && membersModel.length !== 0 && (
          <Button
            leftIcon={<FaPlusSquare />}
            colorScheme="blue"
            variant="outline"
            onClick={() => navigate(PROTECTED_PATHS.USER_MODEL)}
          >
            Update Model
          </Button>
        )}
      </Flex>
```
(`justify="space-between"` becomes `justify="flex-end"` since there's now only one item in the row; `navigate`/`useNavigate` stay — this file has 5 other `navigate(...)` calls).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/member/add` and to `/member/update/<id>`.
Expected: header shows "Add Member" / "Update Member" respectively (from `PAGE_ROUTES`); "Update Model" button (when members model exists) still right-aligned and functional.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AddMember.tsx
git commit -m "refactor(nav): migrate AddMember page onto the shared AppHeader"
```

---

## Task 14: Migrate `MarkAttendance.tsx`

**Files:**
- Modify: `src/pages/MarkAttendance.tsx`

- [ ] **Step 1: Remove only the header block**

Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Mark Attendance
        </Text>
      </Flex>
```
so `<Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>` is directly followed by `<Container>`.

**Do not touch** the bottom "Cancel" button (`onClick={() => navigate(-1)}`, styled `variant="logout"`, full-width) — it's a Submit/Cancel form-action pair, not a header duplicate, and stays exactly as-is per the Global Constraints. `navigate`/`useNavigate` stay since that button and one other `navigate(PROTECTED_PATHS.ALL_ATTENDANCE)` call remain.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/mark-attendance`.
Expected: header shows "Mark Attendance" with back chevron; the bottom Cancel button next to Submit still present and functional.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MarkAttendance.tsx
git commit -m "refactor(nav): migrate MarkAttendance page onto the shared AppHeader"
```

---

## Task 15: Migrate `CreateAttendance.tsx`

**Files:**
- Modify: `src/pages/CreateAttendance.tsx`

- [ ] **Step 1: Remove the header block and the standalone Back button**

Remove import (this is its only usage in the file):
```tsx
import { FaArrowCircleLeft } from "react-icons/fa";
```
Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Create Attendance
        </Text>
      </Flex>
      <Button
        variant="logout"
        colorScheme="blue"
        onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
        mr={2}
        leftIcon={<FaArrowCircleLeft />}
        m="2"
      >
        Back
      </Button>
```
so `<Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>` is directly followed by the `<Flex>` containing "Add Category" / "Add Sub Category". `navigate`/`useNavigate` stay (3 other `navigate(...)` calls remain in this file).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/create-attendance`.
Expected: header shows "Create Attendance" with back chevron; "Add Category"/"Add Sub Category" buttons still present.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CreateAttendance.tsx
git commit -m "refactor(nav): migrate CreateAttendance page onto the shared AppHeader"
```

---

## Task 16: Migrate `ViewAttendance.tsx`

**Files:**
- Modify: `src/pages/ViewAttendance.tsx`

- [ ] **Step 1: Remove the header block**

Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
      >
        <Text fontWeight="bold" color="#fff">
          View Attendance
        </Text>
      </Flex>
```
(exact original props were `justifyContent="space-between" alignItems="center" p="4"` — remove the whole `Flex` including its `p="4"`) so `<Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>` is directly followed by `<Container>`.

- [ ] **Step 2: Remove just the standalone Back button, keeping its sibling actions**

Inside the `<Flex mt="4" justifyContent="space-between">` block, remove only the Back button:
```tsx
              <Button
                variant="logout"
                colorScheme="blue"
                onClick={() => navigate(-1)}
                leftIcon={<FaArrowCircleLeft />}
              >
                Back
              </Button>
```
leaving the `<Flex gap={2}>` (Share / Excel export buttons) as the sole remaining child — change the now-single-child `<Flex mt="4" justifyContent="space-between">` to `<Flex mt="4" justifyContent="flex-end">` since there's no longer a left-hand item to space between.

Remove `FaArrowCircleLeft` from its import (keep the other icons):
```tsx
import { FaArrowCircleLeft, FaFileExcel, FaShareAlt, FaTrash } from "react-icons/fa";
```
becomes:
```tsx
import { FaFileExcel, FaShareAlt, FaTrash } from "react-icons/fa";
```
`navigate`/`useNavigate` stay (one other `navigate(PROTECTED_PATHS.ALL_ATTENDANCE)` call remains).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm start`, navigate to `/attendance/<id>`.
Expected: header shows "View Attendance" with back chevron; Share/Excel export buttons still present, now right-aligned.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ViewAttendance.tsx
git commit -m "refactor(nav): migrate ViewAttendance page onto the shared AppHeader"
```

---

## Task 17: Migrate `AllAttendance.tsx`

**Files:**
- Modify: `src/pages/AllAttendance.tsx`

- [ ] **Step 1: Remove the header block and the standalone Back button**

Remove `FaArrowCircleLeft` from its import (keep `FaPencilAlt`):
```tsx
import { FaArrowCircleLeft, FaPencilAlt } from "react-icons/fa";
```
becomes:
```tsx
import { FaPencilAlt } from "react-icons/fa";
```
Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff">Attendance Tracker</Text>
      </Flex>
      <Button
        variant="logout"
        colorScheme="blue"
        onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
        mr={2}
        leftIcon={<FaArrowCircleLeft />}
        m="2"
      >
        Back
      </Button>
```
so `<Box minH={"100vh"} bg={pageBg}>` is directly followed by the `<Stack>`. `navigate`/`useNavigate` stay (2 other `navigate(...)` calls remain).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/all-attendance`.
Expected: header shows "All Attendance" (corrected from the previous mislabeled "Attendance Tracker") with back chevron; the attendance list still renders and rows are still clickable.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AllAttendance.tsx
git commit -m "refactor(nav): migrate AllAttendance page onto the shared AppHeader"
```

---

## Task 18: Migrate `AddOrganisation.tsx`

**Files:**
- Modify: `src/pages/AddOrganisation.tsx`

- [ ] **Step 1: Remove the header block and the standalone Back button**

Remove import (this is its only usage in the file):
```tsx
import { FaArrowCircleLeft } from "react-icons/fa";
```
Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          New Organisation
        </Text>
      </Flex>
      <Button
        onClick={() => navigate(PROTECTED_PATHS.ALL_ORG)}
        variant="logout"
        mt="10px"
        ml="10px"
        color={"white"}
        _hover={{
          bg: "blue.500",
        }}
        leftIcon={<FaArrowCircleLeft />}
      >
        Back
      </Button>
```
so `<Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>` is directly followed by whatever comes next (the form `Stack`). `navigate`/`useNavigate` stay (one other `navigate(PROTECTED_PATHS.ALL_ORG)` call remains, in the submit success handler).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/add-org`.
Expected: header shows "New Organisation" with back chevron; form still submits and redirects to `/organisations`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/AddOrganisation.tsx
git commit -m "refactor(nav): migrate AddOrganisation page onto the shared AppHeader"
```

---

## Task 19: Migrate `Analytics.tsx`

**Files:**
- Modify: `src/pages/Analytics.tsx`

- [ ] **Step 1: Remove the header block and the standalone Back button**

Remove `FaArrowCircleLeft` from its import (keep the export icons):
```tsx
import { FaArrowCircleLeft, FaFileExcel, FaFilePdf } from "react-icons/fa";
```
becomes:
```tsx
import { FaFileExcel, FaFilePdf } from "react-icons/fa";
```
Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Attendance Analytics
        </Text>
      </Flex>
      <Box p={2}>
        <>
          <Button
            variant="logout"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
            mr={2}
            leftIcon={<FaArrowCircleLeft />}
            m="2"
          >
            Back
          </Button>
```
becomes:
```tsx
      <Box p={2}>
        <>
```
(only the `Flex` header and the `Button` are removed — the `<Box p={2}><>` wrapper stays as the parent for the rest of the page). `navigate`/`useNavigate` stay (one other `navigate(...)` call for the date-range URL sync remains).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/analytics`.
Expected: header shows "Attendance Analytics" with back chevron; export buttons and the rest of the page still present.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Analytics.tsx
git commit -m "refactor(nav): migrate Analytics page onto the shared AppHeader"
```

---

## Task 20: Migrate `MemberAnalytics.tsx`

**Files:**
- Modify: `src/pages/MemberAnalytics.tsx`

- [ ] **Step 1: Remove the header block and the standalone Back button**

Change the combined import (drop `useNavigate`, keep `useParams`/`useSearchParams`):
```tsx
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
```
becomes:
```tsx
import { useParams, useSearchParams } from "react-router-dom";
```
Remove `FaArrowCircleLeft` from its import (keep the export icons):
```tsx
import { FaArrowCircleLeft, FaFileExcel, FaFilePdf } from "react-icons/fa";
```
becomes:
```tsx
import { FaFileExcel, FaFilePdf } from "react-icons/fa";
```
Remove the `navigate` declaration (this file's only `navigate(...)` call is the one being deleted):
```tsx
  const navigate = useNavigate();
```
Remove:
```tsx
      <Flex bg="blue.500" justify="space-between" align="center" p="4">
        <Text fontWeight="bold" color="#fff">Member Analytics</Text>
      </Flex>
      <Box p={2}>
        <>
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={2} mb={3}>
          <Button
            variant="logout" colorScheme="blue" leftIcon={<FaArrowCircleLeft />}
            onClick={() => navigate(PROTECTED_PATHS.ANALYTICS)}
          >
            Back
          </Button>
```
becomes:
```tsx
      <Box p={2}>
        <>
        <Flex justify="flex-end" align="center" flexWrap="wrap" gap={2} mb={3}>
```
(the `Flex` that held the Back button alongside export controls stays, minus the Back button — its `justify` changes from `space-between` to `flex-end` since Back was the "start" side).

Also remove the now-unused import (this file's only reference to `PROTECTED_PATHS` was the deleted back button's `navigate(PROTECTED_PATHS.ANALYTICS)` call):
```tsx
import { PROTECTED_PATHS } from "routes/pagePath";
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/analytics/member/<id>`.
Expected: header shows "Member Analytics" with back chevron; export controls still present, now right-aligned. Run: `npm test -- MemberAnalytics --watchAll=false` and confirm the existing test still passes.

- [ ] **Step 4: Commit**

```bash
git add src/pages/MemberAnalytics.tsx
git commit -m "refactor(nav): migrate MemberAnalytics page onto the shared AppHeader"
```

---

## Task 21: Migrate `UserModel.tsx`

**Files:**
- Modify: `src/pages/UserModel.tsx`

- [ ] **Step 1: Remove only the header block**

Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text color="#fff" fontWeight="bold">
          {isUpdating ? "Update Model" : "Create Model"}
        </Text>
      </Flex>
```
so `<Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>` is directly followed by the `<Flex align={"center"} justify={"center"} ...>` wrapper.

**Do not touch** the bottom `<Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>` — it's a Submit/Cancel form-action pair (paired with the "Update"/"Submit" button right above it), not a header duplicate, and stays as-is. `navigate`/`useNavigate` stay (one other `navigate(PROTECTED_PATHS.ADD_MEMBER)` call remains).

Note: the route-level title for this page is the static `"User Model"` (Task 5) rather than the dynamic `isUpdating ? "Update Model" : "Create Model"` the old inline header showed — both create and update flows use the single `/user-model` route, so there's no static per-route way to distinguish them the way `ADD_MEMBER`/`UPDATE_MEMBER` (two distinct paths) could. This is an intentional, small precision trade-off to keep every page's title fully route-driven; the in-page heading/button text (`"Update Model"` vs `"Create Model"`, unaffected by this task) still tells the user which mode they're in.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/user-model`.
Expected: header shows "User Model" with back chevron; the in-page "Create Model"/"Update Model" heading and the bottom Submit/Cancel pair are unaffected.

- [ ] **Step 4: Commit**

```bash
git add src/pages/UserModel.tsx
git commit -m "refactor(nav): migrate UserModel page onto the shared AppHeader"
```

---

## Task 22: Migrate `ViewMembers.tsx`

**Files:**
- Modify: `src/pages/ViewMembers.tsx`

- [ ] **Step 1: Remove the header block and the standalone Back button**

Remove `FaArrowCircleLeft` from its import (it's on its own line in a multi-line import — remove just that line, keep the rest of the import list intact).

Remove:
```tsx
      <Flex
        bg="blue.500"
        justifyContent="space-between"
        alignItems="center"
        p="4"
        mb={4}
      >
        <Text color="#fff" fontWeight="bold">
          View Members
        </Text>
      </Flex>
      <Box px="4">
        <Flex alignItems="center" justifyContent="space-between" mb={4}>
          <Button
            variant="logout"
            colorScheme="blue"
            onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
            leftIcon={<FaArrowCircleLeft />}
            aria-label="Back"
            px={isCompactActions ? 3 : 4}
          >
            {!isCompactActions && "Back"}
          </Button>
          <Flex gap={2}>
```
becomes:
```tsx
      <Box px="4">
        <Flex alignItems="center" justifyContent="flex-end" mb={4}>
          <Flex gap={2}>
```
(the outer `<Box minH={"100vh"} bg="gray.50">` stays as the parent; the inner action-row `Flex` keeps its sibling buttons, now right-aligned since Back — the "start" side — is gone). `navigate`/`useNavigate` stay (2 other `navigate(...)` calls remain).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/view-member`.
Expected: header shows "View Members" with back chevron; "Add Member" and other action buttons still present, now right-aligned.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ViewMembers.tsx
git commit -m "refactor(nav): migrate ViewMembers page onto the shared AppHeader"
```

---

## Task 23: Migrate `OrganisationSettings.tsx`

**Files:**
- Modify: `src/pages/OrganisationSettings.tsx`

- [ ] **Step 1: Remove the header block, the standalone Back button, and their now-unused imports**

Remove import (this is its only usage in the file):
```tsx
import { FaArrowCircleLeft } from "react-icons/fa";
```
Remove the `useNavigate` import and the `navigate` declaration (this file's only `navigate(...)` call is the one being deleted):
```tsx
import { useNavigate } from "react-router-dom";
```
```tsx
  const navigate = useNavigate();
```
Remove:
```tsx
        <Flex
          bg="blue.500"
          justifyContent="space-between"
          alignItems="center"
          p="4"
        >
          <Text fontWeight="bold" color="#fff">
            Organisation Settings
          </Text>
        </Flex>
        <Button
          onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
          variant="logout"
          mt="10px"
          ml="10px"
          color="white"
          _hover={{ bg: "blue.500" }}
          leftIcon={<FaArrowCircleLeft />}
        >
          Back
        </Button>
```
so `<Box minH="100vh" bg={pageBg}>` (inside `<RequirePermission perm="settings.view">`) is directly followed by whatever comes next in the form.

- [ ] **Step 2: Run the existing OrganisationSettings test**

Run: `npm test -- OrganisationSettings --watchAll=false`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/OrganisationSettings.tsx
git commit -m "refactor(nav): migrate OrganisationSettings page onto the shared AppHeader"
```

---

## Task 24: Migrate `Birthday.tsx`

**Files:**
- Modify: `src/pages/Birthday.tsx`

- [ ] **Step 1: Remove the header block, the standalone Back button, and their now-unused imports**

Remove both `FaArrowCircleLeft` and `FaBirthdayCake` from the multi-line import list (keep `FaFileExcel, FaFilePdf, FaShareAlt, FaWhatsapp, FaCopy`) — `FaBirthdayCake` is used exactly once in this file, inline in the header being deleted (`<FaBirthdayCake color="#fff" size={22} />`), so it becomes unused too:
```tsx
import {
  FaArrowCircleLeft,
  FaBirthdayCake,
  FaFileExcel,
  FaFilePdf,
  FaShareAlt,
  FaWhatsapp,
  FaCopy,
} from "react-icons/fa";
```
becomes:
```tsx
import {
  FaFileExcel,
  FaFilePdf,
  FaShareAlt,
  FaWhatsapp,
  FaCopy,
} from "react-icons/fa";
```

Remove the `useNavigate` import and `navigate` declaration (this file's only `navigate(...)` call is the one being deleted):
```tsx
import { useNavigate } from "react-router-dom";
```
```tsx
  const navigate = useNavigate();
```
Remove:
```tsx
      <Flex
        bg="pink.400"
        justifyContent="space-between"
        alignItems="center"
        p="4"
      >
        <Text fontWeight="bold" color="#fff">
          Birthdays
        </Text>
        <FaBirthdayCake color="#fff" size={22} />
      </Flex>

      <Box p={4}>
        <Button
          variant="ghost"
          colorScheme="pink"
          onClick={() => navigate(PROTECTED_PATHS.DASHBOARD)}
          leftIcon={<FaArrowCircleLeft />}
          mb={4}
        >
          Back
        </Button>
```
becomes:
```tsx
      <Box p={4}>
```
(this also fixes the `pink.400` outlier — the page now uses the shared blue `AppHeader` like every other page).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm start`, navigate to `/birthday`.
Expected: header shows "Birthdays" in the standard blue bar (no longer pink) with a back chevron; the Share button and birthday list below still work.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Birthday.tsx
git commit -m "refactor(nav): migrate Birthday page onto the shared AppHeader, fix pink header outlier"
```

---

## Task 25: Delete dead code

**Files:**
- Delete: `src/components/BackButton.tsx`
- Delete: `src/pages/Orglist.tsx`
- Delete: `src/pages/loginUser.tsx`

**Interfaces:**
- Consumes: nothing — by this point, Tasks 9-12 have removed every `import BackButton from "components/BackButton"` (`Category.tsx`, `SubCategory.tsx`, `OfficersRoles.tsx`, `Finance.tsx` — the only 4 importers). `Orglist.tsx` and `loginUser.tsx` were already confirmed unreferenced by any route or component during the navigation audit.

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "components/BackButton\|pages/Orglist\|pages/loginUser" src/`
Expected: no output (if anything shows up, stop and investigate before deleting — it means either a migration task was missed or the dead-code assumption was wrong).

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/BackButton.tsx src/pages/Orglist.tsx src/pages/loginUser.tsx
```

- [ ] **Step 3: Run the full test suite and typecheck**

Run: `npm test -- --watchAll=false && npx tsc --noEmit`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete BackButton and dead legacy pages superseded by the unified header"
```

---

## Post-plan verification (manual, per the spec)

After all 25 tasks are merged, do one final pass per the spec's Verification section:
- [ ] Visit every one of the 20 routes and confirm: title correct, back chevron present except on `/dashboard` and `/organisations`, hamburger opens the drawer.
- [ ] Log in as a role with only 1-2 permissions and confirm the drawer's nav links match exactly what that role can see (same list the Dashboard grid shows).
- [ ] Confirm Logout and Change Password both work from the drawer on at least 3 different pages (not just Dashboard/Organisations) — this is the core problem this plan fixes.

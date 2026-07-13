# Organisation Settings + Attendance Multi-Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Organisation Settings page (edit name/logo/collapse-by-day/max-edits via `GET`+`PUT /api/organisations/:id`) and adopt the new per-org attendance edit-limit contract (`editsRemaining`/`editCount`) in the attendance UI.

**Architecture:** Follow existing patterns exactly — Zustand store for the selected org, React Query (`useQueryWrapper`/`useMutationWrapper`) for server calls, react-hook-form for the form, Chakra UI for markup, `<Can>`/`RequirePermission` for RBAC. Risky pure logic (edit-limit resolution, PUT-payload construction) is extracted into small tested helpers; the page/components stay thin.

**Tech Stack:** React 18 + TypeScript (strict), Chakra UI v2, Zustand v4 (persisted), TanStack React Query v4, react-hook-form v7, react-toastify, react-router-dom v6, Jest + @testing-library/react (via `react-scripts test`).

## Global Constraints

- **No i18n layer** exists — all UI copy is hardcoded JSX literals (match surrounding code).
- **No yup/zod** — validation is inline react-hook-form rules or manual checks.
- **`name` is required on every PUT**; omitting it → `422`.
- **`image` is overwritten unconditionally by the BE** — always resend the current/edited value or the stored logo is wiped.
- **`maxAttendanceEdits`**: integer `0`–`100`; `null` = use deployment default (`1`); `0` = editing disabled for all records.
- **PUT `/organisations/:id` response does NOT carry `permissions`/`isOwner`/`roleName`** (those come only from `GET /organisations`) — when updating the store after a save, merge over the existing selected org, never replace it wholesale.
- Endpoint constants live in `src/services/api/request.ts`; URL params are filled with `convertParamsToString(url, { param: value })`.
- Run the full suite green before each commit: `CI=true yarn test --watchAll=false` and typecheck with `npx tsc --noEmit`.

---

### Task 1: Foundation — org types + single-org endpoint

**Files:**
- Modify: `src/zStore.ts:21-30` (`OrganisationType`), `src/zStore.ts:40-49` (`EMPTY_ORG`)
- Modify: `src/rbac/types.ts:34-43` (`OrganisationSummary`)
- Modify: `src/services/api/request.ts:11-22` (`orgRequest`)

**Interfaces:**
- Consumes: `PermissionKey` (already imported in `zStore.ts`).
- Produces:
  - `OrganisationType` gains `collapseAttendanceByDay?: boolean` and `maxAttendanceEdits?: number | null`.
  - `OrganisationSummary` becomes a type alias of `OrganisationType` (identical field set — DRY).
  - `orgRequest.ORGANISATION_ONE = "/organisations/:id"` (note: the existing `orgRequest.ORGANISATION` is a misnamed `.../members` route — do NOT reuse it).

- [ ] **Step 1: Add the two fields to `OrganisationType` and `EMPTY_ORG`**

In `src/zStore.ts`, extend the type (lines 21-30):

```ts
export type OrganisationType = {
  name: string;
  image: string;
  owner: string;
  id: string;
  status: string;
  isOwner: boolean;
  roleName: string;
  permissions: PermissionKey[];
  collapseAttendanceByDay?: boolean;
  maxAttendanceEdits?: number | null;
};
```

And extend `EMPTY_ORG` (lines 40-49):

```ts
export const EMPTY_ORG: OrganisationType = {
  name: "",
  image: "",
  owner: "",
  id: "",
  status: "",
  isOwner: false,
  roleName: "",
  permissions: [],
  collapseAttendanceByDay: false,
  maxAttendanceEdits: null,
};
```

- [ ] **Step 2: Collapse the duplicate `OrganisationSummary` into an alias**

In `src/rbac/types.ts`, replace the `OrganisationSummary` interface (lines 34-43) with an alias of the canonical store type:

```ts
import { PermissionArea, PermissionKey } from "rbac/permissions";
import { OrganisationType } from "zStore";

// ...existing PermissionsCatalog / Officer / Role / Invite interfaces unchanged...

export type OrganisationSummary = OrganisationType;
```

(Add the `import { OrganisationType } from "zStore";` line at the top; delete the old `export interface OrganisationSummary { ... }` block. `zStore` does not import from `rbac/types`, so there is no import cycle.)

- [ ] **Step 3: Add the single-org endpoint constant**

In `src/services/api/request.ts`, add one line to the `orgRequest` object (after `ORGANISATIONS`, line 15):

```ts
  ORGANISATIONS: "/organisations",
  ORGANISATION_ONE: "/organisations/:id",
```

- [ ] **Step 4: Typecheck and run the suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `CI=true yarn test --watchAll=false`
Expected: all existing tests PASS (the alias is structurally identical, so no consumer breaks).

- [ ] **Step 5: Commit**

```bash
git add src/zStore.ts src/rbac/types.ts src/services/api/request.ts
git commit -m "feat: add collapseAttendanceByDay/maxAttendanceEdits to org type + single-org endpoint"
```

---

### Task 2: Attendance edit-limit helper

**Files:**
- Create: `src/helpers/attendanceEdits.ts`
- Test: `src/helpers/attendanceEdits.test.ts`

**Interfaces:**
- Produces:
  - `interface EditableRecord { hasBeenUpdated?: boolean; editCount?: number; editsRemaining?: number; }`
  - `resolveEditsRemaining(record: EditableRecord): number`
  - `resolveEditCount(record: EditableRecord): number`
  - `canEditAttendance(record: EditableRecord): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/helpers/attendanceEdits.test.ts`:

```ts
import {
  resolveEditsRemaining,
  resolveEditCount,
  canEditAttendance,
} from "helpers/attendanceEdits";

describe("attendanceEdits", () => {
  it("uses editsRemaining when present", () => {
    expect(resolveEditsRemaining({ editsRemaining: 2 })).toBe(2);
    expect(canEditAttendance({ editsRemaining: 2 })).toBe(true);
  });

  it("treats editsRemaining of 0 as not editable", () => {
    expect(resolveEditsRemaining({ editsRemaining: 0 })).toBe(0);
    expect(canEditAttendance({ editsRemaining: 0 })).toBe(false);
  });

  it("falls back to the legacy one-edit rule when editsRemaining is absent", () => {
    expect(resolveEditsRemaining({ hasBeenUpdated: false })).toBe(1);
    expect(canEditAttendance({ hasBeenUpdated: false })).toBe(true);
    expect(resolveEditsRemaining({ hasBeenUpdated: true })).toBe(0);
    expect(canEditAttendance({ hasBeenUpdated: true })).toBe(false);
  });

  it("resolves editCount, falling back to hasBeenUpdated", () => {
    expect(resolveEditCount({ editCount: 3 })).toBe(3);
    expect(resolveEditCount({ hasBeenUpdated: true })).toBe(1);
    expect(resolveEditCount({ hasBeenUpdated: false })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test src/helpers/attendanceEdits.test.ts --watchAll=false`
Expected: FAIL — "Cannot find module 'helpers/attendanceEdits'".

- [ ] **Step 3: Write the implementation**

Create `src/helpers/attendanceEdits.ts`:

```ts
export interface EditableRecord {
  hasBeenUpdated?: boolean;
  editCount?: number;
  editsRemaining?: number;
}

/**
 * How many edits remain for an attendance record. Prefers the new
 * `editsRemaining` field; falls back to the legacy one-edit rule
 * (`hasBeenUpdated`) for responses that predate the multi-edit contract.
 */
export const resolveEditsRemaining = (record: EditableRecord): number => {
  if (typeof record.editsRemaining === "number") return record.editsRemaining;
  return record.hasBeenUpdated ? 0 : 1;
};

/** How many times the record has been edited (legacy fallback: 0 or 1). */
export const resolveEditCount = (record: EditableRecord): number => {
  if (typeof record.editCount === "number") return record.editCount;
  return record.hasBeenUpdated ? 1 : 0;
};

export const canEditAttendance = (record: EditableRecord): boolean =>
  resolveEditsRemaining(record) > 0;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test src/helpers/attendanceEdits.test.ts --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/helpers/attendanceEdits.ts src/helpers/attendanceEdits.test.ts
git commit -m "feat: add attendance edit-limit resolution helper"
```

---

### Task 3: AllAttendance — adopt multi-edit gating + counts

**Files:**
- Modify: `src/pages/AllAttendance.tsx:26-37` (type), `:122-131` (badge), `:144-162` (edit-button gate)

**Interfaces:**
- Consumes: `resolveEditsRemaining`, `resolveEditCount`, `canEditAttendance` from Task 2.

- [ ] **Step 1: Extend the `AttendanceType`**

In `src/pages/AllAttendance.tsx`, add the two optional fields (lines 26-37):

```ts
type AttendanceType = {
  name: string;
  createdAt: string;
  updatedAt: string;
  id: string;
  hasBeenUpdated: boolean;
  editCount?: number;
  editsRemaining?: number;
  date: string;
  dateFormated: number;
  category?: { name: string; status: string } | null;
  createdBy?: PersonRef | null;
  updatedBy?: PersonRef | null;
};
```

- [ ] **Step 2: Import the helper**

Add to the imports near the top of `src/pages/AllAttendance.tsx` (after the `stringManipulations` import, line 19):

```ts
import {
  canEditAttendance,
  resolveEditCount,
  resolveEditsRemaining,
} from "helpers/attendanceEdits";
```

- [ ] **Step 3: Compute per-record edit state inside the map**

Change the map callback opening (currently line 104 `.map((attendance) => (`) to compute the values first:

```tsx
            .map((attendance) => {
              const editsRemaining = resolveEditsRemaining(attendance);
              const editCount = resolveEditCount(attendance);
              const canEdit = canEditAttendance(attendance);
              return (
                <Flex
                  key={attendance.id}
                  cursor="pointer"
                  borderRadius="10px"
                  alignItems="center"
                  justifyContent="space-between"
                  p="4"
                  mb="10px"
                  border="1px solid rebeccapurple"
                  onClick={() => handleNavigate(attendance)}
                >
```

(Note: this converts the arrow body from `(` … `))` to `{ … return ( … ); }`. Ensure the map now ends with `);\n            })` instead of `))` — see Step 6.)

- [ ] **Step 4: Replace the "Edited" badge with an edit-count badge**

Replace the badge block (currently lines 126-130):

```tsx
                        {editCount > 0 && (
                          <Badge colorScheme="orange" fontSize="0.65rem">
                            edited {editCount}×
                          </Badge>
                        )}
```

- [ ] **Step 5: Replace the edit-button gate with `editsRemaining`, showing the remaining count**

Replace the right-hand `<Flex>` block (currently lines 144-162):

```tsx
                    <Flex alignItems="center" gap={2}>
                      {canEdit && (
                        <>
                          <Text fontSize="xs" color="gray.500">
                            {editsRemaining} left
                          </Text>
                          <Button
                            variant="outline"
                            colorScheme="blue"
                            onClick={(e) => {
                              // stop the click from bubbling to the row onClick
                              e.stopPropagation();
                              const pagePath = convertParamsToString(
                                PROTECTED_PATHS.UPDATE_ATTENANCE,
                                { attendanceId: attendance.id },
                              );
                              navigate(pagePath);
                            }}
                          >
                            <FaPencilAlt />
                          </Button>
                        </>
                      )}
                    </Flex>
```

- [ ] **Step 6: Close the converted map callback**

The map previously ended (lines 164-165):

```tsx
                </Flex>
              ))}
```

Change the tail to close the `return (...)` and the `{ }` arrow body:

```tsx
                </Flex>
              );
            })}
```

- [ ] **Step 7: Typecheck and run the suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `CI=true yarn test --watchAll=false`
Expected: all PASS (no test targets this page directly; this guards against regressions).

- [ ] **Step 8: Manual verification**

Start the app (`yarn start`), open All Attendance for an org. Confirm: a record with `editsRemaining > 0` shows the pencil + "N left"; a record at the limit (`editsRemaining: 0`) shows no pencil; an edited record shows the "edited N×" badge.

- [ ] **Step 9: Commit**

```bash
git add src/pages/AllAttendance.tsx
git commit -m "feat: gate attendance edit on editsRemaining and show edit counts"
```

---

### Task 4: MemberRecordsTable — edit-count-aware badge

**Files:**
- Modify: `src/components/analytics/memberAnalyticsTypes.ts:8-14` (`MemberRecord`)
- Modify: `src/components/analytics/MemberRecordsTable.tsx:29` (badge)
- Test: `src/components/analytics/MemberRecordsTable.test.tsx` (extend existing)

**Interfaces:**
- Consumes: nothing new (defensive inline: `record.editCount` optional).
- Produces: `MemberRecord` gains `editCount?: number`.

- [ ] **Step 1: Extend the failing test first**

In `src/components/analytics/MemberRecordsTable.test.tsx`, add a third record carrying `editCount` and assert the count-aware label. Replace the file with:

```tsx
import { render, screen } from "@testing-library/react";
import MemberRecordsTable from "components/analytics/MemberRecordsTable";

it("renders a row per record with an edited tag when updated", () => {
  render(
    <MemberRecordsTable
      records={[
        { attendanceId: "a1", date: "2026-06-28", status: "present", sessionName: "First Mass", hasBeenUpdated: false },
        { attendanceId: "a2", date: "2026-06-21", status: "absent", sessionName: "Second Mass", hasBeenUpdated: true },
        { attendanceId: "a3", date: "2026-06-14", status: "present", sessionName: "Third Mass", hasBeenUpdated: true, editCount: 2 },
      ]}
    />,
  );
  expect(screen.getByText("First Mass")).toBeInTheDocument();
  expect(screen.getByText("Second Mass")).toBeInTheDocument();
  expect(screen.getByText("edited")).toBeInTheDocument();
  expect(screen.getByText("edited 2×")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test src/components/analytics/MemberRecordsTable.test.tsx --watchAll=false`
Expected: FAIL — either a TS error on the unknown `editCount` prop, or "Unable to find an element with the text: edited 2×".

- [ ] **Step 3: Add `editCount` to `MemberRecord`**

In `src/components/analytics/memberAnalyticsTypes.ts`, extend the interface (lines 8-14):

```ts
export interface MemberRecord {
  attendanceId: string;
  date: string;
  status: AttendanceStatus;
  sessionName: string;
  hasBeenUpdated: boolean;
  editCount?: number;
}
```

- [ ] **Step 4: Make the badge count-aware**

In `src/components/analytics/MemberRecordsTable.tsx`, replace the Note cell (line 29):

```tsx
              <Td>{record.hasBeenUpdated && <Badge colorScheme="purple">{record.editCount ? `edited ${record.editCount}×` : "edited"}</Badge>}</Td>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `CI=true yarn test src/components/analytics/MemberRecordsTable.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/memberAnalyticsTypes.ts src/components/analytics/MemberRecordsTable.tsx src/components/analytics/MemberRecordsTable.test.tsx
git commit -m "feat: show edit count on member record edited badge"
```

---

### Task 5: Org update payload helper

**Files:**
- Create: `src/helpers/orgPayloads.ts`
- Test: `src/helpers/orgPayloads.test.ts`

**Interfaces:**
- Produces:
  - `interface OrgSettingsForm { name: string; image: string; collapseAttendanceByDay: boolean; maxAttendanceEdits: string; }` (form holds the raw `maxAttendanceEdits` string; `""` = use default)
  - `interface OrgUpdatePayload { name: string; image: string; collapseAttendanceByDay: boolean; maxAttendanceEdits: number | null; }`
  - `buildOrgUpdatePayload(form: OrgSettingsForm): OrgUpdatePayload`

- [ ] **Step 1: Write the failing test**

Create `src/helpers/orgPayloads.test.ts`:

```ts
import { buildOrgUpdatePayload } from "helpers/orgPayloads";

describe("buildOrgUpdatePayload", () => {
  const base = {
    name: "VOB Choir",
    image: "https://cdn.example.com/logo.png",
    collapseAttendanceByDay: true,
  };

  it("maps a numeric string to an integer", () => {
    expect(buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "3" })).toEqual({
      ...base,
      maxAttendanceEdits: 3,
    });
  });

  it("keeps 0 (editing disabled) rather than treating it as blank", () => {
    expect(
      buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "0" }).maxAttendanceEdits,
    ).toBe(0);
  });

  it("maps a blank maxAttendanceEdits to null (use default)", () => {
    expect(
      buildOrgUpdatePayload({ ...base, maxAttendanceEdits: "  " }).maxAttendanceEdits,
    ).toBeNull();
  });

  it("trims name and image (both always present)", () => {
    const result = buildOrgUpdatePayload({
      name: "  VOB Choir  ",
      image: "  https://x/y.png ",
      collapseAttendanceByDay: false,
      maxAttendanceEdits: "",
    });
    expect(result.name).toBe("VOB Choir");
    expect(result.image).toBe("https://x/y.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test src/helpers/orgPayloads.test.ts --watchAll=false`
Expected: FAIL — "Cannot find module 'helpers/orgPayloads'".

- [ ] **Step 3: Write the implementation**

Create `src/helpers/orgPayloads.ts`:

```ts
export interface OrgSettingsForm {
  name: string;
  image: string;
  collapseAttendanceByDay: boolean;
  /** Raw input value; "" (or whitespace) means "use the deployment default". */
  maxAttendanceEdits: string;
}

export interface OrgUpdatePayload {
  name: string;
  image: string;
  collapseAttendanceByDay: boolean;
  maxAttendanceEdits: number | null;
}

/**
 * Build the `PUT /organisations/:id` body. `name` and `image` are ALWAYS sent
 * — the BE 422s without `name` and wipes the stored logo if `image` is omitted.
 * A blank `maxAttendanceEdits` maps to `null` so the BE applies its default.
 */
export const buildOrgUpdatePayload = (
  form: OrgSettingsForm,
): OrgUpdatePayload => {
  const trimmedMax = form.maxAttendanceEdits.trim();
  return {
    name: form.name.trim(),
    image: form.image.trim(),
    collapseAttendanceByDay: form.collapseAttendanceByDay,
    maxAttendanceEdits: trimmedMax === "" ? null : Number(trimmedMax),
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test src/helpers/orgPayloads.test.ts --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/helpers/orgPayloads.ts src/helpers/orgPayloads.test.ts
git commit -m "feat: add org settings PUT payload builder"
```

---

### Task 6: Organisation Settings page + route

**Files:**
- Create: `src/pages/OrganisationSettings.tsx`
- Test: `src/pages/OrganisationSettings.test.tsx`
- Modify: `src/routes/pagePath.ts:8-30` (`PROTECTED_PATHS`)
- Modify: `src/routes/protectedRoutes.tsx` (lazy import + route entry)

**Interfaces:**
- Consumes: `buildOrgUpdatePayload`, `OrgSettingsForm` (Task 5); `orgRequest.ORGANISATION_ONE` (Task 1); `putRequest`, `useQueryWrapper`, `useMutationWrapper`, `queryClient` (`services/api/apiHelper`); `RequirePermission`, `Can`; `convertParamsToString`.
- Produces: default-exported `OrganisationSettings` page; `PROTECTED_PATHS.SETTINGS = "/settings"`.

- [ ] **Step 1: Add the route path constant**

In `src/routes/pagePath.ts`, add to `PROTECTED_PATHS` (after `OFFICERS_ROLES`, line 29):

```ts
  OFFICERS_ROLES: "/officers-roles",
  SETTINGS: "/settings",
```

- [ ] **Step 2: Write the failing page test**

Create `src/pages/OrganisationSettings.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import useGlobalStore, { EMPTY_ORG } from "zStore";
import OrganisationSettings from "pages/OrganisationSettings";

jest.mock("react-toastify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

// Resolve the settings GET so the form (not the spinner) renders.
jest.mock("services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() =>
      Promise.resolve({
        data: {
          data: {
            id: "org1",
            name: "VOB Choir",
            image: "",
            collapseAttendanceByDay: false,
            maxAttendanceEdits: 3,
          },
        },
      }),
    ),
    put: jest.fn(() => Promise.resolve({ data: { data: {} } })),
  },
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<OrganisationSettings />} />
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const setOrg = (over: Partial<typeof EMPTY_ORG>) =>
  useGlobalStore.setState({ organisation: { ...EMPTY_ORG, ...over } });

describe("<OrganisationSettings>", () => {
  it("shows the form with a Save button for a manager", async () => {
    setOrg({ id: "org1", permissions: ["settings.view", "settings.manage"] });
    renderPage();
    expect(await screen.findByLabelText("Organisation Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Logo URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Max attendance edits")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save/ })).toBeInTheDocument();
  });

  it("hides Save for a view-only user", async () => {
    setOrg({ id: "org1", permissions: ["settings.view"] });
    renderPage();
    await screen.findByLabelText("Organisation Name");
    expect(screen.queryByRole("button", { name: /Save/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `CI=true yarn test src/pages/OrganisationSettings.test.tsx --watchAll=false`
Expected: FAIL — "Cannot find module 'pages/OrganisationSettings'".

- [ ] **Step 4: Create the page**

Create `src/pages/OrganisationSettings.tsx`:

```tsx
import {
  Box,
  Flex,
  Text,
  Button,
  Stack,
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
  Input,
  Switch,
  useColorModeValue,
} from "@chakra-ui/react";
import { FaArrowCircleLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import useGlobalStore from "zStore";
import { RequirePermission } from "rbac/RequirePermission";
import { Can } from "rbac/Can";
import { orgRequest } from "services";
import {
  putRequest,
  queryClient,
  useMutationWrapper,
  useQueryWrapper,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { buildOrgUpdatePayload, OrgSettingsForm } from "helpers/orgPayloads";
import { PROTECTED_PATHS } from "routes/pagePath";
import LoadingSpinner from "components/LoadingSpinner";

const DEFAULT_MAX_EDITS = 1;

const isUrl = (value: string): boolean => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
};

const OrganisationSettings = () => {
  const navigate = useNavigate();
  const [org, setOrg] = useGlobalStore((s) => [
    s.organisation,
    s.updateOrganisation,
  ]);
  const cardBg = useColorModeValue("white", "gray.700");
  const pageBg = useColorModeValue("gray.50", "gray.800");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<OrgSettingsForm>({
    defaultValues: {
      name: "",
      image: "",
      collapseAttendanceByDay: false,
      maxAttendanceEdits: "",
    },
  });

  const url = convertParamsToString(orgRequest.ORGANISATION_ONE, { id: org.id });

  const { isFetching } = useQueryWrapper(["organisation", org.id], url, {
    enabled: Boolean(org.id),
    onSuccess: (res: any) => {
      const data = res.data;
      reset({
        name: data.name ?? "",
        image: data.image ?? "",
        collapseAttendanceByDay: Boolean(data.collapseAttendanceByDay),
        maxAttendanceEdits:
          data.maxAttendanceEdits == null
            ? ""
            : String(data.maxAttendanceEdits),
      });
    },
  });

  const { mutate, isLoading: isSaving } = useMutationWrapper(
    putRequest,
    (res: any) => {
      // PUT returns org fields but NOT permissions/isOwner/roleName —
      // merge over the selected org so RBAC state is preserved.
      setOrg({ ...org, ...res.data });
      queryClient.invalidateQueries({ queryKey: ["all-organisations"] });
      queryClient.invalidateQueries({ queryKey: ["organisation", org.id] });
      toast.success("Settings saved");
    },
  );

  const onSubmit = (form: OrgSettingsForm) => {
    mutate({ url, data: buildOrgUpdatePayload(form) });
  };

  return (
    <RequirePermission perm="settings.view">
      <Box minH="100vh" bg={pageBg}>
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

        {isFetching ? (
          <LoadingSpinner h="30vh" text="Loading settings..." />
        ) : (
          <Flex align="center" justify="center">
            <form onSubmit={handleSubmit(onSubmit)} style={{ width: "80%" }}>
              <Stack
                spacing={4}
                w="full"
                maxW="md"
                bg={cardBg}
                rounded="xl"
                boxShadow="lg"
                p={6}
                my={12}
                mx="auto"
              >
                <FormControl isRequired isInvalid={Boolean(errors.name)}>
                  <FormLabel>Organisation Name</FormLabel>
                  <Input
                    placeholder="Seat of wisdom presidium"
                    {...register("name", {
                      validate: (v) =>
                        v.trim().length > 0 || "Name is required",
                    })}
                  />
                  <FormErrorMessage>{errors.name?.message}</FormErrorMessage>
                </FormControl>

                <FormControl isInvalid={Boolean(errors.image)}>
                  <FormLabel>Logo URL</FormLabel>
                  <Input
                    placeholder="https://cdn.example.com/logo.png"
                    {...register("image", {
                      validate: (v) =>
                        v.trim() === "" ||
                        isUrl(v.trim()) ||
                        "Enter a valid URL",
                    })}
                  />
                  <FormErrorMessage>{errors.image?.message}</FormErrorMessage>
                </FormControl>

                <FormControl display="flex" alignItems="center">
                  <FormLabel mb="0">Collapse attendance by day</FormLabel>
                  <Switch {...register("collapseAttendanceByDay")} />
                </FormControl>

                <FormControl isInvalid={Boolean(errors.maxAttendanceEdits)}>
                  <FormLabel>Max attendance edits</FormLabel>
                  <Input
                    type="number"
                    placeholder={`${DEFAULT_MAX_EDITS} (default)`}
                    {...register("maxAttendanceEdits", {
                      validate: (v) => {
                        if (v.trim() === "") return true;
                        const n = Number(v);
                        if (!Number.isInteger(n)) return "Must be a whole number";
                        if (n < 0 || n > 100) return "Must be between 0 and 100";
                        return true;
                      },
                    })}
                  />
                  <FormHelperText>
                    0 disables editing for all records. Leave blank to use the
                    default ({DEFAULT_MAX_EDITS}).
                  </FormHelperText>
                  <FormErrorMessage>
                    {errors.maxAttendanceEdits?.message}
                  </FormErrorMessage>
                </FormControl>

                <Can perm="settings.manage">
                  <Button variant="primary" type="submit" isLoading={isSaving}>
                    Save
                  </Button>
                </Can>
              </Stack>
            </form>
          </Flex>
        )}
      </Box>
    </RequirePermission>
  );
};

export default OrganisationSettings;
```

- [ ] **Step 5: Run the page test to verify it passes**

Run: `CI=true yarn test src/pages/OrganisationSettings.test.tsx --watchAll=false`
Expected: PASS (2 tests).

- [ ] **Step 6: Register the lazy route**

In `src/routes/protectedRoutes.tsx`:

Add the lazy import (after the `AddOrganisation` import, line 24-26):

```ts
const OrganisationSettings = WithSuspense(
  lazy(() => import("pages/OrganisationSettings"))
);
```

Add `SETTINGS` to the destructure from `PROTECTED_PATHS` (in the block at lines 28-48):

```ts
  OFFICERS_ROLES,
  SETTINGS,
} = PROTECTED_PATHS;
```

Add the route entry to `PROTECTED_ROUTES` (after the `OFFICERS_ROLES` entry, line 69):

```tsx
  { path: OFFICERS_ROLES, element: <OfficersRoles /> },
  { path: SETTINGS, element: <OrganisationSettings /> },
```

(The page guards itself with `RequirePermission`, matching the `OfficersRoles` convention — no guard needed in the route table.)

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `CI=true yarn test --watchAll=false`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/OrganisationSettings.tsx src/pages/OrganisationSettings.test.tsx src/routes/pagePath.ts src/routes/protectedRoutes.tsx
git commit -m "feat: add organisation settings page and route"
```

---

### Task 7: Entry points — Dashboard tile + org-switcher edit

**Files:**
- Modify: `src/pages/Dashboard.tsx:8-17` (icon import), `:35-44` (`DASHBOARD_ACTIONS`)
- Modify: `src/pages/Organisations.tsx:19` (icon import), `:11-12`+`:119-123` (edit affordance)

**Interfaces:**
- Consumes: `PROTECTED_PATHS.SETTINGS` (Task 6); `Can` (Dashboard, already imported); per-row `org.permissions`/`org.isOwner` (Organisations).

- [ ] **Step 1: Add the Dashboard "Settings" tile**

In `src/pages/Dashboard.tsx`, add `FaCog` to the `react-icons/fa` import (lines 8-17):

```ts
  FaUserShield,
  FaCog,
} from "react-icons/fa";
```

Add the action to `DASHBOARD_ACTIONS` (after the "Officers & Roles" entry, line 43):

```ts
  { label: "Officers & Roles", icon: FaUserShield, colorScheme: "blue", path: PROTECTED_PATHS.OFFICERS_ROLES, perm: "officers.view" },
  { label: "Settings", icon: FaCog, colorScheme: "gray", path: PROTECTED_PATHS.SETTINGS, perm: "settings.view" },
```

(No other change needed — the existing `<Can perm={perm}>` wrapper gates the tile on `settings.view` of the selected org.)

- [ ] **Step 2: Add the org-switcher edit button**

In `src/pages/Organisations.tsx`, add `FaCog` to the `react-icons/fa` import (line 19):

```ts
import { FaTrashAlt, FaCog } from "react-icons/fa";
```

Replace the right-hand delete block (currently lines 119-123) with a Flex containing an edit button (gated on the per-row org's own permissions, since `<Can>` would read the selected-org perms, not this row's) plus the existing delete:

```tsx
                <Flex gap={2}>
                  {(org.isOwner ||
                    org.permissions?.includes("settings.view")) && (
                    <Button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOrg(org);
                        navigate(PROTECTED_PATHS.SETTINGS);
                      }}
                      variant="outline"
                      colorScheme="blue"
                    >
                      <FaCog />
                    </Button>
                  )}
                  {org.isOwner && (
                    <Button
                      onClick={(e) => handleDelete(org, e)}
                      variant="danger"
                    >
                      <FaTrashAlt color="#fff" />
                    </Button>
                  )}
                </Flex>
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `CI=true yarn test --watchAll=false`
Expected: all PASS.

- [ ] **Step 4: Manual verification (end-to-end happy path)**

Start the app (`yarn start`). As an owner:
1. Dashboard shows a **Settings** tile → click → lands on `/settings`.
2. Org list (`/organisations`) shows a gear button per org → click → selects that org and lands on `/settings`.
3. On the settings page: toggle "Collapse attendance by day", set "Max attendance edits" to `3`, Save → success toast; reload → values persisted. Confirm the logo URL, if set, survives a save where you only toggled the switch (image not wiped).
4. Enter `999` in max edits → inline "Must be between 0 and 100"; blank it → saves as default.
5. As a `settings.view`-only officer: the form is visible but the **Save** button is absent.
6. As an officer with no `settings.view`: navigating to `/settings` redirects to the dashboard with the access toast.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx src/pages/Organisations.tsx
git commit -m "feat: add settings entry points on dashboard and org switcher"
```

---

## Self-Review

**Spec coverage:**
- Updatable fields (name/image/collapseAttendanceByDay/maxAttendanceEdits) → Task 6 form + Task 5 payload.
- GET-then-PUT spread, `name` always sent, `image` never wiped, blank→null → Task 5 (`buildOrgUpdatePayload`) + Task 6 (query prefill / merge-on-save).
- Permission gating (`settings.view` page, `settings.manage` save) → Task 6 (`RequirePermission` + `<Can>`).
- 422/403/404 + duplicate-name errors → surfaced by the central `useMutationWrapper` toast (Global Constraints; no per-call `onError` override in Task 6, so the default toast fires).
- Both entry points → Task 7.
- Attendance `editsRemaining` gate + `editCount`/counts + legacy fallback → Tasks 2, 3, 4.
- Attendance 400 fallback → unchanged `MarkAttendance` update path routes through the central error toast (documented; verified in Task 7 manual step / spec — no code change needed, and Task 6/others do not touch that path).

**Placeholder scan:** No TBD/TODO; every code step shows complete code.

**Type consistency:** `OrgSettingsForm`/`OrgUpdatePayload` (Task 5) are used verbatim in Task 6; `resolveEditsRemaining`/`resolveEditCount`/`canEditAttendance` (Task 2) used verbatim in Task 3; `EditableRecord` optional fields align with the fields added to `AttendanceType` (Task 3) and `MemberRecord` (Task 4). `orgRequest.ORGANISATION_ONE` (Task 1) referenced in Task 6. `PROTECTED_PATHS.SETTINGS` (Task 6) referenced in Task 7.

**Note on `MarkAttendance` 400 handling:** confirmed no task overrides the update mutation's `onError`; the BE limit message surfaces via the default handler. If, during Task 7 manual verification, the update path is found to pass a custom `onError`, add a follow-up step to re-toast `error.response.data.error` there. (Left as a verification checkpoint rather than a speculative code change — YAGNI.)

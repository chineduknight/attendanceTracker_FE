# Editable Attendance Session Details + Org Image Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit an attendance session's name/category/sub-category/date on the edit screen (via one shared form component reused by the create screen), and make a saved org logo URL actually render.

**Architecture:** Extract a presentational, controlled `AttendanceDetailsForm` and a `useCategories` hook; both the create screen and the edit screen own their own state and feed the shared component. The edit screen writes changes into the existing `currentAttendance` store, which the existing `PUT` submit path already sends. Org image is a two-line display fix (avatar `src` + settings preview).

**Tech Stack:** React 18 + TS strict, Chakra UI v2, Zustand (persisted), React Query v4, react-hook-form v7 (create/settings only — the shared component is plain controlled inputs), react-toastify, Jest + @testing-library/react.

## Global Constraints

- **No i18n** — hardcoded JSX copy, matching the codebase.
- **No yup/zod** — validation is inline / manual.
- **Dates are `"YYYY-MM-DD"` strings** everywhere; the date input is capped at today (`max`).
- **`AttendanceDetailsForm` is presentational and fully controlled** — no data fetching, no persistence, no submit button; every edit calls `onChange` with the next full value; changing the category resets `subCategoryId` to `""`.
- **No new endpoints** — `PUT /attendance/:id` already accepts `name/date/categoryId/subCategoryId`.
- **No image upload** — logo is a URL string only.
- Run green before each commit: `npx tsc --noEmit` and `CI=true yarn test --watchAll=false`. (If a test run errors with `EPERM ... /.npmrc`, that is a local sandbox restriction, not a code failure — re-run outside the sandbox.)

---

### Task 1: Shared foundation — `useCategories` hook + date-type fix

**Files:**
- Create: `src/hooks/useCategories.ts`
- Test: `src/hooks/useCategories.test.tsx`
- Modify: `src/pages/SubCategory.tsx:23` (import `CategoryType` from the hook)
- Modify: `src/zStore.ts:5-11` (`currentAttendanceType.date`), `src/zStore.ts:69-75` (default)

**Interfaces:**
- Produces:
  - `interface CommonTypeCategory { name: string; status: string; id: string; }`
  - `interface SubCategoryType extends CommonTypeCategory { parentCategoryId: string; }`
  - `interface CategoryType extends CommonTypeCategory { subCategories: SubCategoryType[]; }`
  - `useCategories(organisationId: string): { categories: CategoryType[]; isLoading: boolean }`
  - `currentAttendanceType.date` becomes `string` (was `Date`).

- [ ] **Step 1: Write the failing hook test (via a probe component — RTL-version-agnostic)**

Create `src/hooks/useCategories.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import { useCategories } from "hooks/useCategories";

jest.mock("services/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(() =>
      Promise.resolve({
        data: {
          data: [
            { id: "c1", name: "Sunday Service", status: "active", subCategories: [] },
          ],
        },
      }),
    ),
  },
}));

function Probe({ orgId }: { orgId: string }) {
  const { categories } = useCategories(orgId);
  return <div>count:{categories.length}</div>;
}

it("returns the fetched categories", async () => {
  render(
    <QueryClientProvider client={queryClient}>
      <Probe orgId="org1" />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("count:1")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test src/hooks/useCategories.test.tsx --watchAll=false`
Expected: FAIL — "Cannot find module 'hooks/useCategories'".

- [ ] **Step 3: Create the hook**

Create `src/hooks/useCategories.ts`:

```ts
import { useState } from "react";
import { useQueryWrapper } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { orgRequest } from "services/api/request";

export interface CommonTypeCategory {
  name: string;
  status: string;
  id: string;
}

export interface SubCategoryType extends CommonTypeCategory {
  parentCategoryId: string;
}

export interface CategoryType extends CommonTypeCategory {
  subCategories: SubCategoryType[];
}

/**
 * Fetches the org's categories (with nested sub-categories). Shared by the
 * create and edit attendance screens. Uses the existing "get-all-category"
 * query key so React Query dedupes across screens.
 */
export const useCategories = (organisationId: string) => {
  const [categories, setCategories] = useState<CategoryType[]>([]);
  const url = convertParamsToString(orgRequest.CATEGORY, { organisationId });
  const { isLoading } = useQueryWrapper(["get-all-category"], url, {
    enabled: Boolean(organisationId),
    onSuccess: (res: { data: CategoryType[] }) => setCategories(res.data),
  });
  return { categories, isLoading };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test src/hooks/useCategories.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Point `SubCategory` at the shared type**

In `src/pages/SubCategory.tsx`, change the import (line 23) from:

```ts
import { CategoryType } from "./CreateAttendance";
```

to:

```ts
import { CategoryType } from "hooks/useCategories";
```

(SubCategory keeps its own inline category query — not in scope to refactor — only its type import moves.)

- [ ] **Step 6: Correct the `currentAttendanceType.date` type**

In `src/zStore.ts`, change the `date` field of `currentAttendanceType` (line 9) from `date: Date;` to:

```ts
  date: string;
```

and change the store default (line 73) from `date: new Date(),` to:

```ts
    date: "",
```

(The app already stores/sends `date` as a `"YYYY-MM-DD"` string — this removes the type-vs-reality gap so later tasks need no casts.)

- [ ] **Step 7: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `CI=true yarn test --watchAll=false`
Expected: all PASS (existing suite + the new hook test).

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useCategories.ts src/hooks/useCategories.test.tsx src/pages/SubCategory.tsx src/zStore.ts
git commit -m "feat: add useCategories hook and correct currentAttendance date type"
```

---

### Task 2: `AttendanceDetailsForm` shared component

**Files:**
- Create: `src/components/attendance/AttendanceDetailsForm.tsx`
- Test: `src/components/attendance/AttendanceDetailsForm.test.tsx`

**Interfaces:**
- Consumes: `CategoryType` from `hooks/useCategories` (Task 1).
- Produces:
  - `interface AttendanceDetails { name: string; categoryId: string; subCategoryId: string; date: string; }`
  - default export `AttendanceDetailsForm` with props `{ value: AttendanceDetails; onChange: (next: AttendanceDetails) => void; categories: CategoryType[]; }`.

- [ ] **Step 1: Write the failing component test**

Create `src/components/attendance/AttendanceDetailsForm.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";
import { CategoryType } from "hooks/useCategories";

const categories: CategoryType[] = [
  {
    id: "c1",
    name: "Sunday Service",
    status: "active",
    subCategories: [
      { id: "s1", name: "First Mass", status: "active", parentCategoryId: "c1" },
      { id: "s2", name: "Second Mass", status: "active", parentCategoryId: "c1" },
    ],
  },
  { id: "c2", name: "Weekday", status: "active", subCategories: [] },
];

const base: AttendanceDetails = { name: "", categoryId: "", subCategoryId: "", date: "" };

it("renders all four fields", () => {
  render(<AttendanceDetailsForm value={base} onChange={() => {}} categories={categories} />);
  expect(screen.getByLabelText("Name")).toBeInTheDocument();
  expect(screen.getByLabelText("Category")).toBeInTheDocument();
  expect(screen.getByLabelText("Sub Category")).toBeInTheDocument();
  expect(screen.getByLabelText("Date")).toBeInTheDocument();
});

it("shows sub-categories of the selected category", () => {
  render(
    <AttendanceDetailsForm
      value={{ ...base, categoryId: "c1" }}
      onChange={() => {}}
      categories={categories}
    />,
  );
  expect(screen.getByRole("option", { name: "First Mass" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Second Mass" })).toBeInTheDocument();
});

it("clears the sub-category when the category changes", () => {
  const onChange = jest.fn();
  render(
    <AttendanceDetailsForm
      value={{ ...base, categoryId: "c1", subCategoryId: "s1" }}
      onChange={onChange}
      categories={categories}
    />,
  );
  fireEvent.change(screen.getByLabelText("Category"), { target: { value: "c2" } });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ categoryId: "c2", subCategoryId: "" }),
  );
});

it("emits name edits", () => {
  const onChange = jest.fn();
  render(<AttendanceDetailsForm value={base} onChange={onChange} categories={categories} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "First Mass" } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: "First Mass" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test src/components/attendance/AttendanceDetailsForm.test.tsx --watchAll=false`
Expected: FAIL — "Cannot find module 'components/attendance/AttendanceDetailsForm'".

- [ ] **Step 3: Create the component**

Create `src/components/attendance/AttendanceDetailsForm.tsx`:

```tsx
import { FormControl, FormLabel, Input, Select, Stack } from "@chakra-ui/react";
import { CategoryType } from "hooks/useCategories";

export interface AttendanceDetails {
  name: string;
  categoryId: string;
  subCategoryId: string;
  date: string; // YYYY-MM-DD
}

interface AttendanceDetailsFormProps {
  value: AttendanceDetails;
  onChange: (next: AttendanceDetails) => void;
  categories: CategoryType[];
}

const AttendanceDetailsForm = ({
  value,
  onChange,
  categories,
}: AttendanceDetailsFormProps) => {
  const subCategories =
    categories.find((c) => c.id === value.categoryId)?.subCategories ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Stack spacing={4}>
      <FormControl id="name" isRequired>
        <FormLabel mb="0">Name</FormLabel>
        <Input
          type="text"
          placeholder="Attendance Name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </FormControl>

      <FormControl id="category">
        <FormLabel mb="0">Category</FormLabel>
        <Select
          placeholder="Select option"
          value={value.categoryId}
          onChange={(e) =>
            // Changing the category invalidates any previously chosen sub-category.
            onChange({ ...value, categoryId: e.target.value, subCategoryId: "" })
          }
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </FormControl>

      <FormControl id="subCategory">
        <FormLabel mb="0">Sub Category</FormLabel>
        <Select
          placeholder="Select option"
          value={value.subCategoryId}
          isDisabled={subCategories.length === 0}
          onChange={(e) => onChange({ ...value, subCategoryId: e.target.value })}
        >
          {subCategories.map((sub) => (
            <option key={sub.id} value={sub.id}>
              {sub.name}
            </option>
          ))}
        </Select>
      </FormControl>

      <FormControl id="date" isRequired>
        <FormLabel mb="0">Date</FormLabel>
        <Input
          type="date"
          max={today}
          value={value.date}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
        />
      </FormControl>
    </Stack>
  );
};

export default AttendanceDetailsForm;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test src/components/attendance/AttendanceDetailsForm.test.tsx --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/attendance/AttendanceDetailsForm.tsx src/components/attendance/AttendanceDetailsForm.test.tsx
git commit -m "feat: add shared AttendanceDetailsForm component"
```

---

### Task 3: Refactor `CreateAttendance` onto the shared hook + component

**Files:**
- Modify: `src/pages/CreateAttendance.tsx` (replace inline form + query; keep behavior)

**Interfaces:**
- Consumes: `useCategories` (Task 1), `AttendanceDetailsForm` + `AttendanceDetails` (Task 2).

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/pages/CreateAttendance.tsx` with:

```tsx
import {
  Box,
  Flex,
  useColorModeValue,
  Text,
  Button,
  Stack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { PROTECTED_PATHS } from "routes/pagePath";
import useGlobalStore, { currentAttendanceType } from "zStore";
import { queryClient } from "services/api/apiHelper";
import { Q_KEY } from "utils/constant";
import { FaArrowCircleLeft } from "react-icons/fa";
import { useState } from "react";
import { toast } from "react-toastify";
import { useCategories } from "hooks/useCategories";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";

const EMPTY_DETAILS: AttendanceDetails = {
  name: "",
  categoryId: "",
  subCategoryId: "",
  date: "",
};

const CreateAttendance = () => {
  const navigate = useNavigate();
  const [updateCurrentAttendance, org] = useGlobalStore((state) => [
    state.updateCurrentAttendance,
    state.organisation,
  ]);
  const { categories } = useCategories(org.id);
  const [details, setDetails] = useState<AttendanceDetails>(EMPTY_DETAILS);

  const onContinue = () => {
    if (!details.name.trim() || !details.date) {
      toast.error("Name and date are required");
      return;
    }
    const payload: currentAttendanceType = {
      name: details.name.trim(),
      date: details.date,
      ...(details.categoryId ? { categoryId: details.categoryId } : {}),
      ...(details.subCategoryId ? { subCategoryId: details.subCategoryId } : {}),
    };
    updateCurrentAttendance(payload);
    queryClient.invalidateQueries({ queryKey: [Q_KEY.GET_MEMBERS] });
    navigate(PROTECTED_PATHS.MARK_ATTENANCE);
  };

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
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
      <Flex>
        <Button mt="4" ml="2" onClick={() => navigate(PROTECTED_PATHS.CATEGORY)}>
          Add Category
        </Button>
        <Button
          mt="4"
          ml="6"
          onClick={() => navigate(PROTECTED_PATHS.SUB_CATEGORY)}
        >
          Add Sub-Category
        </Button>
      </Flex>
      <Flex
        align={"center"}
        justify={"center"}
        bg={useColorModeValue("gray.50", "gray.800")}
      >
        <Stack
          spacing={4}
          w={"full"}
          mt="5rem"
          maxW={"md"}
          bg={useColorModeValue("white", "gray.700")}
          rounded={"xl"}
          boxShadow={"lg"}
          p={6}
        >
          <AttendanceDetailsForm
            value={details}
            onChange={setDetails}
            categories={categories}
          />
          <Button
            w="full"
            mt="40px"
            bg={"blue.400"}
            color={"white"}
            _hover={{ bg: "blue.500" }}
            fontWeight="bold"
            fontSize="15px"
            onClick={onContinue}
          >
            Continue
          </Button>
        </Stack>
      </Flex>
    </Box>
  );
};

export default CreateAttendance;
```

- [ ] **Step 2: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors. (Note: `CreateAttendance` no longer exports `CategoryType`; Task 1 already repointed `SubCategory`'s import, so this compiles.)
Run: `CI=true yarn test --watchAll=false`
Expected: all PASS.

- [ ] **Step 3: Manual verification**

`yarn start`; Dashboard → Create Attendance. Confirm the form still has Name/Category/Sub Category/Date, sub-category options track the chosen category, blank name/date shows the "Name and date are required" toast, and Continue lands on the member roster with the chosen values.

- [ ] **Step 4: Commit**

```bash
git add src/pages/CreateAttendance.tsx
git commit -m "refactor: build CreateAttendance from shared details form + useCategories"
```

---

### Task 4: Surface editable details on `MarkAttendance` (edit mode)

**Files:**
- Modify: `src/pages/MarkAttendance.tsx` (imports; derive details; render form in update mode; guard Update)

**Interfaces:**
- Consumes: `useCategories` (Task 1), `AttendanceDetailsForm` + `AttendanceDetails` (Task 2). Relies on `currentAttendance.date` being `string` (Task 1).

- [ ] **Step 1: Add imports**

In `src/pages/MarkAttendance.tsx`, after the `LoadingSpinner` import (line 34), add:

```ts
import { useCategories } from "hooks/useCategories";
import AttendanceDetailsForm, {
  AttendanceDetails,
} from "components/attendance/AttendanceDetailsForm";
```

- [ ] **Step 2: Fetch categories and derive the details value + change handler**

In the `MarkAttendance` component body, immediately after the line `const localStorageKey = \`attendance-${org.id}\`;` (line 109), add:

```ts
  const { categories } = useCategories(org.id);
  const detailsCardBg = useColorModeValue("white", "gray.700");

  // Edit mode shows the session-details form, driven by the loaded currentAttendance.
  const details: AttendanceDetails = {
    name: currentAttendance.name ?? "",
    categoryId: currentAttendance.categoryId ?? "",
    subCategoryId: currentAttendance.subCategoryId ?? "",
    date: (currentAttendance.date ?? "").slice(0, 10),
  };

  const onDetailsChange = (next: AttendanceDetails) => {
    setAttendance({
      ...currentAttendance,
      name: next.name,
      date: next.date,
      categoryId: next.categoryId || undefined,
      subCategoryId: next.subCategoryId || undefined,
    });
  };
```

- [ ] **Step 3: Render the form above the roster in update mode**

In the JSX, inside the `!isLoadingData` branch, immediately after the opening `<>` (currently line 309) and before the search `InputGroup` (line 310), add:

```tsx
            {isUpdate && (
              <Box
                mt="4"
                p="4"
                bg={detailsCardBg}
                rounded="xl"
                boxShadow="sm"
              >
                <AttendanceDetailsForm
                  value={details}
                  onChange={onDetailsChange}
                  categories={categories}
                />
              </Box>
            )}
```

- [ ] **Step 4: Guard the Update button on name + date**

Replace the submit button's `isDisabled` prop (currently `isDisabled={attendanceInfo.present === 0}`, line 360) with:

```tsx
              isDisabled={
                attendanceInfo.present === 0 ||
                (isUpdate && (!details.name.trim() || !details.date))
              }
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `CI=true yarn test --watchAll=false`
Expected: all PASS.

- [ ] **Step 6: Manual verification (edit round-trip)**

`yarn start`; open an editable session (one with edits remaining) via the pencil on All Attendance. Confirm the details form appears prefilled with the session's name/category/sub-category/date; change the name, pick a different category (sub-category resets), change the date; toggle a member; Update. Reload the session and confirm the new name/category/date persisted. Confirm clearing the name disables Update.

- [ ] **Step 7: Commit**

```bash
git add src/pages/MarkAttendance.tsx
git commit -m "feat: allow editing name/category/sub-category/date on attendance edit"
```

---

### Task 5: Render the org logo image

**Files:**
- Modify: `src/pages/Organisations.tsx:112` (avatar `src`)
- Modify: `src/pages/OrganisationSettings.tsx` (Chakra import; `watch`; logo preview)

**Interfaces:**
- Consumes: `org.image` (already on `OrganisationType`).

- [ ] **Step 1: Give the org-list avatar an image source**

In `src/pages/Organisations.tsx`, change the avatar (line 112) from:

```tsx
                  <Avatar name={org.name} w="45px" h="45px" />
```

to:

```tsx
                  <Avatar name={org.name} src={org.image} w="45px" h="45px" />
```

(Chakra `Avatar` falls back to name-initials automatically when `src` is empty or fails to load.)

- [ ] **Step 2: Add a logo preview on the settings page**

In `src/pages/OrganisationSettings.tsx`:

Add `Avatar` to the Chakra import (it currently imports `Box, Flex, Text, Button, Stack, FormControl, FormLabel, FormErrorMessage, FormHelperText, Input, Switch, useColorModeValue`) — add `Avatar`:

```ts
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
  Avatar,
  useColorModeValue,
} from "@chakra-ui/react";
```

Add `watch` to the `useForm` destructure (currently `const { register, handleSubmit, reset, formState: { errors } } = useForm<OrgSettingsForm>({...})`):

```ts
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<OrgSettingsForm>({
```

Replace the Logo URL `FormControl` block (currently the `<Input>` for `image` wrapped in its `FormControl`) so the input sits beside a live preview:

```tsx
                <FormControl isInvalid={Boolean(errors.image)}>
                  <FormLabel>Logo URL</FormLabel>
                  <Flex align="center" gap={3}>
                    <Avatar
                      name={watch("name")}
                      src={watch("image")}
                      size="md"
                    />
                    <Input
                      placeholder="https://cdn.example.com/logo.png"
                      {...register("image", {
                        validate: (v) =>
                          v.trim() === "" ||
                          isUrl(v.trim()) ||
                          "Enter a valid URL",
                      })}
                    />
                  </Flex>
                  <FormErrorMessage>{errors.image?.message}</FormErrorMessage>
                </FormControl>
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `CI=true yarn test --watchAll=false`
Expected: all PASS — in particular `src/pages/OrganisationSettings.test.tsx` still finds the "Logo URL" field by label (the `FormControl` still assigns its id to the `Input`; the `Avatar` is not a form control).

- [ ] **Step 4: Manual verification**

`yarn start`; open Organisation Settings, paste a valid image URL → the preview avatar updates live. Save, go to the org switcher (`/organisations`) → the org now shows the logo (a broken/empty URL falls back to initials). 

- [ ] **Step 5: Commit**

```bash
git add src/pages/Organisations.tsx src/pages/OrganisationSettings.tsx
git commit -m "feat: display org logo on org list and settings preview"
```

---

## Self-Review

**Spec coverage:**
- `useCategories` hook (dedup fetch) → Task 1. Shared types moved + `SubCategory` repointed → Task 1.
- `AttendanceDetailsForm` presentational/controlled, sub-category filtered + reset on category change → Task 2.
- `CreateAttendance` reuses hook + component, behavior preserved → Task 3.
- `MarkAttendance` edit-mode form, seeded from `currentAttendance`, writes back, Update guarded on name/date → Task 4.
- Org image: avatar `src` + settings preview → Task 5.
- Date-as-string correctness (spec: dates are `"YYYY-MM-DD"`) → Task 1 fixes `currentAttendanceType.date`, removing casts in Tasks 3/4.
- Testing: `useCategories` (Task 1), `AttendanceDetailsForm` (Task 2); Create/Mark verified by tsc + suite + manual round-trips (Tasks 3/4); settings-label regression re-checked (Task 5).

**Placeholder scan:** none — every code step carries full code.

**Type consistency:** `AttendanceDetails` (Task 2) used verbatim in Tasks 3/4. `CategoryType`/`useCategories` (Task 1) used in Tasks 2/3/4. `currentAttendanceType.date: string` (Task 1) is what Tasks 3/4 assign without casts. `onChange(next: AttendanceDetails)` signature matches `setDetails` (Task 3) and `onDetailsChange` (Task 4).

**Cross-task note:** Task 1 repoints `SubCategory`'s `CategoryType` import BEFORE Task 3 removes the export from `CreateAttendance`, so there is no window where the import dangles. If executed out of order, run Task 1 before Task 3.

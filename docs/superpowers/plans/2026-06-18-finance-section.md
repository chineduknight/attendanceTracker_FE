# Finance Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained Finance section (obligations, payments, compliance grid, member accountability) to the Presence Pro frontend, against the already-built API.

**Architecture:** One lazy-loaded `Finance` page using Chakra `Tabs` (Obligations · Compliance · Payments · Accountability). Tab UIs are separate focused components under `src/components/finance/`. Data flows through the existing React Query wrappers; pure payload/format helpers are extracted so they can be unit-tested in isolation.

**Tech Stack:** React 18, TypeScript, Chakra UI v2, React Query v4, react-hook-form, react-select, date-fns, react-toastify, react-confirm-alert. Testing: CRA `react-scripts test` (Jest) + React Testing Library.

## Global Constraints

- **Imports are absolute from `src`** (tsconfig `baseUrl: "./src"`). E.g. `import { financeRequest } from "services";`.
- **Dates are always `"YYYY-MM-DD"` strings** — format with `date-fns` `format(date, "yyyy-MM-dd")`.
- **Reads** use `useQueryWrapper(key, url, options)`; **writes** use `useMutationWrapper(makeAPICall, onSuccess?)` + `postRequest`/`putRequest`/`patchRequest`/`deleteRequest` from `services/api/apiHelper`.
- **URLs** are built with `convertParamsToString(url, { param: value })` from `helpers/stringManipulations`.
- **`organisation.id`** comes from `useGlobalStore((s) => s.organisation)`.
- **Exports return a URL string in `data`** — open with `window.open(url, "_blank")`, never expect file bytes.
- **Money** is formatted with the existing `formatAmount(value, countryCode, currency)`; currency is hardcoded to NGN/`NG` via constants for now.
- **Amounts are immutable** on existing obligations — only `name` is editable.
- **Tests run non-interactively** with `CI=true yarn test <path> --watchAll=false`.

---

### Task 1: Finance constants, types, and pure helpers

**Files:**
- Create: `src/components/finance/financeTypes.ts`
- Create: `src/helpers/financeConstants.ts`
- Create: `src/helpers/financePayloads.ts`
- Test: `src/helpers/financePayloads.test.ts`

**Interfaces:**
- Produces:
  - `type ObligationType = "dues" | "levy"`
  - `type MonthStatus = "paid" | "partial" | "unpaid" | "not-due"`
  - `interface Obligation { id: string; type: ObligationType; name: string; year?: number; amountPerMonth?: number; amount?: number; date?: string; }`
  - `interface ComplianceRow { memberId: string; name: string; accountable: boolean; months?: Record<string, MonthStatus>; totalExpected?: number; totalPaid?: number; balance?: number; paidUpToMonth?: number; compliance?: number; creditMonths?: number[]; liable?: boolean; expected?: number; paid?: number; status?: MonthStatus; }`
  - `interface ComplianceSummary { totalMembers: number; accountableMembers: number; totalCollected: number; totalOutstanding: number; }`
  - `MONTHS: { value: number; label: string }[]` (1..12 → Jan..Dec)
  - `monthStatusColor(status: MonthStatus): string` (Chakra bg token)
  - `DEFAULT_CURRENCY = "NGN"`, `DEFAULT_COUNTRY = "NG"`
  - `formatMoney(value: number): string` (wraps `formatAmount` with defaults)
  - `buildRecordPaymentPayload(input: { organisationId: string; obligationId: string; memberId: string; amount: number }): object`
  - `buildDuesCorrectionPayload(input: { organisationId: string; obligationId: string; memberId: string; monthlyPaid: Record<string, number> }): object`
  - `buildLevyCorrectionPayload(input: { organisationId: string; obligationId: string; memberId: string; amountPaid: number }): object`

- [ ] **Step 1: Write the failing test**

`src/helpers/financePayloads.test.ts`:

```ts
import {
  buildRecordPaymentPayload,
  buildDuesCorrectionPayload,
  buildLevyCorrectionPayload,
} from "helpers/financePayloads";
import { monthStatusColor } from "helpers/financeConstants";

describe("finance payload builders", () => {
  const base = { organisationId: "org1", obligationId: "ob1", memberId: "m1" };

  it("builds a record-payment payload", () => {
    expect(buildRecordPaymentPayload({ ...base, amount: 1500 })).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      amount: 1500,
    });
  });

  it("builds a dues correction payload with a monthlyPaid map", () => {
    expect(
      buildDuesCorrectionPayload({ ...base, monthlyPaid: { "1": 500, "2": 500 } })
    ).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      monthlyPaid: { "1": 500, "2": 500 },
    });
  });

  it("builds a levy correction payload with amountPaid", () => {
    expect(buildLevyCorrectionPayload({ ...base, amountPaid: 10000 })).toEqual({
      organisationId: "org1",
      obligationId: "ob1",
      memberId: "m1",
      amountPaid: 10000,
    });
  });
});

describe("monthStatusColor", () => {
  it("maps each status to a distinct color and falls back for unknown", () => {
    expect(monthStatusColor("paid")).toBe("green.100");
    expect(monthStatusColor("partial")).toBe("yellow.100");
    expect(monthStatusColor("unpaid")).toBe("red.100");
    expect(monthStatusColor("not-due")).toBe("gray.100");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test src/helpers/financePayloads.test.ts --watchAll=false`
Expected: FAIL — cannot find modules `helpers/financePayloads` / `helpers/financeConstants`.

- [ ] **Step 3: Write the types**

`src/components/finance/financeTypes.ts`:

```ts
export type ObligationType = "dues" | "levy";
export type MonthStatus = "paid" | "partial" | "unpaid" | "not-due";

export interface Obligation {
  id: string;
  type: ObligationType;
  name: string;
  year?: number;
  amountPerMonth?: number;
  amount?: number;
  date?: string;
}

export interface ComplianceRow {
  memberId: string;
  name: string;
  accountable: boolean;
  // dues
  months?: Record<string, MonthStatus>;
  totalExpected?: number;
  totalPaid?: number;
  balance?: number;
  paidUpToMonth?: number;
  compliance?: number;
  creditMonths?: number[];
  // levy
  liable?: boolean;
  expected?: number;
  paid?: number;
  status?: MonthStatus;
}

export interface ComplianceSummary {
  totalMembers: number;
  accountableMembers: number;
  totalCollected: number;
  totalOutstanding: number;
}

export interface ComplianceResponse {
  obligation: Obligation;
  summary: ComplianceSummary;
  rows: ComplianceRow[];
}
```

- [ ] **Step 4: Write the constants**

`src/helpers/financeConstants.ts`:

```ts
import { formatAmount } from "helpers/stringManipulations";
import { MonthStatus } from "components/finance/financeTypes";

export const DEFAULT_CURRENCY = "NGN";
export const DEFAULT_COUNTRY = "NG";

export const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

const STATUS_COLORS: Record<MonthStatus, string> = {
  paid: "green.100",
  partial: "yellow.100",
  unpaid: "red.100",
  "not-due": "gray.100",
};

export function monthStatusColor(status: MonthStatus): string {
  return STATUS_COLORS[status] ?? "gray.100";
}

export function formatMoney(value: number): string {
  return String(formatAmount(value ?? 0, DEFAULT_COUNTRY, DEFAULT_CURRENCY));
}
```

- [ ] **Step 5: Write the payload builders**

`src/helpers/financePayloads.ts`:

```ts
interface RecordInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  amount: number;
}
interface DuesCorrectionInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  monthlyPaid: Record<string, number>;
}
interface LevyCorrectionInput {
  organisationId: string;
  obligationId: string;
  memberId: string;
  amountPaid: number;
}

export function buildRecordPaymentPayload(input: RecordInput) {
  const { organisationId, obligationId, memberId, amount } = input;
  return { organisationId, obligationId, memberId, amount };
}

export function buildDuesCorrectionPayload(input: DuesCorrectionInput) {
  const { organisationId, obligationId, memberId, monthlyPaid } = input;
  return { organisationId, obligationId, memberId, monthlyPaid };
}

export function buildLevyCorrectionPayload(input: LevyCorrectionInput) {
  const { organisationId, obligationId, memberId, amountPaid } = input;
  return { organisationId, obligationId, memberId, amountPaid };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `CI=true yarn test src/helpers/financePayloads.test.ts --watchAll=false`
Expected: PASS (all 5 tests).

- [ ] **Step 7: Commit**

```bash
git add src/components/finance/financeTypes.ts src/helpers/financeConstants.ts src/helpers/financePayloads.ts src/helpers/financePayloads.test.ts
git commit -m "feat(finance): add finance types, constants, and payload helpers"
```

---

### Task 2: API request constants

**Files:**
- Modify: `src/services/api/request.ts` (append a new export block)

**Interfaces:**
- Produces: `financeRequest` object with keys `OBLIGATIONS`, `LIST_OBLIGATIONS`, `ONE_OBLIGATION`, `UPDATE_OBLIGATION`, `PAYMENTS`, `COMPLIANCE`, `COMPLIANCE_EXPORT_EXCEL`, `COMPLIANCE_EXPORT_PDF`, `FINANCIAL_START_DATE`. Exported transitively via `services` (`services/index.ts` → `./api` → `./request`).

- [ ] **Step 1: Add the request block**

Append to `src/services/api/request.ts`:

```ts
export const financeRequest = {
  OBLIGATIONS: "/finance/obligations",
  LIST_OBLIGATIONS: "/finance/:organisationId/obligations",
  ONE_OBLIGATION: "/finance/:organisationId/obligations/:id",
  UPDATE_OBLIGATION: "/finance/obligations/:id",
  PAYMENTS: "/finance/payments",
  COMPLIANCE: "/finance/:organisationId/obligations/:id/compliance",
  COMPLIANCE_EXPORT_EXCEL:
    "/finance/:organisationId/obligations/:id/compliance/export/excel",
  COMPLIANCE_EXPORT_PDF:
    "/finance/:organisationId/obligations/:id/compliance/export/pdf",
  FINANCIAL_START_DATE: "/finance/members/:memberId/financial-start-date",
};
```

- [ ] **Step 2: Verify it compiles and is importable**

Run: `CI=true yarn test src/helpers/financePayloads.test.ts --watchAll=false`
(Adds nothing testable yet; this just confirms the project still compiles. Expected: PASS.)

- [ ] **Step 3: Commit**

```bash
git add src/services/api/request.ts
git commit -m "feat(finance): add finance API request constants"
```

---

### Task 3: Route, Dashboard button, and Finance shell page

**Files:**
- Modify: `src/routes/pagePath.ts` (add `FINANCE`)
- Modify: `src/routes/protectedRoutes.tsx` (lazy import + route)
- Modify: `src/pages/Dashboard.tsx` (add Finance action)
- Create: `src/pages/Finance.tsx`
- Test: `src/pages/Finance.test.tsx`

**Interfaces:**
- Consumes: `PROTECTED_PATHS.FINANCE`.
- Produces: default-exported `Finance` page rendering a Chakra `Tabs` with tab labels `Obligations`, `Compliance`, `Payments`, `Accountability`. Holds `selectedObligationId` state and `tabIndex` state, passing `selectedObligationId`, `setSelectedObligationId`, and `goToTab(index)` down to tab components (added in later tasks). Until later tasks land, each `TabPanel` renders a placeholder `Text`.

- [ ] **Step 1: Add the path**

In `src/routes/pagePath.ts`, add to `PROTECTED_PATHS`:

```ts
  FINANCE: "/finance",
```

- [ ] **Step 2: Register the route**

In `src/routes/protectedRoutes.tsx`:
- Add lazy import alongside the others:

```tsx
const Finance = WithSuspense(lazy(() => import("pages/Finance")));
```

- Add `FINANCE` to the destructured `PROTECTED_PATHS`:

```tsx
  ANALYTICS,
  BIRTHDAY,
  FINANCE,
} = PROTECTED_PATHS;
```

- Add the route to the `PROTECTED_ROUTES` array (before the `"/"` redirect):

```tsx
  { path: FINANCE, element: <Finance /> },
```

- [ ] **Step 3: Add the Dashboard button**

In `src/pages/Dashboard.tsx`:
- Add `FaMoneyBillWave` to the `react-icons/fa` import.
- Add to `DASHBOARD_ACTIONS`:

```tsx
  { label: "Finance", icon: FaMoneyBillWave, colorScheme: "green", path: PROTECTED_PATHS.FINANCE },
```

- [ ] **Step 4: Write the failing test**

`src/pages/Finance.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Finance from "pages/Finance";

test("renders the four finance tabs", () => {
  render(
    <MemoryRouter>
      <Finance />
    </MemoryRouter>
  );
  expect(screen.getByText("Obligations")).toBeInTheDocument();
  expect(screen.getByText("Compliance")).toBeInTheDocument();
  expect(screen.getByText("Payments")).toBeInTheDocument();
  expect(screen.getByText("Accountability")).toBeInTheDocument();
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `CI=true yarn test src/pages/Finance.test.tsx --watchAll=false`
Expected: FAIL — cannot find module `pages/Finance`.

- [ ] **Step 6: Write the shell page**

`src/pages/Finance.tsx`:

```tsx
import { useState } from "react";
import {
  Box,
  Flex,
  Text,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useColorModeValue,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import BackButton from "components/BackButton";

const Finance = () => {
  const navigate = useNavigate();
  const [selectedObligationId, setSelectedObligationId] = useState<string>("");
  const [tabIndex, setTabIndex] = useState<number>(0);

  return (
    <Box minH={"100vh"} bg={useColorModeValue("gray.50", "gray.800")}>
      <Flex bg="blue.500" justifyContent="space-between" alignItems="center" p="4">
        <Text fontWeight="bold" color="#fff">
          Finance
        </Text>
      </Flex>

      <BackButton handleClick={() => navigate(-1)} />

      <Box p={4}>
        <Tabs index={tabIndex} onChange={setTabIndex} variant="enclosed" colorScheme="green">
          <TabList>
            <Tab>Obligations</Tab>
            <Tab>Compliance</Tab>
            <Tab>Payments</Tab>
            <Tab>Accountability</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <Text>Obligations coming soon</Text>
            </TabPanel>
            <TabPanel>
              <Text>Compliance coming soon</Text>
            </TabPanel>
            <TabPanel>
              <Text>Payments coming soon</Text>
            </TabPanel>
            <TabPanel>
              <Text>Accountability coming soon</Text>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>
    </Box>
  );
};

export default Finance;
```

> Note: `selectedObligationId`, `setSelectedObligationId`, and `setTabIndex` are wired to real tab components in Tasks 5–7. They are declared now so the shell's contract is stable.

- [ ] **Step 7: Run test to verify it passes**

Run: `CI=true yarn test src/pages/Finance.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/pagePath.ts src/routes/protectedRoutes.tsx src/pages/Dashboard.tsx src/pages/Finance.tsx src/pages/Finance.test.tsx
git commit -m "feat(finance): add finance route, dashboard button, and tabbed shell"
```

---

### Task 4: ObligationsTab (list, create, rename, delete)

**Files:**
- Create: `src/components/finance/ObligationsTab.tsx`
- Modify: `src/pages/Finance.tsx` (render `ObligationsTab` in the first panel)

**Interfaces:**
- Consumes: `financeRequest`, `convertParamsToString`, `useQueryWrapper`, `useMutationWrapper`, `postRequest`/`putRequest`/`deleteRequest`, `queryClient`, `Obligation` type, `formatMoney`.
- Props: `{ organisationId: string; selectedObligationId: string; onSelectObligation: (id: string) => void; }`. `onSelectObligation` should set `selectedObligationId` AND switch to the Compliance tab — Finance passes `(id) => { setSelectedObligationId(id); setTabIndex(1); }`.
- Query key: `["finance-obligations", organisationId]`.

- [ ] **Step 1: Write the component**

`src/components/finance/ObligationsTab.tsx`:

```tsx
import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Text,
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  useDisclosure,
  Badge,
} from "@chakra-ui/react";
import { confirmAlert } from "react-confirm-alert";
import "react-confirm-alert/src/react-confirm-alert.css";
import { toast } from "react-toastify";
import { financeRequest } from "services";
import {
  useQueryWrapper,
  useMutationWrapper,
  postRequest,
  putRequest,
  deleteRequest,
  queryClient,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { formatMoney } from "helpers/financeConstants";
import { Obligation, ObligationType } from "components/finance/financeTypes";

interface Props {
  organisationId: string;
  selectedObligationId: string;
  onSelectObligation: (id: string) => void;
}

const ObligationsTab = ({ organisationId, selectedObligationId, onSelectObligation }: Props) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editing, setEditing] = useState<Obligation | null>(null);
  const [type, setType] = useState<ObligationType>("dues");
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [amountPerMonth, setAmountPerMonth] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");

  const listUrl = convertParamsToString(financeRequest.LIST_OBLIGATIONS, { organisationId });
  const { data, isLoading } = useQueryWrapper(["finance-obligations", organisationId], listUrl);
  const obligations: Obligation[] = data?.data ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries(["finance-obligations", organisationId]);

  const { mutate: createMutate, isLoading: creating } = useMutationWrapper(postRequest, () => {
    toast.success("Obligation created");
    invalidate();
    closeModal();
  });
  const { mutate: renameMutate, isLoading: renaming } = useMutationWrapper(putRequest, () => {
    toast.success("Obligation updated");
    invalidate();
    closeModal();
  });
  const { mutate: deleteMutate } = useMutationWrapper(deleteRequest, () => {
    toast.success("Obligation deleted");
    invalidate();
  });

  const resetForm = () => {
    setEditing(null);
    setType("dues");
    setName("");
    setYear("");
    setAmountPerMonth("");
    setAmount("");
    setDate("");
  };

  const closeModal = () => {
    resetForm();
    onClose();
  };

  const openCreate = () => {
    resetForm();
    onOpen();
  };

  const openEdit = (ob: Obligation) => {
    setEditing(ob);
    setType(ob.type);
    setName(ob.name);
    setYear(ob.year ? String(ob.year) : "");
    setAmountPerMonth(ob.amountPerMonth ? String(ob.amountPerMonth) : "");
    setAmount(ob.amount ? String(ob.amount) : "");
    setDate(ob.date ?? "");
    onOpen();
  };

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (editing) {
      // amounts immutable — name only
      const url = convertParamsToString(financeRequest.UPDATE_OBLIGATION, { id: editing.id });
      renameMutate({ url, data: { organisationId, name } });
      return;
    }
    const data =
      type === "dues"
        ? { organisationId, type, name, year: Number(year), amountPerMonth: Number(amountPerMonth) }
        : { organisationId, type, name, amount: Number(amount), date };
    createMutate({ url: financeRequest.OBLIGATIONS, data });
  };

  const remove = (ob: Obligation) => {
    confirmAlert({
      title: "Delete obligation",
      message: `Delete "${ob.name}"? This cannot be undone.`,
      buttons: [
        {
          label: "Yes, delete",
          onClick: () => {
            const url = convertParamsToString(financeRequest.ONE_OBLIGATION, {
              organisationId,
              id: ob.id,
            });
            deleteMutate({ url });
          },
        },
        { label: "Cancel", onClick: () => undefined },
      ],
    });
  };

  if (isLoading) return <Spinner />;

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="md">Obligations</Heading>
        <Button colorScheme="green" onClick={openCreate}>
          Create obligation
        </Button>
      </Flex>

      {obligations.length === 0 ? (
        <Text>No obligations yet. Create one to get started.</Text>
      ) : (
        <SimpleGrid columns={[1, 2, 3]} spacing={4}>
          {obligations.map((ob) => (
            <Box
              key={ob.id}
              p={4}
              borderWidth="1px"
              borderRadius="md"
              borderColor={ob.id === selectedObligationId ? "green.400" : "gray.200"}
              bg="white"
            >
              <Flex justify="space-between" align="center" mb={2}>
                <Text fontWeight="bold">{ob.name}</Text>
                <Badge colorScheme={ob.type === "dues" ? "purple" : "orange"}>{ob.type}</Badge>
              </Flex>
              <Text fontSize="sm" color="gray.600">
                {ob.type === "dues"
                  ? `${ob.year} · ${formatMoney(ob.amountPerMonth ?? 0)}/mo`
                  : `${ob.date} · ${formatMoney(ob.amount ?? 0)}`}
              </Text>
              <Flex gap={2} mt={3}>
                <Button size="sm" colorScheme="blue" onClick={() => onSelectObligation(ob.id)}>
                  View compliance
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(ob)}>
                  Rename
                </Button>
                <Button size="sm" colorScheme="red" variant="ghost" onClick={() => remove(ob)}>
                  Delete
                </Button>
              </Flex>
            </Box>
          ))}
        </SimpleGrid>
      )}

      <Modal isOpen={isOpen} onClose={closeModal}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{editing ? "Rename obligation" : "Create obligation"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb={3}>
              <FormLabel>Type</FormLabel>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as ObligationType)}
                isDisabled={!!editing}
              >
                <option value="dues">Dues (yearly)</option>
                <option value="levy">Levy (one-off)</option>
              </Select>
            </FormControl>
            <FormControl mb={3} isRequired>
              <FormLabel>Name</FormLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </FormControl>
            {type === "dues" ? (
              <>
                <FormControl mb={3}>
                  <FormLabel>Year</FormLabel>
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
                <FormControl mb={3}>
                  <FormLabel>Amount per month</FormLabel>
                  <Input
                    type="number"
                    value={amountPerMonth}
                    onChange={(e) => setAmountPerMonth(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
              </>
            ) : (
              <>
                <FormControl mb={3}>
                  <FormLabel>Amount</FormLabel>
                  <Input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
                <FormControl mb={3}>
                  <FormLabel>Date</FormLabel>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    isDisabled={!!editing}
                  />
                </FormControl>
              </>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={closeModal}>
              Cancel
            </Button>
            <Button colorScheme="green" onClick={submit} isLoading={creating || renaming}>
              {editing ? "Save" : "Create"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default ObligationsTab;
```

- [ ] **Step 2: Wire it into the Finance shell**

In `src/pages/Finance.tsx`:
- Add `import ObligationsTab from "components/finance/ObligationsTab";` and `import useGlobalStore from "zStore";`.
- Add inside the component: `const [organisation] = useGlobalStore((s) => [s.organisation]);`
- Replace the first `TabPanel`'s placeholder with:

```tsx
            <TabPanel>
              <ObligationsTab
                organisationId={organisation.id}
                selectedObligationId={selectedObligationId}
                onSelectObligation={(id) => {
                  setSelectedObligationId(id);
                  setTabIndex(1);
                }}
              />
            </TabPanel>
```

- [ ] **Step 3: Verify the existing Finance test still passes**

Run: `CI=true yarn test src/pages/Finance.test.tsx --watchAll=false`
Expected: PASS (tabs still render; the obligations query is unresolved but the panel mounts only when active — first tab is active, so ensure the test still finds the tab labels). If the test errors on the unresolved query, wrap render in a `QueryClientProvider` using the exported `queryClient`:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
// ...
render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <Finance />
    </MemoryRouter>
  </QueryClientProvider>
);
```

Expected after wrap: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/finance/ObligationsTab.tsx src/pages/Finance.tsx src/pages/Finance.test.tsx
git commit -m "feat(finance): obligations tab (list, create, rename, delete)"
```

---

### Task 5: RecordPaymentModal (shared record + correct)

**Files:**
- Create: `src/components/finance/RecordPaymentModal.tsx`
- Test: `src/components/finance/RecordPaymentModal.test.tsx`

**Interfaces:**
- Consumes: `buildRecordPaymentPayload`, `buildDuesCorrectionPayload`, `buildLevyCorrectionPayload`, `financeRequest`, `useMutationWrapper`, `postRequest`, `putRequest`, `MONTHS`, `Obligation` type.
- Props:

```ts
interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  organisationId: string;
  obligation: Obligation;       // gives type + id
  memberId: string;
  memberName: string;
  onSuccess: () => void;        // caller invalidates compliance query
}
```

- Behaviour: a `mode` toggle "Record" | "Correct".
  - Record → `postRequest` to `financeRequest.PAYMENTS` with `buildRecordPaymentPayload`.
  - Correct + dues → `putRequest` to `financeRequest.PAYMENTS` with `buildDuesCorrectionPayload` (a 12-row month → amount input set built from `MONTHS`).
  - Correct + levy → `putRequest` with `buildLevyCorrectionPayload` (single `amountPaid` input).

- [ ] **Step 1: Write the failing test**

`src/components/finance/RecordPaymentModal.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import RecordPaymentModal from "components/finance/RecordPaymentModal";
import { Obligation } from "components/finance/financeTypes";

const dues: Obligation = { id: "ob1", type: "dues", name: "2026 Dues", year: 2026, amountPerMonth: 500 };
const levy: Obligation = { id: "ob2", type: "levy", name: "Building", amount: 10000, date: "2026-06-18" };

const baseProps = {
  isOpen: true,
  onClose: () => undefined,
  organisationId: "org1",
  memberId: "m1",
  memberName: "Ada",
  onSuccess: () => undefined,
};

test("record mode shows a single amount input", () => {
  render(<RecordPaymentModal {...baseProps} obligation={dues} />);
  expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
});

test("correct mode on dues shows 12 month inputs", () => {
  render(<RecordPaymentModal {...baseProps} obligation={dues} />);
  fireEvent.click(screen.getByText(/correct/i));
  expect(screen.getByLabelText("Jan")).toBeInTheDocument();
  expect(screen.getByLabelText("Dec")).toBeInTheDocument();
});

test("correct mode on levy shows a single amountPaid input", () => {
  render(<RecordPaymentModal {...baseProps} obligation={levy} />);
  fireEvent.click(screen.getByText(/correct/i));
  expect(screen.getByLabelText(/total amount paid/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `CI=true yarn test src/components/finance/RecordPaymentModal.test.tsx --watchAll=false`
Expected: FAIL — cannot find module `components/finance/RecordPaymentModal`.

- [ ] **Step 3: Write the component**

`src/components/finance/RecordPaymentModal.tsx`:

```tsx
import { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Button,
  ButtonGroup,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { toast } from "react-toastify";
import { financeRequest } from "services";
import { useMutationWrapper, postRequest, putRequest } from "services/api/apiHelper";
import {
  buildRecordPaymentPayload,
  buildDuesCorrectionPayload,
  buildLevyCorrectionPayload,
} from "helpers/financePayloads";
import { MONTHS } from "helpers/financeConstants";
import { Obligation } from "components/finance/financeTypes";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  organisationId: string;
  obligation: Obligation;
  memberId: string;
  memberName: string;
  onSuccess: () => void;
}

type Mode = "record" | "correct";

const RecordPaymentModal = ({
  isOpen,
  onClose,
  organisationId,
  obligation,
  memberId,
  memberName,
  onSuccess,
}: Props) => {
  const [mode, setMode] = useState<Mode>("record");
  const [amount, setAmount] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [monthly, setMonthly] = useState<Record<string, string>>({});

  const done = () => {
    toast.success("Payment saved");
    onSuccess();
    onClose();
  };

  const { mutate: record, isLoading: recording } = useMutationWrapper(postRequest, done);
  const { mutate: correct, isLoading: correcting } = useMutationWrapper(putRequest, done);

  const base = { organisationId, obligationId: obligation.id, memberId };

  const submit = () => {
    if (mode === "record") {
      if (!amount) return toast.error("Enter an amount");
      record({ url: financeRequest.PAYMENTS, data: buildRecordPaymentPayload({ ...base, amount: Number(amount) }) });
      return;
    }
    if (obligation.type === "dues") {
      const monthlyPaid: Record<string, number> = {};
      Object.entries(monthly).forEach(([m, v]) => {
        if (v !== "") monthlyPaid[m] = Number(v);
      });
      correct({ url: financeRequest.PAYMENTS, data: buildDuesCorrectionPayload({ ...base, monthlyPaid }) });
    } else {
      correct({ url: financeRequest.PAYMENTS, data: buildLevyCorrectionPayload({ ...base, amountPaid: Number(amountPaid) }) });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Payment — {memberName}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <ButtonGroup isAttached mb={4}>
            <Button colorScheme={mode === "record" ? "green" : "gray"} onClick={() => setMode("record")}>
              Record
            </Button>
            <Button colorScheme={mode === "correct" ? "green" : "gray"} onClick={() => setMode("correct")}>
              Correct
            </Button>
          </ButtonGroup>

          {mode === "record" ? (
            <FormControl>
              <FormLabel htmlFor="amount">Amount</FormLabel>
              <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {obligation.type === "dues" && (
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Auto-fills the earliest unpaid months.
                </Text>
              )}
            </FormControl>
          ) : obligation.type === "dues" ? (
            <SimpleGrid columns={[2, 3, 4]} spacing={3}>
              {MONTHS.map((m) => (
                <FormControl key={m.value}>
                  <FormLabel htmlFor={`month-${m.value}`}>{m.label}</FormLabel>
                  <Input
                    id={`month-${m.value}`}
                    aria-label={m.label}
                    type="number"
                    value={monthly[String(m.value)] ?? ""}
                    onChange={(e) =>
                      setMonthly((prev) => ({ ...prev, [String(m.value)]: e.target.value }))
                    }
                  />
                </FormControl>
              ))}
            </SimpleGrid>
          ) : (
            <FormControl>
              <FormLabel htmlFor="amountPaid">Total amount paid</FormLabel>
              <Input
                id="amountPaid"
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
              />
            </FormControl>
          )}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            Cancel
          </Button>
          <Button colorScheme="green" onClick={submit} isLoading={recording || correcting}>
            Save
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default RecordPaymentModal;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `CI=true yarn test src/components/finance/RecordPaymentModal.test.tsx --watchAll=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/RecordPaymentModal.tsx src/components/finance/RecordPaymentModal.test.tsx
git commit -m "feat(finance): shared record/correct payment modal"
```

---

### Task 6: ComplianceTab (grid, summary, exports, row actions)

**Files:**
- Create: `src/components/finance/ComplianceTab.tsx`
- Modify: `src/pages/Finance.tsx` (render `ComplianceTab` in the second panel)

**Interfaces:**
- Consumes: `financeRequest`, `convertParamsToString`, `useQueryWrapper`, `queryClient`, `RecordPaymentModal`, `monthStatusColor`, `MONTHS`, `formatMoney`, `ComplianceResponse`/`ComplianceRow`/`Obligation` types.
- Props: `{ organisationId: string; obligationId: string; onSetStartDate: (memberId: string) => void; }`. `onSetStartDate` switches Finance to the Accountability tab (Task 7) — Finance passes `(memberId) => { setPrefillMemberId(memberId); setTabIndex(3); }`.
- Query key: `["finance-compliance", organisationId, obligationId]`.

- [ ] **Step 1: Write the component**

`src/components/finance/ComplianceTab.tsx`:

```tsx
import { useState } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Spinner,
  Badge,
} from "@chakra-ui/react";
import { FaFileExcel, FaFilePdf } from "react-icons/fa";
import { financeRequest } from "services";
import { useQueryWrapper, queryClient } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { monthStatusColor, MONTHS, formatMoney } from "helpers/financeConstants";
import { ComplianceResponse, ComplianceRow, Obligation } from "components/finance/financeTypes";
import RecordPaymentModal from "components/finance/RecordPaymentModal";

interface Props {
  organisationId: string;
  obligationId: string;
  onSetStartDate: (memberId: string) => void;
}

const ComplianceTab = ({ organisationId, obligationId, onSetStartDate }: Props) => {
  const [payFor, setPayFor] = useState<ComplianceRow | null>(null);

  if (!obligationId) {
    return <Text>Select an obligation from the Obligations tab to view compliance.</Text>;
  }

  const url = convertParamsToString(financeRequest.COMPLIANCE, { organisationId, id: obligationId });
  const { data, isLoading } = useQueryWrapper(
    ["finance-compliance", organisationId, obligationId],
    url
  );

  const payload: ComplianceResponse | undefined = data?.data;
  const obligation = payload?.obligation as Obligation | undefined;
  const isDues = obligation?.type === "dues";

  const exportFile = (kind: "excel" | "pdf") => {
    const tpl =
      kind === "excel"
        ? financeRequest.COMPLIANCE_EXPORT_EXCEL
        : financeRequest.COMPLIANCE_EXPORT_PDF;
    // Build absolute URL via the configured base; reuse fetch through query wrapper is overkill — open the API URL.
    const path = convertParamsToString(tpl, { organisationId, id: obligationId });
    window.open(`${process.env.REACT_APP_BASE_URL}${path}`, "_blank");
  };

  const invalidate = () =>
    queryClient.invalidateQueries(["finance-compliance", organisationId, obligationId]);

  if (isLoading) return <Spinner />;
  if (!payload) return <Text>No compliance data.</Text>;

  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={2}>
        <Heading size="md">{obligation?.name} compliance</Heading>
        <Flex gap={2}>
          <Button leftIcon={<FaFileExcel />} size="sm" onClick={() => exportFile("excel")}>
            Excel
          </Button>
          <Button leftIcon={<FaFilePdf />} size="sm" onClick={() => exportFile("pdf")}>
            PDF
          </Button>
        </Flex>
      </Flex>

      <SimpleGrid columns={[2, 4]} spacing={4} mb={6}>
        <Stat>
          <StatLabel>Members</StatLabel>
          <StatNumber>{payload.summary.totalMembers}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>Accountable</StatLabel>
          <StatNumber>{payload.summary.accountableMembers}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>Collected</StatLabel>
          <StatNumber>{formatMoney(payload.summary.totalCollected)}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel>Outstanding</StatLabel>
          <StatNumber>{formatMoney(payload.summary.totalOutstanding)}</StatNumber>
        </Stat>
      </SimpleGrid>

      <Box overflowX="auto">
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th>Name</Th>
              {isDues ? (
                <>
                  {MONTHS.map((m) => (
                    <Th key={m.value}>{m.label}</Th>
                  ))}
                  <Th>Paid</Th>
                  <Th>Balance</Th>
                  <Th>%</Th>
                </>
              ) : (
                <>
                  <Th>Status</Th>
                  <Th>Paid</Th>
                  <Th>Balance</Th>
                </>
              )}
              <Th>Action</Th>
            </Tr>
          </Thead>
          <Tbody>
            {payload.rows.map((row) => {
              if (!row.accountable) {
                return (
                  <Tr key={row.memberId}>
                    <Td>{row.name}</Td>
                    <Td colSpan={isDues ? 15 : 4}>
                      <Flex align="center" gap={3}>
                        <Badge>not accountable</Badge>
                        <Button size="xs" onClick={() => onSetStartDate(row.memberId)}>
                          Set start date
                        </Button>
                      </Flex>
                    </Td>
                  </Tr>
                );
              }
              return (
                <Tr key={row.memberId}>
                  <Td>{row.name}</Td>
                  {isDues ? (
                    <>
                      {MONTHS.map((m) => {
                        const status = row.months?.[String(m.value)] ?? "not-due";
                        return (
                          <Td key={m.value} bg={monthStatusColor(status)} title={status} />
                        );
                      })}
                      <Td>{formatMoney(row.totalPaid ?? 0)}</Td>
                      <Td>{formatMoney(row.balance ?? 0)}</Td>
                      <Td>{row.compliance ?? 0}%</Td>
                    </>
                  ) : (
                    <>
                      <Td bg={monthStatusColor(row.status ?? "not-due")}>{row.status}</Td>
                      <Td>{formatMoney(row.paid ?? 0)}</Td>
                      <Td>{formatMoney(row.balance ?? 0)}</Td>
                    </>
                  )}
                  <Td>
                    <Button size="xs" colorScheme="green" onClick={() => setPayFor(row)}>
                      Record payment
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>

      {payFor && obligation && (
        <RecordPaymentModal
          isOpen={!!payFor}
          onClose={() => setPayFor(null)}
          organisationId={organisationId}
          obligation={obligation}
          memberId={payFor.memberId}
          memberName={payFor.name}
          onSuccess={invalidate}
        />
      )}
    </Box>
  );
};

export default ComplianceTab;
```

> Note on exports: the other export buttons in the app (`Analytics.tsx`) call the endpoint and open the returned `data` URL. If the API requires the bearer token (it does), opening `${BASE_URL}${path}` directly in a new tab will 401. During execution, mirror `Analytics.tsx`'s exact export mechanism — fetch via `axiosInstance.get(path)` then `window.open(res.data.data, "_blank")`. Confirm the Analytics approach when implementing this step and match it.

- [ ] **Step 2: Align the export mechanism with Analytics**

Open `src/pages/Analytics.tsx`, find how it triggers Excel/PDF export, and replace `ComplianceTab`'s `exportFile` body to use the identical mechanism (almost certainly an `axiosInstance.get` + `window.open(response.data.data)`). Import `axiosInstance` from `services/api` if needed.

- [ ] **Step 3: Wire into the Finance shell**

In `src/pages/Finance.tsx`:
- Add `import ComplianceTab from "components/finance/ComplianceTab";`
- Add state: `const [prefillMemberId, setPrefillMemberId] = useState<string>("");`
- Replace the second `TabPanel`'s placeholder with:

```tsx
            <TabPanel>
              <ComplianceTab
                organisationId={organisation.id}
                obligationId={selectedObligationId}
                onSetStartDate={(memberId) => {
                  setPrefillMemberId(memberId);
                  setTabIndex(3);
                }}
              />
            </TabPanel>
```

- [ ] **Step 4: Run the Finance test**

Run: `CI=true yarn test src/pages/Finance.test.tsx --watchAll=false`
Expected: PASS (Compliance tab not active by default; tab labels still render).

- [ ] **Step 5: Commit**

```bash
git add src/components/finance/ComplianceTab.tsx src/pages/Finance.tsx
git commit -m "feat(finance): compliance grid with summary, exports, and row payment actions"
```

---

### Task 7: PaymentsTab and AccountabilityTab

**Files:**
- Create: `src/components/finance/PaymentsTab.tsx`
- Create: `src/components/finance/AccountabilityTab.tsx`
- Modify: `src/pages/Finance.tsx` (render both; pass `prefillMemberId` to Accountability)

**Interfaces:**
- `PaymentsTab` props: `{ organisationId: string; }`. Loads obligations (key `["finance-obligations", organisationId]`, shared cache with Task 4) and members (key `["finance-members", organisationId]` via `orgRequest.MEMBERS`). User picks obligation + member, opens `RecordPaymentModal`.
- `AccountabilityTab` props: `{ organisationId: string; prefillMemberId: string; }`. Loads members, shows current `financialStartDate`, supports individual PATCH + clear, and bulk set via checkboxes. Uses `financeRequest.FINANCIAL_START_DATE` + `patchRequest`.

- [ ] **Step 1: Write PaymentsTab**

`src/components/finance/PaymentsTab.tsx`:

```tsx
import { useState } from "react";
import { Box, Button, Flex, Heading, Select, Text, Spinner } from "@chakra-ui/react";
import { financeRequest, orgRequest } from "services";
import { useQueryWrapper, queryClient } from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";
import { Obligation } from "components/finance/financeTypes";
import RecordPaymentModal from "components/finance/RecordPaymentModal";

interface Props {
  organisationId: string;
}

const PaymentsTab = ({ organisationId }: Props) => {
  const [obligationId, setObligationId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [open, setOpen] = useState(false);

  const obUrl = convertParamsToString(financeRequest.LIST_OBLIGATIONS, { organisationId });
  const memUrl = convertParamsToString(orgRequest.MEMBERS, { organisationId });
  const { data: obData, isLoading: obLoading } = useQueryWrapper(
    ["finance-obligations", organisationId],
    obUrl
  );
  const { data: memData, isLoading: memLoading } = useQueryWrapper(
    ["finance-members", organisationId],
    memUrl
  );

  const obligations: Obligation[] = obData?.data ?? [];
  const members: Array<Record<string, any>> = memData?.data ?? [];
  const selectedObligation = obligations.find((o) => o.id === obligationId);
  const selectedMember = members.find((m) => (m.id ?? m._id) === memberId);

  if (obLoading || memLoading) return <Spinner />;

  return (
    <Box>
      <Heading size="md" mb={4}>
        Record / correct a payment
      </Heading>
      <Flex direction={["column", "row"]} gap={4} maxW="2xl">
        <Select
          placeholder="Select obligation"
          value={obligationId}
          onChange={(e) => setObligationId(e.target.value)}
        >
          {obligations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.type})
            </option>
          ))}
        </Select>
        <Select
          placeholder="Select member"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
        >
          {members.map((m) => {
            const id = m.id ?? m._id;
            return (
              <option key={id} value={id}>
                {m.name}
              </option>
            );
          })}
        </Select>
        <Button
          colorScheme="green"
          isDisabled={!obligationId || !memberId}
          onClick={() => setOpen(true)}
        >
          Open
        </Button>
      </Flex>

      {!obligations.length && <Text mt={4}>Create an obligation first.</Text>}

      {open && selectedObligation && selectedMember && (
        <RecordPaymentModal
          isOpen={open}
          onClose={() => setOpen(false)}
          organisationId={organisationId}
          obligation={selectedObligation}
          memberId={memberId}
          memberName={selectedMember.name}
          onSuccess={() =>
            queryClient.invalidateQueries(["finance-compliance", organisationId, obligationId])
          }
        />
      )}
    </Box>
  );
};

export default PaymentsTab;
```

- [ ] **Step 2: Write AccountabilityTab**

`src/components/finance/AccountabilityTab.tsx`:

```tsx
import { useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Heading,
  Input,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { toast } from "react-toastify";
import { financeRequest, orgRequest } from "services";
import {
  useQueryWrapper,
  patchRequest,
  useMutationWrapper,
  queryClient,
} from "services/api/apiHelper";
import { convertParamsToString } from "helpers/stringManipulations";

interface Props {
  organisationId: string;
  prefillMemberId: string;
}

const AccountabilityTab = ({ organisationId, prefillMemberId }: Props) => {
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    prefillMemberId ? { [prefillMemberId]: true } : {}
  );
  const [bulkDate, setBulkDate] = useState("");
  const [rowDates, setRowDates] = useState<Record<string, string>>({});

  const memUrl = convertParamsToString(orgRequest.MEMBERS, { organisationId });
  const { data, isLoading } = useQueryWrapper(["finance-members", organisationId], memUrl);
  const members: Array<Record<string, any>> = data?.data ?? [];

  const invalidate = () => queryClient.invalidateQueries(["finance-members", organisationId]);
  const { mutate } = useMutationWrapper(patchRequest);

  const patchOne = (memberId: string, financialStartDate: string | null) => {
    const url = convertParamsToString(financeRequest.FINANCIAL_START_DATE, { memberId });
    mutate(
      { url, data: { organisationId, financialStartDate } },
      {
        onSuccess: () => {
          toast.success("Updated");
          invalidate();
        },
      }
    );
  };

  const applyBulk = () => {
    if (!bulkDate) return toast.error("Pick a date");
    const ids = Object.keys(selected).filter((id) => selected[id]);
    if (!ids.length) return toast.error("Select members");
    ids.forEach((id) => patchOne(id, bulkDate));
    toast.success(`Applied to ${ids.length} member(s)`);
  };

  if (isLoading) return <Spinner />;

  return (
    <Box>
      <Heading size="md" mb={4}>
        Member accountability
      </Heading>

      <Flex gap={3} mb={4} align="center" wrap="wrap">
        <Input
          type="date"
          maxW="xs"
          value={bulkDate}
          onChange={(e) => setBulkDate(e.target.value)}
        />
        <Button colorScheme="green" onClick={applyBulk}>
          Set start date for selected
        </Button>
      </Flex>

      <Box overflowX="auto">
        <Table size="sm">
          <Thead>
            <Tr>
              <Th></Th>
              <Th>Name</Th>
              <Th>Current start date</Th>
              <Th>Set</Th>
            </Tr>
          </Thead>
          <Tbody>
            {members.map((m) => {
              const id = m.id ?? m._id;
              return (
                <Tr key={id}>
                  <Td>
                    <Checkbox
                      isChecked={!!selected[id]}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [id]: e.target.checked }))
                      }
                    />
                  </Td>
                  <Td>{m.name}</Td>
                  <Td>{m.financialStartDate ?? <Text as="span" color="gray.400">none</Text>}</Td>
                  <Td>
                    <Flex gap={2} align="center">
                      <Input
                        type="date"
                        size="sm"
                        maxW="40"
                        value={rowDates[id] ?? m.financialStartDate ?? ""}
                        onChange={(e) =>
                          setRowDates((prev) => ({ ...prev, [id]: e.target.value }))
                        }
                      />
                      <Button
                        size="xs"
                        colorScheme="blue"
                        onClick={() => patchOne(id, rowDates[id] ?? m.financialStartDate ?? "")}
                      >
                        Save
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => patchOne(id, null)}>
                        Clear
                      </Button>
                    </Flex>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </Box>
    </Box>
  );
};

export default AccountabilityTab;
```

- [ ] **Step 3: Wire both into the Finance shell**

In `src/pages/Finance.tsx`:
- Add imports:

```tsx
import PaymentsTab from "components/finance/PaymentsTab";
import AccountabilityTab from "components/finance/AccountabilityTab";
```

- Replace the third and fourth `TabPanel` placeholders:

```tsx
            <TabPanel>
              <PaymentsTab organisationId={organisation.id} />
            </TabPanel>
            <TabPanel>
              <AccountabilityTab
                organisationId={organisation.id}
                prefillMemberId={prefillMemberId}
              />
            </TabPanel>
```

- [ ] **Step 4: Run the Finance test**

Run: `CI=true yarn test src/pages/Finance.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Full type/compile check**

Run: `CI=true yarn test --watchAll=false`
Expected: all finance tests PASS; no new compile errors. (The pre-existing `App.test.tsx` may fail on the unrelated "learn react" assertion — note it, but do not fix it here.)

- [ ] **Step 6: Commit**

```bash
git add src/components/finance/PaymentsTab.tsx src/components/finance/AccountabilityTab.tsx src/pages/Finance.tsx
git commit -m "feat(finance): payments tab and member accountability tab"
```

---

## Self-Review

**Spec coverage:**
- §2 Architecture & nav → Task 3 (route, dashboard button, tabbed shell). ✓
- §3 File layout → Tasks 1, 4–7 create exactly the listed files. ✓
- §4 API layer → Task 2 (`financeRequest`), used throughout. ✓
- §5.1 Obligations → Task 4. ✓
- §5.2 Compliance → Task 6. ✓
- §5.3 Payments → Tasks 5 (modal) + 7 (PaymentsTab). ✓
- §5.4 Accountability (bulk + individual + grid shortcut) → Task 7 (bulk + individual) and Task 6 (`onSetStartDate` shortcut). ✓
- §6 Money/errors/edge cases → `formatMoney` (Task 1), toast via `useMutationWrapper` (built-in), empty states in each tab. ✓
- §7 Testing → Tasks 1 (payload/color units) and 5 (modal field-switching). ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. The two "match Analytics" steps (Task 6 export) are concrete investigation steps with a named target file, not vague placeholders — necessary because the auth'd export mechanism must mirror existing code exactly.

**Type consistency:** `Obligation`, `ComplianceRow`, `ComplianceResponse`, `ComplianceSummary`, `MonthStatus`, `ObligationType` defined in Task 1 and consumed unchanged in Tasks 4–7. Payload builders' names (`buildRecordPaymentPayload`, `buildDuesCorrectionPayload`, `buildLevyCorrectionPayload`) match between Task 1 and Task 5. Query keys are consistent: `["finance-obligations", organisationId]` (Tasks 4, 7), `["finance-compliance", organisationId, obligationId]` (Tasks 6, 7), `["finance-members", organisationId]` (Task 7). ✓

**Known follow-up flagged for execution:** member id field may be `id` or `_id` (handled with `m.id ?? m._id`); the compliance export auth mechanism must be matched to `Analytics.tsx` during Task 6.

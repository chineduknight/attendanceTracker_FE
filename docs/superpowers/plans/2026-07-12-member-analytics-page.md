# Member Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a celebratory per-member attendance analytics page reachable by clicking a row in the org-wide analytics grid.

**Architecture:** A new `MemberAnalytics` page fetches `GET /attendance/:organisationId/analytics/member/:memberId` and renders a hero banner, a milestone streak card with an attendance-rate ring, colored stat tiles, a per-session timeline strip, and a records table. Shared date-range/export/status logic is extracted from the existing `Analytics.tsx` into reusable modules under `src/components/analytics/` so both pages consume them (DRY).

**Tech Stack:** React 18 + TypeScript (CRA), Chakra UI, @tanstack/react-query v4 (via `useQueryWrapper`), react-router-dom v6.3, date-fns, react-datepicker, Zustand, Jest + React Testing Library.

## Global Constraints

- Dates are always `"YYYY-MM-DD"` strings; format/parse with date-fns (`format`, `parseISO`).
- Use the existing `useQueryWrapper(key, url, options)` for all GETs; never call axios directly.
- Path params are injected with `convertParamsToString(template, { key: value })`; query strings are built with `URLSearchParams`.
- Import via the existing path aliases: `components/…`, `helpers/…`, `services`, `routes/…`, `zStore`.
- Org id comes from `useGlobalStore((s) => [s.organisation])` → `org.id`.
- Only Chakra default-palette colors (purple, blue, cyan, green, red, orange, yellow, gray) — no `indigo`.
- No new npm dependencies.
- API success payloads are wrapped as `{ data: <payload> }`; auth `401` is handled globally by the axios interceptor (skip it in error handlers).

## File Structure

**New (shared, `src/components/analytics/`):**
- `statusMeta.ts` — `AttendanceStatus` type, `STATUS_META`, `EMPTY_STATUS_META`, `getStatusMeta`.
- `streakMilestones.ts` — `MILESTONE_TIERS`, `getMilestoneProgress`.
- `analyticsExport.ts` — `openExportUrl`, `handleExportError`.
- `useDateRange.ts` — `DATE_INPUT_FORMAT`, `DATE_PRESETS`, `formatRangeLabel`, `useDateRange` hook.
- `DateRangeControls.tsx` — preset buttons + two date pickers (+ optional `trailing` slot).
- `memberAnalyticsTypes.ts` — response types.
- `RateRing.tsx`, `StatTiles.tsx`, `MemberHero.tsx`, `StreakCard.tsx`, `AttendanceTimeline.tsx`, `MemberRecordsTable.tsx` — presentational pieces.

**New (page):** `src/pages/MemberAnalytics.tsx`

**Modified:**
- `src/services/api/request.ts` — 3 new `attendanceRequest` constants.
- `src/routes/pagePath.ts` — `MEMBER_ANALYTICS` path.
- `src/routes/protectedRoutes.tsx` — lazy route registration.
- `src/pages/Analytics.tsx` — consume the shared modules; make grid rows clickable.

---

### Task 1: Status metadata module

**Files:**
- Create: `src/components/analytics/statusMeta.ts`
- Test: `src/components/analytics/statusMeta.test.ts`
- Modify: `src/pages/Analytics.tsx`

**Interfaces:**
- Produces: `type AttendanceStatus = "present" | "absent" | "apology"`; `STATUS_META: Record<AttendanceStatus, { color: string; short: string; full: string }>`; `EMPTY_STATUS_META: { color: string; short: string; full: string }`; `getStatusMeta(status: string | undefined) => { color: string; short: string; full: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/analytics/statusMeta.test.ts
import { getStatusMeta, STATUS_META } from "components/analytics/statusMeta";

describe("getStatusMeta", () => {
  it("returns the meta for a known status", () => {
    expect(getStatusMeta("present")).toEqual(STATUS_META.present);
    expect(getStatusMeta("apology").full).toBe("Apology");
  });

  it("falls back to the empty meta for unknown/undefined status", () => {
    expect(getStatusMeta(undefined).short).toBe("-");
    expect(getStatusMeta("bogus").full).toBe("No record");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --watchAll=false src/components/analytics/statusMeta.test.ts`
Expected: FAIL — cannot find module `components/analytics/statusMeta`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/analytics/statusMeta.ts
export type AttendanceStatus = "present" | "absent" | "apology";

export const STATUS_META: Record<
  AttendanceStatus,
  { color: string; short: string; full: string }
> = {
  present: { color: "green", short: "P", full: "Present" },
  absent: { color: "red", short: "A", full: "Absent" },
  apology: { color: "yellow", short: "AP", full: "Apology" },
};

export const EMPTY_STATUS_META = { color: "gray", short: "-", full: "No record" };

export const getStatusMeta = (status: string | undefined) =>
  STATUS_META[status as AttendanceStatus] ?? EMPTY_STATUS_META;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --watchAll=false src/components/analytics/statusMeta.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Refactor `Analytics.tsx` to consume it**

In `src/pages/Analytics.tsx`, delete the local `AttendanceStatus` type, `STATUS_META`, `EMPTY_STATUS_META`, and `getStatusMeta` (currently lines ~88–102) and add this import next to the other `components`/`helpers` imports:

```ts
import {
  STATUS_META,
  getStatusMeta,
  AttendanceStatus,
} from "components/analytics/statusMeta";
```

Leave `VERTICAL_LABEL_SX` and `formatDayHeader` in `Analytics.tsx` (grid-specific).

- [ ] **Step 6: Verify the app still compiles/tests**

Run: `yarn test --watchAll=false src/App.test.tsx`
Expected: PASS (app renders without crashing).

- [ ] **Step 7: Commit**

```bash
git add src/components/analytics/statusMeta.ts src/components/analytics/statusMeta.test.ts src/pages/Analytics.tsx
git commit -m "refactor: extract shared attendance statusMeta module"
```

---

### Task 2: Streak milestone logic

**Files:**
- Create: `src/components/analytics/streakMilestones.ts`
- Test: `src/components/analytics/streakMilestones.test.ts`

**Interfaces:**
- Produces: `MILESTONE_TIERS: number[]`; `interface MilestoneProgress { nextTier: number | null; prevTier: number; percent: number; isRecord: boolean }`; `getMilestoneProgress(currentStreak: number) => MilestoneProgress`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/analytics/streakMilestones.test.ts
import { getMilestoneProgress } from "components/analytics/streakMilestones";

describe("getMilestoneProgress", () => {
  it("targets the first tier from zero", () => {
    expect(getMilestoneProgress(0)).toEqual({
      nextTier: 3, prevTier: 0, percent: 0, isRecord: false,
    });
  });

  it("computes the fill percentage between tiers", () => {
    expect(getMilestoneProgress(4)).toEqual({
      nextTier: 5, prevTier: 3, percent: 50, isRecord: false,
    });
    expect(getMilestoneProgress(7)).toEqual({
      nextTier: 10, prevTier: 5, percent: 40, isRecord: false,
    });
  });

  it("resets to 0% toward the next tier when landing exactly on a tier", () => {
    expect(getMilestoneProgress(5)).toEqual({
      nextTier: 10, prevTier: 5, percent: 0, isRecord: false,
    });
  });

  it("flags record territory at/above the top tier", () => {
    expect(getMilestoneProgress(100)).toEqual({
      nextTier: null, prevTier: 100, percent: 100, isRecord: true,
    });
    expect(getMilestoneProgress(250).isRecord).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --watchAll=false src/components/analytics/streakMilestones.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/analytics/streakMilestones.ts
export const MILESTONE_TIERS = [3, 5, 10, 20, 50, 100];

export interface MilestoneProgress {
  nextTier: number | null; // null once past the top tier
  prevTier: number;        // floor tier (0 below the first)
  percent: number;         // 0..100 fill toward nextTier (100 when isRecord)
  isRecord: boolean;       // streak >= top tier
}

export const getMilestoneProgress = (currentStreak: number): MilestoneProgress => {
  const top = MILESTONE_TIERS[MILESTONE_TIERS.length - 1];
  if (currentStreak >= top) {
    return { nextTier: null, prevTier: top, percent: 100, isRecord: true };
  }
  const nextTier = MILESTONE_TIERS.find((tier) => tier > currentStreak) as number;
  const prevIndex = MILESTONE_TIERS.indexOf(nextTier) - 1;
  const prevTier = prevIndex >= 0 ? MILESTONE_TIERS[prevIndex] : 0;
  const percent = Math.round(((currentStreak - prevTier) / (nextTier - prevTier)) * 100);
  return { nextTier, prevTier, percent, isRecord: false };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --watchAll=false src/components/analytics/streakMilestones.test.ts`
Expected: PASS (4 passing).

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/streakMilestones.ts src/components/analytics/streakMilestones.test.ts
git commit -m "feat: add streak milestone progress helper"
```

---

### Task 3: Export helper module

**Files:**
- Create: `src/components/analytics/analyticsExport.ts`
- Test: `src/components/analytics/analyticsExport.test.ts`
- Modify: `src/pages/Analytics.tsx`

**Interfaces:**
- Produces: `openExportUrl(response: any, format: "PDF" | "Excel") => void`; `handleExportError(err: any, format: "PDF" | "Excel") => void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/analytics/analyticsExport.test.ts
import { openExportUrl } from "components/analytics/analyticsExport";

describe("openExportUrl", () => {
  const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);
  afterEach(() => openSpy.mockClear());

  it("opens the trimmed url from response.data in a new tab", () => {
    openExportUrl({ data: "  https://files.example/x.xlsx  " }, "Excel");
    expect(openSpy).toHaveBeenCalledWith(
      "https://files.example/x.xlsx",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does not open a tab when there is no url string", () => {
    openExportUrl({ data: 123 }, "PDF");
    expect(openSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --watchAll=false src/components/analytics/analyticsExport.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/analytics/analyticsExport.ts
import { toast } from "react-toastify";

export const openExportUrl = (response: any, format: "PDF" | "Excel"): void => {
  const exportUrl =
    typeof response?.data === "string" ? response.data.trim() : "";
  if (exportUrl) {
    window.open(exportUrl, "_blank", "noopener,noreferrer");
    return;
  }
  const responseError =
    typeof response?.error === "string"
      ? response.error
      : `Failed to export ${format}.`;
  toast.error(responseError);
};

export const handleExportError = (err: any, format: "PDF" | "Excel"): void => {
  const statusCode = err?.response?.status;
  if (statusCode === 401) return;
  const apiError = err?.response?.data?.error;
  let message: string;
  if (Array.isArray(apiError)) {
    message = apiError.filter(Boolean).join(", ");
  } else if (typeof apiError === "string" && apiError.trim()) {
    message = apiError;
  } else {
    message = `Failed to export ${format}. Please try again.`;
  }
  toast.error(message);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test --watchAll=false src/components/analytics/analyticsExport.test.ts`
Expected: PASS (2 passing).

- [ ] **Step 5: Refactor `Analytics.tsx` to consume it**

In `src/pages/Analytics.tsx`, delete the local `handleExportSuccess` and `handleExportError` functions (currently lines ~164–191) and add the import:

```ts
import {
  openExportUrl,
  handleExportError,
} from "components/analytics/analyticsExport";
```

Then update the two export query option blocks to call the imported helpers:
- replace `onSuccess: (response: any) => handleExportSuccess(response, "Excel")` with `onSuccess: (response: any) => openExportUrl(response, "Excel")`
- replace `onSuccess: (response: any) => handleExportSuccess(response, "PDF")` with `onSuccess: (response: any) => openExportUrl(response, "PDF")`
- the two `onError: (err: any) => handleExportError(err, …)` lines now resolve to the imported `handleExportError` (no change needed).

- [ ] **Step 6: Verify the app still compiles/tests**

Run: `yarn test --watchAll=false src/App.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/analytics/analyticsExport.ts src/components/analytics/analyticsExport.test.ts src/pages/Analytics.tsx
git commit -m "refactor: extract shared analytics export helpers"
```

---

### Task 4: Shared date-range hook + controls, consumed by Analytics

**Files:**
- Create: `src/components/analytics/useDateRange.ts`
- Create: `src/components/analytics/DateRangeControls.tsx`
- Test: `src/components/analytics/useDateRange.test.ts`
- Modify: `src/pages/Analytics.tsx`

**Interfaces:**
- Produces: `DATE_INPUT_FORMAT: string`; `DATE_PRESETS: { label: string; getRange: (today: Date) => { from: Date; to: Date } }[]`; `formatRangeLabel(fromISO: string, toISO: string) => string`; `useDateRange(options?: { initialFrom?: string; initialTo?: string; onChange?: () => void }) => { fromDate: string; toDate: string; setFromDate: (v: string) => void; setToDate: (v: string) => void; activePreset: string | null; setActivePreset: (v: string | null) => void; applyPreset: (preset) => void; handleDateChange: (setter: (v: string) => void) => (date: Date | null) => void }`.
- `DateRangeControls` props: `{ fromDate, toDate, activePreset, applyPreset, setFromDate, setToDate, handleDateChange, trailing?: React.ReactNode }` (types match the hook's returns).

- [ ] **Step 1: Write the failing test**

```ts
// src/components/analytics/useDateRange.test.ts
import { formatRangeLabel, DATE_PRESETS } from "components/analytics/useDateRange";

describe("useDateRange helpers", () => {
  it("formats a same-year range without repeating the year on the start", () => {
    expect(formatRangeLabel("2026-01-05", "2026-06-30")).toBe("Jan 5 – Jun 30, 2026");
  });

  it("shows both years for a cross-year range", () => {
    expect(formatRangeLabel("2025-12-20", "2026-01-10")).toBe("Dec 20, 2025 – Jan 10, 2026");
  });

  it("exposes the five presets", () => {
    expect(DATE_PRESETS.map((p) => p.label)).toEqual([
      "This Month", "Last Month", "This Quarter", "Last Quarter", "This Year",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test --watchAll=false src/components/analytics/useDateRange.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the hook module**

```ts
// src/components/analytics/useDateRange.ts
import { useState } from "react";
import {
  startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter,
  subQuarters, startOfYear, endOfYear, format, parseISO,
} from "date-fns";

export const DATE_INPUT_FORMAT = "yyyy-MM-dd";

export const DATE_PRESETS: {
  label: string;
  getRange: (today: Date) => { from: Date; to: Date };
}[] = [
  { label: "This Month", getRange: (t) => ({ from: startOfMonth(t), to: endOfMonth(t) }) },
  { label: "Last Month", getRange: (t) => ({ from: startOfMonth(subMonths(t, 1)), to: endOfMonth(subMonths(t, 1)) }) },
  { label: "This Quarter", getRange: (t) => ({ from: startOfQuarter(t), to: endOfQuarter(t) }) },
  { label: "Last Quarter", getRange: (t) => ({ from: startOfQuarter(subQuarters(t, 1)), to: endOfQuarter(subQuarters(t, 1)) }) },
  { label: "This Year", getRange: (t) => ({ from: startOfYear(t), to: endOfYear(t) }) },
];

export const formatRangeLabel = (fromISO: string, toISO: string) => {
  const from = parseISO(fromISO);
  const to = parseISO(toISO);
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = format(from, sameYear ? "MMM d" : "MMM d, yyyy");
  return `${fromLabel} – ${format(to, "MMM d, yyyy")}`;
};

export interface UseDateRangeOptions {
  initialFrom?: string;
  initialTo?: string;
  onChange?: () => void;
}

export const useDateRange = (options: UseDateRangeOptions = {}) => {
  const [fromDate, setFromDate] = useState<string>(options.initialFrom ?? "");
  const [toDate, setToDate] = useState<string>(options.initialTo ?? "");
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const applyPreset = (preset: (typeof DATE_PRESETS)[number]) => {
    const { from, to } = preset.getRange(new Date());
    setFromDate(format(from, DATE_INPUT_FORMAT));
    setToDate(format(to, DATE_INPUT_FORMAT));
    setActivePreset(preset.label);
    options.onChange?.();
  };

  const handleDateChange =
    (setter: (value: string) => void) => (date: Date | null) => {
      setter(date ? format(date, DATE_INPUT_FORMAT) : "");
      setActivePreset(null);
      options.onChange?.();
    };

  return {
    fromDate, toDate, setFromDate, setToDate,
    activePreset, setActivePreset, applyPreset, handleDateChange,
  };
};
```

- [ ] **Step 4: Implement the controls component**

```tsx
// src/components/analytics/DateRangeControls.tsx
import React from "react";
import { Box, Flex, Button, Input } from "@chakra-ui/react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { parseISO } from "date-fns";
import { DATE_PRESETS } from "components/analytics/useDateRange";

const DATE_PICKER_WRAPPER_SX = {
  ".react-datepicker-wrapper": { width: "100%" },
  ".react-datepicker__close-icon": {
    top: 0, right: "0.5rem", marginRight: "0.5rem", height: "100%",
    display: "flex", alignItems: "center", padding: 0,
  },
  ".react-datepicker__close-icon::after": {
    display: "block", backgroundColor: "transparent", color: "gray.400",
    height: "auto", width: "auto", padding: 0, fontSize: "20px", lineHeight: 1,
  },
  ".react-datepicker__close-icon:hover::after": { color: "gray.600" },
} as const;

interface DateRangeControlsProps {
  fromDate: string;
  toDate: string;
  activePreset: string | null;
  applyPreset: (preset: (typeof DATE_PRESETS)[number]) => void;
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  handleDateChange: (setter: (value: string) => void) => (date: Date | null) => void;
  trailing?: React.ReactNode;
}

const DateRangeControls: React.FC<DateRangeControlsProps> = ({
  fromDate, toDate, activePreset, applyPreset,
  setFromDate, setToDate, handleDateChange, trailing,
}) => {
  const fromDateValue = fromDate ? parseISO(fromDate) : null;
  const toDateValue = toDate ? parseISO(toDate) : null;
  const today = new Date();
  const fromMaxDate = toDateValue && toDateValue < today ? toDateValue : today;

  return (
    <>
      <Flex mb={3} gap={2} flexWrap="wrap">
        {DATE_PRESETS.map((preset) => {
          const isActive = activePreset === preset.label;
          return (
            <Button
              key={preset.label} size="sm"
              variant={isActive ? "solid" : "outline"} colorScheme="blue"
              aria-pressed={isActive} onClick={() => applyPreset(preset)}
            >
              {preset.label}
            </Button>
          );
        })}
      </Flex>
      <Flex mb={6} gap={2} align="center" direction={{ base: "column", md: "row" }}>
        <Box w={{ base: "100%", md: "auto" }} sx={DATE_PICKER_WRAPPER_SX}>
          <DatePicker
            selected={fromDateValue} onChange={handleDateChange(setFromDate)}
            selectsStart startDate={fromDateValue} endDate={toDateValue}
            maxDate={fromMaxDate} dateFormat="MMM d, yyyy"
            placeholderText="From date" isClearable customInput={<Input pr="2rem" />}
          />
        </Box>
        <Box w={{ base: "100%", md: "auto" }} sx={DATE_PICKER_WRAPPER_SX}>
          <DatePicker
            selected={toDateValue} onChange={handleDateChange(setToDate)}
            selectsEnd startDate={fromDateValue} endDate={toDateValue}
            minDate={fromDateValue ?? undefined} maxDate={today}
            dateFormat="MMM d, yyyy" placeholderText="To date"
            isClearable customInput={<Input pr="2rem" />}
          />
        </Box>
        {trailing}
      </Flex>
    </>
  );
};

export default DateRangeControls;
```

- [ ] **Step 5: Run the hook test to verify it passes**

Run: `yarn test --watchAll=false src/components/analytics/useDateRange.test.ts`
Expected: PASS (3 passing).

- [ ] **Step 6: Refactor `Analytics.tsx` to consume the hook + controls**

Make these edits in `src/pages/Analytics.tsx`:

1. Remove the now-unused date-fns imports that only the presets used and the local `DATE_INPUT_FORMAT`, `DATE_PICKER_WRAPPER_SX`, `formatRangeLabel`, and `DATE_PRESETS` definitions. Remove the direct `DatePicker`/`react-datepicker` imports (they now live in `DateRangeControls`). Keep `format`, `parseISO` (still used by `formatDayHeader`).

2. Add imports:

```ts
import {
  useDateRange,
  formatRangeLabel,
} from "components/analytics/useDateRange";
import DateRangeControls from "components/analytics/DateRangeControls";
```

3. Replace the `fromDate`/`toDate`/`activePreset` `useState` declarations and the local `applyPreset` and `handleDateChange` functions with the hook (reset `hasSearched` on any change):

```ts
const {
  fromDate, toDate, setFromDate, setToDate,
  activePreset, applyPreset, handleDateChange,
} = useDateRange({ onChange: () => setHasSearched(false) });
```

Keep the existing `const [hasSearched, setHasSearched] = useState(false);`.

4. Delete the local `fromDateValue`/`toDateValue`/`today`/`fromMaxDate` computations (now inside `DateRangeControls`).

5. Replace the JSX preset `<Flex>` block and the two date-picker `<Box>` blocks (the two `sx={DATE_PICKER_WRAPPER_SX}` boxes) with a single `DateRangeControls`, moving the existing status `ReactSelect` and the `Search` button into its `trailing` slot:

```tsx
<DateRangeControls
  fromDate={fromDate}
  toDate={toDate}
  activePreset={activePreset}
  applyPreset={applyPreset}
  setFromDate={setFromDate}
  setToDate={setToDate}
  handleDateChange={handleDateChange}
  trailing={
    <>
      <Box w={{ base: "100%", md: "260px" }}>
        {/* existing ReactSelect status filter — unchanged */}
      </Box>
      <Button
        colorScheme="blue"
        onClick={handleSearch}
        isDisabled={!canRunQuery}
        w={{ base: "100%", md: "auto" }}
      >
        Search
      </Button>
    </>
  }
/>
```

(The `ReactSelect` markup is copied verbatim from the current file — do not change its props or handlers.)

- [ ] **Step 7: Verify Analytics still renders and behaves**

Run: `yarn test --watchAll=false src/App.test.tsx`
Expected: PASS.
Then run the app (`yarn start`), open the org-wide Analytics page, confirm presets set the dates, pickers work, status filter + Search behave exactly as before.

- [ ] **Step 8: Commit**

```bash
git add src/components/analytics/useDateRange.ts src/components/analytics/useDateRange.test.ts src/components/analytics/DateRangeControls.tsx src/pages/Analytics.tsx
git commit -m "refactor: extract shared date-range hook and controls"
```

---

### Task 5: Response types + hero, rate ring, and stat tiles

**Files:**
- Create: `src/components/analytics/memberAnalyticsTypes.ts`
- Create: `src/components/analytics/RateRing.tsx`
- Create: `src/components/analytics/StatTiles.tsx`
- Create: `src/components/analytics/MemberHero.tsx`
- Test: `src/components/analytics/StatTiles.test.tsx`, `src/components/analytics/MemberHero.test.tsx`

**Interfaces:**
- Produces types: `MemberVerdict { date: string; status: AttendanceStatus }`; `MemberRecord { attendanceId: string; date: string; status: AttendanceStatus; sessionName: string; hasBeenUpdated: boolean }`; `MemberAnalyticsSummary { totalSessions; present; absent; apology; attendanceRate; currentStreak; longestStreak: number }`; `MemberAnalytics { member: { memberId: string; name: string; fields: Record<string, unknown> }; range: { fromDate: string | null; toDate: string | null }; summary: MemberAnalyticsSummary; verdicts: MemberVerdict[]; records: MemberRecord[] }`.
- Produces components: `RateRing({ rate: number; size?: number; trackColor?: string })`; `StatTiles({ present; absent; apology; totalSessions: number })`; `MemberHero({ name: string; fields: Record<string, unknown> })`.

- [ ] **Step 1: Create the types file**

```ts
// src/components/analytics/memberAnalyticsTypes.ts
import { AttendanceStatus } from "components/analytics/statusMeta";

export interface MemberVerdict {
  date: string;
  status: AttendanceStatus;
}

export interface MemberRecord {
  attendanceId: string;
  date: string;
  status: AttendanceStatus;
  sessionName: string;
  hasBeenUpdated: boolean;
}

export interface MemberAnalyticsSummary {
  totalSessions: number;
  present: number;
  absent: number;
  apology: number;
  attendanceRate: number;
  currentStreak: number;
  longestStreak: number;
}

export interface MemberAnalytics {
  member: { memberId: string; name: string; fields: Record<string, unknown> };
  range: { fromDate: string | null; toDate: string | null };
  summary: MemberAnalyticsSummary;
  verdicts: MemberVerdict[];
  records: MemberRecord[];
}
```

- [ ] **Step 2: Write the failing tests for StatTiles and MemberHero**

```tsx
// src/components/analytics/StatTiles.test.tsx
import { render, screen } from "@testing-library/react";
import StatTiles from "components/analytics/StatTiles";

it("renders all four totals with labels", () => {
  render(<StatTiles present={30} absent={6} apology={4} totalSessions={40} />);
  expect(screen.getByText("Present")).toBeInTheDocument();
  expect(screen.getByText("30")).toBeInTheDocument();
  expect(screen.getByText("Total Sessions")).toBeInTheDocument();
  expect(screen.getByText("40")).toBeInTheDocument();
});
```

```tsx
// src/components/analytics/MemberHero.test.tsx
import { render, screen } from "@testing-library/react";
import MemberHero from "components/analytics/MemberHero";

it("renders the name, initials, and an identity line from primitive fields", () => {
  render(
    <MemberHero
      name="Ada Lovelace"
      fields={{ part: "soprano", status: "active", tags: ["x"] }}
    />,
  );
  expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  expect(screen.getByText("AL")).toBeInTheDocument();
  expect(screen.getByText("Soprano · Active")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn test --watchAll=false src/components/analytics/StatTiles.test.tsx src/components/analytics/MemberHero.test.tsx`
Expected: FAIL — cannot find modules.

- [ ] **Step 4: Implement RateRing**

```tsx
// src/components/analytics/RateRing.tsx
import React from "react";
import { Box, Text } from "@chakra-ui/react";

interface RateRingProps {
  rate: number; // 0..100
  size?: number;
  trackColor?: string;
}

const RateRing: React.FC<RateRingProps> = ({ rate, size = 76, trackColor = "#22d3ee" }) => {
  const clamped = Math.max(0, Math.min(100, Math.round(rate)));
  const inner = size - 18;
  return (
    <Box
      position="relative" flex="0 0 auto"
      width={`${size}px`} height={`${size}px`} borderRadius="50%"
      display="flex" alignItems="center" justifyContent="center"
      sx={{ background: `conic-gradient(${trackColor} 0 ${clamped}%, rgba(255,255,255,0.22) ${clamped}% 100%)` }}
    >
      <Box
        width={`${inner}px`} height={`${inner}px`} borderRadius="50%" bg="purple.600"
        display="flex" flexDirection="column" alignItems="center" justifyContent="center" color="white"
      >
        <Text fontWeight="bold" fontSize="md" lineHeight="1">{clamped}%</Text>
        <Text fontSize="9px" textTransform="uppercase" opacity={0.8}>rate</Text>
      </Box>
    </Box>
  );
};

export default RateRing;
```

- [ ] **Step 5: Implement StatTiles**

```tsx
// src/components/analytics/StatTiles.tsx
import React from "react";
import { SimpleGrid, Box, Text } from "@chakra-ui/react";

interface StatTilesProps {
  present: number;
  absent: number;
  apology: number;
  totalSessions: number;
}

const TILES: { key: keyof StatTilesProps; label: string; bg: string }[] = [
  { key: "present", label: "Present", bg: "green.500" },
  { key: "absent", label: "Absent", bg: "red.500" },
  { key: "apology", label: "Apology", bg: "orange.500" },
  { key: "totalSessions", label: "Total Sessions", bg: "blue.500" },
];

const StatTiles: React.FC<StatTilesProps> = (props) => (
  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
    {TILES.map((tile) => (
      <Box key={tile.key} bg={tile.bg} color="white" borderRadius="12px" p={4} textAlign="center">
        <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" opacity={0.9}>
          {tile.label}
        </Text>
        <Text fontSize="2xl" fontWeight="bold">{props[tile.key]}</Text>
      </Box>
    ))}
  </SimpleGrid>
);

export default StatTiles;
```

- [ ] **Step 6: Implement MemberHero**

```tsx
// src/components/analytics/MemberHero.tsx
import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { capitalize } from "helpers/stringManipulations";

interface MemberHeroProps {
  name: string;
  fields: Record<string, unknown>;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

const getIdentityLine = (fields: Record<string, unknown>) =>
  Object.values(fields)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => capitalize(String(value)))
    .join(" · ");

const MemberHero: React.FC<MemberHeroProps> = ({ name, fields }) => {
  const identity = getIdentityLine(fields);
  return (
    <Flex
      align="center" gap={4} borderRadius="14px" p={5} color="white"
      bgGradient="linear(135deg, purple.500, blue.500, cyan.400)"
      boxShadow="0 8px 20px rgba(59,130,246,.35)"
    >
      <Flex
        w="56px" h="56px" borderRadius="50%" bg="whiteAlpha.300"
        align="center" justify="center" fontWeight="bold" fontSize="xl" flex="0 0 auto"
      >
        {getInitials(name)}
      </Flex>
      <Box>
        <Text fontWeight="bold" fontSize="xl">{name}</Text>
        {identity && <Text fontSize="sm" opacity={0.9}>{identity}</Text>}
      </Box>
    </Flex>
  );
};

export default MemberHero;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn test --watchAll=false src/components/analytics/StatTiles.test.tsx src/components/analytics/MemberHero.test.tsx`
Expected: PASS (2 passing).

- [ ] **Step 8: Commit**

```bash
git add src/components/analytics/memberAnalyticsTypes.ts src/components/analytics/RateRing.tsx src/components/analytics/StatTiles.tsx src/components/analytics/MemberHero.tsx src/components/analytics/StatTiles.test.tsx src/components/analytics/MemberHero.test.tsx
git commit -m "feat: add member hero, rate ring, and stat tiles"
```

---

### Task 6: Streak card, timeline strip, and records table

**Files:**
- Create: `src/components/analytics/StreakCard.tsx`
- Create: `src/components/analytics/AttendanceTimeline.tsx`
- Create: `src/components/analytics/MemberRecordsTable.tsx`
- Test: `src/components/analytics/StreakCard.test.tsx`, `src/components/analytics/AttendanceTimeline.test.tsx`, `src/components/analytics/MemberRecordsTable.test.tsx`

**Interfaces:**
- Consumes: `getMilestoneProgress` (Task 2), `RateRing` (Task 5), `getStatusMeta`/`STATUS_META`/`AttendanceStatus` (Task 1), `MemberVerdict`/`MemberRecord` (Task 5).
- Produces: `StreakCard({ currentStreak; longestStreak; attendanceRate: number })`; `AttendanceTimeline({ verdicts: MemberVerdict[] })`; `MemberRecordsTable({ records: MemberRecord[] })`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/analytics/StreakCard.test.tsx
import { render, screen } from "@testing-library/react";
import StreakCard from "components/analytics/StreakCard";

it("shows the streak, rate, and the next-milestone cheer", () => {
  render(<StreakCard currentStreak={5} longestStreak={12} attendanceRate={85} />);
  expect(screen.getByText("🔥 5")).toBeInTheDocument();
  expect(screen.getByText("85%")).toBeInTheDocument();
  expect(screen.getByText(/beat your record of 12/)).toBeInTheDocument();
  expect(screen.getByText("🏅 10")).toBeInTheDocument();
});
```

```tsx
// src/components/analytics/AttendanceTimeline.test.tsx
import { render, screen } from "@testing-library/react";
import AttendanceTimeline from "components/analytics/AttendanceTimeline";

it("groups verdicts by month and renders a cell per verdict", () => {
  const { container } = render(
    <AttendanceTimeline
      verdicts={[
        { date: "2026-05-03", status: "present" },
        { date: "2026-05-10", status: "apology" },
        { date: "2026-06-07", status: "absent" },
      ]}
    />,
  );
  expect(screen.getByText("May 2026")).toBeInTheDocument();
  expect(screen.getByText("Jun 2026")).toBeInTheDocument();
  // 3 verdict cells + 3 legend swatches = 6 boxes of 16px/12px; assert verdict cells:
  expect(container.querySelectorAll('[data-cell="verdict"]').length).toBe(3);
});
```

```tsx
// src/components/analytics/MemberRecordsTable.test.tsx
import { render, screen } from "@testing-library/react";
import MemberRecordsTable from "components/analytics/MemberRecordsTable";

it("renders a row per record with an edited tag when updated", () => {
  render(
    <MemberRecordsTable
      records={[
        { attendanceId: "a1", date: "2026-06-28", status: "present", sessionName: "First Mass", hasBeenUpdated: false },
        { attendanceId: "a2", date: "2026-06-21", status: "absent", sessionName: "Second Mass", hasBeenUpdated: true },
      ]}
    />,
  );
  expect(screen.getByText("First Mass")).toBeInTheDocument();
  expect(screen.getByText("Second Mass")).toBeInTheDocument();
  expect(screen.getByText("edited")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test --watchAll=false src/components/analytics/StreakCard.test.tsx src/components/analytics/AttendanceTimeline.test.tsx src/components/analytics/MemberRecordsTable.test.tsx`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement StreakCard**

```tsx
// src/components/analytics/StreakCard.tsx
import React from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import RateRing from "components/analytics/RateRing";
import { getMilestoneProgress } from "components/analytics/streakMilestones";

interface StreakCardProps {
  currentStreak: number;
  longestStreak: number;
  attendanceRate: number;
}

const getCheer = (currentStreak: number, longestStreak: number, isRecord: boolean) => {
  if (isRecord) return "🏆 Record territory — keep it going!";
  if (longestStreak > 0 && currentStreak >= longestStreak) return "🔥 New personal best!";
  if (longestStreak > 0) return `${longestStreak - currentStreak} more to beat your record of ${longestStreak}`;
  return "Start your streak!";
};

const StreakCard: React.FC<StreakCardProps> = ({ currentStreak, longestStreak, attendanceRate }) => {
  const { nextTier, percent, isRecord } = getMilestoneProgress(currentStreak);
  const cheer = getCheer(currentStreak, longestStreak, isRecord);

  return (
    <Box
      borderRadius="16px" p={5} color="white"
      bgGradient="linear(135deg, purple.600, blue.600)"
      boxShadow="0 10px 24px rgba(79,70,229,.35)"
    >
      <Flex justify="space-between" align="center" gap={4} flexWrap="wrap">
        <Box>
          <Text fontSize="3xl" fontWeight="extrabold" lineHeight="1">🔥 {currentStreak}</Text>
          <Text opacity={0.9}>current streak</Text>
          <Text fontSize="sm" opacity={0.85} mt={1}>Longest ever: <b>{longestStreak}</b></Text>
        </Box>
        <RateRing rate={attendanceRate} />
      </Flex>
      <Box mt={4} h="14px" bg="whiteAlpha.300" borderRadius="999px" overflow="hidden">
        <Box h="100%" width={`${percent}%`} borderRadius="999px" bgGradient="linear(90deg, yellow.400, orange.400)" />
      </Box>
      <Flex justify="space-between" fontSize="xs" opacity={0.9} mt={1}>
        <Text>0</Text>
        <Text textAlign="center">{cheer}</Text>
        <Text>{nextTier ? `🏅 ${nextTier}` : "🏆 max"}</Text>
      </Flex>
    </Box>
  );
};

export default StreakCard;
```

- [ ] **Step 4: Implement AttendanceTimeline**

```tsx
// src/components/analytics/AttendanceTimeline.tsx
import React from "react";
import { Box, Flex, Text, Tooltip, Wrap, WrapItem } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import { MemberVerdict } from "components/analytics/memberAnalyticsTypes";
import { getStatusMeta, STATUS_META, AttendanceStatus } from "components/analytics/statusMeta";

const CELL_COLOR: Record<AttendanceStatus, string> = {
  present: "green.500",
  apology: "orange.500",
  absent: "red.500",
};

const groupByMonth = (verdicts: MemberVerdict[]) => {
  const groups: { label: string; items: MemberVerdict[] }[] = [];
  verdicts.forEach((verdict) => {
    const label = format(parseISO(verdict.date), "MMM yyyy");
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(verdict);
    else groups.push({ label, items: [verdict] });
  });
  return groups;
};

const AttendanceTimeline: React.FC<{ verdicts: MemberVerdict[] }> = ({ verdicts }) => {
  const groups = groupByMonth(verdicts);
  return (
    <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.200" p={4}>
      <Text fontSize="sm" fontWeight="semibold" mb={3}>Attendance history</Text>
      {groups.map((group) => (
        <Box key={group.label} mb={3}>
          <Text fontSize="xs" color="gray.500" textTransform="uppercase" letterSpacing="wider" mb={1}>
            {group.label}
          </Text>
          <Wrap spacing="4px">
            {group.items.map((verdict, index) => (
              <WrapItem key={`${verdict.date}-${verdict.status}-${index}`}>
                <Tooltip
                  label={`${format(parseISO(verdict.date), "MMM d, yyyy")} · ${getStatusMeta(verdict.status).full}`}
                >
                  <Box
                    data-cell="verdict" w="16px" h="16px" borderRadius="4px"
                    bg={CELL_COLOR[verdict.status] ?? "gray.200"}
                  />
                </Tooltip>
              </WrapItem>
            ))}
          </Wrap>
        </Box>
      ))}
      <Flex gap={4} mt={2} fontSize="xs" color="gray.600" flexWrap="wrap">
        {(Object.keys(STATUS_META) as AttendanceStatus[]).map((status) => (
          <Flex key={status} align="center" gap={1}>
            <Box w="12px" h="12px" borderRadius="3px" bg={CELL_COLOR[status]} />
            <Text>{STATUS_META[status].full}</Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
};

export default AttendanceTimeline;
```

- [ ] **Step 5: Implement MemberRecordsTable**

```tsx
// src/components/analytics/MemberRecordsTable.tsx
import React from "react";
import { Box, Table, Thead, Tbody, Tr, Th, Td, Badge, Text } from "@chakra-ui/react";
import { format, parseISO } from "date-fns";
import { MemberRecord } from "components/analytics/memberAnalyticsTypes";
import { getStatusMeta } from "components/analytics/statusMeta";

const MemberRecordsTable: React.FC<{ records: MemberRecord[] }> = ({ records }) => (
  <Box bg="white" borderRadius="12px" border="1px solid" borderColor="gray.200" p={2} overflowX="auto">
    <Text fontSize="sm" fontWeight="semibold" p={2}>Session records</Text>
    <Table variant="striped" size="sm">
      <Thead>
        <Tr>
          <Th isNumeric>SN</Th>
          <Th>Date</Th>
          <Th>Session</Th>
          <Th>Status</Th>
          <Th>Note</Th>
        </Tr>
      </Thead>
      <Tbody>
        {records.map((record, index) => {
          const meta = getStatusMeta(record.status);
          return (
            <Tr key={record.attendanceId}>
              <Td isNumeric>{index + 1}</Td>
              <Td>{format(parseISO(record.date), "MMM d, yyyy")}</Td>
              <Td>{record.sessionName}</Td>
              <Td><Badge colorScheme={meta.color}>{meta.full}</Badge></Td>
              <Td>{record.hasBeenUpdated && <Badge colorScheme="purple">edited</Badge>}</Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  </Box>
);

export default MemberRecordsTable;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `yarn test --watchAll=false src/components/analytics/StreakCard.test.tsx src/components/analytics/AttendanceTimeline.test.tsx src/components/analytics/MemberRecordsTable.test.tsx`
Expected: PASS (3 passing).

- [ ] **Step 7: Commit**

```bash
git add src/components/analytics/StreakCard.tsx src/components/analytics/AttendanceTimeline.tsx src/components/analytics/MemberRecordsTable.tsx src/components/analytics/StreakCard.test.tsx src/components/analytics/AttendanceTimeline.test.tsx src/components/analytics/MemberRecordsTable.test.tsx
git commit -m "feat: add streak card, attendance timeline, and records table"
```

---

### Task 7: Service constants, route wiring, and the MemberAnalytics page

**Files:**
- Modify: `src/services/api/request.ts`
- Modify: `src/routes/pagePath.ts`
- Modify: `src/routes/protectedRoutes.tsx`
- Create: `src/pages/MemberAnalytics.tsx`
- Test: `src/pages/MemberAnalytics.test.tsx`

**Interfaces:**
- Consumes: all components from Tasks 4–6, `attendanceRequest.MEMBER_ANALYTICS*`, `useDateRange`, `openExportUrl`/`handleExportError`, `MemberAnalytics` type.
- Produces: default-exported `MemberAnalyticsPage` React component; route `MEMBER_ANALYTICS = "/analytics/member/:memberId"`.

- [ ] **Step 1: Add the service constants**

In `src/services/api/request.ts`, add to the `attendanceRequest` object (after `ANALYTICS_EXPORT_PDF`):

```ts
  MEMBER_ANALYTICS: "/attendance/:organisationId/analytics/member/:memberId",
  MEMBER_ANALYTICS_EXPORT_EXCEL:
    "/attendance/:organisationId/analytics/member/:memberId/export/excel",
  MEMBER_ANALYTICS_EXPORT_PDF:
    "/attendance/:organisationId/analytics/member/:memberId/export/pdf",
```

- [ ] **Step 2: Add the path**

In `src/routes/pagePath.ts`, add to `PROTECTED_PATHS` (after `ANALYTICS`):

```ts
  MEMBER_ANALYTICS: "/analytics/member/:memberId",
```

- [ ] **Step 3: Register the lazy route**

In `src/routes/protectedRoutes.tsx`:

Add the lazy import next to the other page imports:
```ts
const MemberAnalytics = WithSuspense(lazy(() => import("pages/MemberAnalytics")));
```
Add `MEMBER_ANALYTICS` to the `PROTECTED_PATHS` destructuring block.
Add the route to `PROTECTED_ROUTES` (right after the `ANALYTICS` entry):
```tsx
  { path: MEMBER_ANALYTICS, element: <MemberAnalytics /> },
```

- [ ] **Step 4: Write the failing page smoke test**

```tsx
// src/pages/MemberAnalytics.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "services/api/apiHelper";
import MemberAnalytics from "pages/MemberAnalytics";

test("renders the header and back button", () => {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/analytics/member/m1?fromDate=2026-01-01&toDate=2026-06-30"]}>
        <Routes>
          <Route path="/analytics/member/:memberId" element={<MemberAnalytics />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText("Member Analytics")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Back/ })).toBeInTheDocument();
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `yarn test --watchAll=false src/pages/MemberAnalytics.test.tsx`
Expected: FAIL — cannot find module `pages/MemberAnalytics`.

- [ ] **Step 6: Implement the page**

```tsx
// src/pages/MemberAnalytics.tsx
import React, { useMemo } from "react";
import { Box, Flex, Button, Spinner, Text } from "@chakra-ui/react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { FaArrowCircleLeft, FaFileExcel, FaFilePdf } from "react-icons/fa";
import { useQueryWrapper } from "services/api/apiHelper";
import { attendanceRequest } from "services";
import { convertParamsToString } from "helpers/stringManipulations";
import useGlobalStore from "zStore";
import { PROTECTED_PATHS } from "routes/pagePath";
import { useDateRange } from "components/analytics/useDateRange";
import DateRangeControls from "components/analytics/DateRangeControls";
import MemberHero from "components/analytics/MemberHero";
import StreakCard from "components/analytics/StreakCard";
import StatTiles from "components/analytics/StatTiles";
import AttendanceTimeline from "components/analytics/AttendanceTimeline";
import MemberRecordsTable from "components/analytics/MemberRecordsTable";
import { openExportUrl, handleExportError } from "components/analytics/analyticsExport";
import { MemberAnalytics as MemberAnalyticsData } from "components/analytics/memberAnalyticsTypes";

const buildQuery = (fromDate: string, toDate: string) => {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  return params.toString();
};

const withQuery = (path: string, queryString: string) =>
  queryString ? `${path}?${queryString}` : path;

const MemberAnalyticsPage: React.FC = () => {
  const { memberId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [org] = useGlobalStore((state) => [state.organisation]);
  const navigate = useNavigate();

  const {
    fromDate, toDate, setFromDate, setToDate,
    activePreset, applyPreset, handleDateChange,
  } = useDateRange({
    initialFrom: searchParams.get("fromDate") ?? "",
    initialTo: searchParams.get("toDate") ?? "",
  });

  const canQuery = Boolean(org.id && memberId);
  const queryString = useMemo(() => buildQuery(fromDate, toDate), [fromDate, toDate]);

  const url = useMemo(() => {
    if (!canQuery) return "";
    const path = convertParamsToString(attendanceRequest.MEMBER_ANALYTICS, {
      organisationId: org.id,
      memberId,
    });
    return withQuery(path, queryString);
  }, [canQuery, org.id, memberId, queryString]);

  const { data: response, isFetching, error } = useQueryWrapper(
    ["memberAnalytics", org.id, memberId, fromDate, toDate],
    url,
    { enabled: canQuery },
  );

  const analytics: MemberAnalyticsData | undefined = response?.data;
  const statusCode = (error as any)?.response?.status;
  const hasData = Boolean(analytics && analytics.summary.totalSessions > 0);

  const excelUrl = useMemo(() => {
    if (!canQuery) return "";
    const path = convertParamsToString(attendanceRequest.MEMBER_ANALYTICS_EXPORT_EXCEL, {
      organisationId: org.id, memberId,
    });
    return withQuery(path, queryString);
  }, [canQuery, org.id, memberId, queryString]);

  const pdfUrl = useMemo(() => {
    if (!canQuery) return "";
    const path = convertParamsToString(attendanceRequest.MEMBER_ANALYTICS_EXPORT_PDF, {
      organisationId: org.id, memberId,
    });
    return withQuery(path, queryString);
  }, [canQuery, org.id, memberId, queryString]);

  const { refetch: refetchExcel, isFetching: isExportingExcel } = useQueryWrapper(
    ["memberAnalyticsExcel", org.id, memberId, fromDate, toDate],
    excelUrl,
    {
      enabled: false,
      onSuccess: (res: any) => openExportUrl(res, "Excel"),
      onError: (err: any) => handleExportError(err, "Excel"),
    },
  );

  const { refetch: refetchPdf, isFetching: isExportingPdf } = useQueryWrapper(
    ["memberAnalyticsPdf", org.id, memberId, fromDate, toDate],
    pdfUrl,
    {
      enabled: false,
      onSuccess: (res: any) => openExportUrl(res, "PDF"),
      onError: (err: any) => handleExportError(err, "PDF"),
    },
  );

  return (
    <Box minH="100vh" bg="gray.50">
      <Flex bg="blue.500" justify="space-between" align="center" p="4">
        <Text fontWeight="bold" color="#fff">Member Analytics</Text>
      </Flex>
      <Box p={2}>
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={2} mb={3}>
          <Button
            variant="logout" colorScheme="blue" leftIcon={<FaArrowCircleLeft />}
            onClick={() => navigate(PROTECTED_PATHS.ANALYTICS)}
          >
            Back
          </Button>
          <Flex gap={2} flexWrap="wrap">
            <Button
              leftIcon={<FaFileExcel />} onClick={() => refetchExcel()}
              isLoading={isExportingExcel} isDisabled={!hasData}
              bg="green.500" color="white" _hover={{ bg: "green.600" }}
            >
              Export Excel
            </Button>
            <Button
              leftIcon={<FaFilePdf />} onClick={() => refetchPdf()}
              isLoading={isExportingPdf} isDisabled={!hasData}
              bg="red.500" color="white" _hover={{ bg: "red.600" }}
            >
              Export PDF
            </Button>
          </Flex>
        </Flex>

        <DateRangeControls
          fromDate={fromDate}
          toDate={toDate}
          activePreset={activePreset}
          applyPreset={applyPreset}
          setFromDate={setFromDate}
          setToDate={setToDate}
          handleDateChange={handleDateChange}
        />

        {isFetching && <Spinner />}
        {!isFetching && statusCode === 404 && (
          <Text color="red.500" mt={4}>Member not found in this organisation.</Text>
        )}
        {!isFetching && error && statusCode !== 404 && (
          <Text color="red.500" mt={4}>Error loading member analytics.</Text>
        )}
        {!isFetching && !error && analytics && !hasData && (
          <Text mt={4}>No attendance records for this range.</Text>
        )}
        {!isFetching && !error && hasData && analytics && (
          <Flex direction="column" gap={4} mt={2}>
            <MemberHero name={analytics.member.name} fields={analytics.member.fields} />
            <StreakCard
              currentStreak={analytics.summary.currentStreak}
              longestStreak={analytics.summary.longestStreak}
              attendanceRate={analytics.summary.attendanceRate}
            />
            <StatTiles
              present={analytics.summary.present}
              absent={analytics.summary.absent}
              apology={analytics.summary.apology}
              totalSessions={analytics.summary.totalSessions}
            />
            <AttendanceTimeline verdicts={analytics.verdicts} />
            <MemberRecordsTable records={analytics.records} />
          </Flex>
        )}
      </Box>
    </Box>
  );
};

export default MemberAnalyticsPage;
```

- [ ] **Step 7: Run the page test to verify it passes**

Run: `yarn test --watchAll=false src/pages/MemberAnalytics.test.tsx`
Expected: PASS (1 passing).

- [ ] **Step 8: Commit**

```bash
git add src/services/api/request.ts src/routes/pagePath.ts src/routes/protectedRoutes.tsx src/pages/MemberAnalytics.tsx src/pages/MemberAnalytics.test.tsx
git commit -m "feat: add member analytics page, route, and service endpoints"
```

---

### Task 8: Make org-wide grid rows drill into the member page

**Files:**
- Modify: `src/pages/Analytics.tsx`

**Interfaces:**
- Consumes: `PROTECTED_PATHS.MEMBER_ANALYTICS`, `convertParamsToString`, the existing `navigate` and `fromDate`/`toDate` in `Analytics.tsx`, and `row.memberId` on each analytics row.

- [ ] **Step 1: Add a navigation helper in the component body**

In `src/pages/Analytics.tsx`, after the `navigate` is obtained, add:

```ts
const goToMemberAnalytics = (memberId: string) => {
  const path = convertParamsToString(PROTECTED_PATHS.MEMBER_ANALYTICS, { memberId });
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const search = params.toString();
  navigate(search ? `${path}?${search}` : path);
};
```

(`PROTECTED_PATHS` and `convertParamsToString` are already imported in this file.)

- [ ] **Step 2: Make each row clickable**

In the table body, change the row element from:

```tsx
<Tr key={row.memberId}>
```

to:

```tsx
<Tr
  key={row.memberId}
  onClick={() => row.memberId && goToMemberAnalytics(row.memberId)}
  cursor={row.memberId ? "pointer" : "default"}
  _hover={row.memberId ? { bg: "blue.50" } : undefined}
  title={row.memberId ? "View member analytics" : undefined}
>
```

- [ ] **Step 3: Verify build/tests**

Run: `yarn test --watchAll=false src/App.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Analytics.tsx
git commit -m "feat: drill into member analytics from the org-wide grid"
```

---

### Task 9: End-to-end verification

**Files:** none (manual verification).

- [ ] **Step 1: Run the full test suite**

Run: `yarn test --watchAll=false`
Expected: all suites pass (new analytics tests + existing suites).

- [ ] **Step 2: Typecheck / build**

Run: `yarn build`
Expected: compiles with no TypeScript errors.

- [ ] **Step 3: Drive the app (use the `run`/`verify` skill)**

Start the app (`yarn start`), log in, open an org, go to **Attendance Analytics**, run a search with a date range, then:
1. Click a member row → lands on `/analytics/member/:memberId?fromDate=…&toDate=…`.
2. Confirm the hero (name + identity), streak card (🔥 current, longest, milestone bar filling, rate ring %), four stat tiles, the month-grouped timeline strip (hover shows date + status), and the records table (with an "edited" tag on updated sessions).
3. Change the range with a preset and a picker → data refetches automatically.
4. Click **Export Excel** and **Export PDF** → a file URL opens in a new tab; for a range with no sessions, buttons are disabled and the empty-state message shows.
5. Manually visit a bogus member id → "Member not found in this organisation."
6. Click **Back** → returns to the org-wide analytics page.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "fix: member analytics verification adjustments"
```

---

## Self-Review

**Spec coverage:**
- Route + grid-row entry point carrying the range → Tasks 7, 8. ✓
- Service constants → Task 7. ✓
- Hero banner (identity only) → Task 5 (MemberHero). ✓
- Streak card: milestone bar + rate ring → Tasks 2, 5 (RateRing), 6 (StreakCard). ✓
- Stat tiles (present/absent/apology/total) → Task 5. ✓
- Timeline strip (verdicts, month-grouped, legend) → Task 6. ✓
- Records table (date/session/status/edited) → Task 6. ✓
- Auto-fetch on load + range change; default range carried from query → Task 7. ✓
- Export Excel/PDF in header (URL open, 400/empty handling) → Tasks 3, 7. ✓
- States: loading / empty / 404 → Task 7. ✓
- DRY extraction (useDateRange, DateRangeControls, analyticsExport, statusMeta) + Analytics refactor → Tasks 1, 3, 4. ✓
- Milestone ladder 3/5/10/20/50/100 → Task 2. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**Type consistency:** `AttendanceStatus` defined once in `statusMeta.ts` and reused by `memberAnalyticsTypes.ts`, timeline, and table. Component prop names (`present/absent/apology/totalSessions`, `currentStreak/longestStreak/attendanceRate`, `verdicts`, `records`) match the page's usage in Task 7 and the `MemberAnalytics` type. `getMilestoneProgress` returns `{ nextTier, prevTier, percent, isRecord }`, consumed consistently by StreakCard. `openExportUrl(response, format)` / `handleExportError(err, format)` signatures match both the Analytics refactor (Task 3) and the page (Task 7). ✓

## Notes / conventions

- Component tests render plain (no `ChakraProvider`), matching the existing `PermissionGrid.test.tsx`; the page test wraps in `QueryClientProvider` + `MemoryRouter`, matching `Finance.test.tsx`.
- `yarn test` is `react-scripts test`; pass `--watchAll=false` for one-shot runs.
- File locations follow the feature-cohesive convention already used by `components/finance/` and `components/officers/`.

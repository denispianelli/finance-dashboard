# Design — "Du / Au" date-range filter (shadcn-based, supersedes the popover-range design)

Date: 2026-06-03

Supersedes the range approach in `2026-06-03-transactions-date-range-filter-design.md` (the
hand-rolled single "Période" popover + range calendar). Same goal — filter transactions by an
arbitrary date range — but built on **adopted shadcn components** (project decision 2026-06-03,
see memory `feedback_adopt_shadcn_ui`) and a clearer **two-field "Du / Au"** UX.

## Why the rework

Visual QA of the first version surfaced: misplaced calendar nav arrows, no in-progress
selection feedback, future dates selectable, and a default ("Tout") that didn't read as a
period control. Rather than patch the hand-rolled calendar, we adopt shadcn's maintained
`calendar` + date-input pattern (which handle nav/feedback correctly) and switch to two
explicit date fields, which is clearer than two-click range selection and makes the bugs
impossible by construction.

## Decision

- Bump `react-day-picker` **v9 → v10** (shadcn's current `calendar` targets the latest).
- Replace the hand-rolled `src/renderer/components/ui/calendar.tsx` with shadcn's official
  `calendar` (pulled via the shadcn MCP), re-themed to the design tokens.
- Build a reusable single-date **`DateInput`** from shadcn's "Input" date-picker pattern
  (typed input + calendar popover).
- `PeriodFilter` = preset quick-fill shortcuts **+ two `DateInput`s ("Du" / "Au")**, replacing
  the single "Période" popover button.
- The filter logic stays on explicit `from`/`to` bounds (already refactored — unchanged).

## Design

### 1. Dependency

- `react-day-picker` `^9` → `^10`. `@radix-ui/react-popover` and `date-fns` already present.
  (`@tanstack/react-virtual` unaffected.)

### 2. `calendar.tsx` — adopt shadcn v10, re-themed

Pull `@shadcn/calendar` (registry:ui, react-day-picker v10) via the MCP and replace the current
hand-rolled file. Re-theme: map its color classes to the repo tokens (`ink-*`, `paper-*`,
`line-*`, `brass`/`brass-soft`); keep French locale + Monday start; Lucide chevrons. The v10
component fixes the nav layout and provides correct range/selected/today states out of the box.
NO stock shadcn tokens (`bg-background`, `text-muted-foreground`, …) may remain.

### 3. `DateInput` — `src/renderer/components/dashboard/DateInput.tsx`

A single-date field combining a typed input with a calendar popover (shadcn "Input" date
pattern, re-themed).

- Props: `{ value: string | null; onChange: (iso: string | null) => void; min?: string; max?: string; ariaLabel: string; placeholder?: string }` — `value`/`min`/`max` are ISO `yyyy-mm-dd`.
- A styled text input shows the date as `jj/mm/aaaa`; a trailing `CalendarDays` (Lucide) button
  opens a `Popover` with a single-mode `Calendar` (`disabled` outside `[min, max]`,
  `defaultMonth` = current value).
- Typing a valid `jj/mm/aaaa` (parsed with `date-fns`) within `[min,max]` → `onChange(iso)`;
  empty input → `onChange(null)`; invalid/out-of-range input → reverts to the last valid value
  on blur (no error UI). Calendar select → `onChange(iso)` + closes.
- Date↔ISO via `toLocalISODate` (exists) and local-midnight parse.

### 4. `PeriodFilter` — rework

- Value is now the bounds directly: `{ from: string | null; to: string | null }` (ISO; null =
  unbounded). The `DateSel` discriminated union is removed.
- Props: `{ value: { from: string | null; to: string | null }; onChange: (v) => void; today: string }`.
- Layout (inline in the filter bar):
  - **Preset chips**: Tout / 30 jours / 3 mois / Année. Clicking fills the bounds:
    `30j` → `{ from: periodStart('30d', today), to: today }`; `3 mois`/`Année` likewise via
    `periodStart`; `Tout` → `{ from: null, to: null }`. A chip shows active when the current
    bounds equal its computed bounds.
  - **`Du` `DateInput`** (`value=from`, `max = to ?? today`) and **`Au` `DateInput`**
    (`value=to`, `min = from ?? undefined`, `max = today`). Cross-constraints make future dates
    and inverted ranges unselectable.
- Editing either field emits the updated `{from,to}`.

### 5. `TransactionsPage`

- State: `const [range, setRange] = useState<{ from: string | null; to: string | null }>(() => ({ from: periodStart('30d', today), to: today }))` — **default = last 30 days**.
- Build `TxFilters` with `from: range.from, to: range.to` (other filters unchanged).
- Render `<PeriodFilter value={range} onChange={setRange} today={today} />` in place of the old
  period control. `today` state stays; the in-page `periodStart` resolution + `DateSel` import
  are removed (PeriodFilter owns preset→bounds now).

### 6. Testing

- `DateInput` (jsdom): typing `jj/mm/aaaa` → `onChange(iso)`; clearing → `onChange(null)`;
  out-of-`max` typed value reverts on blur; calendar day click → `onChange(iso)`.
- `PeriodFilter` (jsdom): a preset chip fills both bounds (assert `onChange` payload); editing
  the `Du` field emits updated `from`; the `Au` field's calendar disables future days.
- `TransactionsPage` (jsdom): default range is the last 30 days (assert the IPC/filter reflects
  a non-null `from`); the `Du`/`Au` controls render; existing filter/empty/virtualization tests
  stay green. (No real-clock-dependent date assertions — bounds logic is covered in
  `filterTransactions` unit tests.)

### 7. Definition of done

Lint clean (0 warnings), `tsc --noEmit` clean, unit tests green, `npm run build` succeeds.
Manual visual check: calendar dark-themed (FR, Monday, correct nav, range/selected highlight),
Du/Au fields typeable + calendar pickable, future dates blocked, presets fill the fields,
default shows the last 30 days.

## Risks / notes

- react-day-picker v10 `classNames` keys differ slightly from v9 — re-theme against the
  installed v10 (pull the exact shadcn v10 calendar source via the MCP; tune tokens visually).
- The filter bar gets busier (presets + Du + Au + type + category + search); it already
  `flex-wrap`s — verify it wraps cleanly at narrow widths.
- This reworks code committed (but not pushed) in the prior date-range commits; the new work
  supersedes the hand-rolled calendar + the `DateSel`-based `PeriodFilter`.

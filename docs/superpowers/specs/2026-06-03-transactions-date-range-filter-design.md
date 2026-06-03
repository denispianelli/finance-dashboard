# Design — Unified "Période" filter (presets + custom date range)

Date: 2026-06-03

## Problem

The Transactions page filters by period only through fixed preset buttons (Tout / 30 jours /
3 mois / Cette année). There is no way to filter by an arbitrary date range.

## Goal

Replace the period segmented control with a single "Période" popover that offers the existing
presets AND a calendar range picker, so the user can pick either a quick preset or a custom
from–to range. One control, no clutter.

Non-goals: per-field date inputs, time-of-day, relative ranges beyond the four presets,
server-side date filtering (filtering stays client-side).

## Decision

Add the shadcn date-picker building blocks manually (this repo copies shadcn components into
`src/renderer/components/ui/`, it is not a runtime package): a Radix `Popover` wrapper and a
`react-day-picker` v9 `Calendar`, both styled to the repo's design tokens. The period logic is
refactored so the filter works on explicit inclusive date bounds (`from`/`to`), which covers
presets and custom ranges uniformly.

## Design

### 1. Dependencies & UI primitives

- npm deps (local, CSP-safe): `@radix-ui/react-popover`, `react-day-picker` (v9), `date-fns`
  (label formatting + French locale).
- `src/renderer/components/ui/popover.tsx` — Radix Popover wrapper following the existing
  `dialog.tsx` pattern, styled with tokens (`bg-ink-2`, `border-line-2`, shadow, radius).
- `src/renderer/components/ui/calendar.tsx` — `react-day-picker` `DayPicker` in `mode="range"`,
  French locale, week starting Monday, styled via its `classNames` prop to the tokens
  (selected range in `brass`, muted out-of-month days, hover states). Exposes a thin
  `Calendar` wrapper component.

### 2. Filter logic refactor — `src/renderer/lib/filterTransactions.ts`

`filterTransactions` currently takes `period: TxPeriod` + `today`. Change `TxFilters` to take
explicit inclusive bounds instead:

```ts
export interface TxFilters {
  readonly from: string | null; // inclusive lower bound, ISO yyyy-mm-dd, null = unbounded
  readonly to: string | null; // inclusive upper bound, ISO yyyy-mm-dd, null = unbounded
  readonly categoryId: 'all' | null | string;
  readonly query: string;
  readonly type: TxType;
}
```

The date check becomes `if (from && t.date < from) return false; if (to && t.date > to) return false;`
(lexicographic ISO compare). `filterTransactions` no longer reads `today` and no longer knows
about presets. `TxPeriod` and `periodStart(period, today)` stay exported — the **page** resolves
a preset to a `from` bound via `periodStart` (presets have no upper bound → `to = null`).

### 3. `PeriodFilter` component — `src/renderer/components/dashboard/PeriodFilter.tsx`

- Selection model (exported):
  ```ts
  export type DateSel =
    | { kind: 'preset'; preset: TxPeriod }
    | { kind: 'range'; from: string; to: string }; // ISO yyyy-mm-dd
  ```
- Props: `{ value: DateSel; onChange: (v: DateSel) => void; today: string }`.
- Renders a `Popover`: trigger is a ghost `Button` showing the current label —
  presets → "Tout" / "30 derniers jours" / "3 derniers mois" / "Cette année"; range →
  `"12 mai – 3 juin"` via `date-fns` `format(d, 'd MMM', { locale: fr })`.
- Popover content: a left column of preset buttons + a `Calendar` (`mode="range"`).
  - Clicking a preset → `onChange({ kind: 'preset', preset })` and closes the popover.
  - The calendar reflects the current range (if `kind: 'range'`). When the user has selected
    BOTH ends, → `onChange({ kind: 'range', from, to })`. A partial selection (only `from`)
    does not commit yet.
- ISO ↔ `Date` conversion: `toLocalISODate(date)` (already exists) for Date→ISO; ISO→Date via
  `new Date(`${iso}T00:00:00`)` (local midnight, no UTC shift).

### 4. `TransactionsPage` — `src/renderer/pages/TransactionsPage.tsx`

- Replace the period `Segmented` with `<PeriodFilter value={dateSel} onChange={setDateSel} today={today} />`.
  State: `const [dateSel, setDateSel] = useState<DateSel>({ kind: 'preset', preset: 'all' })`.
- Compute effective bounds:
  ```ts
  const { from, to } = useMemo(() => {
    if (dateSel.kind === 'range') return { from: dateSel.from, to: dateSel.to };
    return { from: periodStart(dateSel.preset, today), to: null as string | null };
  }, [dateSel, today]);
  ```
  Pass `from`/`to` into the `TxFilters` built for `filterTransactions`. The type/category/search
  filters are unchanged. The `today` state stays (used to resolve presets).

### 5. Testing

- `filterTransactions` tests: adapt to `from`/`to` bounds — inclusive lower bound, inclusive
  upper bound, both-set range, unbounded (null/null) returns all, combined with type/category/
  search. `periodStart` tests unchanged.
- `PeriodFilter` test (jsdom): the trigger label reflects the `value`; clicking a preset calls
  `onChange` with that preset; selecting two calendar days calls `onChange` with
  `{ kind: 'range', from, to }`. (Use `react-day-picker`'s rendered day buttons via accessible
  names / role `gridcell`.)
- `TransactionsPage` test: a "filters by date range" test — set a range (drive `PeriodFilter`)
  and assert only in-range transactions render. Keep the existing filter/empty-state/virtualization
  tests green.

### 6. Definition of done

Lint clean, `tsc --noEmit` clean, unit tests green, `npm run build` succeeds. Manual visual
check of the calendar (dark tokens, French locale, Monday start, range highlight).

## Risks / notes

- The `Calendar` token styling (react-day-picker v9 `classNames`) is the fiddliest part; verify
  visually in dark mode.
- `filterTransactions` signature change ripples to its tests and the `TransactionsPage` filter
  construction — both are updated here; no other consumer exists.
- `react-day-picker` v9 + React 19 are compatible; French locale via `react-day-picker/locale`
  or `date-fns/locale`.

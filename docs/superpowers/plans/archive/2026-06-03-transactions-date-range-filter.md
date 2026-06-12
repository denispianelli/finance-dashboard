# Unified "Période" filter (presets + date range) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Transactions period segmented control with a single "Période" popover offering the four presets plus a calendar date-range picker.

**Architecture:** Add Radix `Popover` + `react-day-picker` `Calendar` as shadcn-style UI primitives. Refactor `filterTransactions` to take explicit `from`/`to` bounds (covers presets and custom ranges uniformly). A new `PeriodFilter` component owns the popover/preset/calendar UI; `TransactionsPage` resolves the selection to bounds via the existing `periodStart`.

**Tech Stack:** React 19, `@radix-ui/react-popover`, `react-day-picker` v9, `date-fns`, TypeScript strict, Tailwind/shadcn tokens, Lucide, Vitest 4 (jsdom).

**Conventions:** TS strict (no `any`, no non-null assertions, `noUncheckedIndexedAccess` on). Conventional Commits, imperative subject (commitlint). Commit body trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Pre-commit reformats staged files (re-add + retry). The lint script runs `eslint ... --max-warnings 0` (warnings fail). Run tests with `npm test -- <pattern>`.

**Testing reality (read this):** `TransactionsPage` reads the real clock for `today`, so date-based assertions at the page level are non-deterministic across run dates. Therefore date-bound filtering is proven in `filterTransactions` unit tests (injected dates) and the calendar→onChange wiring in the `PeriodFilter` test; the page test only checks that the new control renders/wires (no date assertion).

---

### Task 1: Add dependencies

**Files:** `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install @radix-ui/react-popover react-day-picker date-fns`
Expected: adds the three to `dependencies`; lockfile updated. (`react-day-picker` should be v9.x.)

- [ ] **Step 2: Confirm versions resolve**

Run: `node -p "require('react-day-picker/package.json').version"` → expect `9.x`.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add popover, react-day-picker and date-fns for the date-range filter"
```

(append the Co-Authored-By trailer)

---

### Task 2: Refactor `filterTransactions` to explicit `from`/`to` bounds

**Files:**

- Modify: `src/renderer/lib/filterTransactions.ts`
- Modify: `tests/unit/renderer/filterTransactions.test.ts`

- [ ] **Step 1: Update the tests (TDD)**

In `tests/unit/renderer/filterTransactions.test.ts`, replace the `ALL` constant and the entire `describe('filterTransactions', ...)` block (keep the `periodStart` and `toLocalISODate` describes and the `tx()` factory and `TODAY` unchanged). New `ALL` + block:

```ts
const ALL = { from: null, to: null, categoryId: 'all', query: '', type: 'all' } as const;

describe('filterTransactions', () => {
  it('returns everything with the default (unbounded) filters', () => {
    const txns = [tx({ id: 'a' }), tx({ id: 'b' })];
    expect(filterTransactions(txns, ALL)).toHaveLength(2);
  });

  it('excludes transactions before the inclusive lower bound (from)', () => {
    const txns = [tx({ id: 'old', date: '2026-01-10' }), tx({ id: 'new', date: '2026-05-20' })];
    const out = filterTransactions(txns, { ...ALL, from: '2026-05-04' });
    expect(out.map((t) => t.id)).toEqual(['new']);
  });

  it('includes a transaction exactly on the lower bound', () => {
    const txns = [tx({ id: 'edge', date: '2026-05-04' })];
    expect(filterTransactions(txns, { ...ALL, from: '2026-05-04' })).toHaveLength(1);
  });

  it('excludes transactions after the inclusive upper bound (to)', () => {
    const txns = [tx({ id: 'in', date: '2026-05-10' }), tx({ id: 'after', date: '2026-05-20' })];
    const out = filterTransactions(txns, { ...ALL, to: '2026-05-15' });
    expect(out.map((t) => t.id)).toEqual(['in']);
  });

  it('includes a transaction exactly on the upper bound', () => {
    const txns = [tx({ id: 'edge', date: '2026-05-15' })];
    expect(filterTransactions(txns, { ...ALL, to: '2026-05-15' })).toHaveLength(1);
  });

  it('keeps only transactions inside a closed [from, to] range', () => {
    const txns = [
      tx({ id: 'before', date: '2026-04-30' }),
      tx({ id: 'inside', date: '2026-05-10' }),
      tx({ id: 'after', date: '2026-06-01' }),
    ];
    const out = filterTransactions(txns, { ...ALL, from: '2026-05-01', to: '2026-05-31' });
    expect(out.map((t) => t.id)).toEqual(['inside']);
  });

  it('filters by a specific category id', () => {
    const txns = [tx({ id: 'a', categoryId: 'cat-1' }), tx({ id: 'b', categoryId: 'cat-2' })];
    const out = filterTransactions(txns, { ...ALL, categoryId: 'cat-1' });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('filters uncategorized transactions when categoryId is null', () => {
    const txns = [tx({ id: 'a', categoryId: null }), tx({ id: 'b', categoryId: 'cat-2' })];
    const out = filterTransactions(txns, { ...ALL, categoryId: null });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('matches search case- and accent-insensitively on labelClean', () => {
    const txns = [
      tx({ id: 'a', labelClean: 'Café de la Gare' }),
      tx({ id: 'b', labelClean: 'Loyer' }),
    ];
    const out = filterTransactions(txns, { ...ALL, query: 'cafe' });
    expect(out.map((t) => t.id)).toEqual(['a']);
  });

  it('filters income (amount > 0) and expense (amount < 0)', () => {
    const txns = [tx({ id: 'in', amount: 100 }), tx({ id: 'out', amount: -40 })];
    expect(filterTransactions(txns, { ...ALL, type: 'income' }).map((t) => t.id)).toEqual(['in']);
    expect(filterTransactions(txns, { ...ALL, type: 'expense' }).map((t) => t.id)).toEqual(['out']);
  });

  it('excludes zero-amount transactions from both income and expense', () => {
    const txns = [tx({ id: 'zero', amount: 0 })];
    expect(filterTransactions(txns, { ...ALL, type: 'income' })).toHaveLength(0);
    expect(filterTransactions(txns, { ...ALL, type: 'expense' })).toHaveLength(0);
    expect(filterTransactions(txns, { ...ALL, type: 'all' })).toHaveLength(1);
  });

  it('combines filters (AND semantics)', () => {
    const txns = [
      tx({
        id: 'hit',
        amount: -10,
        categoryId: 'cat-1',
        labelClean: 'Monoprix',
        date: '2026-05-30',
      }),
      tx({
        id: 'wrongCat',
        amount: -10,
        categoryId: 'cat-9',
        labelClean: 'Monoprix',
        date: '2026-05-30',
      }),
      tx({
        id: 'wrongType',
        amount: 10,
        categoryId: 'cat-1',
        labelClean: 'Monoprix',
        date: '2026-05-30',
      }),
      tx({
        id: 'outOfRange',
        amount: -10,
        categoryId: 'cat-1',
        labelClean: 'Monoprix',
        date: '2026-01-01',
      }),
    ];
    const out = filterTransactions(txns, {
      from: '2026-05-01',
      to: '2026-05-31',
      categoryId: 'cat-1',
      query: 'mono',
      type: 'expense',
    });
    expect(out.map((t) => t.id)).toEqual(['hit']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- filterTransactions`
Expected: FAIL — `TxFilters` still has `period`/`today`; passing `from`/`to` is a type error / wrong behavior.

- [ ] **Step 3: Refactor `filterTransactions.ts`**

Replace the `TxFilters` interface and the `filterTransactions` function. Keep `TxPeriod`, `TxType`, `TxCategoryFilter`, `normalize`, `toLocalISODate`, and `periodStart` exactly as they are.

Change the interface from the `period`/`today` version to:

```ts
export interface TxFilters {
  /** Inclusive lower bound, ISO `yyyy-mm-dd`. `null` = unbounded. */
  readonly from: string | null;
  /** Inclusive upper bound, ISO `yyyy-mm-dd`. `null` = unbounded. */
  readonly to: string | null;
  /** Category to match: 'all' = any, null = uncategorized, otherwise a category id. */
  readonly categoryId: TxCategoryFilter;
  /** Free-text match on the cleaned label; case- and accent-insensitive. Empty = no filter. */
  readonly query: string;
  /** Income (amount > 0), expense (amount < 0), or all. Zero-amount only appears under 'all'. */
  readonly type: TxType;
}
```

Change the function body (drop the `periodStart` call; use the bounds directly):

```ts
export function filterTransactions(
  txns: readonly DashboardTransaction[],
  filters: TxFilters,
): DashboardTransaction[] {
  const q = normalize(filters.query.trim());

  return txns.filter((t) => {
    if (filters.from !== null && t.date < filters.from) return false;
    if (filters.to !== null && t.date > filters.to) return false;
    if (filters.categoryId !== 'all' && t.categoryId !== filters.categoryId) return false;
    if (filters.type === 'income' && t.amount <= 0) return false;
    if (filters.type === 'expense' && t.amount >= 0) return false;
    if (q.length > 0 && !normalize(t.labelClean).includes(q)) return false;
    return true;
  });
}
```

Leave the JSDoc above `filterTransactions` but drop the stale "by period" wording — make it read: "Filter transactions by date bounds / category / label / type. All criteria are AND-ed. ISO `yyyy-mm-dd` dates compare lexicographically."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- filterTransactions` → PASS.
Note: `TransactionsPage.tsx` still passes `period`/`today` at this point, so `npx tsc --noEmit` will FAIL until Task 5. That is expected; do not "fix" the page here. Proceed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/filterTransactions.ts tests/unit/renderer/filterTransactions.test.ts
git commit -m "refactor(transactions): filter by explicit from/to date bounds"
```

(append the Co-Authored-By trailer; the pre-push hook is not triggered by commit, so the temporary page type error does not block committing.)

---

### Task 3: Add `Popover` and `Calendar` UI primitives

**Files:**

- Create: `src/renderer/components/ui/popover.tsx`
- Create: `src/renderer/components/ui/calendar.tsx`

No standalone tests (they are plumbing exercised by Task 4). Verify via lint + tsc.

- [ ] **Step 1: Create `src/renderer/components/ui/popover.tsx`**

```tsx
import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@renderer/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-lg border border-line-2 bg-ink-2 text-paper shadow-lg outline-none ' +
          'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
```

- [ ] **Step 2: Create `src/renderer/components/ui/calendar.tsx`**

This targets `react-day-picker` v9. IMPORTANT: v9 minor versions have tweaked a few `classNames` keys and the `Chevron` component API. After writing this, run it (Task 4 / dev) and **verify the calendar renders correctly in dark mode; adjust the `classNames` keys to match the installed version if any part is unstyled.** This is the one visually-fiddly piece — tune it, do not leave it broken.

```tsx
import { type ComponentProps } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import { fr } from 'react-day-picker/locale';
import { cn } from '@renderer/lib/utils';

export type CalendarProps = ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={fr}
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col',
        month: 'space-y-3',
        month_caption: 'relative flex h-8 items-center justify-center',
        caption_label: 'font-sans text-[13px] font-medium capitalize text-paper',
        nav: 'absolute inset-x-0 top-0 flex items-center justify-between',
        button_previous:
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-paper-mute hover:bg-ink-3 hover:text-paper',
        button_next:
          'inline-flex h-7 w-7 items-center justify-center rounded-md text-paper-mute hover:bg-ink-3 hover:text-paper',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-9 text-[10px] font-medium uppercase tracking-[0.08em] text-paper-dim',
        week: 'mt-1 flex w-full',
        day: 'h-9 w-9 p-0 text-center',
        day_button:
          'inline-flex h-9 w-9 items-center justify-center rounded-md font-mono text-xs tabular-nums text-paper hover:bg-ink-3',
        range_start: 'rounded-l-md bg-brass text-ink-1',
        range_end: 'rounded-r-md bg-brass text-ink-1',
        range_middle: 'rounded-none bg-brass-soft text-paper',
        today: 'text-brass',
        outside: 'text-paper-dim opacity-50',
        disabled: 'text-paper-dim opacity-30',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft size={16} strokeWidth={1.6} />
          ) : (
            <ChevronRight size={16} strokeWidth={1.6} />
          ),
      }}
      {...props}
    />
  );
}
```

If `react-day-picker/locale` does not resolve in the installed version, import the locale from `date-fns/locale` instead: `import { fr } from 'date-fns/locale';` (DayPicker accepts a date-fns locale).

- [ ] **Step 3: Lint + typecheck**

Run: `npx eslint src/renderer/components/ui/popover.tsx src/renderer/components/ui/calendar.tsx` → clean (fix any `react-hooks`/compiler warning the same way as elsewhere — but these are simple components, none expected).
Run: `npx tsc --noEmit` → note: the page still has the temporary error from Task 2; confirm there are NO NEW errors in `popover.tsx`/`calendar.tsx` specifically.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/popover.tsx src/renderer/components/ui/calendar.tsx
git commit -m "feat(ui): add Popover and Calendar primitives (shadcn/react-day-picker)"
```

(append the Co-Authored-By trailer)

---

### Task 4: `PeriodFilter` component + test

**Files:**

- Create: `src/renderer/components/dashboard/PeriodFilter.tsx`
- Test: `tests/unit/renderer/PeriodFilter.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/PeriodFilter.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { PeriodFilter, type DateSel } from '@renderer/components/dashboard/PeriodFilter';

// Radix Popover needs a couple of jsdom APIs that aren't implemented.
beforeEach(() => {
  if (!('hasPointerCapture' in Element.prototype)) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!('scrollIntoView' in Element.prototype)) {
    Element.prototype.scrollIntoView = () => {};
  }
});

afterEach(() => {
  cleanup();
});

describe('PeriodFilter', () => {
  it('shows the preset label on the trigger', () => {
    render(<PeriodFilter value={{ kind: 'preset', preset: 'all' }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Tout/ })).toBeInTheDocument();
  });

  it('shows a formatted range label on the trigger', () => {
    render(
      <PeriodFilter
        value={{ kind: 'range', from: '2026-05-12', to: '2026-06-03' }}
        onChange={vi.fn()}
      />,
    );
    // French short month formatting, e.g. "12 mai – 3 juin"
    expect(screen.getByRole('button', { name: /mai.*juin/ })).toBeInTheDocument();
  });

  it('calls onChange with a preset when a preset is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={{ kind: 'preset', preset: 'all' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Tout/ }));
    fireEvent.click(screen.getByText('30 derniers jours'));
    expect(onChange).toHaveBeenCalledWith({ kind: 'preset', preset: '30d' });
  });

  it('calls onChange with a range after two calendar days are picked', () => {
    const onChange = vi.fn<(v: DateSel) => void>();
    render(<PeriodFilter value={{ kind: 'preset', preset: 'all' }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Tout/ }));
    // react-day-picker renders day cells as buttons whose text is the day number.
    const dayButtons = screen
      .getAllByRole('button')
      .filter((b) => /^\d{1,2}$/.test((b.textContent ?? '').trim()));
    expect(dayButtons.length).toBeGreaterThan(1);
    fireEvent.click(dayButtons[3]!);
    fireEvent.click(dayButtons[8]!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'range' }));
  });
});
```

Note: if the day-button query finds nothing (react-day-picker markup differs in the installed version), inspect the rendered DOM and adjust the selector (e.g. `screen.getAllByRole('gridcell')` then query their inner button). The assertion `objectContaining({ kind: 'range' })` must stay — only the selector may be tuned.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- PeriodFilter`
Expected: FAIL — module `@renderer/components/dashboard/PeriodFilter` does not exist.

- [ ] **Step 3: Create `src/renderer/components/dashboard/PeriodFilter.tsx`**

```tsx
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@renderer/lib/utils';
import { toLocalISODate, type TxPeriod } from '@renderer/lib/filterTransactions';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export type DateSel =
  | { kind: 'preset'; preset: TxPeriod }
  | { kind: 'range'; from: string; to: string };

const PRESETS: { preset: TxPeriod; label: string }[] = [
  { preset: 'all', label: 'Tout' },
  { preset: '30d', label: '30 derniers jours' },
  { preset: '3m', label: '3 derniers mois' },
  { preset: 'year', label: 'Cette année' },
];

const PRESET_LABEL: Record<TxPeriod, string> = {
  all: 'Tout',
  '30d': '30 derniers jours',
  '3m': '3 derniers mois',
  year: 'Cette année',
};

/** ISO `yyyy-mm-dd` → local-midnight Date (no UTC shift). */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function triggerLabel(value: DateSel): string {
  if (value.kind === 'preset') return PRESET_LABEL[value.preset];
  const from = format(isoToDate(value.from), 'd MMM', { locale: fr });
  const to = format(isoToDate(value.to), 'd MMM', { locale: fr });
  return `${from} – ${to}`;
}

export function PeriodFilter({
  value,
  onChange,
}: {
  value: DateSel;
  onChange: (v: DateSel) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedRange: DateRange | undefined =
    value.kind === 'range' ? { from: isoToDate(value.from), to: isoToDate(value.to) } : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm">
          {triggerLabel(value)}
          <ChevronDown size={14} strokeWidth={1.6} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-auto gap-2 p-2" align="start">
        <div className="flex w-44 flex-col gap-0.5">
          {PRESETS.map((p) => (
            <button
              key={p.preset}
              type="button"
              onClick={() => {
                onChange({ kind: 'preset', preset: p.preset });
                setOpen(false);
              }}
              className={cn(
                'rounded-md px-2.5 py-1.5 text-left font-sans text-xs text-paper-mute hover:bg-ink-3 hover:text-paper',
                value.kind === 'preset' && value.preset === p.preset && 'bg-ink-3 text-paper',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="border-l border-line-2 pl-2">
          <Calendar
            mode="range"
            selected={selectedRange}
            onSelect={(range) => {
              if (range?.from && range.to) {
                onChange({
                  kind: 'range',
                  from: toLocalISODate(range.from),
                  to: toLocalISODate(range.to),
                });
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- PeriodFilter`
Expected: PASS. If the Radix popover doesn't open under `fireEvent.click` in jsdom, ensure the `hasPointerCapture`/`scrollIntoView` stubs from the test's `beforeEach` are present (they are). If the calendar day selector finds nothing, tune the selector per the Step 1 note (keep the `kind: 'range'` assertion).

- [ ] **Step 5: Lint + typecheck**

Run: `npx eslint src/renderer/components/dashboard/PeriodFilter.tsx tests/unit/renderer/PeriodFilter.test.tsx` → clean.
(`npx tsc --noEmit` still shows the Task-2 page error until Task 5 — confirm no NEW errors here.)

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/dashboard/PeriodFilter.tsx tests/unit/renderer/PeriodFilter.test.tsx
git commit -m "feat(transactions): add PeriodFilter (presets + range calendar)"
```

(append the Co-Authored-By trailer)

---

### Task 5: Wire `PeriodFilter` into `TransactionsPage`

**Files:**

- Modify: `src/renderer/pages/TransactionsPage.tsx`
- Modify: `tests/unit/renderer/TransactionsPage.test.tsx`

- [ ] **Step 1: Update the page**

(a) Imports — change the `filterTransactions` import block (drop `TxPeriod`, add `periodStart`) and add the `PeriodFilter` import:

```ts
import {
  filterTransactions,
  periodStart,
  toLocalISODate,
  type TxFilters,
  type TxType,
} from '../lib/filterTransactions';
```

and (next to the other dashboard-component imports):

```ts
import { PeriodFilter, type DateSel } from '../components/dashboard/PeriodFilter';
```

(b) Delete the `PERIODS` constant entirely:

```ts
const PERIODS: { value: TxPeriod; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: '30d', label: '30 jours' },
  { value: '3m', label: '3 mois' },
  { value: 'year', label: 'Cette année' },
];
```

(c) Replace the period state line:

```ts
const [period, setPeriod] = useState<TxPeriod>('all');
```

with:

```ts
const [dateSel, setDateSel] = useState<DateSel>({ kind: 'preset', preset: 'all' });
```

(d) Insert the bounds resolver immediately BEFORE the `filtered` memo:

```ts
const { from, to } = useMemo<{ from: string | null; to: string | null }>(() => {
  if (dateSel.kind === 'range') return { from: dateSel.from, to: dateSel.to };
  return { from: periodStart(dateSel.preset, today), to: null };
}, [dateSel, today]);
```

(e) Replace the `filtered` memo body + deps:

```ts
const filtered = useMemo(() => {
  const filters: TxFilters = {
    from,
    to,
    type,
    query,
    categoryId: category === NONE ? null : category,
  };
  return filterTransactions(transactions, filters);
}, [transactions, from, to, type, query, category]);
```

(f) In the filter bar, replace the period segmented control:

```tsx
<Segmented options={PERIODS} value={period} onChange={setPeriod} />
```

with:

```tsx
<PeriodFilter value={dateSel} onChange={setDateSel} />
```

(The `Segmented options={TYPES} ...` control stays — `Segmented` is still used.)

- [ ] **Step 2: Add a page test for the new control**

In `tests/unit/renderer/TransactionsPage.test.tsx`, add the Radix jsdom stubs to the EXISTING `beforeEach` (it already stubs `getBoundingClientRect`; append these two lines inside it):

```tsx
if (!('hasPointerCapture' in Element.prototype)) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!('scrollIntoView' in Element.prototype)) {
  Element.prototype.scrollIntoView = () => {};
}
```

Then add this test at the end of the `describe` block:

```tsx
it('renders the Période control with presets in its popover', async () => {
  renderPage();
  await screen.findByText('Carrefour');
  fireEvent.click(screen.getByRole('button', { name: /Tout/ }));
  expect(await screen.findByText('30 derniers jours')).toBeInTheDocument();
});
```

(No date assertion: the page reads the real clock — date-bound behavior is covered by the `filterTransactions` unit tests and the `PeriodFilter` test.)

- [ ] **Step 3: Run the tests**

Run: `npm test -- TransactionsPage` → all pass (the existing tests + the new one).
Run: `npm test -- filterTransactions` → still pass.

- [ ] **Step 4: Lint + full typecheck (page error from Task 2 is now resolved)**

Run: `npx tsc --noEmit` → clean (the page now uses `from`/`to`).
Run: `npx eslint src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx` → clean (no unused `TxPeriod`/`PERIODS`).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx
git commit -m "feat(transactions): use the Période filter (presets + date range) on the page"
```

(append the Co-Authored-By trailer)

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint** — Run: `npm run lint` → clean (0 warnings).
- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → clean.
- [ ] **Step 3: Unit tests** — Run: `npm test` → all green.
- [ ] **Step 4: Build** — Run: `npm run build` → succeeds.
- [ ] **Step 5 (manual):** In the dev app, open Transactions: the "Période" button shows the current selection; the popover shows presets + a French calendar (Monday-first, dark-styled, range highlighted in brass); picking a preset filters and updates the label; picking a from–to range filters the list and shows "12 mai – 3 juin"-style label. Verify the calendar is fully styled (no unstyled react-day-picker defaults).

---

## Self-review notes

- **Spec coverage:** deps (Task 1); `from`/`to` filter refactor + tests (Task 2); Popover + Calendar primitives (Task 3); `PeriodFilter` with `DateSel`, presets + range calendar, label formatting, ISO↔Date (Task 4); page wiring with `periodStart` bound resolution (Task 5); verification + manual calendar check (Task 6). Covered.
- **Deviation from spec:** `PeriodFilter` does NOT take a `today` prop (it doesn't need one — preset labels are static and the page resolves preset→bounds). Page-level test asserts control rendering, not date filtering, because the page uses the real clock (documented under "Testing reality").
- **Placeholder scan:** none. The calendar `classNames`/selector "tune if the installed version differs" notes are concrete fallback instructions for a known react-day-picker version-sensitivity, not TODOs.
- **Type consistency:** `TxFilters` now `{from,to,categoryId,query,type}` used identically in Task 2 (tests + impl) and Task 5 (page). `DateSel` defined in Task 4, imported in Task 5. `periodStart`/`toLocalISODate` reused unchanged. `Calendar` `mode="range"` → `onSelect(range?: DateRange)` matches react-day-picker v9.

```

```

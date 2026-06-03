# "Du / Au" date-range filter (shadcn-based) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Période" popover with preset shortcuts + two "Du"/"Au" date fields (typed input + calendar), built on shadcn's adopted Calendar (react-day-picker v10), with future dates and inverted ranges impossible.

**Architecture:** Bump react-day-picker to v10 and adopt shadcn's `calendar` (re-themed to tokens). A reusable `DateInput` (typed `jj/mm/aaaa` input + single-date calendar popover) is the building block. `PeriodFilter` becomes preset chips + a `Du`/`Au` pair emitting `{from,to}` bounds. The page holds a `{from,to}` range (default last 30 days). The `filterTransactions` from/to logic is unchanged.

**Tech Stack:** React 19, react-day-picker v10, `@radix-ui/react-popover`, `date-fns`, TS strict, Tailwind/shadcn tokens, Lucide, Vitest 4 (jsdom).

**Conventions:** TS strict (no `any`, no non-null assertions, `noUncheckedIndexedAccess` on). Conventional Commits, imperative subject. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Lint runs `--max-warnings 0`. Pre-commit reformats staged files (re-add + retry). Tests: `npm test -- <pattern>`.

**Starting state:** The prior (committed, unpushed) date-range work exists: a hand-rolled v9 `calendar.tsx`, a `PeriodFilter` using a `DateSel` union + range calendar, and `TransactionsPage` holding `dateSel`. `filterTransactions` already takes `from`/`to` bounds; `periodStart`/`toLocalISODate` are exported and unchanged. This plan reworks the calendar + PeriodFilter + page; the from/to filter stays.

---

### Task 1: Bump react-day-picker to v10 and adopt shadcn's Calendar (re-themed)

**Files:**

- Modify: `package.json`, `package-lock.json`
- Replace: `src/renderer/components/ui/calendar.tsx`

The shadcn `calendar` is a drop-in for our current usage (it forwards `mode`/`selected`/`onSelect`/`disabled`/`defaultMonth` to DayPicker), so the existing `PeriodFilter` keeps compiling/rendering until reworked in Task 3.

- [ ] **Step 1: Bump the dependency**

Run: `npm install react-day-picker@latest`
Then confirm: `node -p "require('react-day-picker/package.json').version"` → `10.x`.

- [ ] **Step 2: Pull the shadcn calendar source**

Run: `npx shadcn@latest add @shadcn/calendar --overwrite --yes`
Expected: it rewrites `src/renderer/components/ui/calendar.tsx` with the official v10 component (placed via the `ui` alias `@renderer/components/ui`), importing `cn` from `@renderer/lib/utils` and `Button`/`buttonVariants` from the ui alias.

If the CLI errors or misplaces the file (non-Next repo), fall back: fetch the registry source and write it yourself — `WebFetch https://ui.shadcn.com/r/styles/new-york-v4/calendar.json` (the JSON's `files[0].content` is the component), or use the MCP `view`/registry to obtain it, then save to `src/renderer/components/ui/calendar.tsx` with the same alias imports.

- [ ] **Step 3: Re-theme to the design tokens + locale**

Edit the freshly-added `calendar.tsx`:

- Replace every stock shadcn token with repo tokens: `bg-background`→`bg-ink-2`, `text-foreground`/default text→`text-paper`, `text-muted-foreground`→`text-paper-mute`, `bg-accent`/hover→`bg-ink-3`, `bg-primary`→`bg-brass`, `text-primary-foreground`→`text-ink-1`, range-middle/accent→`bg-brass-soft text-paper`, borders→`border-line-2`, `text-primary` (today)→`text-brass`. There must be **no** `*-background`/`*-foreground`/`*-primary`/`*-accent`/`*-muted` classes left.
- Set French locale + Monday start: pass `locale={fr}` (`import { fr } from "react-day-picker/locale"`) and rely on the locale for week start. Keep `showOutsideDays`.
- Ensure the nav chevrons use Lucide (`ChevronLeft`/`ChevronRight`) — shadcn v10 already wires a `Chevron` component; keep it, just confirm the icon import resolves.
- Keep the component's exported name `Calendar` and its `CalendarProps`/props passthrough so consumers are unchanged.

- [ ] **Step 4: Verify nothing regressed**

Run: `npm test -- DashboardPage` (doesn't use Calendar — must pass), `npm test -- PeriodFilter` (old range usage on v10 — should still pass; if the day-button selector broke, leave it for Task 3 which rewrites this test — but typecheck must be clean).
Run: `npx tsc --noEmit` → clean.
Run: `npx eslint src/renderer/components/ui/calendar.tsx` → 0/0 (add a scoped `// eslint-disable-next-line react-hooks/incompatible-library` if the React Compiler flags `useDayPicker`/internal hooks, justified).

If the old `PeriodFilter` range test fails ONLY because v10 changed day-button markup, it is acceptable to let it fail here and fix it in Task 3 (which replaces that test) — but say so explicitly in the task report, and tsc/lint must still be clean.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/renderer/components/ui/calendar.tsx
git commit -m "feat(ui): adopt shadcn Calendar on react-day-picker v10, re-themed to tokens"
```

(append the trailer)

---

### Task 2: Add a reusable `DateInput` (typed input + calendar popover)

**Files:**

- Create: `src/renderer/components/dashboard/DateInput.tsx`
- Test: `tests/unit/renderer/DateInput.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/DateInput.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { DateInput } from '@renderer/components/dashboard/DateInput';

afterEach(() => {
  cleanup();
});

describe('DateInput', () => {
  it('shows the value formatted as jj/mm/aaaa', () => {
    render(<DateInput value="2026-05-12" onChange={vi.fn()} ariaLabel="Du" />);
    expect(screen.getByLabelText('Du')).toHaveValue('12/05/2026');
  });

  it('emits ISO on a valid typed date (commit on blur)', () => {
    const onChange = vi.fn();
    render(<DateInput value={null} onChange={onChange} ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: '03/06/2026' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith('2026-06-03');
  });

  it('emits null when cleared', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-12" onChange={onChange} ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('reverts a typed date beyond max without emitting it', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-12" onChange={onChange} max="2026-06-03" ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: '01/01/2027' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalledWith('2027-01-01');
    expect(input).toHaveValue('12/05/2026');
  });

  it('reverts an unparseable input', () => {
    const onChange = vi.fn();
    render(<DateInput value="2026-05-12" onChange={onChange} ariaLabel="Du" />);
    const input = screen.getByLabelText('Du');
    fireEvent.change(input, { target: { value: 'not a date' } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('12/05/2026');
  });
});
```

- [ ] **Step 2: Run it — confirm it fails** (module missing). `npm test -- DateInput`.

- [ ] **Step 3: Create `src/renderer/components/dashboard/DateInput.tsx`**

```tsx
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { format, isValid, parse } from 'date-fns';
import type { Matcher } from 'react-day-picker';
import { cn } from '@renderer/lib/utils';
import { toLocalISODate } from '@renderer/lib/filterTransactions';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

const DISPLAY = 'dd/MM/yyyy';

/** ISO `yyyy-mm-dd` → local-midnight Date (no UTC shift). */
function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function isoToDisplay(iso: string | null): string {
  return iso ? format(isoToDate(iso), DISPLAY) : '';
}

export interface DateInputProps {
  value: string | null; // ISO yyyy-mm-dd
  onChange: (iso: string | null) => void;
  min?: string; // ISO inclusive
  max?: string; // ISO inclusive
  ariaLabel: string;
}

export function DateInput({ value, onChange, min, max, ariaLabel }: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);

  // Keep the text field in sync when `value` changes externally (preset fill / cross-field),
  // using React's "store info from previous renders" pattern (no effect).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(isoToDisplay(value));
  }

  const revert = () => {
    setText(isoToDisplay(value));
  };

  const commit = () => {
    const raw = text.trim();
    if (raw === '') {
      onChange(null);
      return;
    }
    const parsed = parse(raw, DISPLAY, new Date());
    if (!isValid(parsed)) {
      revert();
      return;
    }
    const iso = toLocalISODate(parsed);
    if ((min !== undefined && iso < min) || (max !== undefined && iso > max)) {
      revert();
      return;
    }
    onChange(iso);
  };

  const selected = value ? isoToDate(value) : undefined;
  const disabled: Matcher[] = [];
  if (min !== undefined) disabled.push({ before: isoToDate(min) });
  if (max !== undefined) disabled.push({ after: isoToDate(max) });

  return (
    <div className="inline-flex h-7 items-center rounded-md border border-line-2 bg-ink-2">
      <input
        aria-label={ariaLabel}
        value={text}
        placeholder="jj/mm/aaaa"
        onChange={(e) => {
          setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        className="h-full w-[88px] bg-transparent px-2 font-mono text-xs text-paper placeholder:text-paper-dim focus:outline-none"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${ariaLabel} — ouvrir le calendrier`}
            className="flex h-full items-center px-1.5 text-paper-mute hover:text-paper"
          >
            <CalendarDays size={14} strokeWidth={1.6} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={disabled}
            onSelect={(d) => {
              if (d) {
                onChange(toLocalISODate(d));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

If TS complains that `mode="single"` + `selected: Date | undefined` + `onSelect` aren't assignable on `Calendar` (its props are the DayPicker union), pass them through as written — the single-mode overload accepts them. Do NOT use `any`.

- [ ] **Step 4: Run the test — confirm pass.** `npm test -- DateInput`. (The 5 tests cover input behavior deterministically; calendar interaction is covered indirectly + in PeriodFilter.)

- [ ] **Step 5: Lint + typecheck.** `npx eslint src/renderer/components/dashboard/DateInput.tsx tests/unit/renderer/DateInput.test.tsx` → 0/0. `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/dashboard/DateInput.tsx tests/unit/renderer/DateInput.test.tsx
git commit -m "feat(transactions): add reusable DateInput (typed field + calendar popover)"
```

(append the trailer)

---

### Task 3: Rework `PeriodFilter` → presets + Du/Au

**Files:**

- Modify (replace contents): `src/renderer/components/dashboard/PeriodFilter.tsx`
- Modify (replace contents): `tests/unit/renderer/PeriodFilter.test.tsx`

- [ ] **Step 1: Replace the test**

Replace the entire `tests/unit/renderer/PeriodFilter.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PeriodFilter } from '@renderer/components/dashboard/PeriodFilter';

const TODAY = '2026-06-03';

afterEach(() => {
  cleanup();
});

describe('PeriodFilter', () => {
  it('renders Du and Au fields reflecting the value', () => {
    render(
      <PeriodFilter
        value={{ from: '2026-05-12', to: '2026-06-03' }}
        onChange={vi.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByLabelText('Du')).toHaveValue('12/05/2026');
    expect(screen.getByLabelText('Au')).toHaveValue('03/06/2026');
  });

  it('fills both bounds when the "30 jours" preset is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={{ from: null, to: null }} onChange={onChange} today={TODAY} />);
    fireEvent.click(screen.getByRole('button', { name: '30 jours' }));
    expect(onChange).toHaveBeenCalledWith({ from: '2026-05-04', to: '2026-06-03' });
  });

  it('clears both bounds when "Tout" is clicked', () => {
    const onChange = vi.fn();
    render(
      <PeriodFilter value={{ from: '2026-05-04', to: TODAY }} onChange={onChange} today={TODAY} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tout' }));
    expect(onChange).toHaveBeenCalledWith({ from: null, to: null });
  });

  it('emits an updated lower bound when Du is edited', () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={{ from: null, to: TODAY }} onChange={onChange} today={TODAY} />);
    const du = screen.getByLabelText('Du');
    fireEvent.change(du, { target: { value: '01/05/2026' } });
    fireEvent.blur(du);
    expect(onChange).toHaveBeenCalledWith({ from: '2026-05-01', to: TODAY });
  });
});
```

- [ ] **Step 2: Run it — confirm it fails** (old PeriodFilter exports `DateSel`/different shape). `npm test -- PeriodFilter`.

- [ ] **Step 3: Replace `src/renderer/components/dashboard/PeriodFilter.tsx`**

```tsx
import { cn } from '@renderer/lib/utils';
import { periodStart, type TxPeriod } from '@renderer/lib/filterTransactions';
import { DateInput } from './DateInput';

export interface DateRangeValue {
  from: string | null; // ISO yyyy-mm-dd
  to: string | null;
}

const PRESETS: { preset: TxPeriod; label: string }[] = [
  { preset: 'all', label: 'Tout' },
  { preset: '30d', label: '30 jours' },
  { preset: '3m', label: '3 mois' },
  { preset: 'year', label: 'Cette année' },
];

/** Bounds for a preset relative to `today`. 'all' clears both bounds. */
function presetBounds(preset: TxPeriod, today: string): DateRangeValue {
  if (preset === 'all') return { from: null, to: null };
  return { from: periodStart(preset, today), to: today };
}

function isActive(value: DateRangeValue, bounds: DateRangeValue): boolean {
  return value.from === bounds.from && value.to === bounds.to;
}

const CHIP = 'h-7 rounded-md px-2.5 font-sans text-xs font-medium transition-colors';

export function PeriodFilter({
  value,
  onChange,
  today,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  today: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex gap-1 rounded-lg border border-line-2 bg-ink-2 p-1">
        {PRESETS.map((p) => {
          const bounds = presetBounds(p.preset, today);
          return (
            <button
              key={p.preset}
              type="button"
              onClick={() => {
                onChange(bounds);
              }}
              className={cn(
                CHIP,
                isActive(value, bounds)
                  ? 'bg-ink-3 text-paper'
                  : 'text-paper-mute hover:text-paper',
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="inline-flex items-center gap-1.5">
        <span className="font-sans text-xs text-paper-mute">Du</span>
        <DateInput
          ariaLabel="Du"
          value={value.from}
          max={value.to ?? today}
          onChange={(from) => {
            onChange({ from, to: value.to });
          }}
        />
        <span className="font-sans text-xs text-paper-mute">au</span>
        <DateInput
          ariaLabel="Au"
          value={value.to}
          min={value.from ?? undefined}
          max={today}
          onChange={(to) => {
            onChange({ from: value.from, to });
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test — confirm pass.** `npm test -- PeriodFilter`.

- [ ] **Step 5: Lint + typecheck.** `npx eslint src/renderer/components/dashboard/PeriodFilter.tsx tests/unit/renderer/PeriodFilter.test.tsx` → 0/0. `npx tsc --noEmit` → note: `TransactionsPage.tsx` still imports the removed `DateSel`/old props → it WILL error until Task 4. Confirm errors are ONLY in TransactionsPage.tsx.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/dashboard/PeriodFilter.tsx tests/unit/renderer/PeriodFilter.test.tsx
git commit -m "feat(transactions): rework PeriodFilter into presets + Du/Au fields"
```

(append the trailer; commit succeeds despite the page tsc error — pre-commit doesn't run tsc)

---

### Task 4: Wire the new `PeriodFilter` into `TransactionsPage`

**Files:**

- Modify: `src/renderer/pages/TransactionsPage.tsx`
- Modify: `tests/unit/renderer/TransactionsPage.test.tsx`

- [ ] **Step 1: Edit the page**

(a) Replace the PeriodFilter import:

```ts
import { PeriodFilter, type DateRangeValue } from '../components/dashboard/PeriodFilter';
```

(b) Keep the `filterTransactions` import block but ensure it imports `periodStart` and `toLocalISODate` and `type TxFilters`, `type TxType` (drop any now-unused `type TxPeriod`).
(c) Replace the `dateSel` state + the `{from,to}` resolver `useMemo` with a single range state defaulting to the last 30 days:

```ts
const [range, setRange] = useState<DateRangeValue>(() => ({
  from: periodStart('30d', today),
  to: today,
}));
```

Remove the old `const { from, to } = useMemo(...)` resolver block entirely.
(d) Update the `filtered` memo to read `range.from`/`range.to`:

```ts
const filtered = useMemo(() => {
  const filters: TxFilters = {
    from: range.from,
    to: range.to,
    type,
    query,
    categoryId: category === NONE ? null : category,
  };
  return filterTransactions(transactions, filters);
}, [transactions, range, type, query, category]);
```

(e) In the filter bar, replace `<PeriodFilter value={dateSel} onChange={setDateSel} />` with:

```tsx
<PeriodFilter value={range} onChange={setRange} today={today} />
```

`today` state stays (used for the default + presets).

- [ ] **Step 2: Update the page test**

In `tests/unit/renderer/TransactionsPage.test.tsx`, REMOVE the old "renders the Période control with presets in its popover" test (the period control is no longer a popover button). Add:

```tsx
it('defaults to the last-30-days range and renders the Du/Au fields', async () => {
  renderPage();
  await screen.findByText('Carrefour');
  // Du/Au date fields are present...
  expect(screen.getByLabelText('Du')).toBeInTheDocument();
  expect(screen.getByLabelText('Au')).toBeInTheDocument();
  // ...and a non-empty lower bound was requested (default = last 30 days).
  expect((screen.getByLabelText('Du') as HTMLInputElement).value).not.toBe('');
});
```

The Radix `hasPointerCapture`/`scrollIntoView` stubs already added to `beforeEach` stay (the calendar popovers need them).

NOTE: the default-30-days fixture interaction — `TX` transactions are dated `2026-05-14`; with a real-clock `today` the default 30-day window may or may not include them, so do NOT assert on which rows render here. Assert only that the Du field is non-empty (proves the default range is applied). Date-bound correctness is covered in `filterTransactions` tests.

- [ ] **Step 3: Run tests + FULL typecheck (page error resolved).**
      `npm test -- TransactionsPage` → pass. `npx tsc --noEmit` → fully clean. `npx eslint src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx` → 0/0 (no unused `DateSel`/`TxPeriod`).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx
git commit -m "feat(transactions): default to last 30 days and use Du/Au range filter on the page"
```

(append the trailer)

---

### Task 5: Full verification

**Files:** none.

- [ ] **Step 1: Lint** — `npm run lint` → clean (0 warnings).
- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` → clean.
- [ ] **Step 3: Unit tests** — `npm test` → all green (DateInput, PeriodFilter, TransactionsPage, DashboardPage, filterTransactions).
- [ ] **Step 4: Build** — `npm run build` → succeeds.
- [ ] **Step 5 (manual):** dev app, Transactions page: default shows the last-30-days range in Du/Au; typing a date works; the calendar (dark, FR, Monday, correct nav arrows, range/selected highlight) picks a date; future days are disabled; `Au`'s calendar can't go before `Du` and vice-versa; preset chips fill both fields; the list filters accordingly.

---

## Self-review notes

- **Spec coverage:** v10 bump + shadcn calendar re-themed (Task 1); `DateInput` typed+calendar (Task 2); `PeriodFilter` = presets + Du/Au, cross-constraints, `{from,to}` (Task 3); page default-30d + wiring (Task 4); verify + visual (Task 5). Future-block via `max=today` on Au and `max=to??today`/cross-`min` on the fields. Covered.
- **Deviation from spec:** the cross-constraint is expressed as `DateInput` `min`/`max` (Du.max = `to ?? today`, Au.min = `from`, Au.max = `today`) rather than a free-standing rule — same effect, simpler.
- **Placeholder scan:** none. The calendar-source acquisition (CLI add, with a registry-fetch fallback) + the re-theme token checklist are concrete instructions, not TODOs.
- **Type consistency:** `DateRangeValue {from,to}` defined in PeriodFilter (Task 3), imported by the page (Task 4). `DateInput` props (`value/onChange/min/max/ariaLabel`) consistent across Tasks 2–3. `periodStart`/`toLocalISODate` reused unchanged. The old `DateSel` union is fully removed (Tasks 3–4).
- **Ordering:** calendar swap first (drop-in, keeps consumers compiling), then DateInput, then PeriodFilter (page error introduced), then page (error resolved) — matches the per-task green/again-green flow used before.

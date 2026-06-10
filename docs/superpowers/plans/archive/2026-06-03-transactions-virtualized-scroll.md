# Transactions virtualized scroll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Transactions page pagination with a virtualized continuous scroll (only visible rows rendered), after refactoring `TxTable` into per-row grids that can be positioned.

**Architecture:** `TxTable` is split into a shared fixed-width column template (`TX_GRID`) plus exported `TxTableHeader` and `TxTableRow`; its public API is unchanged. `TransactionsPage` drops all pagination and renders the filtered rows through `@tanstack/react-virtual` inside a height-capped scroll container with a sticky header.

**Tech Stack:** React 19, react-router, `@tanstack/react-virtual` v3, TypeScript strict, Tailwind/shadcn, Lucide, Vitest 4 (jsdom).

**Conventions:** TS strict (no `any`, no non-null assertions, `noUncheckedIndexedAccess` on). Conventional Commits, imperative subject (commitlint via husky). Commit body trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Pre-commit hook reformats staged files (re-add + retry). Run tests with `npm test -- <pattern>`.

**Naming note:** `TxRow` is already the **data interface** in `TxTable.tsx`. The new row **component** is therefore named `TxTableRow` (header: `TxTableHeader`). Do not reuse `TxRow` for the component.

---

### Task 1: Refactor `TxTable` into per-row grids (behavior-preserving)

**Files:**

- Modify (full rewrite of render structure): `src/renderer/components/dashboard/TxTable.tsx`

Safety net: there is no `TxTable` test, but `tests/unit/renderer/DashboardPage.test.tsx` renders `TxTable` and asserts row content; it must stay green. This task changes layout only, not the public `TxTableProps`.

- [ ] **Step 1: Replace the file contents**

Replace the entire `src/renderer/components/dashboard/TxTable.tsx` with:

```tsx
import { MoreHorizontal } from 'lucide-react';
import type { CategoryDTO, CreateCategoryInput } from '@shared/types/category';
import { cn } from '@renderer/lib/utils';
import { CategoryIcon } from '@renderer/lib/categoryIcon';
import { Money, type MoneyKind } from '../ui/money';
import { CategoryPicker } from './CategoryPicker';

export interface TxRow {
  id: string;
  date: string;
  icon: string;
  main: string;
  sub: string;
  catColor: string;
  catName: string;
  amount: number;
  amountKind: MoneyKind;
  conf: string;
  confLow?: boolean;
}

export interface TxTableProps {
  rows: TxRow[];
  /** When all three are provided, the category cell becomes an inline picker. */
  categories?: CategoryDTO[];
  onReassign?: (transactionId: string, categoryId: string) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

const HEAD =
  'font-sans text-[9px] font-semibold uppercase tracking-[0.18em] text-paper-mute pb-2.5 border-b border-line-2';
const CELL = 'py-[11px]';

/** Shared column template. Fixed widths (description is the only flexible 1fr) so each row is
 *  an independent grid that still aligns with the header and the other rows — which lets the
 *  Transactions page virtualize rows as positionable boxes. */
export const TX_GRID =
  'grid items-center gap-x-3 xl:gap-x-3.5 ' +
  'grid-cols-[72px_24px_1fr_160px_96px] ' +
  'xl:grid-cols-[84px_28px_1fr_180px_110px_56px_24px]';

export function TxTableHeader() {
  return (
    <div className={TX_GRID}>
      <span className={HEAD} />
      <span className={HEAD} />
      <span className={HEAD}>Description</span>
      <span className={HEAD}>Catégorie</span>
      <span className={cn(HEAD, 'text-right')}>Montant</span>
      <span className={cn(HEAD, 'hidden text-right xl:block')}>Conf.</span>
      <span className={cn(HEAD, 'hidden xl:block')} />
    </div>
  );
}

export interface TxTableRowProps {
  row: TxRow;
  categories?: CategoryDTO[];
  onReassign?: (transactionId: string, categoryId: string) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
}

export function TxTableRow({ row: t, categories, onReassign, onCreateCategory }: TxTableRowProps) {
  return (
    <div className={cn(TX_GRID, 'border-b border-line-1 hover:bg-ink-3')}>
      <span className={cn(CELL, 'font-mono text-xs tabular-nums text-paper-mute')}>{t.date}</span>
      <span className={CELL}>
        <CategoryIcon name={t.icon} />
      </span>
      <span className={cn(CELL, 'flex min-w-0 flex-col gap-0.5')}>
        <span className="truncate font-sans text-[13px] font-medium leading-tight text-paper">
          {t.main}
        </span>
        <span className="truncate font-mono text-[11px] tracking-[0.02em] text-paper-dim">
          {t.sub}
        </span>
      </span>
      <span className={cn(CELL, 'min-w-0')}>
        {categories && onReassign && onCreateCategory ? (
          <CategoryPicker
            categories={categories}
            current={{ name: t.catName, color: t.catColor }}
            onSelect={(id) => {
              onReassign(t.id, id);
            }}
            onCreate={onCreateCategory}
          />
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1.5 font-sans text-[11px] font-medium text-paper-soft">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: t.catColor }}
            />
            <span className="truncate">{t.catName}</span>
          </span>
        )}
      </span>
      <span className={cn(CELL, 'text-right')}>
        <Money value={t.amount} kind={t.amountKind} className="text-[13px] font-medium" />
      </span>
      <span
        className={cn(
          CELL,
          'hidden text-right font-mono text-[11px] font-medium xl:block',
          t.confLow ? 'text-flag' : 'text-paper-mute',
        )}
      >
        {t.conf}
      </span>
      <span className={cn(CELL, 'hidden justify-center text-paper-dim xl:flex')}>
        <MoreHorizontal size={14} strokeWidth={1.6} />
      </span>
    </div>
  );
}

export function TxTable({ rows, categories, onReassign, onCreateCategory }: TxTableProps) {
  return (
    <div>
      <TxTableHeader />
      {rows.map((t) => (
        <TxTableRow
          key={t.id}
          row={t}
          categories={categories}
          onReassign={onReassign}
          onCreateCategory={onCreateCategory}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify the dashboard table still works**

Run: `npm test -- DashboardPage`
Expected: PASS (unchanged — the public `TxTable` API and rendered text are the same).

- [ ] **Step 3: Lint + typecheck**

Run: `npx eslint src/renderer/components/dashboard/TxTable.tsx` → clean.
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/dashboard/TxTable.tsx
git commit -m "refactor(dashboard): split TxTable into per-row grids for virtualization"
```

(append the Co-Authored-By trailer)

---

### Task 2: Add the `@tanstack/react-virtual` dependency

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install**

Run: `npm install @tanstack/react-virtual`
Expected: adds `@tanstack/react-virtual` (v3.x) to `dependencies`; lockfile updated.

- [ ] **Step 2: Sanity-check it resolves**

Run: `npx tsc --noEmit` → clean (no usage yet, just confirms install is well-formed).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @tanstack/react-virtual for the Transactions list"
```

(append the Co-Authored-By trailer)

---

### Task 3: Virtualize `TransactionsPage` (remove pagination) + tests

**Files:**

- Modify: `src/renderer/pages/TransactionsPage.tsx`
- Modify: `tests/unit/renderer/TransactionsPage.test.tsx`
- Modify: `tests/setup/renderer.ts`

- [ ] **Step 1: Add a `ResizeObserver` stub to the shared test setup**

jsdom has no `ResizeObserver`; `@tanstack/react-virtual` needs it. Append to `tests/setup/renderer.ts`:

```ts
// jsdom lacks ResizeObserver, which @tanstack/react-virtual observes. No-op stub is enough;
// per-test layout sizes are provided by the virtualized-list tests themselves.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
```

- [ ] **Step 2: Update the tests — remove pagination tests, add a virtualization test + layout stub**

In `tests/unit/renderer/TransactionsPage.test.tsx`:

(a) **Delete the 5 pagination tests** (everything from `it('paginates: renders only the first 25 rows…'` through `it('renders no pagination controls when results fit on one page', …)`). Keep the first 7 tests (default render, IPC limit, search, type, category, filtered-empty, import-empty).

(b) Add a layout stub so the virtualizer renders a deterministic window in jsdom. Add this `beforeEach`/`afterEach` pair right after the existing `beforeEach`/`afterEach` (do not remove the existing ones):

```tsx
beforeEach(() => {
  // jsdom reports zero-sized elements; give the virtualizer a viewport + row heights so it
  // renders a real (windowed) subset. A small viewport + overscan keeps tiny fixtures fully
  // visible while large ones are windowed.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 800,
    height: 40,
    top: 0,
    left: 0,
    right: 800,
    bottom: 40,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

(c) Add the virtualization test at the end of the `describe` block:

```tsx
it('virtualizes the list: does not render every row at once', async () => {
  stubIpc(MANY); // 30 rows
  renderPage();
  expect(await screen.findByText('Op 00')).toBeInTheDocument();
  const rendered = screen.getAllByText(/^Op \d{2}$/);
  expect(rendered.length).toBeLessThan(30);
});
```

Note: `MANY` already exists in the file. If, when you run the suite, the virtualizer renders **zero** rows (so `findByText('Op 00')` times out) or renders **all 30**, tune the jsdom layout stub (the `height` value, and if needed also stub `HTMLElement.prototype.offsetHeight`/`clientHeight`, or pass `initialRect` to `useVirtualizer`) until a tiny fixture renders fully and the 30-row fixture is windowed. This environment-tuning is expected; the goal is: small fixtures fully visible, large ones windowed.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- TransactionsPage`
Expected: FAIL — the page still imports/uses pagination + `TxTable rows={pageRows…}`; the new virtualization test fails and the removed-pagination expectations no longer match the still-paginated component. (Compile/assertion failures are fine here.)

- [ ] **Step 4: Rewrite `TransactionsPage.tsx`**

Replace the entire `src/renderer/pages/TransactionsPage.tsx` with:

```tsx
import { useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { TxTableHeader, TxTableRow } from '../components/dashboard/TxTable';
import { useDashboard } from '../hooks/useDashboard';
import { toAccount, toTxRow } from '../lib/dashboardMap';
import {
  filterTransactions,
  toLocalISODate,
  type TxFilters,
  type TxPeriod,
  type TxType,
} from '../lib/filterTransactions';
import { cn } from '../lib/utils';
import type { AppOutletContext } from '../lib/outletContext';

/** Load the whole account history; the client-side filters do the rest. */
const FULL_HISTORY_LIMIT = 100000;
/** Sentinel select value mapping to "uncategorized" (null) in the filter. */
const NONE = '__none__';
/** Approximate rendered height of one row, used as the virtualizer's size estimate. */
const ROW_ESTIMATE = 57;

const PERIODS: { value: TxPeriod; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: '30d', label: '30 jours' },
  { value: '3m', label: '3 mois' },
  { value: 'year', label: 'Cette année' },
];

const TYPES: { value: TxType; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'income', label: 'Revenus' },
  { value: 'expense', label: 'Dépenses' },
];

const SEG_BTN = 'h-7 rounded-md px-2.5 font-sans text-xs font-medium transition-colors';
const FIELD = 'h-7 rounded-md border border-line-2 bg-ink-2 px-2 font-sans text-xs text-paper';

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg border border-line-2 bg-ink-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => {
            onChange(o.value);
          }}
          className={cn(
            SEG_BTN,
            value === o.value ? 'bg-ink-3 text-paper' : 'text-paper-mute hover:text-paper',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TransactionsPage() {
  const { refreshToken } = useOutletContext<AppOutletContext>();
  const {
    accounts,
    transactions,
    categories,
    selectedAccountId,
    selectAccount,
    reassign,
    createCategory,
  } = useDashboard(refreshToken, { transactionLimit: FULL_HISTORY_LIMIT });

  const [today] = useState(() => toLocalISODate(new Date()));
  const [period, setPeriod] = useState<TxPeriod>('all');
  const [type, setType] = useState<TxType>('all');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const filters: TxFilters = {
      period,
      today,
      type,
      query,
      categoryId: category === NONE ? null : category,
    };
    return filterTransactions(transactions, filters);
  }, [transactions, period, today, type, query, category]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  return (
    <>
      <AccountTabs
        accounts={accounts.map(toAccount)}
        activeId={selectedAccountId ?? ''}
        onSelect={selectAccount}
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3.5">
            <Overline>— III</Overline>
            <CardTitle>Transactions</CardTitle>
          </div>
          <span className="font-mono text-xs text-paper-mute">
            {filtered.length} résultat{filtered.length !== 1 ? 's' : ''}
          </span>
        </CardHeader>

        <div className="flex flex-wrap items-center gap-3 pb-4">
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
          <Segmented options={TYPES} value={type} onChange={setType} />
          <select
            aria-label="Catégorie"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
            }}
            className={FIELD}
          >
            <option value="all">Toutes catégories</option>
            <option value={NONE}>Sans catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            aria-label="Rechercher"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className={cn(FIELD, 'min-w-[160px] flex-1 placeholder:text-paper-dim')}
          />
        </div>

        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-paper-mute">
            Aucune transaction — importez un relevé pour commencer.
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-paper-mute">
            Aucune transaction ne correspond à ces filtres.
          </p>
        ) : (
          <div ref={scrollRef} className="relative max-h-[70vh] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-ink-1">
              <TxTableHeader />
            </div>
            <div
              ref={listRef}
              className="relative"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const t = filtered[vi.index];
                if (!t) return null;
                return (
                  <div
                    key={t.id}
                    data-index={vi.index}
                    ref={(el) => {
                      rowVirtualizer.measureElement(el);
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start - rowVirtualizer.options.scrollMargin}px)`,
                    }}
                  >
                    <TxTableRow
                      row={toTxRow(t)}
                      categories={categories}
                      onReassign={(txId, catId) => {
                        void reassign(txId, catId);
                      }}
                      onCreateCategory={createCategory}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- TransactionsPage`
Expected: PASS — the 7 kept tests + the new virtualization test. If 0 rows render, tune the jsdom stub from Step 2(b) as noted there, then re-run.

- [ ] **Step 6: Lint + typecheck**

Run: `npx eslint src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx tests/setup/renderer.ts` → clean (no unused imports — `Button`/`ChevronLeft`/`ChevronRight` are gone).
Run: `npx tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx tests/setup/renderer.ts
git commit -m "feat(transactions): replace pagination with virtualized continuous scroll"
```

(append the Co-Authored-By trailer)

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint** — Run: `npm run lint` → clean.
- [ ] **Step 2: Typecheck** — Run: `npx tsc --noEmit` → clean.
- [ ] **Step 3: Unit tests** — Run: `npm test` → all green (DashboardPage, TransactionsPage, filterTransactions, etc.).
- [ ] **Step 4: Build** — Run: `npm run build` → succeeds.
- [ ] **Step 5 (manual):** With the dev app, open Transactions on an account with many transactions: confirm one continuous fluid scroll, no page controls, the column header stays pinned, columns stay aligned, the result count shows the full total, and filters/empty states still work. Glance at the dashboard's "Dernières transactions" card to confirm the fixed-width columns still look right.

---

## Self-review notes

- **Spec coverage:** TxTable per-row grid refactor with shared `TX_GRID`, exported `TxTableHeader`/`TxTableRow`, unchanged public API, row-level border/hover, `key={row.id}` (Task 1). `@tanstack/react-virtual` dependency (Task 2). Pagination removed; virtualized list with sticky header + `scrollMargin` + `measureElement` + capped `max-h-[70vh]`; total count and both empty states preserved (Task 3). jsdom `ResizeObserver` + layout stub; pagination tests removed; virtualization test added; DashboardPage stays green (Task 3 + Task 4). Build/lint/tsc/manual (Task 4). Covered.
- **Placeholder scan:** none. The jsdom-stub tuning note is a concrete instruction with a fallback, not a TODO.
- **Type consistency:** component is `TxTableRow` (distinct from the `TxRow` data interface); `TxTableHeader`, `TX_GRID` exported from TxTable and imported in TransactionsPage. `rowVirtualizer.options.scrollMargin`, `getTotalSize()`, `getVirtualItems()`, `measureElement` are the v3 API. `toTxRow(t)` maps a `DashboardTransaction` to the `TxRow` the row component expects.

```

```

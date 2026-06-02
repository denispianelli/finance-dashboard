# Dashboard recent-transactions preview + full Transactions page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit the dashboard "Dernières transactions" card to the 10 latest rows, and make "Tout voir →" open a dedicated, client-side-filterable Transactions page.

**Architecture:** A pure `filterTransactions` function (period / category / label search / type) does all filtering in the renderer over a fully-loaded account history. The new `TransactionsPage` reuses `useDashboard` (extended with a `transactionLimit` option), `AccountTabs`, and `TxTable`. No backend changes — `dashboard:getTransactions` already supports `accountId` + `limit`.

**Tech Stack:** React + react-router (HashRouter), TypeScript strict, Tailwind/shadcn, Vitest 4 (jsdom per-file).

**Deviation from spec:** The spec named a new `useAccountTransactions` hook. Implementing it would duplicate `useDashboard`'s accounts/categories/`reassign`/`createCategory` logic verbatim. Instead we add an optional `transactionLimit` to `useDashboard` (one focused change, zero duplication — consistent with the repo's anti-over-engineering posture). The spec's isolation goal is preserved by the pure `filterTransactions` unit.

**Test layout:** Tests live under `tests/unit/...` mirroring the src path (not colocated). Renderer tests use a per-file `// @vitest-environment jsdom` directive + explicit `afterEach(cleanup)`, mock `@renderer/ipc/client`, and render through `MemoryRouter`. Run unit tests with `npm test` (alias for `vitest run tests/unit`).

---

### Task 1: Pure `filterTransactions` library

**Files:**

- Create: `src/renderer/lib/filterTransactions.ts`
- Test: `tests/unit/renderer/filterTransactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/filterTransactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterTransactions, periodStart } from '@renderer/lib/filterTransactions';
import type { DashboardTransaction } from '@shared/types/dashboard';

function tx(over: Partial<DashboardTransaction> = {}): DashboardTransaction {
  return {
    id: 't1',
    accountId: 'a1',
    date: '2026-05-14',
    amount: -84.3,
    labelRaw: 'CB CARREFOUR',
    labelClean: 'Carrefour Market',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    confidence: null,
    isInternalTransfer: false,
    userModified: false,
    ...over,
  };
}

const TODAY = '2026-06-03';
const ALL = { period: 'all', today: TODAY, categoryId: 'all', query: '', type: 'all' } as const;

describe('periodStart', () => {
  it('returns null for "all"', () => {
    expect(periodStart('all', TODAY)).toBeNull();
  });
  it('returns Jan 1st of the current year for "year"', () => {
    expect(periodStart('year', TODAY)).toBe('2026-01-01');
  });
  it('returns today minus 30 days for "30d"', () => {
    expect(periodStart('30d', TODAY)).toBe('2026-05-04');
  });
  it('returns today minus 3 months for "3m"', () => {
    expect(periodStart('3m', TODAY)).toBe('2026-03-03');
  });
});

describe('filterTransactions', () => {
  it('returns everything with the default "all" filters', () => {
    const txns = [tx({ id: 'a' }), tx({ id: 'b' })];
    expect(filterTransactions(txns, ALL)).toHaveLength(2);
  });

  it('excludes transactions before the period start', () => {
    const txns = [tx({ id: 'old', date: '2026-01-10' }), tx({ id: 'new', date: '2026-05-20' })];
    const out = filterTransactions(txns, { ...ALL, period: '30d' });
    expect(out.map((t) => t.id)).toEqual(['new']);
  });

  it('includes a transaction exactly on the period boundary', () => {
    const txns = [tx({ id: 'edge', date: periodStart('30d', TODAY) as string })];
    expect(filterTransactions(txns, { ...ALL, period: '30d' })).toHaveLength(1);
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
    ];
    const out = filterTransactions(txns, {
      period: '30d',
      today: TODAY,
      categoryId: 'cat-1',
      query: 'mono',
      type: 'expense',
    });
    expect(out.map((t) => t.id)).toEqual(['hit']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- filterTransactions`
Expected: FAIL — cannot resolve `@renderer/lib/filterTransactions` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/renderer/lib/filterTransactions.ts`:

```ts
import type { DashboardTransaction } from '@shared/types/dashboard';

export type TxPeriod = 'all' | '30d' | '3m' | 'year';
export type TxType = 'all' | 'income' | 'expense';

export interface TxFilters {
  /** Time window relative to `today`. */
  readonly period: TxPeriod;
  /** Reference date as ISO `yyyy-mm-dd`. Injected so this stays clock-free and testable. */
  readonly today: string;
  /** Category to match: 'all' = any, null = uncategorized, otherwise a category id. */
  readonly categoryId: string | null | 'all';
  /** Free-text match on the cleaned label; case- and accent-insensitive. Empty = no filter. */
  readonly query: string;
  /** Income (amount > 0), expense (amount < 0), or all. */
  readonly type: TxType;
}

/** Strip diacritics + lowercase, for accent-insensitive search.
 *  NOTE for the implementer: write the combining-marks range as the explicit unicode
 *  escape `/[̀-ͯ]/g` (the rendered character class below may show literal
 *  combining marks, which are invisible/ambiguous in source). */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Inclusive lower-bound ISO date for a period, or null for 'all'. */
export function periodStart(period: TxPeriod, today: string): string | null {
  if (period === 'all') return null;
  if (period === 'year') return `${today.slice(0, 4)}-01-01`;
  const d = new Date(`${today}T00:00:00`);
  if (period === '30d') d.setDate(d.getDate() - 30);
  else d.setMonth(d.getMonth() - 3); // '3m'
  return d.toISOString().slice(0, 10);
}

/**
 * Filter transactions by period / category / label / type. All criteria are AND-ed.
 * ISO `yyyy-mm-dd` dates compare lexicographically, so no Date parsing is needed for the
 * range check.
 */
export function filterTransactions(
  txns: readonly DashboardTransaction[],
  filters: TxFilters,
): DashboardTransaction[] {
  const from = periodStart(filters.period, filters.today);
  const q = normalize(filters.query.trim());

  return txns.filter((t) => {
    if (from !== null && t.date < from) return false;
    if (filters.categoryId !== 'all' && t.categoryId !== filters.categoryId) return false;
    if (filters.type === 'income' && t.amount <= 0) return false;
    if (filters.type === 'expense' && t.amount >= 0) return false;
    if (q.length > 0 && !normalize(t.labelClean).includes(q)) return false;
    return true;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- filterTransactions`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/filterTransactions.ts tests/unit/renderer/filterTransactions.test.ts
git commit -m "feat(transactions): add pure client-side transaction filter"
```

---

### Task 2: Extend `useDashboard` with a `transactionLimit` option

**Files:**

- Modify: `src/renderer/hooks/useDashboard.ts`

This is a small, additive refactor. It is exercised by the `TransactionsPage` test in Task 4 (which asserts the limit reaches the IPC layer), so it has no standalone test step.

- [ ] **Step 1: Add the options type and parameter**

In `src/renderer/hooks/useDashboard.ts`, add this interface just above the `export function useDashboard` declaration:

```ts
export interface UseDashboardOptions {
  /**
   * Max transactions to fetch for the selected account. Omitted on the dashboard
   * (backend default of 100, enough for the preview + the monthly insight). The full
   * Transactions page passes a high value to load the whole history for client-side
   * filtering.
   */
  readonly transactionLimit?: number;
}
```

Change the function signature from:

```ts
export function useDashboard(refreshToken: number): UseDashboard {
```

to:

```ts
export function useDashboard(
  refreshToken: number,
  options: UseDashboardOptions = {},
): UseDashboard {
  const { transactionLimit } = options;
```

- [ ] **Step 2: Pass the limit through the transactions fetch**

In the "Transactions + metrics for the selected account" effect, change the `getTransactions` invoke from:

```ts
void ipc
  .invoke('dashboard:getTransactions', { accountId: selectedAccountId })
  .then(({ transactions: next }) => {
    if (active) setTransactions(next);
  });
```

to:

```ts
void ipc
  .invoke('dashboard:getTransactions', {
    accountId: selectedAccountId,
    ...(transactionLimit !== undefined && { limit: transactionLimit }),
  })
  .then(({ transactions: next }) => {
    if (active) setTransactions(next);
  });
```

Then add `transactionLimit` to that effect's dependency array, changing:

```ts
  }, [selectedAccountId, refreshToken, tick]);
```

to:

```ts
  }, [selectedAccountId, refreshToken, tick, transactionLimit]);
```

- [ ] **Step 3: Verify nothing broke**

Run: `npm test -- DashboardPage` and `npx tsc --noEmit`
Expected: DashboardPage tests still PASS; typecheck clean. (The dashboard calls `useDashboard(refreshToken)` with no options, so its behavior is unchanged.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useDashboard.ts
git commit -m "feat(dashboard): allow useDashboard to fetch the full transaction history"
```

---

### Task 3: Dashboard preview — slice to 10 + wire "Tout voir"

**Files:**

- Modify: `src/renderer/pages/DashboardPage.tsx`
- Modify: `tests/unit/renderer/DashboardPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/renderer/DashboardPage.test.tsx`, add `within` to the testing-library import:

```ts
import { cleanup, render, screen, within } from '@testing-library/react';
```

Add these two tests inside the `describe('DashboardPage', ...)` block:

```ts
it('shows at most the 10 latest transactions in the preview', async () => {
  const many: DashboardTransaction[] = Array.from({ length: 12 }, (_, i) => ({
    ...TX[0]!,
    id: `t${String(i)}`,
    labelClean: `Tx ${String(i).padStart(2, '0')}`,
  }));
  stubIpc(many);
  renderPage();
  expect(await screen.findByText('Tx 00')).toBeInTheDocument();
  expect(screen.getByText('Tx 09')).toBeInTheDocument();
  // 11th and 12th rows are not rendered in the preview.
  expect(screen.queryByText('Tx 10')).not.toBeInTheDocument();
  expect(screen.queryByText('Tx 11')).not.toBeInTheDocument();
});

it('links "Tout voir" to the transactions page', () => {
  renderPage();
  const link = screen.getByRole('link', { name: /Tout voir/ });
  expect(link).toHaveAttribute('href', '/transactions');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- DashboardPage`
Expected: FAIL — the preview currently renders all 12 rows (so `Tx 10`/`Tx 11` are present), and "Tout voir" is a `<button>`, not a link (no `link` role).

- [ ] **Step 3: Implement the slice and the link**

In `src/renderer/pages/DashboardPage.tsx`, change the import on line 1 to add `Link`:

```ts
import { Link, useOutletContext } from 'react-router-dom';
```

Add this constant just inside the component body, right after the `useDashboard(...)` destructuring block:

```ts
const RECENT_LIMIT = 10;
```

Replace the inert "Tout voir" button:

```tsx
<Button variant="ghost" size="sm">
  Tout voir →
</Button>
```

with a link styled as the same ghost button (`Button` already supports `asChild` via Radix `Slot`):

```tsx
<Button asChild variant="ghost" size="sm">
  <Link to="/transactions">Tout voir →</Link>
</Button>
```

Replace the preview table's `rows` prop:

```tsx
            rows={transactions.map(toTxRow)}
```

with:

```tsx
            rows={transactions.slice(0, RECENT_LIMIT).map(toTxRow)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- DashboardPage`
Expected: PASS (all DashboardPage tests, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/DashboardPage.tsx tests/unit/renderer/DashboardPage.test.tsx
git commit -m "feat(dashboard): show 10 latest transactions and link Tout voir to /transactions"
```

---

### Task 4: Build `TransactionsPage`, wire the route and the sidebar

**Files:**

- Create: `src/renderer/pages/TransactionsPage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/components/Sidebar.tsx`
- Test: `tests/unit/renderer/TransactionsPage.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/TransactionsPage.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { TransactionsPage } from '@renderer/pages/TransactionsPage';
import type { AccountSummary, DashboardTransaction } from '@shared/types/dashboard';
import type { CategoryDTO } from '@shared/types/category';

const mockInvoke = vi.mocked(ipc.invoke);

const ACCOUNTS: AccountSummary[] = [
  {
    id: 'acc-1',
    name: 'Compte courant',
    type: 'checking',
    bankId: 'lcl',
    currency: 'EUR',
    balance: 1000,
    txCount: 3,
  },
];

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat-food',
    name: 'Alimentation',
    icon: 'wallet',
    color: '#aaa',
    parentId: null,
    isDefault: true,
    position: 0,
  },
];

function tx(over: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: 't',
    accountId: 'acc-1',
    date: '2026-05-14',
    amount: -10,
    labelRaw: 'RAW',
    labelClean: 'Label',
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    categoryIcon: null,
    confidence: null,
    isInternalTransfer: false,
    userModified: false,
    ...over,
  };
}

const TX: DashboardTransaction[] = [
  tx({ id: 'a', labelClean: 'Carrefour', amount: -50, categoryId: 'cat-food' }),
  tx({ id: 'b', labelClean: 'Salaire', amount: 2000, categoryId: null }),
  tx({ id: 'c', labelClean: 'Pharmacie', amount: -15, categoryId: null }),
];

function stubIpc(transactions: DashboardTransaction[] = TX): void {
  mockInvoke.mockImplementation(((channel: string) => {
    if (channel === 'dashboard:getAccounts') return Promise.resolve({ accounts: ACCOUNTS });
    if (channel === 'dashboard:getTransactions') return Promise.resolve({ transactions });
    if (channel === 'dashboard:metrics') return Promise.resolve({ balance: 0, series: [] });
    if (channel === 'categories:list') return Promise.resolve({ categories: CATEGORIES });
    return Promise.resolve(undefined);
  }) as typeof ipc.invoke);
}

beforeEach(() => {
  mockInvoke.mockReset();
  stubIpc();
});

afterEach(() => {
  cleanup();
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/transactions']}>
      <Routes>
        <Route element={<Outlet context={{ refreshToken: 0 }} />}>
          <Route path="/transactions" element={<TransactionsPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('TransactionsPage', () => {
  it('renders all transactions for the account by default', async () => {
    renderPage();
    expect(await screen.findByText('Carrefour')).toBeInTheDocument();
    expect(screen.getByText('Salaire')).toBeInTheDocument();
    expect(screen.getByText('Pharmacie')).toBeInTheDocument();
  });

  it('requests the full history (high limit) over IPC', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    expect(mockInvoke).toHaveBeenCalledWith(
      'dashboard:getTransactions',
      expect.objectContaining({ accountId: 'acc-1', limit: 100000 }),
    );
  });

  it('filters by free-text search on the label', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'pharma' } });
    expect(screen.getByText('Pharmacie')).toBeInTheDocument();
    expect(screen.queryByText('Carrefour')).not.toBeInTheDocument();
    expect(screen.queryByText('Salaire')).not.toBeInTheDocument();
  });

  it('filters by type (revenus shows only positive amounts)', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.click(screen.getByRole('button', { name: 'Revenus' }));
    expect(screen.getByText('Salaire')).toBeInTheDocument();
    expect(screen.queryByText('Carrefour')).not.toBeInTheDocument();
  });

  it('filters by category', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.change(screen.getByLabelText('Catégorie'), { target: { value: 'cat-food' } });
    expect(screen.getByText('Carrefour')).toBeInTheDocument();
    expect(screen.queryByText('Salaire')).not.toBeInTheDocument();
  });

  it('shows a filtered-empty state when nothing matches', async () => {
    renderPage();
    await screen.findByText('Carrefour');
    fireEvent.change(screen.getByLabelText('Rechercher'), { target: { value: 'zzzzz' } });
    expect(screen.getByText(/ne correspond à ces filtres/i)).toBeInTheDocument();
  });

  it('shows the import empty state when the account has no transactions', async () => {
    stubIpc([]);
    renderPage();
    expect(await screen.findByText(/importez un relevé/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- TransactionsPage`
Expected: FAIL — cannot resolve `@renderer/pages/TransactionsPage` (module does not exist yet).

- [ ] **Step 3: Create the page**

Create `src/renderer/pages/TransactionsPage.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, CardHeader, CardTitle } from '../components/ui/card';
import { Overline } from '../components/ui/overline';
import { AccountTabs } from '../components/dashboard/AccountTabs';
import { TxTable } from '../components/dashboard/TxTable';
import { useDashboard } from '../hooks/useDashboard';
import { toAccount, toTxRow } from '../lib/dashboardMap';
import {
  filterTransactions,
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

  const [today] = useState(() => new Date().toISOString().slice(0, 10));
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
            {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
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
          <TxTable
            rows={filtered.map(toTxRow)}
            categories={categories}
            onReassign={(txId, catId) => {
              void reassign(txId, catId);
            }}
            onCreateCategory={createCategory}
          />
        )}
      </Card>
    </>
  );
}
```

- [ ] **Step 4: Wire the route in `App.tsx`**

In `src/renderer/App.tsx`, add the import alongside the other page imports:

```ts
import { TransactionsPage } from './pages/TransactionsPage';
```

Add the route inside the `AppShell` layout route, right after the index route:

```tsx
          <Route index element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
```

- [ ] **Step 5: Enable the sidebar item**

In `src/renderer/components/Sidebar.tsx`, flip the Transactions item to enabled:

```ts
      { path: '/transactions', label: 'Transactions', Icon: ArrowLeftRight, enabled: true },
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test -- TransactionsPage`
Expected: PASS (all TransactionsPage tests).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/pages/TransactionsPage.tsx src/renderer/App.tsx src/renderer/components/Sidebar.tsx tests/unit/renderer/TransactionsPage.test.tsx
git commit -m "feat(transactions): add filterable Transactions page and enable its route"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: clean (0 errors).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Unit tests**

Run: `npm test`
Expected: all green, including `filterTransactions`, `DashboardPage`, `TransactionsPage`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5 (manual, optional): Visual check**

Launch the app, confirm: the dashboard card shows 10 rows max; "Tout voir →" opens `/transactions`; the sidebar "Transactions" item is active; period/type/category/search filters narrow the list and the result count updates; the filtered-empty state appears when nothing matches.

---

## Self-review notes

- **Spec coverage:** preview limit (Task 3), "Tout voir" link (Task 3), `/transactions` route + sidebar (Task 4), AccountTabs + local account state (Task 4), full-history fetch (Task 2), all four filters (Task 1 pure logic + Task 4 wiring), pure isolated filter unit (Task 1), result count + filtered-empty state (Task 4), unit + component tests (Tasks 1, 3, 4). All covered.
- **Date determinism:** period-boundary math is tested in Task 1 with an injected `today`; the component test (Task 4) deliberately avoids period assertions because the page reads the real clock. `today` is captured once via `useState` initializer.
- **Type consistency:** `filterTransactions` / `periodStart` / `TxFilters` / `TxPeriod` / `TxType` names match across Tasks 1 and 4. `transactionLimit` option name matches across Tasks 2 and 4. The `NONE` sentinel ('**none**') is mapped to `null` before reaching the filter.

# A2 — Reports page: the remaining six analyses (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** Complete US3 — grow `/reports` so it shows the seven analyses. A1 already ships #2 (gained/lost). A2 adds: **1** net worth over time/breakdown, **3** top spending categories, **4** savings rate, **5** subscriptions & recurring, **6** year vs N-1, **7** biggest movements.

**Architecture:** Pure compute helpers in `src/renderer/lib/reports.ts` (unit-tested, no React); a `useReports` hook that fetches `dashboard:netWorth`, `recurring:list`, all transactions, and the year cash-flow series; small presentational cards consuming those; mounted on `ReportsPage` alongside the existing `CashflowCard`.

**Tech Stack:** React 19, TS strict, Tailwind tokens, Vitest + Testing Library (jsdom).

**Spec:** `…/specs/2026-06-06-mvp-personal-finance-design.md` (brick A2, the seven Reports analyses). Depends on F1/F2/D1 (merged).

---

## File structure

- Create `src/renderer/lib/reports.ts` — pure helpers (+ `tests/unit/renderer/reports.test.ts`)
- Create `src/renderer/hooks/useReports.ts` (+ `tests/unit/renderer/useReports.test.ts`)
- Create section components under `src/renderer/components/reports/`: `NetWorthCard`, `SavingsRateKpis`, `TopCategoriesCard`, `RecurringCard`, `YearComparisonCard`, `BiggestMovementsCard` (+ a couple of focused render tests)
- Modify `src/renderer/pages/ReportsPage.tsx` to compose them (+ extend `ReportsPage.test.tsx`)

## Pure helpers (the testable core) — `src/renderer/lib/reports.ts`

```typescript
import type { CashflowPoint, DashboardTransaction } from '@shared/types/dashboard';

export interface CategoryShare {
  name: string;
  total: number;
}

/** Top spending categories across ALL given transactions (expenses, non-transfer,
 *  categorised), largest first. */
export function topCategories(txns: DashboardTransaction[], limit = 5): CategoryShare[] {
  const totals = new Map<string, number>();
  for (const tx of txns) {
    if (tx.amount >= 0) continue;
    if (tx.isInternalTransfer || tx.categoryId === 'cat-transferts') continue;
    if (tx.categoryName === null) continue;
    totals.set(tx.categoryName, (totals.get(tx.categoryName) ?? 0) + Math.abs(tx.amount));
  }
  return [...totals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Savings rate over a cash-flow series: net / income, as a 0-100 percentage.
 *  Returns null when there is no income to divide by. */
export function savingsRate(series: CashflowPoint[]): number | null {
  const income = series.reduce((s, p) => s + p.income, 0);
  const net = series.reduce((s, p) => s + p.net, 0);
  if (income <= 0) return null;
  return (net / income) * 100;
}

export interface YearComparison {
  current: CashflowPoint;
  previous: CashflowPoint | null;
  netDelta: number | null;
}

/** Latest year vs the one before, from a year-granularity cash-flow series. */
export function yearOverYear(yearSeries: CashflowPoint[]): YearComparison | null {
  if (yearSeries.length === 0) return null;
  const sorted = [...yearSeries].sort((a, b) => a.period.localeCompare(b.period));
  const current = sorted[sorted.length - 1];
  if (current === undefined) return null;
  const previous = sorted[sorted.length - 2] ?? null;
  return { current, previous, netDelta: previous ? current.net - previous.net : null };
}

/** Largest movements by magnitude (non-transfer), most extreme first. */
export function biggestMovements(txns: DashboardTransaction[], limit = 5): DashboardTransaction[] {
  return txns
    .filter((t) => !t.isInternalTransfer && t.categoryId !== 'cat-transferts')
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit);
}
```

### Tests `tests/unit/renderer/reports.test.ts`

Cover: `topCategories` aggregates expenses, ignores income/transfers/uncategorised, sorts + caps; `savingsRate` = net/income% and null when income 0; `yearOverYear` picks latest + delta vs previous (null with one year); `biggestMovements` sorts by |amount|, excludes transfers, caps. (Build small `DashboardTransaction` fixtures.)

---

## Tasks (TDD, commit per task)

1. **reports.ts helpers** — write `reports.test.ts` (red) → implement → green → commit.
2. **`useReports` hook** — fetch `dashboard:netWorth`, `recurring:list`, `dashboard:getTransactions` (no account, high limit), `dashboard:cashflow` year. Return `{ netWorth, recurring, transactions, yearSeries }`. Test with a mocked `ipc.invoke` dispatching per channel. Commit.
3. **Section cards** (`src/renderer/components/reports/*`) — each a pure presentational component over props (NetWorthCard: total + per-account list with `balanceSource` "déclaré" hint; SavingsRateKpis: net-worth + savings-rate + monthly-subscriptions KPIs via `Kpi`; TopCategoriesCard; RecurringCard: subscriptions list + monthly total + next due; YearComparisonCard; BiggestMovementsCard). One render test for NetWorthCard + RecurringCard at least. Commit.
4. **Compose on `ReportsPage`** — keep `CashflowCard`; add KPIs row + the section cards using `useReports`. Extend `ReportsPage.test.tsx` to mock all channels and assert the new sections render (net worth total, a subscription, a category). Full gate `tsc && vitest && npm run lint`. Commit, push, PR.

## Self-review

- **Spec coverage:** all seven analyses present on `/reports` (US1 from A1 + the six here). Net worth uses F2 balances; recurring uses D1; year-vs-N-1 uses cash-flow year; empty states graceful. ✅
- **Type consistency:** helpers typed off `CashflowPoint`/`DashboardTransaction`; hook returns shapes the cards consume verbatim.
- **No new main code**; renderer reads existing channels only. Renderer does no I/O beyond typed IPC; CSP unchanged.

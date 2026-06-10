# Reports — specific-period filter + shadcn area chart (Implementation Plan)

> Follow-up to the MVP Reports page. REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Let `/reports` be scoped to a **specific period** — a whole year (e.g. 2023) or a specific month (e.g. June 2024) — chosen via a granularity toggle + value menu, and render the gained/lost trend as a **shadcn/Recharts area chart** (year → net per month; month → cumulative net per day). All flow analyses recompute for the selected period; net worth stays "actuel".

**Architecture:** Pure period helpers in `lib/reports.ts` (TDD); a `PeriodPicker` and a `CashflowAreaChart` (shadcn `ChartContainer` + Recharts `AreaChart`); `ReportsPage` owns the selected-period state, derives available periods from the month cash-flow series, and scopes the cards. Renderer-only; reuses existing channels.

## Period model

`ReportPeriod = { granularity: 'year' | 'month'; value: string }` — `value` is `yyyy` or `yyyy-mm`.

## Pure helpers (add to `src/renderer/lib/reports.ts`) — TDD in `reports.test.ts`

```typescript
export interface ReportPeriod {
  granularity: 'year' | 'month';
  value: string; // yyyy | yyyy-mm
}

export interface NetPoint {
  label: string;
  net: number;
}

const MONTHS_SHORT = [
  'janv',
  'févr',
  'mars',
  'avr',
  'mai',
  'juin',
  'juil',
  'août',
  'sept',
  'oct',
  'nov',
  'déc',
];

/** Distinct years and months present in a month-granularity cash-flow series, newest first. */
export function availablePeriods(monthSeries: CashflowPoint[]): {
  years: string[];
  months: string[];
} {
  const years = new Set<string>();
  const months = new Set<string>();
  for (const p of monthSeries) {
    years.add(p.period.slice(0, 4));
    months.add(p.period);
  }
  const desc = (a: string, b: string): number => b.localeCompare(a);
  return { years: [...years].sort(desc), months: [...months].sort(desc) };
}

/** The 12 months of a year (Jan→Dec), net per month, zero-filled, from a month series. */
export function monthlyNetForYear(monthSeries: CashflowPoint[], year: string): NetPoint[] {
  const byMonth = new Map(monthSeries.map((p) => [p.period, p.net]));
  return MONTHS_SHORT.map((label, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    return { label, net: byMonth.get(key) ?? 0 };
  });
}

/** Transactions whose date falls in the period (date prefix match). */
export function txInPeriod(
  txns: DashboardTransaction[],
  period: ReportPeriod,
): DashboardTransaction[] {
  return txns.filter((t) => t.date.startsWith(period.value));
}

/** Income / expense / net of a transaction set (transfers excluded). */
export function periodTotals(txns: DashboardTransaction[]): {
  income: number;
  expense: number;
  net: number;
} {
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (t.isInternalTransfer || t.categoryId === 'cat-transferts') continue;
    if (t.amount >= 0) income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income + expense };
}

/** Cumulative net by day across the transactions of a month (`yyyy-mm`), transfers excluded. */
export function dailyCumulativeNet(txns: DashboardTransaction[], month: string): NetPoint[] {
  const inMonth = txns
    .filter(
      (t) => t.date.startsWith(month) && !t.isInternalTransfer && t.categoryId !== 'cat-transferts',
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const byDay = new Map<string, number>();
  for (const t of inMonth) {
    const day = t.date.slice(8, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
  }
  let running = 0;
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, delta]) => {
      running += delta;
      return { label: day, net: running };
    });
}

/** The comparable previous period: previous year, or the same month one year earlier. */
export function previousPeriod(period: ReportPeriod): ReportPeriod {
  if (period.granularity === 'year') {
    return { granularity: 'year', value: String(Number(period.value) - 1) };
  }
  const year = Number(period.value.slice(0, 4)) - 1;
  return { granularity: 'month', value: `${String(year)}-${period.value.slice(5, 7)}` };
}
```

Tests: `availablePeriods` dedups+sorts; `monthlyNetForYear` zero-fills 12; `txInPeriod` prefix; `periodTotals` excludes transfers; `dailyCumulativeNet` accumulates; `previousPeriod` year/month.

## Components

- `src/renderer/components/reports/PeriodPicker.tsx` — `{ period, available, onChange }`. A `Chip` toggle Année/Mois + a native `<select>` of the values (years or months, month labels via `monthLabelFr`). Render test: switching granularity + selecting a value calls `onChange`.
- `src/renderer/components/reports/CashflowAreaChart.tsx` — `{ data: NetPoint[]; title }`. shadcn `ChartContainer` (config `{ net: { label: 'Net', color: 'var(--sage)' } }`) wrapping a Recharts `AreaChart` over `data` (XAxis `label`, Area `dataKey="net"`), `ChartTooltip`/`ChartTooltipContent`. Empty state when `data` all-zero/empty. Render test: renders an SVG / the title; jsdom + `ResizeObserver` shim if needed.

## Page (`ReportsPage`)

- State `period`, defaulting to the latest available year once data loads.
- `useCashflow()` month series → `availablePeriods`; `useReports()` → netWorth, recurring, transactions.
- chart data: year → `monthlyNetForYear(monthSeries, value)`; month → `dailyCumulativeNet(transactions, value)`.
- scope `txInPeriod(transactions, period)` → `topCategories`, `biggestMovements`, `periodTotals` → savings rate (= net/income×100).
- Year-vs-N-1 → period net vs `previousPeriod` net (from month series sums / transactions).
- NetWorth stays current (label "actuel"); Recurring stays all-time; subscriptions KPI unchanged.
- Replace `CashflowCard` usage with `PeriodPicker` + `CashflowAreaChart`. (Keep `CashflowCard` file or remove if unused — remove its now-dead usage; keep its test only if file kept.)
- Extend `ReportsPage.test.tsx`: mock channels, assert the picker + a section render for a default period.

## Gate / DoD

`npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run build` all green. Self-merge once CI green.

## Self-review

- Period filter scopes flows (cashflow, categories, savings, movements, YoY); net worth intentionally current. Area chart for gained/lost only; other analyses stay lists. shadcn chart used. No new main code; renderer typed-IPC only; privacy intact (recharts is local).

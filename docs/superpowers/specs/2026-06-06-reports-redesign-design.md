# Reports page redesign — "did I gain or lose?" first

- **Date** : 2026-06-06
- **Status** : Accepted (validated via visual mockups)
- **Related** : the MVP Reports page (US3) and the period-filter work (PR #154, same branch)

## Intent

The maintainer's primary need on `/reports`: **at a glance, for the selected period (a month or a
year), did I gain or lose money — is it positive or negative (more out than in)?** The current
page buries that under uniform list cards. The redesign leads with an unmistakable **verdict**,
then supports it. Validated against mockups (the "pastille verdict" hero + full-width-then-grid
layout was the chosen direction).

## Layout (top → bottom)

1. **Header** — "Rapports" title on the left; the period control on the right (an **Année / Mois**
   toggle + a value `<select>` of the years/months present in the data). No lonely full-width row.
2. **Verdict row** (hero, full width) — **three KPI pastilles** side by side:
   **Entrées** (total income, sage accent), **Sorties** (total spend, coral accent), and
   **Résultat** (net = income − spend, **colored by sign** — sage if ≥ 0, coral if < 0 — with the
   word **positif/négatif**; sub-text `+X % vs N-1 · épargne X %`). The Résultat tile is the
   verdict. Folds in the old savings-rate and year-vs-N-1 cards.
3. **Mois par mois** (full width) — a **bar chart** (shadcn/Recharts), one bar per sub-period,
   **green when that sub-period's net ≥ 0, coral when < 0**. Year → 12 months; month → per-day net.
   (Replaces the area chart — bars read the per-period sign better.)
4. **Grid (2 col)** — **Patrimoine** (a donut of account composition + the total, "actuel") ·
   **Où part l'argent** (top spending categories as horizontal bars).
5. **Grid (2 col)** — **Abonnements** (list + monthly total) · **Plus gros mouvements** (list).

Everything except Patrimoine recomputes for the selected period; Patrimoine stays _actuel_
(point-in-time); recurring stays all-time.

## Components (renderer)

- `ReportsHeader` — title + `PeriodPicker` (existing) on the right.
- `VerdictRow` — three KPI pastilles (Entrées / Sorties / Résultat) from a `PeriodVerdict` value.
- `CashflowBarChart` — Recharts `BarChart`; each bar colored by its own net sign. Replaces
  `CashflowAreaChart`.
- `NetWorthDonut` — Recharts `PieChart` (donut) over account balances + centered/side total.
- `TopCategoriesBars` — horizontal bars (Recharts `BarChart` layout="vertical", or the existing
  CSS bars kept). Keep it simple; reuse `topCategories`.
- Keep `RecurringCard`, `BiggestMovementsCard` (lists). Drop the standalone `SavingsRateKpis`
  and `YearComparisonCard` (folded into the pastille). Drop `CashflowAreaChart`.

## Pure helpers (TDD, `lib/reports.ts`)

- `periodVerdict(scopedTxns, prevTxns)` → `{ net, income, expense, positive, savingsRate, deltaPct }`
  where `positive = net >= 0`, `savingsRate = income>0 ? net/income*100 : null`,
  `deltaPct = prevNet>0 ? (net-prevNet)/|prevNet|*100 : null`. (Reuses `periodTotals`.)
- `accountComposition(netWorth)` → `{ name, value }[]` of non-null positive balances (for the donut).
- Monthly/daily net series already exist (`monthlyNetForYear`, `dailyCumulativeNet`); the bar chart
  colors each bar via its `net` sign.

## Data flow

Unchanged channels: `dashboard:cashflow` (month series → available periods + monthly bars),
`dashboard:netWorth` (donut + verdict has nothing from it), `recurring:list`, `dashboard:getTransactions`
(scoped for verdict/categories/movements). No new main code. Renderer typed-IPC only; CSP unchanged.

## Testing

- Pure helpers: `periodVerdict` (sign, savings rate, delta, zero-income/zero-prev cases),
  `accountComposition` (drops null/≤0). Existing helper tests stay.
- Component render tests: `VerdictPastille` (gain vs loss wording/color), `CashflowBarChart`
  (renders bars; ResizeObserver shim), `NetWorthDonut` (renders), `ReportsPage` integration
  (header + pastille + a section).
- DoD: tsc, vitest, `npm run lint`, `npm run build` all green.

## Out of scope

Drill-down/click-through, net-worth-over-time history, tooltips beyond Recharts defaults, animation
polish. Can come later.

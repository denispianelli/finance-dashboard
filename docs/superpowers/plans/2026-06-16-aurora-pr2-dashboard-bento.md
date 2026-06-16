# Aurora PR — Dashboard bento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`). **Acceptance is visual:** after each task, run `npm run screenshots` and diff `.screenshots/{dark,light}-01-dashboard.png` against the canonical reference `design_handoff_aurora/screenshots/01-tableau-de-bord.png` (dark) — not unit assertions.

**Goal:** Replace the dashboard's uniform `KpiGrid`+`Row2` layout with the Aurora **bento grid**, matching `ui_kits/aurora/dashboard.jsx` (canonical), reconciled to our scope (no "Prélèvements à venir" tile).

**Architecture:** A 12-column CSS grid of glass `.tile`s with varied spans. Reuse existing data (`useDashboard`) and primitives (`ChartCard`, `Kpi`, `Insight`, `TxTable`, `reports/CategoryDonut`); add the new tiles the bento introduces. No backend/IPC changes.

**Tech Stack:** React 19 + TS strict, Tailwind, Recharts, the Aurora `.tile`/`.tile-hover` classes (already shipped), Vitest 4 (jsdom), the screenshot harness (`npm run screenshots`).

**Branch:** continue on `feat/aurora-global-reskin` (or a fresh `feat/aurora-dashboard-bento` off it). Visual PR → maintainer validates in-app before merge.

**Canonical source of record:** `ui_kits/aurora/dashboard.jsx` in the Design project (fetched). Read it for per-tile visual detail; do NOT ship its raw JSX — recreate with our components.

---

## Reconciled layout (Upcoming/Prélèvements tile dropped — spec §7)

Canonical bento is 9 tiles; we drop `UpcomingTile`, leaving 8, rebalanced to a clean 12-col grid:

| Row | Tiles (span)                                                    |
| --- | --------------------------------------------------------------- |
| 1   | **HeroBalance** (4, row-span 2) · **BalanceChart** (8)          |
| 2   | _(hero continues)_ · **Revenus** KPI (4) · **Dépenses** KPI (4) |
| 3   | **SpendingDonut** (5) · **Insight** (3) · **AccountsMini** (4)  |
| 4   | **Recent transactions** (12)                                    |

> This row-3/4 rebalance (AccountsMini pulled up; Recent full-width) is **my proposed reconciliation** for the dropped tile — it is the first thing to eyeball against the reference in the harness, and the maintainer validates it in-app.

## Component inventory

**New** (`src/renderer/components/dashboard/`):

- `Bento.tsx` — `Bento` (12-col grid wrapper) + `Tile` (glass `.tile`/`.tile-hover` with a `span` prop → `style={{ gridColumn: 'span N' }}`, optional `rowSpan`). One responsibility: bento layout primitives.
- `HeroBalanceTile.tsx` — eyebrow "Solde net · comptes", big bold figure (reuse the `splitEuro` hero figure pattern), delta + "ce mois", a `sparkPoints` sparkline, and the account list (dot + name + balance, top 4). Accent gradient background (`linear-gradient(155deg, rgba(var(--accent-glow),0.16), var(--surface) 46%)`).
- `SpendingDonutTile.tsx` — eyebrow "Ce mois" / title "Où part l'argent"; reuse `reports/CategoryDonut` fed by `topSpendingCategories(transactions, month)`; center = total sorties; legend of top 5.
- `AccountsMiniTile.tsx` — eyebrow "Comptes" / title "Mes comptes"; list of all accounts (CatChip-style icon, name, bank, balance); a ghost "manage" button → `/accounts`.

**Reused, re-housed into `Tile`** (no logic change): `ChartCard` (span 8), `Kpi` ×2 (span 4 each — Revenus/Dépenses), `Insight` (span 3), `TxTable` (Recent, span 12).

**Data (all already provided by `useDashboard`):** `accounts: AccountSummary[]`, `transactions`, `metrics` (`series`, `balance`), `categories`, `reassign`, `createCategory`. Helpers: `splitEuro`, `sparkPoints`, `topSpendingCategories`, `kpiDelta`, `latestMonth`, `monthLabelFr` (all in `lib/dashboardCharts`); `toAccount`/`toTxRow` (`lib/dashboardMap`).

**Account dot colours:** `AccountSummary` has no stored colour. Derive deterministically from the category swatch palette by index (`--cat-1..15`) in a tiny helper; document it. (Matches the reference's coloured account dots.)

---

## Task 1: Bento + Tile layout primitives

**Files:** Create `src/renderer/components/dashboard/Bento.tsx`; Test `tests/unit/renderer/Bento.test.tsx`.

- [ ] **Step 1 — failing test (jsdom + cleanup):** `Tile` renders children and applies `grid-column: span N`; `Bento` renders a 12-col grid. Assert on inline style `gridColumn` / class.
- [ ] **Step 2** run → fails (module missing).
- [ ] **Step 3 — implement:** `Bento` = `<div className="grid grid-cols-12 items-start gap-4">`. `Tile` = `<div className={cn('tile tile-hover', className)} style={{ gridColumn: \`span ${span}\`, gridRow: rowSpan ? \`span ${rowSpan}\` : undefined, ...style }}>`. Props: `span: number`, `rowSpan?: number`, `pad?`(default via`p-[22px]`), `className?`, `style?`, `children`. Use `cn()`from`lib/utils`.
- [ ] **Step 4** run → passes.
- [ ] **Step 5** commit `feat(aurora): add Bento grid + Tile layout primitives`.

## Task 2: HeroBalanceTile

**Files:** Create `HeroBalanceTile.tsx`; Test `HeroBalanceTile.test.tsx`.

- [ ] **Step 1 — failing test:** given accounts + a balance + series, renders the eyebrow "Solde net · comptes", the formatted balance, and one row per account (top 4) with name + formatted balance.
- [ ] **Step 2** run → fails.
- [ ] **Step 3 — implement:** props `{ balance: number; monthDelta?: {delta;dir}; monthAmount?: number; series: number[]; accounts: Account[] }`. Eyebrow via `<Overline>`; figure via the existing hero pattern (`splitEuro` → bold Geist, `font-sans font-semibold`, `tabular-nums`); `<Spark>`-equivalent sparkline from `sparkPoints(series)` (reuse the `Kpi` spark rendering or extract it); account rows = dot (palette colour by index) + name + `formatBalance`. Accent-gradient background per the canonical tile. Reuse `<Money>`/`formatEuro` for amounts — never hand-roll `Intl`.
- [ ] **Step 4** run → passes.
- [ ] **Step 5** commit `feat(aurora): add HeroBalanceTile`.

## Task 3: SpendingDonutTile

**Files:** Create `SpendingDonutTile.tsx`; Test `SpendingDonutTile.test.tsx`.

- [ ] **Step 1 — failing test:** given transactions + month, renders title "Où part l'argent" and a donut with the top spending categories (assert legend labels present).
- [ ] **Step 2** run → fails.
- [ ] **Step 3 — implement:** compute `topSpendingCategories(transactions, month)`; feed `reports/CategoryDonut` (segments `{key,label,value,color}`); center total = sum; show a legend (top 5). Empty state when no spending: "Pas encore de dépenses ce mois."
- [ ] **Step 4** run → passes.
- [ ] **Step 5** commit `feat(aurora): add SpendingDonutTile (reuses CategoryDonut)`.

## Task 4: AccountsMiniTile

**Files:** Create `AccountsMiniTile.tsx`; Test `AccountsMiniTile.test.tsx`.

- [ ] **Step 1 — failing test:** renders title "Mes comptes" and a row per account (name + bank + balance); the manage button calls `onManage`.
- [ ] **Step 2** run → fails.
- [ ] **Step 3 — implement:** props `{ accounts: Account[]; onManage: () => void }`. Rows: icon chip (palette colour) + name + bank + `<Money kind="plain">`. Ghost button (Lucide `Settings2`) → `onManage`.
- [ ] **Step 4** run → passes.
- [ ] **Step 5** commit `feat(aurora): add AccountsMiniTile`.

## Task 5: Assemble the bento in DashboardPage

**Files:** Modify `src/renderer/pages/DashboardPage.tsx`. (The `AccountTabs` at the top is removed — accounts now live in the Hero + AccountsMini tiles; navigation to a filtered account moves to AccountsMini/Hero rows if desired, else just `/accounts`.)

- [ ] **Step 1 — replace the layout:** swap `AccountTabs` + `KpiGrid` + `Row2` + the recent `Card` for `<Bento>` with the reconciled tiles: `HeroBalanceTile` (span 4, rowSpan 2), `ChartCard` wrapped in `Tile span 8`, two `Kpi` in `Tile span 4`, `SpendingDonutTile` span 5, `Insight` in `Tile span 3`, `AccountsMiniTile` span 4, recent `TxTable` in `Tile span 12`. Relabel hero context per canonical. Keep the `RuleDialog` + reassign wiring intact.
- [ ] **Step 2 — verify build + existing tests:** `npm run typecheck && npm run lint && npx vitest run`. Fix any DashboardPage test that asserted on the old `AccountTabs`/layout (update to the bento structure; note each).
- [ ] **Step 3 — capture + compare:** `npm run screenshots`; open `.screenshots/dark-01-dashboard.png` and `light-01-dashboard.png`; diff against `design_handoff_aurora/screenshots/01-tableau-de-bord.png`. List visual deviations (spans, spacing, gradient now in the wide tile, donut, type sizes).
- [ ] **Step 4 — iterate** on deviations until the bento matches the reference (re-capture each time), including re-judging the **chart gradient** now that it sits in the wide tile.
- [ ] **Step 5** commit `feat(aurora): assemble dashboard bento grid`.

## Task 6: Full verification

- [ ] `npm run lint && npm run typecheck && npx vitest run && npm run build` all green.
- [ ] `grep -rn "fixed inset-0\|Intl.NumberFormat" src/renderer` — no new hits.
- [ ] `npm run screenshots` — dashboard (dark+light) matches reference; other 6 screens unchanged.
- [ ] Maintainer validates the bento in-app (esp. light theme + the gradient verdict) before merge.

## Self-Review notes

- Reuse over rebuild: ChartCard/Kpi/Insight/TxTable/CategoryDonut are re-housed, not rewritten. New code is only the bento primitives + 3 tiles.
- Dropped UpcomingTile (spec §7); row-3/4 rebalance is provisional pending harness + maintainer check.
- Account dot colours derived from the existing `--cat-*` swatch palette (no schema change).
- Acceptance is visual via the harness, not unit assertions — tests guard structure/props only.

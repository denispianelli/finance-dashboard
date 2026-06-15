# Investment tracking — Phase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track investment performance per support — TRI (money-weighted) and TTWROR
(time-weighted) — from user-declared valuations + flows, 100% local. PP-style data model
(wrapper → support → flows → valuations); no network, no quotes (that's Phase B).

**Architecture:** Four new tables (`investment_wrappers`, `investment_supports`,
`support_valuations`, `support_flows`). A pure `performance.ts` computes TTWROR (linked Modified
Dietz) + TRI (IRR via Newton/bisection) from value/flow series. Supports become a fourth
net-worth contributor and allocation holding (reusing #232's `class_id`). Typed IPC + a
« Placements » card with a monthly update flow and a per-support detail view.

**Tech Stack:** Electron + `node:sqlite`, TS strict, Vitest 4, React + shadcn/ui + Tailwind,
Playwright-Electron E2E.

**Spec:** `docs/superpowers/specs/2026-06-15-investment-tracking-phase-a-design.md`
**ADRs:** ADR-009 Amendment 3, ADR-018, ADR-002 amendment.

**Conventions (CLAUDE.md):** TS strict (`no-explicit-any`/`no-unsafe-*` errors,
`noUncheckedIndexedAccess`); SQLite rows `as unknown as Row[]`; money via `lib/euro`/`<Money>`
(never `Intl.NumberFormat`); modals via `ui/dialog` (never `fixed inset-0`); mutating IPC tagged;
unit tests importing a main handler that pulls `electron` must `vi.mock('electron', …)`
(macOS CI flake); branch+PR, self-merge once green, UI validated in-app before merge.

---

## File Structure

- Create `src/main/db/migrations/025_investment_tracking.sql`; register in `migrate.ts`.
- Create `src/shared/types/investment.ts` (all DTOs/types).
- Create `src/main/investment/performance.ts` (pure math) + `investmentRepo.ts` (persistence).
- Modify `src/main/dashboard/consolidated.ts` (net worth) + `assetClassRepo.ts`/`allocation.ts`
  (holdings include supports).
- IPC: `channels.ts`, `handlers/investment.ts`, `register.ts`, `src/shared/types/ipc.ts`.
- Renderer: `hooks/usePlacements.ts`; `components/patrimoine/{PlacementsCard,SupportDetailDialog,
WrapperDialog,UpdateSupportDialog}.tsx`; mount in `pages/PatrimoinePage.tsx`.
- Tests under `tests/unit/...` and `tests/e2e/...`.

---

## Task 1: Migration 025 + shared types

**Files:** Create `src/main/db/migrations/025_investment_tracking.sql`; modify
`src/main/db/migrate.ts`; create `src/shared/types/investment.ts`.

- [ ] **Step 1: Migration SQL** — `025_investment_tracking.sql`:

```sql
-- Investment tracking (ADR-009 Amd 3, Phase A): wrappers → supports → declared
-- valuations + flows. 100% local; no quotes/prices (Phase B).
CREATE TABLE investment_wrappers (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,                 -- 'pea' | 'av' | 'cto' | 'other'
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE investment_supports (
  id             TEXT PRIMARY KEY,
  wrapper_id     TEXT NOT NULL REFERENCES investment_wrappers(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  isin           TEXT,
  valuation_mode TEXT NOT NULL DEFAULT 'declared',
  class_id       TEXT REFERENCES asset_classes(id) ON DELETE SET NULL,
  currency       TEXT NOT NULL DEFAULT 'EUR',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE support_valuations (
  id         TEXT PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  as_of      TEXT NOT NULL,
  value      REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_valuations ON support_valuations(support_id, as_of);

CREATE TABLE support_flows (
  id         TEXT PRIMARY KEY,
  support_id TEXT NOT NULL REFERENCES investment_supports(id) ON DELETE CASCADE,
  flow_date  TEXT NOT NULL,
  amount     REAL NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_support_flows ON support_flows(support_id, flow_date);
```

- [ ] **Step 2: Register** in `migrate.ts`: `import sql025 from './migrations/025_investment_tracking.sql?raw';` and `{ version: 25, sql: sql025 },` after version 24. (Additive — no `rebuildsTables`.)

- [ ] **Step 3: Types** — `src/shared/types/investment.ts`:

```ts
export type WrapperType = 'pea' | 'av' | 'cto' | 'other';

export interface WrapperDTO {
  id: string;
  name: string;
  type: WrapperType;
  sortOrder: number;
}

export interface SupportDTO {
  id: string;
  wrapperId: string;
  name: string;
  isin: string | null;
  classId: string | null;
  currency: string;
  sortOrder: number;
  currentValue: number; // latest valuation, 0 if none yet
}

export interface DatedValue {
  date: string; // ISO yyyy-mm-dd
  value: number;
}
export interface DatedFlow {
  date: string; // ISO yyyy-mm-dd
  amount: number; // + contribution, − withdrawal
}

/** Performance of a support or an aggregate. All return figures are fractions (0.064 = 6.4%). */
export interface Performance {
  startDate: string | null; // first valuation date
  endDate: string | null; // last valuation date
  currentValue: number;
  netInvested: number; // opening value + Σ flows
  absoluteGain: number; // currentValue − netInvested
  ttworrCumulative: number | null; // since inception
  ttworrAnnual: number | null; // null when < 1 year of history
  triAnnual: number | null; // IRR; null when < 1 year or unsolvable
  hasFullYear: boolean;
}

export interface CreateWrapperInput {
  name: string;
  type: WrapperType;
}
export interface CreateSupportInput {
  wrapperId: string;
  name: string;
  isin: string | null;
  classId: string | null;
}
/** One monthly update: a valuation, and optionally the net flow since last time. */
export interface SupportUpdateInput {
  supportId: string;
  asOf: string; // ISO
  value: number;
  flow: number; // 0 if none
}

/** A support plus its computed performance, for the card. */
export interface SupportWithPerf extends SupportDTO {
  perf: Performance;
}
export interface WrapperWithSupports extends WrapperDTO {
  supports: SupportWithPerf[];
  perf: Performance; // aggregated
}
export interface SupportHistory {
  valuations: DatedValue[];
  flows: DatedFlow[];
}
```

- [ ] **Step 4:** `npm run typecheck` → clean. **Step 5:** commit `feat(investment): migration 025 + shared types`.

---

## Task 2: Performance math (`performance.ts`) — TDD, the rigor core

**Files:** Create `src/main/investment/performance.ts`; `tests/unit/investment/performance.test.ts`.

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment node`). Cover the spec's
      cross-checks exactly:

```ts
import { describe, it, expect } from 'vitest';
import { computePerformance, irr } from '../../../src/main/investment/performance';
import type { DatedValue, DatedFlow } from '@shared/types/investment';

describe('performance', () => {
  it('lump sum, no flows: TRI annual = CAGR, and TRI≈TTWROR', () => {
    const vals: DatedValue[] = [
      { date: '2022-01-01', value: 10000 },
      { date: '2024-01-01', value: 12100 }, // +21% over 2 years → 10%/yr
    ];
    const perf = computePerformance(vals, []);
    expect(perf.triAnnual).toBeCloseTo(0.1, 3);
    expect(perf.ttworrAnnual).toBeCloseTo(0.1, 3);
    expect(perf.ttworrCumulative).toBeCloseTo(0.21, 3);
    expect(perf.hasFullYear).toBe(true);
  });

  it('flat (value = invested): returns are 0', () => {
    const vals: DatedValue[] = [
      { date: '2022-01-01', value: 1000 },
      { date: '2023-06-01', value: 2000 },
    ];
    const flows: DatedFlow[] = [{ date: '2022-07-01', value: 1000 } as unknown as DatedFlow];
    // 1000 start + 1000 contributed = 2000 end, no gain
    const perf = computePerformance(vals, [{ date: '2022-07-01', amount: 1000 }]);
    expect(perf.absoluteGain).toBeCloseTo(0, 6);
    expect(perf.ttworrCumulative).toBeCloseTo(0, 6);
  });

  it('short history (< 1 year): annualised figures are null, cumulative present', () => {
    const vals: DatedValue[] = [
      { date: '2024-01-01', value: 1000 },
      { date: '2024-03-01', value: 1050 },
    ];
    const perf = computePerformance(vals, []);
    expect(perf.hasFullYear).toBe(false);
    expect(perf.ttworrAnnual).toBeNull();
    expect(perf.triAnnual).toBeNull();
    expect(perf.ttworrCumulative).toBeCloseTo(0.05, 4);
  });

  it('irr solves a simple two-flow case', () => {
    // invest 1000 at t0, +1100 one year later → 10%
    const r = irr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 1100 },
    ]);
    expect(r).toBeCloseTo(0.1, 3);
  });

  it('returns null perf fields when fewer than 2 valuations', () => {
    const perf = computePerformance([{ date: '2024-01-01', value: 1000 }], []);
    expect(perf.ttworrCumulative).toBeNull();
    expect(perf.triAnnual).toBeNull();
    expect(perf.currentValue).toBe(1000);
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Implement** `src/main/investment/performance.ts`:

```ts
import type { DatedValue, DatedFlow, Performance } from '@shared/types/investment';

const MS_PER_DAY = 86_400_000;
const days = (a: string, b: string): number => (Date.parse(b) - Date.parse(a)) / MS_PER_DAY;
const years = (a: string, b: string): number => days(a, b) / 365;

export interface Cashflow {
  date: string;
  amount: number;
}

/** Internal rate of return (annualised), or null if unsolvable. Newton-Raphson with a
 *  bisection fallback on [-0.9999, 10]. Cashflows: investor perspective (invest negative). */
export function irr(cfs: Cashflow[]): number | null {
  if (cfs.length < 2) return null;
  const t0 = cfs[0]!.date;
  const npv = (r: number): number =>
    cfs.reduce((s, cf) => s + cf.amount / Math.pow(1 + r, years(t0, cf.date)), 0);
  const dnpv = (r: number): number =>
    cfs.reduce((s, cf) => {
      const y = years(t0, cf.date);
      return s - (y * cf.amount) / Math.pow(1 + r, y + 1);
    }, 0);

  // Newton-Raphson.
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(r);
    if (Math.abs(f) < 1e-7) return r;
    const d = dnpv(r);
    if (d === 0) break;
    const next = r - f / d;
    if (!Number.isFinite(next)) break;
    r = Math.max(next, -0.9999);
  }
  // Bisection fallback.
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo * fhi > 0) return null; // no sign change
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < 1e-7) return mid;
    if (flo * fmid < 0) hi = mid;
    else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

/** Compute TRI + TTWROR + gains from a support's (declared) valuation and flow series. */
export function computePerformance(
  valuationsRaw: DatedValue[],
  flowsRaw: DatedFlow[],
): Performance {
  const valuations = [...valuationsRaw].sort((a, b) => a.date.localeCompare(b.date));
  const flows = [...flowsRaw].sort((a, b) => a.date.localeCompare(b.date));

  const currentValue = valuations.at(-1)?.value ?? 0;
  const openingValue = valuations[0]?.value ?? 0;
  const flowSum = flows.reduce((s, f) => s + f.amount, 0);
  const netInvested = openingValue + flowSum;
  const absoluteGain = currentValue - netInvested;

  const empty: Performance = {
    startDate: valuations[0]?.date ?? null,
    endDate: valuations.at(-1)?.date ?? null,
    currentValue,
    netInvested,
    absoluteGain,
    ttworrCumulative: null,
    ttworrAnnual: null,
    triAnnual: null,
    hasFullYear: false,
  };
  if (valuations.length < 2) return empty;

  const startDate = valuations[0]!.date;
  const endDate = valuations.at(-1)!.date;
  const totalDays = days(startDate, endDate);
  const hasFullYear = totalDays >= 365;

  // TTWROR — linked Modified Dietz across consecutive valuation sub-periods.
  let product = 1;
  for (let k = 1; k < valuations.length; k++) {
    const v0 = valuations[k - 1]!;
    const v1 = valuations[k]!;
    const span = days(v0.date, v1.date);
    if (span <= 0) continue;
    const sub = flows.filter((f) => f.date > v0.date && f.date <= v1.date);
    const netFlow = sub.reduce((s, f) => s + f.amount, 0);
    const weighted = sub.reduce((s, f) => s + f.amount * (days(f.date, v1.date) / span), 0);
    const denom = v0.value + weighted;
    const r = denom === 0 ? 0 : (v1.value - v0.value - netFlow) / denom;
    product *= 1 + r;
  }
  const ttworrCumulative = product - 1;
  const ttworrAnnual = hasFullYear ? Math.pow(product, 365 / totalDays) - 1 : null;

  // TRI — IRR over investor cashflows; annualised by construction → only surfaced ≥ 1 year.
  const cfs: Cashflow[] = [
    { date: startDate, amount: -openingValue },
    ...flows.map((f) => ({ date: f.date, amount: -f.amount })),
    { date: endDate, amount: currentValue },
  ].filter((cf) => cf.amount !== 0);
  const triAnnual = hasFullYear ? irr(cfs) : null;

  return {
    startDate,
    endDate,
    currentValue,
    netInvested,
    absoluteGain,
    ttworrCumulative,
    ttworrAnnual,
    triAnnual,
    hasFullYear,
  };
}
```

- [ ] **Step 3:** run tests → PASS. **Step 4:** `npm run typecheck`. **Step 5:** commit
      `feat(investment): TRI/TTWROR performance math with cross-check tests`.

---

## Task 3: `investmentRepo` — persistence

**Files:** Create `src/main/investment/investmentRepo.ts`; `tests/unit/investment/investmentRepo.test.ts`.

- [ ] **Step 1: Failing test** — bootstrap `new DatabaseSync(':memory:'); runMigrations(db);`
      (see `tests/unit/patrimoine/matchPayments.test.ts`). Assert: create wrapper → create support →
      addValuation ×2 + addFlow → `listWrappers` returns the wrapper with the support, the support's
      `currentValue` = latest valuation, and `getSupportHistory` returns both series. Assert
      `deleteWrapper` cascades (support + history gone).

- [ ] **Step 2: Implement** `investmentRepo.ts` with functions (mirror `assetClassRepo.ts` style,
      `as unknown as Row[]`, `randomUUID`):

```ts
createWrapper(db, input: CreateWrapperInput): WrapperDTO
listWrapperRows(db): WrapperDTO[]                       // ordered by sort_order, created_at
deleteWrapper(db, id): void                             // PRAGMA foreign_keys=ON; cascade
createSupport(db, input: CreateSupportInput): SupportDTO
deleteSupport(db, id): void
addValuation(db, supportId, asOf, value): void          // INSERT a support_valuations row
addFlow(db, supportId, flowDate, amount, note?): void   // INSERT a support_flows row (skip if amount===0)
applyUpdate(db, input: SupportUpdateInput): void        // addValuation + (flow!==0 ? addFlow)
getSupportHistory(db, supportId): SupportHistory        // {valuations:DatedValue[], flows:DatedFlow[]}
latestValuation(db, supportId): number                  // max as_of value, 0 if none
listSupportRows(db, wrapperId?): SupportDTO[]            // with currentValue via subquery/latestValuation
```

`createWrapper`/`createSupport` set `sort_order = MAX+1`. `SupportDTO.currentValue` comes from
the latest `support_valuations.value` (subquery `ORDER BY as_of DESC LIMIT 1`, COALESCE 0).

- [ ] **Step 3:** tests PASS; **Step 4:** typecheck; **Step 5:** commit `feat(investment): investment repo`.

---

## Task 4: Net-worth + allocation integration

**Files:** modify `src/main/dashboard/consolidated.ts`, `src/main/patrimoine/assetClassRepo.ts`,
`src/main/patrimoine/allocation.ts`; tests `tests/unit/investment/integration.test.ts`.

- [ ] **Step 1: Failing test** — seed a wrapper+support with a latest valuation V and a class C;
      assert `getNetWorth(db).total` includes V; assert `getAllocation(db)` puts V in class C's slice
      and still reconciles (`total === getNetWorth().total`); assert `listHoldings` includes the support
      with `kind:'support'`.

- [ ] **Step 2: Net worth** — in `consolidated.ts` `getNetWorth`, add the supports' latest
      valuations to the total and to a new `supports` breakdown array (mirror the `assets` block). Read
      each support's latest valuation (`investmentRepo.listSupportRows` or a direct query). Add to
      `NetWorth` type a `supports: { supportId; name; value }[]` field (in `src/shared/types/dashboard.ts`).

- [ ] **Step 3: Allocation** — extend `ClassifiableHolding.kind` to include `'support'` (in
      `src/shared/types/patrimoine.ts`), and in `assetClassRepo.ts`: `listHoldings` also returns
      supports (`signedValue` = latest valuation, `classId` from the support); `assignClass`'s
      `TABLE_BY_KIND` gains `support: 'investment_supports'`. In `allocation.ts` `getAllocation`, add a
      loop over supports contributing `latestValuation` to their class bucket (rounded, like assets).
      Reconciliation must still hold (a test asserts `total === getNetWorth().total`).

- [ ] **Step 4:** tests PASS (incl. existing allocation/netWorth suites — run
      `npx vitest run tests/unit/patrimoine/`); typecheck. **Step 5:** commit
      `feat(investment): supports feed net worth + allocation`.

---

## Task 5: IPC wiring

**Files:** `channels.ts`, `handlers/investment.ts`, `register.ts`, `src/shared/types/ipc.ts`;
test `tests/unit/ipc/investment.test.ts`.

- [ ] **Step 1:** Add channels + contract entries (mirror the patrimoine block; mutating ones go
      in `register.ts`'s mutating array):

| channel                        | payload              | response                              | mutating |
| ------------------------------ | -------------------- | ------------------------------------- | -------- |
| `investment:listWrappers`      | `{}`                 | `{ wrappers: WrapperWithSupports[] }` | no       |
| `investment:getSupportHistory` | `{ supportId }`      | `{ history: SupportHistory }`         | no       |
| `investment:createWrapper`     | `CreateWrapperInput` | `{ wrapper: WrapperDTO }`             | **yes**  |
| `investment:deleteWrapper`     | `{ id }`             | `{ ok: true }`                        | **yes**  |
| `investment:createSupport`     | `CreateSupportInput` | `{ support: SupportDTO }`             | **yes**  |
| `investment:deleteSupport`     | `{ id }`             | `{ ok: true }`                        | **yes**  |
| `investment:updateSupport`     | `SupportUpdateInput` | `{ ok: true }`                        | **yes**  |

- [ ] **Step 2: Handlers** `handlers/investment.ts` — `handleInvestmentListWrappers` builds
      `WrapperWithSupports[]`: for each wrapper, list its supports, and for each support compute
      `perf = computePerformance(history.valuations, history.flows)`; the wrapper `perf` = pooled
      (concatenate all supports' flows; sum valuations by date — for Phase A, sum each support's latest
      and earliest; simplest correct pooling: merge all supports' valuation series by summing values on
      shared dates is complex, so for the **aggregate** pool flows and build a combined valuation series
      by summing, per date, each support's latest-known value as-of that date). KISS note: if combined
      valuation alignment is hard, the wrapper aggregate may sum supports' `currentValue`/`absoluteGain`
      and report TRI from pooled cashflows + combined current value, leaving TTWROR aggregate optional;
      document whatever is implemented. (Per-support perf is the must-have; wrapper aggregate is
      secondary.)

- [ ] **Step 3:** register; mock-electron handler test (empty list; create wrapper→support→update→
      listWrappers shows currentValue + a perf object). **Step 4:** typecheck + `npx vitest run tests/unit/ipc/`.
      **Step 5:** commit `feat(investment): IPC`.

---

## Task 6: Renderer — Placements card, update flow, detail view

**Files:** create `hooks/usePlacements.ts`, `components/patrimoine/{PlacementsCard,WrapperDialog,
UpdateSupportDialog,SupportDetailDialog}.tsx`; modify `pages/PatrimoinePage.tsx`; test
`tests/unit/renderer/PlacementsCard.test.tsx`.

- [ ] **Step 1: Hook** `usePlacements(refreshToken)` — loads `investment:listWrappers`; actions
      `createWrapper`, `deleteWrapper`, `createSupport`, `deleteSupport`, `updateSupport`,
      `getSupportHistory`; each mutation invokes IPC then reloads. Mirror `usePatrimoine`.

- [ ] **Step 2: Failing render test** — `PlacementsCard` given a `WrapperWithSupports[]` fixture
      renders each wrapper + support name + current value; for a support with `hasFullYear:false`
      the row shows the cumulative return labelled « depuis l'origine » and **no** annualised %; for
      `hasFullYear:true` it shows the annualised TRI/TTWROR. (jsdom + `afterEach(cleanup)`.)

- [ ] **Step 3: Build components** (only `ui/*` primitives, `lib/euro` incl. `formatPercent`,
      Lucide; no `Intl.NumberFormat`/`fixed inset-0`):
  - **PlacementsCard**: own `Card`, overline (next free numeral), title « Placements », "Ajouter
    une enveloppe" button. Per wrapper: name + aggregate value; per support row: name, `<Money>`
    current value, and the **returns per the display rule** — `hasFullYear ? formatPercent(triAnnual)+" /an"` (TRI) and TTWROR annual, else `formatPercent(ttworrCumulative)+" depuis l'origine"`; colour sage/coral by sign. Row actions: "Mettre à jour" (opens UpdateSupportDialog), open detail, delete.
  - **WrapperDialog** (`ui/dialog`): create a wrapper (name + type select pea/av/cto/other) and,
    inside it, add supports (name + optional ISIN + class select reusing the allocation classes).
  - **UpdateSupportDialog**: the monthly update — date (default today), new value, net flow since
    last (default 0). Calls `updateSupport`.
  - **SupportDetailDialog**: the verification surface — the full valuation + flow history table
    (dates, values, flows) and the computed TRI/TTWROR (annual + cumulative) with the cashflow
    list. Read via `getSupportHistory`.
  - Delete uses the inline-confirm pattern (mirror `AssetsCard`).

- [ ] **Step 4: Mount** in `PatrimoinePage.tsx`: pull placements from the hook, render
      `<PlacementsCard>` (after Allocation, before/after Actifs — pick order, renumber overlines I…N),
      wire dialogs; every mutation calls `notifyDataChanged()` so sidebar net worth + allocation refresh.

- [ ] **Step 5:** render test PASS; `npm run typecheck && npm run lint`; grep clean
      (`fixed inset-0\|new Intl.NumberFormat` in new files). **Step 6:** commit
      `feat(investment): placements card, update flow, detail view`.

---

## Task 7: E2E + docs + gate

**Files:** create `tests/e2e/investment-flow.test.ts`; modify `README.md`, `CLAUDE.md` (scope
pointer if needed).

- [ ] **Step 1: E2E** (mirror `tests/e2e/patrimoine-allocation.test.ts`): via IPC create a wrapper

* support, apply two updates a year apart (value + flow), navigate to Patrimoine, assert the
  support shows an annualised return; assert net worth reflects the support value. Synthetic data only.

- [ ] **Step 2:** run `xvfb-run -a npm run test:e2e -- investment`.
- [ ] **Step 3:** README — add a bullet: per-support investment performance (TRI/TTWROR) from
      declared valuations + flows, 100% local; note the opt-in price feed is Phase B (ADR-018).
- [ ] **Step 4: Full gate** — `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] **Step 5:** commit `test(investment): e2e + document phase A`.

---

## Definition of done

Lint/tsc clean, unit + E2E green, build OK, audit grep clean. **UI validated in-app before merge**
(visual brick): create your PEA + AV wrappers and their supports, enter two monthly updates, and
verify a support's TTWROR sub-period return by hand against the history table, and that net worth +
allocation include the supports.

## Validation script (maintainer, in-app)

1. Placements → add wrapper « PEA » → add support « World ETF » (class Actions).
2. Add wrapper « AV » → supports « Fonds € » (class Fonds €/Oblig) + « World UC » (class Actions).
3. For one support, enter two valuations a month apart with a contribution between → check the
   monthly return = `valeur_fin / (valeur_début + flux) − 1` by hand against the detail table.
4. Check the support shows « depuis l'origine » (not an annualised %) while under 1 year.
5. Check the sidebar net worth increased by the supports' value, and the allocation card now
   counts them in their classes (reconciles to the cent).

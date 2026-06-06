# F1 — Consolidation + transfer exclusion (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the consolidated, transfer-aware data backbone — net worth across all accounts, and consolidated cash flow by month and by year — that US1/US2/US3 read.

**Architecture:** Two pure query functions in the main process over the existing SQLite schema. Net worth reuses the ADR-014 anchored balance (`getAccountSummaries`); cash flow reuses the ADR-006 internal-transfer rule, extracted from `metrics.ts` into one shared SQL predicate so both queries stay DRY. Surfaced through two new typed IPC channels. **No schema change, no renderer I/O.**

**Tech Stack:** TypeScript (strict), `node:sqlite` (`DatabaseSync`), Electron typed IPC contract, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-mvp-personal-finance-design.md` (brick F1).

---

## File structure

- Create `src/main/dashboard/transferFilter.ts` — single source of the `cat-transferts` / `is_internal_transfer` exclusion predicate.
- Modify `src/main/dashboard/metrics.ts` — import that predicate instead of its private copy (DRY).
- Create `src/main/dashboard/consolidated.ts` — `getConsolidatedCashflow` + `getNetWorth`.
- Modify `src/shared/types/dashboard.ts` — `CashflowPoint`, `CashflowGranularity`, `NetWorthAccount`, `NetWorth`.
- Modify `src/main/ipc/channels.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/register.ts` — wire two channels.
- Create `src/main/ipc/handlers/dashboardConsolidated.ts` — two thin handlers.
- Create `tests/unit/dashboard/consolidated.test.ts` and `tests/unit/ipc/dashboardConsolidated.test.ts`.

Invariant checks each commit: `npx tsc --noEmit` clean, `npx eslint .` clean (no `any`/unsafe), targeted Vitest green.

---

### Task 1: Extract the internal-transfer predicate (DRY refactor, stay green)

**Files:**

- Create: `src/main/dashboard/transferFilter.ts`
- Modify: `src/main/dashboard/metrics.ts:6-12`

- [ ] **Step 1: Create the shared predicate module**

```typescript
// src/main/dashboard/transferFilter.ts

/** The seeded internal-transfers category. A transfer moves your own money
 *  between your accounts — it is neither income nor spending, so it is kept out
 *  of every income/expense figure. */
export const TRANSFER_CATEGORY = 'cat-transferts';

/** SQL predicate (for a WHERE/CASE clause over `transactions`) selecting rows
 *  that are NOT an internal transfer. Written affirmatively rather than NOT(...)
 *  to avoid SQLite three-valued logic when `category_id` is NULL. */
export const NOT_TRANSFER = `is_internal_transfer = 0 AND (category_id IS NULL OR category_id != '${TRANSFER_CATEGORY}')`;
```

- [ ] **Step 2: Point `metrics.ts` at the shared predicate**

In `src/main/dashboard/metrics.ts`, delete the local `TRANSFER_CATEGORY` and `NOT_TRANSFER` declarations (the block at lines 6-12) and add this import at the top:

```typescript
import { NOT_TRANSFER } from './transferFilter';
```

- [ ] **Step 3: Verify nothing regressed**

Run: `npx vitest run tests/unit/dashboard/metrics.test.ts`
Expected: PASS (same behaviour, predicate now imported).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/dashboard/transferFilter.ts src/main/dashboard/metrics.ts
git commit -m "refactor(dashboard): extract internal-transfer predicate to one module"
```

---

### Task 2: `getConsolidatedCashflow` — income/expense/net across ALL accounts, by month and by year

The core of US1's "gained/lost". Aggregates every account together; transfers excluded; grouped by `month` (`yyyy-mm`) or `year` (`yyyy`).

**Files:**

- Create: `src/main/dashboard/consolidated.ts`
- Test: `tests/unit/dashboard/consolidated.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/dashboard/consolidated.test.ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getConsolidatedCashflow } from '../../../src/main/dashboard/consolidated';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('perso', 'Perso', 'checking')").run();
  db.prepare(
    "INSERT INTO accounts (id, name, type) VALUES ('livret', 'Livret A', 'savings')",
  ).run();
  return db;
}

let txSeq = 0;
function seedTx(
  db: DatabaseSync,
  account: string,
  date: string,
  amount: number,
  opts: { transfer?: boolean; categoryId?: string } = {},
): void {
  txSeq += 1;
  const id = `t${String(txSeq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, is_internal_transfer, category_id)
     VALUES (?, ?, ?, ?, ?, 'x', 'X', ?, ?)`,
  ).run(id, account, id, date, amount, opts.transfer ? 1 : 0, opts.categoryId ?? null);
}

describe('getConsolidatedCashflow', () => {
  it('returns an empty series when there are no transactions', () => {
    const db = freshDb();
    expect(getConsolidatedCashflow(db, 'month')).toEqual([]);
    db.close();
  });

  it('sums income/expense/net across all accounts per month', () => {
    const db = freshDb();
    seedTx(db, 'perso', '2026-04-10', 2000); // income
    seedTx(db, 'perso', '2026-04-15', -500); // expense
    seedTx(db, 'livret', '2026-04-20', 30); // interest, income on another account

    const series = getConsolidatedCashflow(db, 'month');
    expect(series).toEqual([{ period: '2026-04', income: 2030, expense: -500, net: 1530 }]);
    db.close();
  });

  it('excludes internal transfers (flagged or cat-transferts) from income and expense', () => {
    const db = freshDb();
    seedTx(db, 'perso', '2026-04-10', 2000); // real income
    seedTx(db, 'perso', '2026-04-12', -500, { transfer: true }); // transfer out (flagged)
    seedTx(db, 'livret', '2026-04-12', 500, { transfer: true }); // transfer in (flagged)
    seedTx(db, 'perso', '2026-04-13', -100, { categoryId: 'cat-transferts' }); // transfer via category

    const series = getConsolidatedCashflow(db, 'month');
    // Only the 2000 income survives; none of the 500/500/100 transfer legs count.
    expect(series).toEqual([{ period: '2026-04', income: 2000, expense: 0, net: 2000 }]);
    db.close();
  });

  it('groups by calendar year when granularity is "year"', () => {
    const db = freshDb();
    seedTx(db, 'perso', '2025-03-01', 1000);
    seedTx(db, 'perso', '2025-09-01', -400);
    seedTx(db, 'perso', '2026-02-01', 2000);
    seedTx(db, 'perso', '2026-08-01', -1500);

    const series = getConsolidatedCashflow(db, 'year');
    expect(series).toEqual([
      { period: '2025', income: 1000, expense: -400, net: 600 },
      { period: '2026', income: 2000, expense: -1500, net: 500 },
    ]);
    db.close();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/dashboard/consolidated.test.ts`
Expected: FAIL — `getConsolidatedCashflow` is not exported / module missing.

- [ ] **Step 3: Implement `getConsolidatedCashflow`**

```typescript
// src/main/dashboard/consolidated.ts
import type { DatabaseSync } from 'node:sqlite';
import type { CashflowGranularity, CashflowPoint } from '@shared/types/dashboard';
import { NOT_TRANSFER } from './transferFilter';

interface CashflowRow {
  period: string;
  income: number;
  expense: number;
}

/**
 * Income / expense / net across ALL accounts, grouped by calendar month
 * (`yyyy-mm`) or year (`yyyy`). Internal transfers (flagged or categorised as
 * `cat-transferts`) are excluded — they move your own money, they are neither
 * income nor spending. `expense` is negative or zero; `net = income + expense`.
 */
export function getConsolidatedCashflow(
  db: DatabaseSync,
  granularity: CashflowGranularity,
): CashflowPoint[] {
  const periodExpr = granularity === 'year' ? 'substr(date, 1, 4)' : 'substr(date, 1, 7)';
  const rows = db
    .prepare(
      `SELECT ${periodExpr} AS period,
              COALESCE(SUM(CASE WHEN amount >= 0 AND ${NOT_TRANSFER} THEN amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN amount <  0 AND ${NOT_TRANSFER} THEN amount ELSE 0 END), 0) AS expense
       FROM transactions
       GROUP BY period
       ORDER BY period ASC`,
    )
    .all() as unknown as CashflowRow[];

  return rows.map((r) => ({
    period: r.period,
    income: r.income,
    expense: r.expense,
    net: r.income + r.expense,
  }));
}
```

- [ ] **Step 4: Add the types** in `src/shared/types/dashboard.ts` (append at end):

```typescript
/** Month (`yyyy-mm`) or calendar-year (`yyyy`) bucketing for consolidated cash flow. */
export type CashflowGranularity = 'month' | 'year';

/** One period of consolidated cash flow across all accounts (transfers excluded). */
export interface CashflowPoint {
  /** `yyyy-mm` for month granularity, `yyyy` for year. */
  readonly period: string;
  /** Sum of positive amounts (income) in the period. */
  readonly income: number;
  /** Sum of negative amounts (expenses) in the period — negative or zero. */
  readonly expense: number;
  /** `income + expense` — the period's net gain/loss. */
  readonly net: number;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/dashboard/consolidated.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/main/dashboard/consolidated.ts src/shared/types/dashboard.ts tests/unit/dashboard/consolidated.test.ts
git commit -m "feat(dashboard): consolidated cash flow by month/year, transfers excluded"
```

---

### Task 3: `getNetWorth` — sum of real account balances ("accounts as a whole")

The backbone of US2's consolidated net. Reuses `getAccountSummaries` (ADR-014) so the anchored-balance logic lives in exactly one place. Accounts with no anchor have `balance: null` (F2 will fill these with a declared balance); for now they contribute 0 to the total but are listed so the UI can flag them.

**Files:**

- Modify: `src/main/dashboard/consolidated.ts`
- Modify: `src/shared/types/dashboard.ts`
- Test: `tests/unit/dashboard/consolidated.test.ts`

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/dashboard/consolidated.test.ts`)

```typescript
import { getNetWorth } from '../../../src/main/dashboard/consolidated';

function seedValidatedImport(
  db: DatabaseSync,
  account: string,
  closingBalance: number,
  closingDate: string,
): void {
  txSeq += 1;
  const id = `imp${String(txSeq)}`;
  db.prepare(
    `INSERT INTO imports
       (id, account_id, file_hash, source_type, date_range_start, date_range_end,
        status, closing_balance, closing_balance_date)
     VALUES (?, ?, ?, 'ofx', ?, ?, 'validated', ?, ?)`,
  ).run(id, account, id, closingDate, closingDate, closingBalance, closingDate);
}

describe('getNetWorth', () => {
  it('is zero with no accounts data', () => {
    const db = freshDb();
    expect(getNetWorth(db)).toEqual({ total: 0, accounts: [] });
    db.close();
  });

  it('sums anchored balances and lists each account', () => {
    const db = freshDb();
    seedValidatedImport(db, 'perso', 1200, '2026-04-30');
    seedValidatedImport(db, 'livret', 8000, '2026-04-30');

    const result = getNetWorth(db);
    expect(result.total).toBe(9200);
    expect(result.accounts).toEqual(
      expect.arrayContaining([
        { accountId: 'perso', name: 'Perso', balance: 1200 },
        { accountId: 'livret', name: 'Livret A', balance: 8000 },
      ]),
    );
    db.close();
  });

  it('treats an unanchored account as null balance contributing 0 to the total', () => {
    const db = freshDb();
    seedValidatedImport(db, 'perso', 1200, '2026-04-30');
    // 'livret' has no validated import with a closing balance → null balance.

    const result = getNetWorth(db);
    expect(result.total).toBe(1200);
    expect(result.accounts).toContainEqual({
      accountId: 'livret',
      name: 'Livret A',
      balance: null,
    });
    db.close();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/dashboard/consolidated.test.ts -t getNetWorth`
Expected: FAIL — `getNetWorth` not exported.

- [ ] **Step 3: Implement `getNetWorth`** (append to `src/main/dashboard/consolidated.ts`)

```typescript
import type { NetWorth } from '@shared/types/dashboard';
import { getAccountSummaries } from './queries';

/**
 * Consolidated net worth: the sum of every account's real balance (ADR-014).
 * Unanchored accounts carry `balance: null` and contribute 0 to the total; they
 * are still listed so the UI can surface "declare a balance" (brick F2). No
 * market valuation, no network — balances come only from imported statements.
 */
export function getNetWorth(db: DatabaseSync): NetWorth {
  const accounts = getAccountSummaries(db);
  const total = accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0);
  return {
    total,
    accounts: accounts.map((a) => ({ accountId: a.id, name: a.name, balance: a.balance })),
  };
}
```

- [ ] **Step 4: Add the types** in `src/shared/types/dashboard.ts` (append):

```typescript
/** One account's contribution to net worth. `balance` is null when unanchored. */
export interface NetWorthAccount {
  readonly accountId: string;
  readonly name: string;
  readonly balance: number | null;
}

/** Consolidated net worth: total of all account balances plus the per-account breakdown. */
export interface NetWorth {
  /** Sum of non-null account balances. */
  readonly total: number;
  readonly accounts: NetWorthAccount[];
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run tests/unit/dashboard/consolidated.test.ts`
Expected: PASS (all consolidated tests, 7 total).

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/main/dashboard/consolidated.ts src/shared/types/dashboard.ts tests/unit/dashboard/consolidated.test.ts
git commit -m "feat(dashboard): net worth as the sum of real account balances"
```

---

### Task 4: Expose `dashboard:cashflow` and `dashboard:netWorth` over IPC

**Files:**

- Modify: `src/main/ipc/channels.ts:14` (after `dashboardMetrics`)
- Modify: `src/shared/types/ipc.ts` (imports + `IpcContract`)
- Create: `src/main/ipc/handlers/dashboardConsolidated.ts`
- Modify: `src/main/ipc/register.ts`
- Test: `tests/unit/ipc/dashboardConsolidated.test.ts`

- [ ] **Step 1: Write the failing handler tests**

```typescript
// tests/unit/ipc/dashboardConsolidated.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';

const db = { __fake: true };
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const cashflow = [{ period: '2026', income: 1000, expense: -400, net: 600 }];
const netWorth = { total: 1200, accounts: [{ accountId: 'perso', name: 'Perso', balance: 1200 }] };
const getConsolidatedCashflow = vi.fn(() => cashflow);
const getNetWorth = vi.fn(() => netWorth);
vi.mock('../../../src/main/dashboard/consolidated', () => ({
  getConsolidatedCashflow: (...a: unknown[]) => getConsolidatedCashflow(...a),
  getNetWorth: (...a: unknown[]) => getNetWorth(...a),
}));

import {
  handleDashboardCashflow,
  handleDashboardNetWorth,
} from '../../../src/main/ipc/handlers/dashboardConsolidated';

afterEach(() => {
  vi.clearAllMocks();
});

describe('dashboard consolidated handlers', () => {
  it('cashflow handler passes the granularity through and returns the series', () => {
    const res = handleDashboardCashflow({ granularity: 'year' });
    expect(getConsolidatedCashflow).toHaveBeenCalledWith(db, 'year');
    expect(res).toEqual({ series: cashflow });
  });

  it('net worth handler returns the consolidated total', () => {
    const res = handleDashboardNetWorth();
    expect(getNetWorth).toHaveBeenCalledWith(db);
    expect(res).toEqual(netWorth);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/ipc/dashboardConsolidated.test.ts`
Expected: FAIL — handler module does not exist.

- [ ] **Step 3: Create the handlers**

```typescript
// src/main/ipc/handlers/dashboardConsolidated.ts
import type { CashflowGranularity, CashflowPoint, NetWorth } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { getConsolidatedCashflow, getNetWorth } from '../../dashboard/consolidated';

export function handleDashboardCashflow(payload: { granularity: CashflowGranularity }): {
  series: CashflowPoint[];
} {
  return { series: getConsolidatedCashflow(getDb(), payload.granularity) };
}

export function handleDashboardNetWorth(): NetWorth {
  return getNetWorth(getDb());
}
```

- [ ] **Step 4: Add the channels** in `src/main/ipc/channels.ts` (after the `dashboardMetrics` line):

```typescript
  dashboardCashflow: 'dashboard:cashflow',
  dashboardNetWorth: 'dashboard:netWorth',
```

- [ ] **Step 5: Extend the IPC contract** in `src/shared/types/ipc.ts`.

Add `CashflowGranularity`, `CashflowPoint`, `NetWorth` to the existing `./dashboard` import block, then add inside `IpcContract` (after the `'dashboard:metrics'` line):

```typescript
  'dashboard:cashflow': {
    payload: { granularity: CashflowGranularity };
    response: { series: CashflowPoint[] };
  };
  'dashboard:netWorth': { payload: Record<string, never>; response: NetWorth };
```

- [ ] **Step 6: Register the handlers** in `src/main/ipc/register.ts`.

Add the import:

```typescript
import { handleDashboardCashflow, handleDashboardNetWorth } from './handlers/dashboardConsolidated';
```

And inside `registerAllHandlers()` (after the `dashboardMetrics` registration):

```typescript
register(CHANNELS.dashboardCashflow, handleDashboardCashflow);
register(CHANNELS.dashboardNetWorth, () => handleDashboardNetWorth());
```

- [ ] **Step 7: Run to verify pass**

Run: `npx vitest run tests/unit/ipc/dashboardConsolidated.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Full gate**

Run: `npx tsc --noEmit && npx vitest run && npx eslint .`
Expected: typecheck clean, all unit tests green, no lint errors.

- [ ] **Step 9: Commit**

```bash
git add src/main/ipc/channels.ts src/shared/types/ipc.ts src/main/ipc/handlers/dashboardConsolidated.ts src/main/ipc/register.ts tests/unit/ipc/dashboardConsolidated.test.ts
git commit -m "feat(ipc): expose consolidated cash flow and net worth channels"
```

---

## Self-review

**Spec coverage (F1 acceptance criteria):**

- "A 500 € perso→livret transfer is neither income nor expense in any period total" → Task 2, test _"excludes internal transfers"_ (both flagged legs + a `cat-transferts` leg). ✅
- "Consolidated net = sum of account balances" → Task 3, `getNetWorth` over `getAccountSummaries`. ✅
- "Per-account drill-down still shows the movement as a transfer" → unchanged: `getTransactions` / `getDashboardMetrics` still expose `isInternalTransfer` and per-account series; this plan adds consolidated reads without touching them. ✅
- "Unit tests cover transfer-pair exclusion in period aggregates" → Task 2. ✅

**Placeholder scan:** none — every step ships real code or an exact command.

**Type consistency:** `getConsolidatedCashflow(db, granularity)` and `getNetWorth(db)` signatures match across the query module, the handlers, and the IPC contract. `CashflowPoint` / `NetWorth` / `NetWorthAccount` are defined once in `dashboard.ts` and imported everywhere. Channel keys `dashboardCashflow` / `dashboardNetWorth` map to `'dashboard:cashflow'` / `'dashboard:netWorth'` consistently in channels, contract, and register.

**Out of F1 (next bricks):** declared balances for unanchored accounts (F2); month+year UI surface for "gained/lost" (A1); Reports page composing it all (A2). No UI is built here — F1 is the verified data backbone, by design (Approach A).

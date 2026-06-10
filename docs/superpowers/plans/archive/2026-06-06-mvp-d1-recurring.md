# D1 — Recurring / subscription detection (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Checkbox steps.

**Goal:** US4 — detect recurring expenses / subscriptions from the transaction history: a stable payee + stable amount at a regular monthly or annual cadence becomes a subscription with its amount, cadence, monthly-equivalent, last and next-due dates.

**Architecture:** A pure `detectRecurring(inputs)` function (no DB — fully unit-testable) plus an IPC `recurring:list` channel whose handler reads non-transfer expense rows and runs it, returning the subscriptions and their monthly total.

**Tech Stack:** TypeScript strict, `node:sqlite`, Electron typed IPC, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-mvp-personal-finance-design.md` (brick D1). Independent of F2/A1; reuses F1's `NOT_TRANSFER`.

---

## File structure

- Create `src/shared/types/recurring.ts` — `RecurringInput`, `RecurringSubscription`, `RecurringReport`
- Create `src/main/recurring/detect.ts` — `detectRecurring`
- Create `src/main/ipc/handlers/recurringList.ts`
- Modify `src/main/ipc/channels.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/register.ts`
- Tests: `tests/unit/recurring/detect.test.ts`, `tests/unit/ipc/recurringList.test.ts`

## Algorithm (locked thresholds for deterministic tests)

- Expenses only (`amount < 0`); group by exact `label`.
- Need **≥ 3 occurrences**. Sort by date; compute consecutive day-intervals.
- Cadence: **monthly** if every interval ∈ [25, 35] days; **annual** if every interval ∈ [355, 375]; otherwise not recurring.
- Amount must be stable: every |amount| within `max(2, 5% of median)` of the median.
- `amount` = median magnitude; `monthlyEquivalent` = amount (monthly) or amount/12 (annual); `nextDueDate` = last date + 1 month / + 1 year (UTC). Sort results by `monthlyEquivalent` desc.

---

### Task 1: types + `detectRecurring`

- [ ] **Step 1: Test** `tests/unit/recurring/detect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectRecurring } from '../../../src/main/recurring/detect';
import type { RecurringInput } from '@shared/types/recurring';

function monthly(label: string, amount: number, months: string[]): RecurringInput[] {
  return months.map((m) => ({ date: `${m}-15`, amount, label }));
}

describe('detectRecurring', () => {
  it('detects a monthly subscription with cadence, monthly-equivalent and next due', () => {
    const txns = monthly('NETFLIX', -13.49, ['2026-01', '2026-02', '2026-03', '2026-04']);
    const [sub] = detectRecurring(txns);
    expect(sub).toMatchObject({
      label: 'NETFLIX',
      amount: 13.49,
      cadence: 'monthly',
      monthlyEquivalent: 13.49,
      occurrences: 4,
      lastDate: '2026-04-15',
      nextDueDate: '2026-05-15',
    });
  });

  it('detects an annual subscription (monthly-equivalent = amount / 12)', () => {
    const txns: RecurringInput[] = [
      { date: '2024-03-01', amount: -120, label: 'ASSURANCE' },
      { date: '2025-03-01', amount: -120, label: 'ASSURANCE' },
      { date: '2026-03-01', amount: -120, label: 'ASSURANCE' },
    ];
    const [sub] = detectRecurring(txns);
    expect(sub).toMatchObject({ label: 'ASSURANCE', cadence: 'annual', occurrences: 3 });
    expect(sub?.monthlyEquivalent).toBeCloseTo(10, 5);
    expect(sub?.nextDueDate).toBe('2027-03-01');
  });

  it('ignores one-off charges and fewer than three occurrences', () => {
    const txns: RecurringInput[] = [
      { date: '2026-01-10', amount: -50, label: 'GARAGE' },
      { date: '2026-02-10', amount: -50, label: 'GARAGE' },
    ];
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('rejects a group whose amount is not stable', () => {
    const txns = [
      { date: '2026-01-15', amount: -10, label: 'VAR' },
      { date: '2026-02-15', amount: -40, label: 'VAR' },
      { date: '2026-03-15', amount: -90, label: 'VAR' },
    ];
    expect(detectRecurring(txns)).toEqual([]);
  });

  it('ignores income and sorts results by monthly-equivalent desc', () => {
    const txns = [
      ...monthly('SPOTIFY', -10, ['2026-01', '2026-02', '2026-03']),
      ...monthly('RENT', -800, ['2026-01', '2026-02', '2026-03']),
      ...monthly('SALARY', 2500, ['2026-01', '2026-02', '2026-03']), // income, ignored
    ];
    const subs = detectRecurring(txns);
    expect(subs.map((s) => s.label)).toEqual(['RENT', 'SPOTIFY']);
  });
});
```

- [ ] **Step 2:** Run → FAIL. `npx vitest run tests/unit/recurring/detect.test.ts`

- [ ] **Step 3: Types** `src/shared/types/recurring.ts`:

```typescript
/** A transaction reduced to what recurrence detection needs. `date` is `yyyy-mm-dd`. */
export interface RecurringInput {
  readonly date: string;
  readonly amount: number;
  readonly label: string;
}

export type RecurringCadence = 'monthly' | 'annual';

/** A detected recurring expense / subscription. `amount` is a positive magnitude. */
export interface RecurringSubscription {
  readonly label: string;
  readonly amount: number;
  readonly cadence: RecurringCadence;
  readonly monthlyEquivalent: number;
  readonly occurrences: number;
  readonly lastDate: string;
  readonly nextDueDate: string;
}

/** The recurring report: detected subscriptions + their combined monthly cost. */
export interface RecurringReport {
  readonly subscriptions: RecurringSubscription[];
  readonly monthlyTotal: number;
}
```

- [ ] **Step 4: Implement** `src/main/recurring/detect.ts`:

```typescript
import type {
  RecurringCadence,
  RecurringInput,
  RecurringSubscription,
} from '@shared/types/recurring';

const MIN_OCCURRENCES = 3;

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length === 0) return 0;
  return s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

function cadenceOf(intervals: number[]): RecurringCadence | null {
  if (intervals.length === 0) return null;
  if (intervals.every((d) => d >= 25 && d <= 35)) return 'monthly';
  if (intervals.every((d) => d >= 355 && d <= 375)) return 'annual';
  return null;
}

function addInterval(date: string, cadence: RecurringCadence): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (cadence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Detect recurring expenses: a stable payee + stable amount at a regular monthly
 * or annual cadence. Income is ignored; transfers are expected to be filtered out
 * by the caller. Pure — no DB, no clock.
 */
export function detectRecurring(txns: RecurringInput[]): RecurringSubscription[] {
  const groups = new Map<string, RecurringInput[]>();
  for (const t of txns) {
    if (t.amount >= 0) continue;
    const g = groups.get(t.label) ?? [];
    g.push(t);
    groups.set(t.label, g);
  }

  const subs: RecurringSubscription[] = [];
  for (const [label, items] of groups) {
    if (items.length < MIN_OCCURRENCES) continue;
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(daysBetween(sorted[i - 1]?.date ?? '', sorted[i]?.date ?? ''));
    }
    const cadence = cadenceOf(intervals);
    if (cadence === null) continue;

    const amounts = sorted.map((s) => Math.abs(s.amount));
    const medAmt = median(amounts);
    const tol = Math.max(2, medAmt * 0.05);
    if (!amounts.every((a) => Math.abs(a - medAmt) <= tol)) continue;

    const lastDate = sorted[sorted.length - 1]?.date ?? '';
    subs.push({
      label,
      amount: medAmt,
      cadence,
      monthlyEquivalent: cadence === 'monthly' ? medAmt : medAmt / 12,
      occurrences: sorted.length,
      lastDate,
      nextDueDate: addInterval(lastDate, cadence),
    });
  }

  return subs.sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
}
```

- [ ] **Step 5:** Run → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit** `feat(recurring): detect monthly/annual subscriptions from history`

---

### Task 2: IPC `recurring:list`

- [ ] **Step 1: Test** `tests/unit/ipc/recurringList.test.ts` — seed a real in-memory DB through a mocked `getDb`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
db.exec('DELETE FROM accounts');
db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'A', 'checking')").run();
let n = 0;
function seed(date: string, amount: number, label: string, transfer = false): void {
  n += 1;
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, is_internal_transfer)
     VALUES (?, 'a1', ?, ?, ?, ?, ?, ?)`,
  ).run(`t${String(n)}`, `t${String(n)}`, date, amount, label, label, transfer ? 1 : 0);
}
for (const m of ['2026-01', '2026-02', '2026-03']) seed(`${m}-15`, -10, 'SPOTIFY');
seed('2026-01-20', -500, 'TRANSFER', true); // excluded
seed('2026-02-20', -500, 'TRANSFER', true);
seed('2026-03-20', -500, 'TRANSFER', true);

vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

import { handleRecurringList } from '../../../src/main/ipc/handlers/recurringList';

afterEach(() => {
  vi.clearAllMocks();
});

describe('recurring:list handler', () => {
  it('returns detected subscriptions and the monthly total, excluding transfers', () => {
    const res = handleRecurringList();
    expect(res.subscriptions.map((s) => s.label)).toEqual(['SPOTIFY']);
    expect(res.monthlyTotal).toBeCloseTo(10, 5);
  });
});
```

- [ ] **Step 2:** Run → FAIL.

- [ ] **Step 3: Handler** `src/main/ipc/handlers/recurringList.ts`:

```typescript
import type { RecurringInput, RecurringReport } from '@shared/types/recurring';
import { getDb } from '../../db';
import { NOT_TRANSFER } from '../../dashboard/transferFilter';
import { detectRecurring } from '../../recurring/detect';

export function handleRecurringList(): RecurringReport {
  const rows = getDb()
    .prepare(`SELECT date, amount, label_clean AS label FROM transactions WHERE ${NOT_TRANSFER}`)
    .all() as unknown as RecurringInput[];
  const subscriptions = detectRecurring(rows);
  const monthlyTotal = subscriptions.reduce((sum, s) => sum + s.monthlyEquivalent, 0);
  return { subscriptions, monthlyTotal };
}
```

- [ ] **Step 4: Channel** in `src/main/ipc/channels.ts` (after the dashboard channels):

```typescript
  recurringList: 'recurring:list',
```

- [ ] **Step 5: Contract** in `src/shared/types/ipc.ts`: add `import type { RecurringReport } from './recurring';` (top) and inside `IpcContract`:

```typescript
  'recurring:list': { payload: Record<string, never>; response: RecurringReport };
```

- [ ] **Step 6: Register** in `src/main/ipc/register.ts`: import `handleRecurringList` from `./handlers/recurringList`, then add `register(CHANNELS.recurringList, () => handleRecurringList());`

- [ ] **Step 7: Full gate.** `npx tsc --noEmit && npx vitest run && npm run lint`.

- [ ] **Step 8: Commit** `feat(ipc): recurring:list channel returning subscriptions + monthly total`

---

## Self-review

- **Spec coverage (D1):** monthly + annual detection with cadence, monthly total, next due → Task 1; one-offs not flagged, transfers excluded → Task 1 + Task 2. ✅
- **Placeholder scan:** none.
- **Type consistency:** `RecurringInput` / `RecurringSubscription` / `RecurringReport` shared across detect, handler, contract. `recurringList` → `'recurring:list'`.
- **Out of D1:** the Reports "Subscriptions & recurring" section UI is A2 (consumes `recurring:list`); budgets stay out (ADR-009 amendment).

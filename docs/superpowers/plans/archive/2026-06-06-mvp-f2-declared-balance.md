# F2 — Declared balance for unanchored accounts (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let an account with no anchoring statement (typically AV / PEA / livret) carry a **user-declared balance** that feeds consolidated net worth, while staying distinguishable from a statement-derived balance. No market data, no network.

**Architecture:** One additive migration (two nullable columns on `accounts`). `getAccountSummaries` (ADR-014) gains a `balanceSource` and falls back to the declared balance when no statement anchors the account — statement always wins when both exist. A `setDeclaredBalance` mutation + IPC channel let the UI set/clear it. `getNetWorth` (F1) benefits for free since it reads `getAccountSummaries`.

**Tech Stack:** TypeScript strict, `node:sqlite`, Electron typed IPC, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-mvp-personal-finance-design.md` (brick F2). Depends on F1 (merged).

---

## File structure

- Create `src/main/db/migrations/012_account_declared_balance.sql`
- Modify `src/main/db/migrate.ts` — import + register version 12
- Modify `src/main/dashboard/queries.ts` — `getAccountSummaries` reads declared balance + sets `balanceSource`
- Modify `src/shared/types/dashboard.ts` — `BalanceSource`, `balanceSource` on `AccountSummary`, `SetDeclaredBalanceInput`
- Modify `src/main/accounts/manage.ts` — `setDeclaredBalance`
- Modify `src/main/ipc/channels.ts`, `src/shared/types/ipc.ts`, `src/main/ipc/register.ts`
- Create `src/main/ipc/handlers/accountsDeclaredBalance.ts`
- Tests: `tests/unit/dashboard/queries.test.ts` (extend), `tests/unit/accounts/declaredBalance.test.ts` (new), `tests/unit/ipc/accountsDeclaredBalance.test.ts` (new), `tests/unit/dashboard/consolidated.test.ts` (extend net worth)

---

### Task 1: Migration 012 — declared balance columns

- [ ] **Step 1:** Create `src/main/db/migrations/012_account_declared_balance.sql`:

```sql
-- A user-declared balance for accounts no imported statement anchors (typically
-- AV / PEA / livret). It feeds net worth (ADR-014 path) without any price feed
-- or network call. `declared_balance_date` records when it was last set.
ALTER TABLE accounts ADD COLUMN declared_balance REAL;
ALTER TABLE accounts ADD COLUMN declared_balance_date TEXT;
```

- [ ] **Step 2:** Register in `src/main/db/migrate.ts`. Add the import after the `sql011` line:

```typescript
import sql012 from './migrations/012_account_declared_balance.sql?raw';
```

and the entry after `{ version: 11, sql: sql011 }`:

```typescript
  { version: 12, sql: sql012 },
```

- [ ] **Step 3:** Run the whole suite — migration must not break existing tests.

Run: `npx vitest run tests/unit/dashboard tests/unit/accounts`
Expected: all PASS (new column is nullable, nothing reads it yet).

- [ ] **Step 4: Commit**

```bash
git add src/main/db/migrations/012_account_declared_balance.sql src/main/db/migrate.ts
git commit -m "feat(db): add nullable declared_balance columns to accounts (migration 012)"
```

---

### Task 2: `getAccountSummaries` falls back to the declared balance

Statement anchor wins; otherwise a declared balance applies; otherwise null.

- [ ] **Step 1: Write failing tests** — extend `tests/unit/dashboard/queries.test.ts` with a `describe('getAccountSummaries — declared balance')`. Use the file's existing `freshDb`/seed helpers; add this self-contained block (adjust the import line if `getAccountSummaries` is not already imported):

```typescript
describe('getAccountSummaries — declared balance', () => {
  it("uses the declared balance and marks the source 'declared' when no statement anchors", () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');
    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('av', 'AV', 'life_insurance')").run();
    db.prepare(
      "UPDATE accounts SET declared_balance = 15000, declared_balance_date = '2026-06-01' WHERE id = 'av'",
    ).run();

    const [acc] = getAccountSummaries(db);
    expect(acc).toMatchObject({ id: 'av', balance: 15000, balanceSource: 'declared' });
    db.close();
  });

  it("prefers a statement anchor over a declared balance (source 'statement')", () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');
    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('perso', 'Perso', 'checking')").run();
    db.prepare("UPDATE accounts SET declared_balance = 99 WHERE id = 'perso'").run();
    db.prepare(
      `INSERT INTO imports (id, account_id, file_hash, source_type, date_range_start, date_range_end, status, closing_balance, closing_balance_date)
       VALUES ('i1','perso','h1','ofx','2026-04-01','2026-04-30','validated', 1200, '2026-04-30')`,
    ).run();

    const [acc] = getAccountSummaries(db);
    expect(acc).toMatchObject({ id: 'perso', balance: 1200, balanceSource: 'statement' });
    db.close();
  });

  it('is null with source null when neither anchor nor declared balance exists', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');
    db.prepare("INSERT INTO accounts (id, name, type) VALUES ('x', 'X', 'checking')").run();

    const [acc] = getAccountSummaries(db);
    expect(acc).toMatchObject({ id: 'x', balance: null, balanceSource: null });
    db.close();
  });
});
```

- [ ] **Step 2:** Run → FAIL (`balanceSource` undefined / declared not used).

Run: `npx vitest run tests/unit/dashboard/queries.test.ts -t "declared balance"`

- [ ] **Step 3: Add the types** in `src/shared/types/dashboard.ts`. Add the union and the field on `AccountSummary`:

```typescript
/** Where an account's balance comes from. `null` when no balance is known. */
export type BalanceSource = 'statement' | 'declared' | null;
```

Inside `AccountSummary`, after the `balance` field add:

```typescript
  /** Whether `balance` came from a statement anchor (ADR-014), a user-declared
   *  value (F2), or is unknown (`null`). */
  readonly balanceSource: BalanceSource;
```

- [ ] **Step 4: Implement** in `src/main/dashboard/queries.ts`.

In the `AccountRow` interface add: `declared_balance: number | null;`

In the SQL `SELECT a.id, a.name, a.type, a.bank_id, a.currency,` add `a.declared_balance,` (e.g. right after `a.currency,`).

Replace the final `.map(...)` return with:

```typescript
return rows.map((r) => {
  if (r.has_anchor === 1) {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      bankId: r.bank_id,
      currency: r.currency,
      balance: (r.anchor_balance ?? 0) + r.later_sum,
      balanceSource: 'statement' as const,
      txCount: r.tx_count,
    };
  }
  if (r.declared_balance !== null) {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      bankId: r.bank_id,
      currency: r.currency,
      balance: r.declared_balance,
      balanceSource: 'declared' as const,
      txCount: r.tx_count,
    };
  }
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    bankId: r.bank_id,
    currency: r.currency,
    balance: null,
    balanceSource: null,
    txCount: r.tx_count,
  };
});
```

- [ ] **Step 5:** Run the declared-balance tests → PASS. Then run the full suite and fix any `AccountSummary` `toEqual` assertions that now need `balanceSource` (search: `npx vitest run` and address failures by adding the field to expected objects).

Run: `npx vitest run` then `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/main/dashboard/queries.ts src/shared/types/dashboard.ts tests/unit/dashboard/queries.test.ts
git commit -m "feat(accounts): fall back to a declared balance with an explicit source"
```

---

### Task 3: `setDeclaredBalance` mutation

- [ ] **Step 1: Write failing tests** — `tests/unit/accounts/declaredBalance.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { setDeclaredBalance } from '../../../src/main/accounts/manage';

function db1(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('DELETE FROM accounts');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('av', 'AV', 'life_insurance')").run();
  return db;
}

describe('setDeclaredBalance', () => {
  it('sets a declared balance and returns the updated summary', () => {
    const db = db1();
    const acc = setDeclaredBalance(db, { id: 'av', balance: 15000 });
    expect(acc).toMatchObject({ id: 'av', balance: 15000, balanceSource: 'declared' });
    db.close();
  });

  it('clears the declared balance when given null', () => {
    const db = db1();
    setDeclaredBalance(db, { id: 'av', balance: 15000 });
    const acc = setDeclaredBalance(db, { id: 'av', balance: null });
    expect(acc).toMatchObject({ id: 'av', balance: null, balanceSource: null });
    db.close();
  });

  it('throws for an unknown account', () => {
    const db = db1();
    expect(() => setDeclaredBalance(db, { id: 'nope', balance: 1 })).toThrow();
    db.close();
  });
});
```

- [ ] **Step 2:** Run → FAIL (`setDeclaredBalance` not exported).

Run: `npx vitest run tests/unit/accounts/declaredBalance.test.ts`

- [ ] **Step 3: Add the input type** in `src/shared/types/dashboard.ts`:

```typescript
/** Set (or clear, with `balance: null`) an account's user-declared balance. */
export interface SetDeclaredBalanceInput {
  readonly id: string;
  readonly balance: number | null;
}
```

- [ ] **Step 4: Implement** in `src/main/accounts/manage.ts`. Add `SetDeclaredBalanceInput` to the type import from `@shared/types/dashboard`, then append:

```typescript
/**
 * Set or clear (`balance: null`) an account's user-declared balance. Stamps the
 * date when a value is set. Returns the refreshed summary. No network — the
 * figure is user-entered, never fetched (ADR-002).
 */
export function setDeclaredBalance(
  db: DatabaseSync,
  input: SetDeclaredBalanceInput,
): AccountSummary {
  const date = input.balance === null ? null : new Date().toISOString().slice(0, 10);
  const res = db
    .prepare('UPDATE accounts SET declared_balance = ?, declared_balance_date = ? WHERE id = ?')
    .run(input.balance, date, input.id);
  if (Number(res.changes) === 0) {
    throw new Error(`setDeclaredBalance: account ${input.id} not found`);
  }
  const updated = getAccountSummaries(db).find((a) => a.id === input.id);
  if (!updated) throw new Error('setDeclaredBalance: account vanished after update');
  return updated;
}
```

- [ ] **Step 5:** Run → PASS. `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

```bash
git add src/main/accounts/manage.ts src/shared/types/dashboard.ts tests/unit/accounts/declaredBalance.test.ts
git commit -m "feat(accounts): setDeclaredBalance mutation (set/clear, stamped)"
```

---

### Task 4: IPC channel `accounts:setDeclaredBalance` + net-worth coverage

- [ ] **Step 1: Write failing tests** — `tests/unit/ipc/accountsDeclaredBalance.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';

const db = { __fake: true };
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const account = {
  id: 'av',
  name: 'AV',
  type: 'life_insurance',
  bankId: null,
  currency: 'EUR',
  balance: 15000,
  balanceSource: 'declared',
  txCount: 0,
};
const setDeclaredBalance = vi.fn<(db: unknown, input: unknown) => typeof account>(() => account);
vi.mock('../../../src/main/accounts/manage', () => ({
  setDeclaredBalance: (dbArg: unknown, input: unknown) => setDeclaredBalance(dbArg, input),
}));

import { handleAccountsSetDeclaredBalance } from '../../../src/main/ipc/handlers/accountsDeclaredBalance';

afterEach(() => {
  vi.clearAllMocks();
});

describe('accounts:setDeclaredBalance handler', () => {
  it('forwards the payload and returns the updated account', () => {
    const res = handleAccountsSetDeclaredBalance({ id: 'av', balance: 15000 });
    expect(setDeclaredBalance).toHaveBeenCalledWith(db, { id: 'av', balance: 15000 });
    expect(res).toEqual({ account });
  });
});
```

Also extend `tests/unit/dashboard/consolidated.test.ts` `getNetWorth` describe with:

```typescript
it('counts a declared balance toward net worth', () => {
  const db = freshDb(); // perso + livret, unanchored
  db.prepare("UPDATE accounts SET declared_balance = 5000 WHERE id = 'livret'").run();

  const result = getNetWorth(db);
  expect(result.total).toBe(5000);
  expect(result.accounts).toContainEqual({ accountId: 'livret', name: 'Livret A', balance: 5000 });
  db.close();
});
```

- [ ] **Step 2:** Run both → FAIL (handler missing; net worth test passes already if Task 2 done — confirm).

Run: `npx vitest run tests/unit/ipc/accountsDeclaredBalance.test.ts tests/unit/dashboard/consolidated.test.ts`

- [ ] **Step 3: Create the handler** `src/main/ipc/handlers/accountsDeclaredBalance.ts`:

```typescript
import type { AccountSummary, SetDeclaredBalanceInput } from '@shared/types/dashboard';
import { getDb } from '../../db';
import { setDeclaredBalance } from '../../accounts/manage';

export function handleAccountsSetDeclaredBalance(payload: SetDeclaredBalanceInput): {
  account: AccountSummary;
} {
  return { account: setDeclaredBalance(getDb(), payload) };
}
```

- [ ] **Step 4: Channel** in `src/main/ipc/channels.ts` after `accountsDelete`:

```typescript
  accountsSetDeclaredBalance: 'accounts:setDeclaredBalance',
```

- [ ] **Step 5: Contract** in `src/shared/types/ipc.ts`. Add `SetDeclaredBalanceInput` to the `./dashboard` import, then after `'accounts:delete'`:

```typescript
  'accounts:setDeclaredBalance': {
    payload: SetDeclaredBalanceInput;
    response: { account: AccountSummary };
  };
```

- [ ] **Step 6: Register** in `src/main/ipc/register.ts`: import `handleAccountsSetDeclaredBalance` from `./handlers/accountsDeclaredBalance`, then add after the `accountsDelete` registration:

```typescript
register(CHANNELS.accountsSetDeclaredBalance, handleAccountsSetDeclaredBalance);
```

- [ ] **Step 7: Full gate.** `npx tsc --noEmit && npx vitest run && npx eslint .` → all clean/green.

- [ ] **Step 8: Commit**

```bash
git add src/main/ipc/ src/shared/types/ipc.ts tests/unit/ipc/accountsDeclaredBalance.test.ts tests/unit/dashboard/consolidated.test.ts
git commit -m "feat(ipc): accounts:setDeclaredBalance channel; net worth counts declared balances"
```

---

## Self-review

- **Spec coverage (F2 acceptance):** unanchored account with a declared balance contributes to net worth → Task 2 + Task 4 net-worth test. Editing the declared balance updates net worth → Task 3 (set) feeds `getAccountSummaries` → `getNetWorth`. Declared vs statement distinguishable → `balanceSource` (Task 2). No network anywhere → value is user-entered, migration adds no fetch. ✅
- **Placeholder scan:** none.
- **Type consistency:** `balanceSource: BalanceSource` on `AccountSummary`; `SetDeclaredBalanceInput { id, balance }` used in manage, handler, contract; channel key `accountsSetDeclaredBalance` → `'accounts:setDeclaredBalance'`. The new `AccountSummary.balanceSource` field means any existing exact-equality assertion on a summary must include it — Task 2 Step 5 sweeps the suite for these.
- **Out of F2:** UI to edit the declared balance (Accounts page input) lands with A2/UI bricks; F2 ships the data + IPC.

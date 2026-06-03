# Editable Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit (date / label / amount) and delete a transaction from the transactions table, preserving the originally-extracted figures as an audit trail.

**Architecture:** Three additive nullable columns on `transactions` (migration 009) store the "as extracted" snapshot. New IPC mutations (`transactions:update` / `:delete` / `:restore`) mirror the existing `transactions:setCategory` path (typed contract → channel → pure handler → DB function). The renderer edits inline in the virtualized row; delete is a hard `DELETE` with a transient in-memory undo toast. No soft delete, no reconciliation engine, no edit history (see spec §2).

**Tech Stack:** Electron + TypeScript (strict), `node:sqlite` (`DatabaseSync`), React + Tailwind, Vitest 4, sonner (toasts), lucide-react (icons).

**Spec:** `docs/superpowers/specs/2026-06-03-editable-transactions-design.md`

---

## File Structure

**Create:**

- `src/main/db/migrations/009_editable_transactions.sql` — add `original_date`, `original_amount`, `edited_at`
- `src/main/transactions/mutate.ts` — DB layer: `updateTransaction`, `deleteTransaction`, `restoreTransaction`
- `src/main/ipc/handlers/transactions.ts` — IPC handlers for the three mutations
- `src/shared/types/transaction.ts` — `UpdateTransactionInput`, `DeletedTransactionSnapshot`
- `tests/unit/transactions/mutate.test.ts`
- `tests/unit/ipc/transactions.test.ts`
- `tests/unit/db/editable_transactions.test.ts`

**Modify:**

- `src/main/db/migrate.ts` — register migration 009
- `src/shared/types/ipc.ts` — add three channels to `IpcContract`
- `src/main/ipc/channels.ts` — add three channel constants
- `src/main/ipc/register.ts` — register three handlers
- `src/main/dashboard/queries.ts` — select + map the three new columns
- `src/shared/types/dashboard.ts` — add `originalDate`, `originalAmount`, `editedAt` to `DashboardTransaction`
- `src/renderer/hooks/useDashboard.ts` — add `updateTransaction`, `deleteTransaction` (+ undo via `restore`)
- `src/renderer/lib/dashboardMap.ts` — extend `toTxRow` with edit fields + marker hint
- `src/renderer/components/dashboard/TxTable.tsx` — Date header, actions column, inline edit, marker
- `src/renderer/pages/TransactionsPage.tsx` — `editingId` state, wire edit/delete/undo
- Test fixtures gaining the three DTO fields: `tests/unit/renderer/dashboardMap.test.ts`, `DashboardPage.test.tsx`, `TransactionsPage.test.tsx`, `dashboardCharts.test.ts`, `filterTransactions.test.ts`
- `docs/adr/003-deterministic-extraction.md`, `docs/adr/005-mandatory-human-review.md`, `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md`

**Create (docs):**

- `docs/adr/012-editable-transactions-audit-trail.md`

---

## Task 1: Migration 009 — audit-trail columns

**Files:**

- Create: `src/main/db/migrations/009_editable_transactions.sql`
- Modify: `src/main/db/migrate.ts`
- Test: `tests/unit/db/editable_transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/db/editable_transactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

describe('migration 009 (editable transactions)', () => {
  it('adds original_date, original_amount and edited_at to transactions', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const cols = (db.prepare('PRAGMA table_info(transactions)').all() as { name: string }[]).map(
      (c) => c.name,
    );
    expect(cols).toContain('original_date');
    expect(cols).toContain('original_amount');
    expect(cols).toContain('edited_at');
    db.close();
  });

  it('records version 9', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const versions = (
      db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[]
    ).map((r) => r.version);
    expect(versions).toContain(9);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/db/editable_transactions.test.ts`
Expected: FAIL — columns not found / version 9 missing.

- [ ] **Step 3: Create the migration**

Create `src/main/db/migrations/009_editable_transactions.sql`:

```sql
-- Migration 009 — editable transactions with an audit trail.
--
-- The user can now edit a transaction's date / amount / label and delete rows
-- (see ADR-012). Figures are still extracted deterministically; an edit is an
-- explicit, audited override. We preserve the originally-extracted figures so
-- verifiability shifts from immutability to transparency:
--   * original_date / original_amount: snapshot of the extracted figure, set
--     once on the first edit that changes that figure (NULL = never changed).
--   * edited_at: ISO timestamp of the last manual edit (NULL = never edited).
-- The label keeps its own audit for free: label_raw is never edited and stays
-- visible, so no original_label column is needed. Delete is a hard DELETE (no
-- deleted_at) — see the spec for why.
ALTER TABLE transactions ADD COLUMN original_date TEXT;
ALTER TABLE transactions ADD COLUMN original_amount REAL;
ALTER TABLE transactions ADD COLUMN edited_at TEXT;
```

- [ ] **Step 4: Register the migration**

In `src/main/db/migrate.ts`, add the import after the `sql008` import:

```ts
import sql009 from './migrations/009_editable_transactions.sql?raw';
```

And add the entry at the end of the `MIGRATIONS` array (after `{ version: 8, sql: sql008 }`):

```ts
  { version: 9, sql: sql009 },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/db/editable_transactions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations/009_editable_transactions.sql src/main/db/migrate.ts tests/unit/db/editable_transactions.test.ts
git commit -m "feat(db): add editable-transactions audit columns (migration 009)"
```

---

## Task 2: Shared types for the mutations

**Files:**

- Create: `src/shared/types/transaction.ts`
- Modify: `src/shared/types/ipc.ts`, `src/main/ipc/channels.ts`

No test (pure type declarations + a `satisfies` check covered by `tsc`).

- [ ] **Step 1: Create the types file**

Create `src/shared/types/transaction.ts`:

```ts
/** Fields a user may edit on a transaction. All optional; only provided fields
 *  change. Figures (date/amount) are snapshotted into original_* on first change. */
export interface UpdateTransactionInput {
  readonly transactionId: string;
  readonly date?: string; // ISO yyyy-mm-dd
  readonly label?: string; // edits label_clean only; label_raw is never touched
  readonly amount?: number;
}

/** Every persisted column of a transaction, in camelCase — enough to re-insert a
 *  deleted row faithfully. Returned by `transactions:delete`, sent back to
 *  `transactions:restore`. The renderer treats it as an opaque undo token. */
export interface DeletedTransactionSnapshot {
  readonly id: string;
  readonly accountId: string;
  readonly importId: string | null;
  readonly txHash: string;
  readonly date: string;
  readonly amount: number;
  readonly labelRaw: string;
  readonly labelClean: string;
  readonly categoryId: string | null;
  readonly isInternalTransfer: boolean;
  readonly userModified: boolean;
  readonly fitid: string | null;
  readonly originalDate: string | null;
  readonly originalAmount: number | null;
  readonly editedAt: string | null;
}
```

- [ ] **Step 2: Add the channels to the IPC contract**

In `src/shared/types/ipc.ts`, add the import near the other type imports:

```ts
import type { UpdateTransactionInput, DeletedTransactionSnapshot } from './transaction';
```

And add three entries inside `interface IpcContract` (after the `transactions:setCategory` line):

```ts
  'transactions:update': { payload: UpdateTransactionInput; response: { ok: true } };
  'transactions:delete': {
    payload: { transactionId: string };
    response: { ok: true; snapshot: DeletedTransactionSnapshot };
  };
  'transactions:restore': {
    payload: { transaction: DeletedTransactionSnapshot };
    response: { ok: true };
  };
```

- [ ] **Step 3: Add the channel constants**

In `src/main/ipc/channels.ts`, add inside `CHANNELS` (after `transactionsSetCategory`):

```ts
  transactionsUpdate: 'transactions:update',
  transactionsDelete: 'transactions:delete',
  transactionsRestore: 'transactions:restore',
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no handler registered yet — `register.ts` is untouched, so no missing-handler error; the contract just gains entries).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/transaction.ts src/shared/types/ipc.ts src/main/ipc/channels.ts
git commit -m "feat(ipc): declare transactions update/delete/restore channels"
```

---

## Task 3: DB layer — `updateTransaction`

**Files:**

- Create: `src/main/transactions/mutate.ts`
- Test: `tests/unit/transactions/mutate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/transactions/mutate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { updateTransaction } from '../../../src/main/transactions/mutate';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'Compte', 'checking')").run();
  return db;
}

function seed(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, user_modified)
     VALUES ('t1', 'a1', 't1', '2026-05-14', -84.3, 'CB CARREFOUR', 'Carrefour', 0)`,
  ).run();
}

interface Row {
  date: string;
  amount: number;
  label_clean: string;
  original_date: string | null;
  original_amount: number | null;
  edited_at: string | null;
  user_modified: number;
}
const read = (db: DatabaseSync): Row =>
  db
    .prepare(
      'SELECT date, amount, label_clean, original_date, original_amount, edited_at, user_modified FROM transactions WHERE id = ?',
    )
    .get('t1') as unknown as Row;

describe('updateTransaction', () => {
  it('changes the amount and snapshots the extracted original once', () => {
    const db = freshDb();
    seed(db);
    updateTransaction(db, { transactionId: 't1', amount: -90 });
    let r = read(db);
    expect(r.amount).toBe(-90);
    expect(r.original_amount).toBe(-84.3);
    expect(r.edited_at).not.toBeNull();
    expect(r.user_modified).toBe(1);

    // A second amount edit keeps the FIRST (extracted) snapshot.
    updateTransaction(db, { transactionId: 't1', amount: -100 });
    r = read(db);
    expect(r.amount).toBe(-100);
    expect(r.original_amount).toBe(-84.3);
    db.close();
  });

  it('changes the date and snapshots original_date but not original_amount', () => {
    const db = freshDb();
    seed(db);
    updateTransaction(db, { transactionId: 't1', date: '2026-05-20' });
    const r = read(db);
    expect(r.date).toBe('2026-05-20');
    expect(r.original_date).toBe('2026-05-14');
    expect(r.original_amount).toBeNull(); // amount unchanged → not a figures change
    db.close();
  });

  it('edits the label without setting any figure snapshot', () => {
    const db = freshDb();
    seed(db);
    updateTransaction(db, { transactionId: 't1', label: 'Carrefour Market' });
    const r = read(db);
    expect(r.label_clean).toBe('Carrefour Market');
    expect(r.original_date).toBeNull();
    expect(r.original_amount).toBeNull();
    expect(r.edited_at).not.toBeNull(); // still a manual edit
    db.close();
  });

  it('throws on an unknown id', () => {
    const db = freshDb();
    expect(() => updateTransaction(db, { transactionId: 'nope', amount: 1 })).toThrow();
    db.close();
  });

  it('rejects a malformed date and a non-finite amount', () => {
    const db = freshDb();
    seed(db);
    expect(() => updateTransaction(db, { transactionId: 't1', date: '14/05/2026' })).toThrow();
    expect(() => updateTransaction(db, { transactionId: 't1', amount: Number.NaN })).toThrow();
    db.close();
  });

  it('rejects an empty label', () => {
    const db = freshDb();
    seed(db);
    expect(() => updateTransaction(db, { transactionId: 't1', label: '   ' })).toThrow();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/transactions/mutate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `updateTransaction`**

Create `src/main/transactions/mutate.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import type { UpdateTransactionInput } from '@shared/types/transaction';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface EditableRow {
  date: string;
  amount: number;
  label_clean: string;
  original_date: string | null;
  original_amount: number | null;
}

/**
 * Edit a transaction's date / label / amount. Figures (date, amount) are
 * snapshotted into original_* the first time they change, so the extracted
 * value is never lost (see ADR-012). Any edit sets edited_at + user_modified.
 * label edits change label_clean only; label_raw is never touched.
 */
export function updateTransaction(db: DatabaseSync, input: UpdateTransactionInput): void {
  if (input.date !== undefined && !ISO_DATE.test(input.date)) {
    throw new Error(`updateTransaction: invalid date "${input.date}"`);
  }
  if (input.amount !== undefined && !Number.isFinite(input.amount)) {
    throw new Error('updateTransaction: amount must be a finite number');
  }
  if (input.label !== undefined && input.label.trim() === '') {
    throw new Error('updateTransaction: label is empty');
  }

  const row = db
    .prepare(
      'SELECT date, amount, label_clean, original_date, original_amount FROM transactions WHERE id = ?',
    )
    .get(input.transactionId) as unknown as EditableRow | undefined;
  if (row === undefined) {
    throw new Error(`updateTransaction: transaction ${input.transactionId} not found`);
  }

  const nextDate = input.date ?? row.date;
  const nextAmount = input.amount ?? row.amount;
  const nextLabel = input.label !== undefined ? input.label.trim() : row.label_clean;

  const dateChanged = nextDate !== row.date;
  const amountChanged = nextAmount !== row.amount;
  const labelChanged = nextLabel !== row.label_clean;
  if (!dateChanged && !amountChanged && !labelChanged) return;

  const originalDate = dateChanged && row.original_date === null ? row.date : row.original_date;
  const originalAmount =
    amountChanged && row.original_amount === null ? row.amount : row.original_amount;

  db.prepare(
    `UPDATE transactions
     SET date = ?, amount = ?, label_clean = ?,
         original_date = ?, original_amount = ?,
         edited_at = datetime('now'), user_modified = 1
     WHERE id = ?`,
  ).run(nextDate, nextAmount, nextLabel, originalDate, originalAmount, input.transactionId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/transactions/mutate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transactions/mutate.ts tests/unit/transactions/mutate.test.ts
git commit -m "feat(transactions): add updateTransaction with figure snapshots"
```

---

## Task 4: DB layer — `deleteTransaction` + `restoreTransaction`

**Files:**

- Modify: `src/main/transactions/mutate.ts`
- Test: `tests/unit/transactions/mutate.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/transactions/mutate.test.ts` (add the import at the top alongside `updateTransaction`):

```ts
import {
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from '../../../src/main/transactions/mutate';
```

Then append this describe block:

```ts
describe('deleteTransaction / restoreTransaction', () => {
  it('returns a faithful snapshot, deletes the row, and restores it', () => {
    const db = freshDb();
    db.prepare(
      `INSERT INTO transactions (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean, category_id, is_internal_transfer, user_modified, fitid)
       VALUES ('t1', 'a1', NULL, 'hash1', '2026-05-14', -84.3, 'CB CARREFOUR', 'Carrefour', NULL, 0, 0, 'fit1')`,
    ).run();

    const snapshot = deleteTransaction(db, 't1');
    expect(snapshot.id).toBe('t1');
    expect(snapshot.txHash).toBe('hash1');
    expect(snapshot.fitid).toBe('fit1');
    expect(snapshot.amount).toBe(-84.3);
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });

    restoreTransaction(db, snapshot);
    const back = db
      .prepare('SELECT id, tx_hash, fitid, amount FROM transactions WHERE id = ?')
      .get('t1');
    expect(back).toMatchObject({ id: 't1', tx_hash: 'hash1', fitid: 'fit1', amount: -84.3 });
    db.close();
  });

  it('throws when deleting an unknown id', () => {
    const db = freshDb();
    expect(() => deleteTransaction(db, 'nope')).toThrow();
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/transactions/mutate.test.ts`
Expected: FAIL — `deleteTransaction` / `restoreTransaction` not exported.

- [ ] **Step 3: Implement delete + restore**

Append to `src/main/transactions/mutate.ts` (add the snapshot type import at the top):

```ts
import type { UpdateTransactionInput, DeletedTransactionSnapshot } from '@shared/types/transaction';
```

```ts
interface FullRow {
  id: string;
  account_id: string;
  import_id: string | null;
  tx_hash: string;
  date: string;
  amount: number;
  label_raw: string;
  label_clean: string;
  category_id: string | null;
  is_internal_transfer: number;
  user_modified: number;
  fitid: string | null;
  original_date: string | null;
  original_amount: number | null;
  edited_at: string | null;
}

/** Hard-delete a transaction, returning a snapshot of every column so the caller
 *  can restore it (the renderer's undo). Throws if the id does not exist. */
export function deleteTransaction(
  db: DatabaseSync,
  transactionId: string,
): DeletedTransactionSnapshot {
  const row = db
    .prepare('SELECT * FROM transactions WHERE id = ?')
    .get(transactionId) as unknown as FullRow | undefined;
  if (row === undefined) {
    throw new Error(`deleteTransaction: transaction ${transactionId} not found`);
  }
  db.prepare('DELETE FROM transactions WHERE id = ?').run(transactionId);
  return {
    id: row.id,
    accountId: row.account_id,
    importId: row.import_id,
    txHash: row.tx_hash,
    date: row.date,
    amount: row.amount,
    labelRaw: row.label_raw,
    labelClean: row.label_clean,
    categoryId: row.category_id,
    isInternalTransfer: row.is_internal_transfer === 1,
    userModified: row.user_modified === 1,
    fitid: row.fitid,
    originalDate: row.original_date,
    originalAmount: row.original_amount,
    editedAt: row.edited_at,
  };
}

/** Re-insert a previously deleted transaction from its snapshot (undo). */
export function restoreTransaction(db: DatabaseSync, snap: DeletedTransactionSnapshot): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
        category_id, is_internal_transfer, user_modified, fitid,
        original_date, original_amount, edited_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    snap.id,
    snap.accountId,
    snap.importId,
    snap.txHash,
    snap.date,
    snap.amount,
    snap.labelRaw,
    snap.labelClean,
    snap.categoryId,
    snap.isInternalTransfer ? 1 : 0,
    snap.userModified ? 1 : 0,
    snap.fitid,
    snap.originalDate,
    snap.originalAmount,
    snap.editedAt,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/transactions/mutate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/transactions/mutate.ts tests/unit/transactions/mutate.test.ts
git commit -m "feat(transactions): add hard delete with restorable snapshot"
```

---

## Task 5: IPC handlers + registration

**Files:**

- Create: `src/main/ipc/handlers/transactions.ts`
- Modify: `src/main/ipc/register.ts`
- Test: `tests/unit/ipc/transactions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ipc/transactions.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import {
  handleTransactionsUpdate,
  handleTransactionsDelete,
  handleTransactionsRestore,
} from '../../../src/main/ipc/handlers/transactions';

function setup(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'C', 'checking')").run();
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, user_modified)
     VALUES ('t1', 'a1', 't1', '2026-05-14', -10, 'RAW', 'Lbl', 0)`,
  ).run();
  dbHolder.db = db;
  return db;
}

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
});

describe('transactions IPC handlers', () => {
  it('update returns ok and writes the change', () => {
    const db = setup();
    expect(handleTransactionsUpdate({ transactionId: 't1', amount: -20 })).toEqual({ ok: true });
    expect(db.prepare('SELECT amount FROM transactions WHERE id = ?').get('t1')).toMatchObject({
      amount: -20,
    });
  });

  it('delete returns a snapshot and restore puts the row back', () => {
    const db = setup();
    const res = handleTransactionsDelete({ transactionId: 't1' });
    expect(res.ok).toBe(true);
    expect(res.snapshot.id).toBe('t1');
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });

    expect(handleTransactionsRestore({ transaction: res.snapshot })).toEqual({ ok: true });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ipc/transactions.test.ts`
Expected: FAIL — handlers module not found.

- [ ] **Step 3: Implement the handlers**

Create `src/main/ipc/handlers/transactions.ts`:

```ts
import type { UpdateTransactionInput, DeletedTransactionSnapshot } from '@shared/types/transaction';
import { getDb } from '../../db';
import {
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from '../../transactions/mutate';

export function handleTransactionsUpdate(payload: UpdateTransactionInput): { ok: true } {
  updateTransaction(getDb(), payload);
  return { ok: true };
}

export function handleTransactionsDelete(payload: { transactionId: string }): {
  ok: true;
  snapshot: DeletedTransactionSnapshot;
} {
  const snapshot = deleteTransaction(getDb(), payload.transactionId);
  return { ok: true, snapshot };
}

export function handleTransactionsRestore(payload: { transaction: DeletedTransactionSnapshot }): {
  ok: true;
} {
  restoreTransaction(getDb(), payload.transaction);
  return { ok: true };
}
```

- [ ] **Step 4: Register the handlers**

In `src/main/ipc/register.ts`, add the import:

```ts
import {
  handleTransactionsUpdate,
  handleTransactionsDelete,
  handleTransactionsRestore,
} from './handlers/transactions';
```

And inside `registerAllHandlers()`, after the `transactionsSetCategory` registration:

```ts
register(CHANNELS.transactionsUpdate, handleTransactionsUpdate);
register(CHANNELS.transactionsDelete, handleTransactionsDelete);
register(CHANNELS.transactionsRestore, handleTransactionsRestore);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/ipc/transactions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc/handlers/transactions.ts src/main/ipc/register.ts tests/unit/ipc/transactions.test.ts
git commit -m "feat(ipc): wire transactions update/delete/restore handlers"
```

---

## Task 6: Expose audit fields through the query + DTO

**Files:**

- Modify: `src/shared/types/dashboard.ts`, `src/main/dashboard/queries.ts`
- Test: `tests/unit/dashboard/queries.test.ts` (existing)

- [ ] **Step 1: Add the failing test**

In `tests/unit/dashboard/queries.test.ts`, extend the `seedTx` helper to accept optional audit fields and assert `getTransactions` returns them. Add to the `args` object type and the INSERT (the helper currently inserts `id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id`):

Add a focused test (place it in the `getTransactions` describe block):

```ts
it('returns the audit fields (originalDate, originalAmount, editedAt)', () => {
  const db = freshDb();
  seedAccount(db, 'a1', 'Compte courant');
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, original_date, original_amount, edited_at)
     VALUES ('e1', 'a1', 'e1', '2026-05-20', -90, 'X', 'X', '2026-05-14', -84.3, '2026-06-03 10:00:00')`,
  ).run();
  const tx = getTransactions(db, { accountId: 'a1' }).find((t) => t.id === 'e1');
  expect(tx?.originalDate).toBe('2026-05-14');
  expect(tx?.originalAmount).toBe(-84.3);
  expect(tx?.editedAt).toBe('2026-06-03 10:00:00');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/dashboard/queries.test.ts`
Expected: FAIL — `originalDate` etc. are `undefined` / type error.

- [ ] **Step 3: Add fields to the DTO**

In `src/shared/types/dashboard.ts`, inside `interface DashboardTransaction`, after `categoryIcon`:

```ts
  readonly originalDate: string | null;
  readonly originalAmount: number | null;
  readonly editedAt: string | null;
```

- [ ] **Step 4: Select + map the columns**

In `src/main/dashboard/queries.ts`, add to `interface TransactionRow` (after `category_icon`):

```ts
original_date: string | null;
original_amount: number | null;
edited_at: string | null;
```

In the SELECT, change the joined-column line to also fetch the three columns:

```ts
              c.icon AS category_icon,
              t.original_date, t.original_amount, t.edited_at,
              t.is_internal_transfer, t.user_modified
```

In the `rows.map(...)` return object, after `categoryIcon: r.category_icon,`:

```ts
    originalDate: r.original_date,
    originalAmount: r.original_amount,
    editedAt: r.edited_at,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/dashboard/queries.test.ts`
Expected: PASS.

- [ ] **Step 6: Fix the broken DTO fixtures**

Adding required fields breaks fixtures that build a `DashboardTransaction`. In each file below, add the three fields (`originalDate: null, originalAmount: null, editedAt: null,`) to the transaction fixture object, right after the `categoryIcon: null,` line:

- `tests/unit/renderer/dashboardMap.test.ts` (the `makeTx` factory)
- `tests/unit/renderer/DashboardPage.test.tsx`
- `tests/unit/renderer/TransactionsPage.test.tsx`
- `tests/unit/renderer/dashboardCharts.test.ts`
- `tests/unit/renderer/filterTransactions.test.ts`

- [ ] **Step 7: Run the full unit suite to confirm fixtures compile + pass**

Run: `npx tsc --noEmit && npx vitest run tests/unit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/dashboard.ts src/main/dashboard/queries.ts tests/unit/dashboard/queries.test.ts tests/unit/renderer/dashboardMap.test.ts tests/unit/renderer/DashboardPage.test.tsx tests/unit/renderer/TransactionsPage.test.tsx tests/unit/renderer/dashboardCharts.test.ts tests/unit/renderer/filterTransactions.test.ts
git commit -m "feat(dashboard): surface transaction audit fields in the DTO"
```

---

## Task 7: Renderer hook — `updateTransaction` / `deleteTransaction` (+ undo)

**Files:**

- Modify: `src/renderer/hooks/useDashboard.ts`
- Test: none (thin IPC wrappers; covered by the component tests in Task 10). The toasts follow the existing `reassign` pattern.

- [ ] **Step 1: Extend the hook interface**

In `src/renderer/hooks/useDashboard.ts`, add to `interface UseDashboard` (after `reassign`):

```ts
/** Edit a transaction's date / label / amount and refresh. */
updateTransaction: (input: UpdateTransactionInput) => Promise<void>;
/** Delete a transaction; offers an undo toast that restores it. */
deleteTransaction: (transactionId: string) => Promise<void>;
```

Add the type import near the top:

```ts
import type { UpdateTransactionInput } from '@shared/types/transaction';
```

- [ ] **Step 2: Implement the callbacks**

After the existing `reassign` `useCallback` (before `createCategory`), add:

```ts
const updateTransaction = useCallback(async (input: UpdateTransactionInput) => {
  try {
    await ipc.invoke('transactions:update', input);
    setTick((t) => t + 1);
    toast.success('Transaction modifiée');
  } catch (e) {
    toast.error(`Modification impossible : ${errMessage(e)}`);
  }
}, []);

const deleteTransaction = useCallback(async (transactionId: string) => {
  try {
    const { snapshot } = await ipc.invoke('transactions:delete', { transactionId });
    setTick((t) => t + 1);
    toast.success('Transaction supprimée', {
      action: {
        label: 'Annuler',
        onClick: () => {
          void ipc.invoke('transactions:restore', { transaction: snapshot }).then(() => {
            setTick((t) => t + 1);
          });
        },
      },
    });
  } catch (e) {
    toast.error(`Suppression impossible : ${errMessage(e)}`);
  }
}, []);
```

- [ ] **Step 3: Return the new callbacks**

Add `updateTransaction,` and `deleteTransaction,` to the returned object at the end of the hook.

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useDashboard.ts
git commit -m "feat(renderer): add updateTransaction/deleteTransaction hook actions"
```

---

## Task 8: Map audit fields into the table row

**Files:**

- Modify: `src/renderer/lib/dashboardMap.ts`, `src/renderer/components/dashboard/TxTable.tsx` (the `TxRow` interface only)
- Test: `tests/unit/renderer/dashboardMap.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/unit/renderer/dashboardMap.test.ts`, add to the `toTxRow` describe block:

```ts
it('marks an edited row and builds an original-values hint', () => {
  const row = toTxRow(
    makeTx({ editedAt: '2026-06-03 10:00:00', originalAmount: -84.3, originalDate: '2026-05-14' }),
  );
  expect(row.edited).toBe(true);
  expect(row.originalHint).toContain('84,30');
  expect(row.originalHint).toContain('14/05');
});

it('is not marked edited when editedAt is null', () => {
  expect(toTxRow(makeTx()).edited).toBe(false);
  expect(toTxRow(makeTx()).originalHint).toBeNull();
});

it('exposes raw editable values for the inline editor', () => {
  const row = toTxRow(makeTx({ date: '2026-05-14', amount: -84.3, labelClean: 'Carrefour' }));
  expect(row.editDate).toBe('2026-05-14');
  expect(row.editAmount).toBe(-84.3);
  expect(row.editLabel).toBe('Carrefour');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/dashboardMap.test.ts`
Expected: FAIL — `edited` / `originalHint` / `editDate` undefined.

- [ ] **Step 3: Extend `TxRow`**

In `src/renderer/components/dashboard/TxTable.tsx`, add to `interface TxRow` (after `amountKind`):

```ts
/** True when the row was edited by hand (shows the "modifié" marker). */
edited: boolean;
/** Tooltip text with the original extracted figures, or null. */
originalHint: string | null;
/** Raw values that seed the inline editor. */
editDate: string; // ISO yyyy-mm-dd
editAmount: number;
editLabel: string;
```

- [ ] **Step 4: Build them in `toTxRow`**

In `src/renderer/lib/dashboardMap.ts`, add a helper above `toTxRow`:

```ts
/** "extrait : -84,30 · 14/05" from the snapshotted figures, or null if none. */
function originalHint(tx: DashboardTransaction): string | null {
  if (tx.editedAt === null) return null;
  const parts: string[] = [];
  if (tx.originalAmount !== null) parts.push(formatBalance(tx.originalAmount));
  if (tx.originalDate !== null) parts.push(formatTxDate(tx.originalDate));
  return parts.length > 0 ? `extrait : ${parts.join(' · ')}` : 'Modifié manuellement';
}
```

In `toTxRow`, add to the returned object (after `amountKind: txKind(tx),`):

```ts
    edited: tx.editedAt !== null,
    originalHint: originalHint(tx),
    editDate: tx.date,
    editAmount: tx.amount,
    editLabel: tx.labelClean,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/dashboardMap.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/lib/dashboardMap.ts src/renderer/components/dashboard/TxTable.tsx tests/unit/renderer/dashboardMap.test.ts
git commit -m "feat(renderer): map audit fields and editable values into TxRow"
```

---

## Task 9: TxTable — Date header, actions column, inline edit, marker

**Files:**

- Modify: `src/renderer/components/dashboard/TxTable.tsx`
- Test: `tests/unit/renderer/TxTable.test.tsx` (create)

This task rewrites `TxTableHeader` and `TxTableRow`. The row gains a read mode (with pencil/trash on hover and an optional "modifié" marker) and an edit mode (date / label / amount inputs + ✓ / ✕). One row edits at a time, driven by props from the page.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/TxTable.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TxTableRow, type TxRow } from '@renderer/components/dashboard/TxTable';

afterEach(() => {
  cleanup();
});

const baseRow: TxRow = {
  id: 't1',
  date: '14/05',
  icon: 'wallet',
  main: 'Carrefour',
  sub: 'CB CARREFOUR',
  catColor: '#6E6E78',
  catName: 'Courses',
  amount: -84.3,
  amountKind: 'expense',
  edited: false,
  originalHint: null,
  editDate: '2026-05-14',
  editAmount: -84.3,
  editLabel: 'Carrefour',
};

describe('TxTableRow', () => {
  it('calls onStartEdit when the pencil is clicked', () => {
    const onStartEdit = vi.fn();
    render(<TxTableRow row={baseRow} onStartEdit={onStartEdit} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Modifier'));
    expect(onStartEdit).toHaveBeenCalledWith('t1');
  });

  it('calls onDelete when the trash is clicked', () => {
    const onDelete = vi.fn();
    render(<TxTableRow row={baseRow} onStartEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Supprimer'));
    expect(onDelete).toHaveBeenCalledWith('t1');
  });

  it('in edit mode, saves the parsed French amount and trimmed label', () => {
    const onSaveEdit = vi.fn();
    render(
      <TxTableRow
        row={baseRow}
        editing
        onSaveEdit={onSaveEdit}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '-90,5' } });
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: ' Carrefour Market ' } });
    fireEvent.click(screen.getByLabelText('Enregistrer'));
    expect(onSaveEdit).toHaveBeenCalledWith('t1', {
      date: '2026-05-14',
      label: 'Carrefour Market',
      amount: -90.5,
    });
  });

  it('blocks save on an invalid amount', () => {
    const onSaveEdit = vi.fn();
    render(
      <TxTableRow
        row={baseRow}
        editing
        onSaveEdit={onSaveEdit}
        onCancelEdit={vi.fn()}
        onStartEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Montant'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByLabelText('Enregistrer'));
    expect(onSaveEdit).not.toHaveBeenCalled();
  });

  it('shows the modified marker with the original hint', () => {
    render(
      <TxTableRow
        row={{ ...baseRow, edited: true, originalHint: 'extrait : -84,30 · 14/05' }}
        onStartEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('extrait : -84,30 · 14/05')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/TxTable.test.tsx`
Expected: FAIL — new props / labels don't exist yet.

- [ ] **Step 3: Add the amount parser**

In `src/renderer/lib/dashboardMap.ts`, export a helper:

```ts
/** Parse a French-formatted amount ("-90,5" / "-90.5") to a number, or null. */
export function parseAmount(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || normalized === '-') return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 4: Rewrite `TxTable.tsx`**

Replace the whole component body below the imports. Add `useState` and the icons to the imports:

```tsx
import { useState } from 'react';
import { Pencil, Trash2, Check, X } from 'lucide-react';
```

Update the grid template (actions column now present at all breakpoints):

```tsx
export const TX_GRID =
  'grid items-center gap-x-3 xl:gap-x-3.5 ' +
  'grid-cols-[72px_24px_1fr_140px_96px_52px] ' +
  'xl:grid-cols-[84px_28px_1fr_180px_110px_56px]';
```

Header (column 1 now labelled "Date", actions column header empty at all sizes):

```tsx
export function TxTableHeader() {
  return (
    <div className={TX_GRID}>
      <span className={HEAD}>Date</span>
      <span className={HEAD} />
      <span className={HEAD}>Description</span>
      <span className={HEAD}>Catégorie</span>
      <span className={cn(HEAD, 'text-right')}>Montant</span>
      <span className={HEAD} />
    </div>
  );
}
```

Row props and component (replaces the existing `TxTableRowProps` + `TxTableRow`). The `editing`, `onSaveEdit`, `onCancelEdit`, `onStartEdit`, `onDelete` props are added; `categories`/`onReassign`/`onCreateCategory` stay for the category picker:

```tsx
export interface TxTableRowProps {
  row: TxRow;
  categories?: CategoryDTO[];
  onReassign?: (transactionId: string, categoryId: string) => void;
  onCreateCategory?: (input: CreateCategoryInput) => Promise<CategoryDTO>;
  editing?: boolean;
  onStartEdit: (transactionId: string) => void;
  onSaveEdit?: (
    transactionId: string,
    fields: { date: string; label: string; amount: number },
  ) => void;
  onCancelEdit?: () => void;
  onDelete: (transactionId: string) => void;
}

const INPUT =
  'w-full rounded border border-line-2 bg-ink-2 px-1.5 py-1 font-sans text-[12px] text-paper outline-none focus:border-paper-mute';
const ICON_BTN = 'rounded p-1 text-paper-dim hover:text-paper hover:bg-ink-2';

export function TxTableRow({
  row: t,
  categories,
  onReassign,
  onCreateCategory,
  editing = false,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: TxTableRowProps) {
  if (editing) {
    return <TxTableRowEdit row={t} onSaveEdit={onSaveEdit} onCancelEdit={onCancelEdit} />;
  }
  return (
    <div className={cn(TX_GRID, 'group border-b border-line-1 hover:bg-ink-3')}>
      <span
        className={cn(
          CELL,
          'flex items-center gap-1 font-mono text-xs tabular-nums text-paper-mute',
        )}
      >
        {t.date}
        {t.edited && (
          <span
            aria-label={t.originalHint ?? 'Modifié manuellement'}
            title={t.originalHint ?? 'Modifié manuellement'}
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-flag"
          />
        )}
      </span>
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
      <span className={cn(CELL, 'flex justify-end gap-0.5 opacity-0 group-hover:opacity-100')}>
        <button
          type="button"
          aria-label="Modifier"
          className={ICON_BTN}
          onClick={() => {
            onStartEdit(t.id);
          }}
        >
          <Pencil size={13} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Supprimer"
          className={ICON_BTN}
          onClick={() => {
            onDelete(t.id);
          }}
        >
          <Trash2 size={13} strokeWidth={1.8} />
        </button>
      </span>
    </div>
  );
}

function TxTableRowEdit({
  row: t,
  onSaveEdit,
  onCancelEdit,
}: {
  row: TxRow;
  onSaveEdit?: (id: string, f: { date: string; label: string; amount: number }) => void;
  onCancelEdit?: () => void;
}) {
  const [date, setDate] = useState(t.editDate);
  const [label, setLabel] = useState(t.editLabel);
  const [amount, setAmount] = useState(formatBalance(t.editAmount));
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsedAmount = parseAmount(amount);
    const trimmed = label.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('Date invalide');
    if (parsedAmount === null) return setError('Montant invalide');
    if (trimmed === '') return setError('Libellé vide');
    onSaveEdit?.(t.id, { date, label: trimmed, amount: parsedAmount });
  };

  return (
    <div className={cn(TX_GRID, 'border-b border-line-1 bg-ink-2')}>
      <span className={CELL}>
        <input
          aria-label="Date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
          }}
          className={INPUT}
        />
      </span>
      <span className={CELL} />
      <span className={cn(CELL, 'min-w-0')}>
        <input
          aria-label="Libellé"
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
          }}
          className={INPUT}
        />
        {error !== null && <span className="mt-0.5 block text-[10px] text-flag">{error}</span>}
      </span>
      <span className={CELL} />
      <span className={CELL}>
        <input
          aria-label="Montant"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
          }}
          className={cn(INPUT, 'text-right font-mono tabular-nums')}
        />
      </span>
      <span className={cn(CELL, 'flex justify-end gap-0.5')}>
        <button type="button" aria-label="Enregistrer" className={ICON_BTN} onClick={save}>
          <Check size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          aria-label="Annuler"
          className={ICON_BTN}
          onClick={() => onCancelEdit?.()}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </span>
    </div>
  );
}
```

Add the needed imports at the top if missing: `formatBalance` and `parseAmount` from `@renderer/lib/dashboardMap`. The `TxTable` list wrapper at the bottom of the file must pass the new required props through; update its signature:

```tsx
export function TxTable({ rows, categories, onReassign, onCreateCategory, onStartEdit, onDelete }: TxTableProps) {
```

and add `onStartEdit: (id: string) => void;` and `onDelete: (id: string) => void;` to `TxTableProps`, forwarding them to each `TxTableRow`. (The virtualized page in Task 10 renders `TxTableRow` directly and does not use `TxTable`, but keep it consistent so the simpler `TxTable` still compiles.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/TxTable.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the full unit suite + typecheck**

Run: `npx tsc --noEmit && npx vitest run tests/unit`
Expected: PASS (existing `TxTable`/`TransactionsPage` callers may need the new required props — fix call sites minimally; the page is fully wired in Task 10).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/dashboard/TxTable.tsx src/renderer/lib/dashboardMap.ts tests/unit/renderer/TxTable.test.tsx
git commit -m "feat(renderer): Date header, row actions and inline edit in TxTable"
```

---

## Task 10: Wire editing + delete into the Transactions page

**Files:**

- Modify: `src/renderer/pages/TransactionsPage.tsx`
- Test: `tests/unit/renderer/TransactionsPage.test.tsx` (existing — extend)

- [ ] **Step 1: Write the failing test**

In `tests/unit/renderer/TransactionsPage.test.tsx`, add a test that clicking the pencil enters edit mode and saving calls the hook. Mock `useDashboard` to expose `updateTransaction`/`deleteTransaction` spies (follow the file's existing mock setup). Minimal assertion:

```tsx
it('enters edit mode on the pencil and saves via the hook', async () => {
  // (reuse the file's existing render helper + useDashboard mock with a transaction)
  fireEvent.click(screen.getAllByLabelText('Modifier')[0]!);
  fireEvent.change(screen.getByLabelText('Montant'), { target: { value: '-99,99' } });
  fireEvent.click(screen.getByLabelText('Enregistrer'));
  expect(updateTransactionSpy).toHaveBeenCalledWith({
    transactionId: expect.any(String),
    date: expect.any(String),
    label: expect.any(String),
    amount: -99.99,
  });
});
```

(If the existing mock shape differs, adapt: the key behavior to assert is that the pencil reveals inputs and ✓ calls `updateTransaction`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/TransactionsPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Add editing state + handlers**

In `src/renderer/pages/TransactionsPage.tsx`:

Pull the new actions from the hook (where `reassign, createCategory` are destructured):

```tsx
const { /* ...existing... */, reassign, createCategory, updateTransaction, deleteTransaction } = useDashboard(/* ...existing args... */);
```

Add local edit state near the top of the component:

```tsx
const [editingId, setEditingId] = useState<string | null>(null);
```

(Ensure `useState` is imported.)

Update the `TxTableRow` usage inside the virtualizer map to pass the new props and map the save back to ISO/number for the hook:

```tsx
<TxTableRow
  row={toTxRow(t)}
  categories={categories}
  onReassign={(txId, catId) => {
    void reassign(txId, catId);
  }}
  onCreateCategory={createCategory}
  editing={editingId === t.id}
  onStartEdit={(id) => {
    setEditingId(id);
  }}
  onSaveEdit={(id, fields) => {
    void updateTransaction({
      transactionId: id,
      date: fields.date,
      label: fields.label,
      amount: fields.amount,
    });
    setEditingId(null);
  }}
  onCancelEdit={() => {
    setEditingId(null);
  }}
  onDelete={(id) => {
    void deleteTransaction(id);
  }}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/TransactionsPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TransactionsPage.test.tsx
git commit -m "feat(renderer): inline edit + delete on the Transactions page"
```

---

## Task 11: Integration test — import → edit → delete → restore

**Files:**

- Test: `tests/integration/transactions/editDelete.test.ts` (create)

- [ ] **Step 1: Write the test**

Create `tests/integration/transactions/editDelete.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from '../../../src/main/transactions/mutate';
import { getTransactions } from '../../../src/main/dashboard/queries';

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  runMigrations(d);
  d.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'C', 'checking')").run();
  d.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean)
     VALUES ('t1', 'a1', 't1', '2026-05-14', -84.3, 'CB CARREFOUR', 'Carrefour')`,
  ).run();
  return d;
}

describe('edit + delete lifecycle', () => {
  it('edits an amount, preserves the original, then deletes and restores', () => {
    const d = db();
    updateTransaction(d, { transactionId: 't1', amount: -90 });
    let tx = getTransactions(d, { accountId: 'a1' })[0];
    expect(tx?.amount).toBe(-90);
    expect(tx?.originalAmount).toBe(-84.3);
    expect(tx?.editedAt).not.toBeNull();

    const snap = deleteTransaction(d, 't1');
    expect(getTransactions(d, { accountId: 'a1' })).toHaveLength(0);

    restoreTransaction(d, snap);
    tx = getTransactions(d, { accountId: 'a1' })[0];
    expect(tx?.amount).toBe(-90); // edit survives the round-trip
    expect(tx?.originalAmount).toBe(-84.3);
    d.close();
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/integration/transactions/editDelete.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/transactions/editDelete.test.ts
git commit -m "test(transactions): integration for edit/delete/restore lifecycle"
```

---

## Task 12: ADR-012 + doc amendments

**Files:**

- Create: `docs/adr/012-editable-transactions-audit-trail.md`
- Modify: `docs/adr/003-deterministic-extraction.md`, `docs/adr/005-mandatory-human-review.md`, `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md`

- [ ] **Step 1: Write ADR-012**

Create `docs/adr/012-editable-transactions-audit-trail.md`:

```markdown
# ADR-012 — Editable transactions with an audit trail

- **Status**: Accepted
- **Date**: 2026-06-03
- **Category**: Data, UI, Product
- **Related**: ADR-003 (deterministic extraction), ADR-005 (mandatory human review)

## Context

ADR-003 held that figures (amount, date) come exclusively from deterministic
extraction and are never touched by hand — the basis for arithmetic
reconciliation and the "you can verify" promise. But extraction is not perfect
(OCR on scanned PDFs, an odd bank layout), deduplication can miss a duplicate,
and a label is sometimes worth clarifying. With no way to correct a transaction
after import, the user is stuck with wrong data.

## Decision

Allow the user to edit a transaction's `date`, `label` and `amount`, and to
delete a row. Verifiability shifts **from immutability to transparency**:

- The originally-extracted figures are preserved on first change
  (`original_date`, `original_amount`; migration 009). The label keeps its audit
  for free — `label_raw` is never edited and stays visible; only `label_clean`
  is editable.
- `edited_at` marks a row as manually modified; the UI shows a marker with the
  original values.
- Delete is a hard `DELETE` (no `deleted_at`). Undo is transient (held in the
  renderer for the toast). A future reconciliation (#71) detects an unbalanced
  statement from the import's closing balance vs the current sum — it does not
  need the deleted row, and soft delete would tax every query forever.

## Consequences

- Editing is an explicit, audited user override — never an LLM/automatic
  mutation. ADR-003's "no automatic figure mutation" still holds; this adds a
  deliberate manual path.
- A reconciliation feature can later flag edited (`original_* IS NOT NULL`) and
  deleted rows using data preserved here.
- No edit history (single "as extracted" snapshot) and no soft delete, by
  YAGNI — see the design spec.

## Alternatives considered

- **Read-only transactions** (status quo): rejected — leaves bad extractions
  uncorrectable.
- **Soft delete + edit-history log**: rejected as over-engineering for a
  single-user app; the permanent per-query filter tax outweighs the benefit.
```

- [ ] **Step 2: Amend ADR-003**

In `docs/adr/003-deterministic-extraction.md`, under Consequences (or at the end), add:

```markdown
## Amendment (2026-06-03) — manual edits allowed, audited

Transactions are now user-editable post-import (see ADR-012). This does not
weaken deterministic extraction: figures are still _extracted_ deterministically
and never mutated by the LLM or automatically. An edit is an explicit, audited
user override that preserves the originally-extracted figure.
```

- [ ] **Step 3: Amend ADR-005**

In `docs/adr/005-mandatory-human-review.md`, under Consequences, add:

```markdown
## Amendment (2026-06-03) — post-import editing is a separate, audited path

The mandatory pre-INSERT Review is unchanged. Correcting a transaction _after_
import (edit / delete) is a distinct, audited path (see ADR-012), not a bypass of
the Review gate.
```

- [ ] **Step 4: Note editability in the master design spec**

In `docs/superpowers/specs/2026-05-14-finance-dashboard-design.md`, in the
transactions/table section, add a sentence: transactions are editable
(date/label/amount) and deletable post-import, with the extracted figures
preserved as an audit trail (ADR-012).

- [ ] **Step 5: Commit**

```bash
git add docs/adr/012-editable-transactions-audit-trail.md docs/adr/003-deterministic-extraction.md docs/adr/005-mandatory-human-review.md docs/superpowers/specs/2026-05-14-finance-dashboard-design.md
git commit -m "docs: ADR-012 editable transactions; amend ADR-003/005 and spec"
```

---

## Task 13: Full verification + PR

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `npm run lint && npx tsc --noEmit && npx vitest run tests/unit tests/integration && npm run build`
Expected: all green.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Run: `npm run dev`, open the Transactions page, edit a row's amount (check the "modifié" marker + tooltip), delete a row (check the undo toast restores it), confirm the "Date" header shows.

- [ ] **Step 3: Push + open the PR**

```bash
git push -u origin worktree-feat+editable-transactions
gh pr create --base main --title "feat(transactions): inline edit + delete with audit trail" --body "Implements docs/superpowers/specs/2026-06-03-editable-transactions-design.md. Adds inline edit (date/label/amount) and delete with transient undo; preserves extracted figures (migration 009); ADR-012. Hard delete, no reconciliation engine (YAGNI)."
```

- [ ] **Step 4: Self-merge once CI is green** (per CLAUDE.md MVP gate).

---

## Self-review notes

- **Spec coverage:** migration/columns (§3 → T1), updateTransaction snapshot-once + two signals (§3/§4.1 → T3), hard delete + restore (§4.2 → T4), IPC contract incl. delete-returns-snapshot (§5 → T2/T5), query+DTO (§6 → T6), hook + undo toast (§5 → T7), Date header + actions + inline edit + marker (§7 → T8/T9), page wiring (§7 → T10), ADR-012 + amendments (§8 → T12), tests (§9 → T3/T4/T5/T6/T8/T9/T10/T11). All sections mapped.
- **Type consistency:** `UpdateTransactionInput` and `DeletedTransactionSnapshot` (T2) are used unchanged in T3/T4/T5/T7; `TxRow` fields added in T8 are consumed in T9; DTO fields added in T6 are consumed in T8.
- **Non-goals honored:** no `deleted_at`, no reconciliation engine, no edit-history table.

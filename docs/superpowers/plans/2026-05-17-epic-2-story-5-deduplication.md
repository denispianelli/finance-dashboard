# Deduplication (3 Levels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Level 2 (period overlap) and Level 3 (transaction semantic hash) deduplication to the import pipeline; Level 1 (file hash) already exists.

**Architecture:** Two new standalone files following the existing pure-vs-DB split. `txHash.ts` holds pure functions (label normalization, hash, batch assignment). `periodOverlap.ts` holds one DB query. No existing file is modified.

**Tech Stack:** TypeScript, `node:crypto` (SHA-256), `node:sqlite` (`DatabaseSync`), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-17-deduplication-design.md`

---

## File Structure

| File                                      | Responsibility                                                      |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `src/main/import/txHash.ts`               | Pure: `normalizeLabel`, `computeTxHash`, `assignTxHashes` (Level 3) |
| `src/main/import/periodOverlap.ts`        | DB: `checkPeriodOverlap` (Level 2)                                  |
| `tests/unit/import/txHash.test.ts`        | Unit tests for `txHash.ts`                                          |
| `tests/unit/import/periodOverlap.test.ts` | Unit tests for `periodOverlap.ts` (in-memory DB)                    |

Reference (not modified): `src/main/import/hashFile.ts`, `src/main/import/duplicateCheck.ts`, `src/main/import/pdf/extractTransactions.ts` (exports `ExtractedTransaction`), `src/main/db/migrate.ts` (exports `runMigrations`).

Conventions: tests use `import { describe, it, expect } from 'vitest';`; relative import depth from `tests/unit/import/` is `../../../src/main/...`. `ExtractedTransaction` is `{ date: string; label: string; amount: number }` from `src/main/import/pdf/extractTransactions`.

---

### Task 1: Label normalization + hash computation

**Files:**

- Create: `src/main/import/txHash.ts`
- Test: `tests/unit/import/txHash.test.ts`
- Also commit: `docs/superpowers/plans/2026-05-17-epic-2-story-5-deduplication.md`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/import/txHash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeLabel, computeTxHash } from '../../../src/main/import/txHash';

describe('normalizeLabel', () => {
  it('removes accents', () => {
    expect(normalizeLabel('Crédit Lyonnais')).toBe('CREDIT LYONNAIS');
  });
  it('uppercases', () => {
    expect(normalizeLabel('carrefour')).toBe('CARREFOUR');
  });
  it('collapses spaces, tabs and newlines to a single space', () => {
    expect(normalizeLabel('A  \t B\nC')).toBe('A B C');
  });
  it('trims leading and trailing whitespace', () => {
    expect(normalizeLabel('  VIR SEPA  ')).toBe('VIR SEPA');
  });
});

describe('computeTxHash', () => {
  it('is deterministic for identical inputs', () => {
    const a = computeTxHash('acc1', '2025-11-01', -1000, 'CARREFOUR', 0);
    const b = computeTxHash('acc1', '2025-11-01', -1000, 'CARREFOUR', 0);
    expect(a).toBe(b);
  });
  it('returns a 64-char hex SHA-256 string', () => {
    const h = computeTxHash('acc1', '2025-11-01', -1000, 'CARREFOUR', 0);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('canonicalizes amount: 1.1 and 1.10 hash the same', () => {
    expect(computeTxHash('a', '2025-01-01', 1.1, 'X', 0)).toBe(
      computeTxHash('a', '2025-01-01', 1.1, 'X', 0),
    );
    expect(computeTxHash('a', '2025-01-01', 1.1, 'X', 0)).toBe(
      computeTxHash('a', '2025-01-01', 1.100000001, 'X', 0),
    );
  });
  it('normalizes the label before hashing', () => {
    expect(computeTxHash('a', '2025-01-01', 10, 'Crédit', 0)).toBe(
      computeTxHash('a', '2025-01-01', 10, 'CREDIT', 0),
    );
  });
  it('changes when any field changes', () => {
    const base = computeTxHash('a', '2025-01-01', 10, 'X', 0);
    expect(computeTxHash('b', '2025-01-01', 10, 'X', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-02', 10, 'X', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-01', 11, 'X', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-01', 10, 'Y', 0)).not.toBe(base);
    expect(computeTxHash('a', '2025-01-01', 10, 'X', 1)).not.toBe(base);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/import/txHash.test.ts`
Expected: FAIL — `normalizeLabel`/`computeTxHash` not exported (module not found).

- [ ] **Step 3: Implement `txHash.ts` (normalizeLabel + computeTxHash)**

Create `src/main/import/txHash.ts`:

```typescript
import { createHash } from 'node:crypto';

export function normalizeLabel(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeTxHash(
  accountId: string,
  date: string,
  amount: number,
  labelRaw: string,
  orderInImport: number,
): string {
  const input = [
    accountId,
    date,
    amount.toFixed(2),
    normalizeLabel(labelRaw),
    String(orderInImport),
  ].join('|');
  return createHash('sha256').update(input).digest('hex');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import/txHash.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/import/txHash.ts tests/unit/import/txHash.test.ts docs/superpowers/plans/2026-05-17-epic-2-story-5-deduplication.md
git commit -m "feat: add label normalization and transaction hash (#28)"
```

---

### Task 2: Batch hash assignment

**Files:**

- Modify: `src/main/import/txHash.ts` (append `TransactionWithHash` + `assignTxHashes`)
- Test: `tests/unit/import/txHash.test.ts` (append a `describe` block)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/import/txHash.test.ts` (add `assignTxHashes` to the existing import from `../../../src/main/import/txHash`, and import the transaction type):

```typescript
import { assignTxHashes } from '../../../src/main/import/txHash';
import type { ExtractedTransaction } from '../../../src/main/import/pdf/extractTransactions';

describe('assignTxHashes', () => {
  it('assigns a distinct hash to each distinct transaction (all order 0)', () => {
    const txs: ExtractedTransaction[] = [
      { date: '2025-11-01', label: 'CARREFOUR', amount: -50 },
      { date: '2025-11-02', label: 'SALAIRE', amount: 2000 },
    ];
    const out = assignTxHashes('acc1', txs);
    expect(out).toHaveLength(2);
    expect(out[0]?.tx_hash).not.toBe(out[1]?.tx_hash);
    expect(out[0]?.tx_hash).toBe(computeTxHash('acc1', '2025-11-01', -50, 'CARREFOUR', 0));
    expect(out[1]?.tx_hash).toBe(computeTxHash('acc1', '2025-11-02', 2000, 'SALAIRE', 0));
  });

  it('preserves date, label and amount unchanged', () => {
    const txs: ExtractedTransaction[] = [{ date: '2025-11-01', label: 'CARREFOUR', amount: -50 }];
    const out = assignTxHashes('acc1', txs);
    expect(out[0]).toMatchObject({ date: '2025-11-01', label: 'CARREFOUR', amount: -50 });
  });

  it('disambiguates within-batch duplicates with incrementing orderInImport', () => {
    const txs: ExtractedTransaction[] = [
      { date: '2025-11-01', label: 'CARREFOUR', amount: -50 },
      { date: '2025-11-01', label: 'CARREFOUR', amount: -50 },
    ];
    const out = assignTxHashes('acc1', txs);
    expect(out[0]?.tx_hash).toBe(computeTxHash('acc1', '2025-11-01', -50, 'CARREFOUR', 0));
    expect(out[1]?.tx_hash).toBe(computeTxHash('acc1', '2025-11-01', -50, 'CARREFOUR', 1));
    expect(out[0]?.tx_hash).not.toBe(out[1]?.tx_hash);
  });

  it('cross-import: a single occurrence in batch A matches the first occurrence in batch B', () => {
    const batchA: ExtractedTransaction[] = [
      { date: '2025-11-01', label: 'CARREFOUR', amount: -50 },
    ];
    const batchB: ExtractedTransaction[] = [
      { date: '2025-11-01', label: 'CARREFOUR', amount: -50 },
      { date: '2025-11-01', label: 'CARREFOUR', amount: -50 },
    ];
    const a = assignTxHashes('acc1', batchA);
    const b = assignTxHashes('acc1', batchB);
    expect(a[0]?.tx_hash).toBe(b[0]?.tx_hash); // both order 0 → dedup
    expect(a[0]?.tx_hash).not.toBe(b[1]?.tx_hash); // genuine 2nd purchase is new
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/import/txHash.test.ts`
Expected: FAIL — `assignTxHashes` not exported.

- [ ] **Step 3: Implement `assignTxHashes`**

Append to `src/main/import/txHash.ts`:

```typescript
import type { ExtractedTransaction } from './pdf/extractTransactions';

export interface TransactionWithHash {
  date: string;
  label: string;
  amount: number;
  tx_hash: string;
}

export function assignTxHashes(
  accountId: string,
  transactions: ExtractedTransaction[],
): TransactionWithHash[] {
  const counters = new Map<string, number>();
  return transactions.map((tx) => {
    const baseKey = [accountId, tx.date, tx.amount.toFixed(2), normalizeLabel(tx.label)].join('|');
    const orderInImport = counters.get(baseKey) ?? 0;
    counters.set(baseKey, orderInImport + 1);
    return {
      date: tx.date,
      label: tx.label,
      amount: tx.amount,
      tx_hash: computeTxHash(accountId, tx.date, tx.amount, tx.label, orderInImport),
    };
  });
}
```

Note: the `import type { ExtractedTransaction }` line goes at the top of the file with the other imports (move it next to the `node:crypto` import — TypeScript/ESLint require imports at the top).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import/txHash.test.ts`
Expected: PASS (14 tests total).

- [ ] **Step 5: Lint and typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/import/txHash.ts tests/unit/import/txHash.test.ts
git commit -m "feat: add batch transaction hash assignment (#28)"
```

---

### Task 3: Period overlap detection

**Files:**

- Create: `src/main/import/periodOverlap.ts`
- Test: `tests/unit/import/periodOverlap.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/import/periodOverlap.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { checkPeriodOverlap } from '../../../src/main/import/periodOverlap';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO accounts(id,name,type) VALUES('a1','Main','checking')").run();
  db.prepare("INSERT INTO accounts(id,name,type) VALUES('a2','Other','checking')").run();
  return db;
}

function addImport(
  db: DatabaseSync,
  id: string,
  accountId: string,
  start: string,
  end: string,
  status: string,
): void {
  db.prepare(
    `INSERT INTO imports(id,account_id,file_hash,source_type,date_range_start,date_range_end,status)
     VALUES(?,?,?, 'pdf', ?, ?, ?)`,
  ).run(id, accountId, `hash-${id}`, start, end, status);
}

describe('checkPeriodOverlap', () => {
  it('reports no overlap when ranges are disjoint', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-02-01', '2025-02-28');
    expect(r.hasOverlap).toBe(false);
    expect(r.overlappingImports).toEqual([]);
    db.close();
  });

  it('flags a partial overlap', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-15', '2025-02-15');
    expect(r.hasOverlap).toBe(true);
    expect(r.overlappingImports).toHaveLength(1);
    expect(r.overlappingImports[0]?.id).toBe('i1');
    db.close();
  });

  it('treats touching boundaries as overlapping (inclusive)', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-31', '2025-02-28');
    expect(r.hasOverlap).toBe(true);
    db.close();
  });

  it('includes pending_review imports', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'pending_review');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-10', '2025-01-20');
    expect(r.hasOverlap).toBe(true);
    db.close();
  });

  it('ignores cancelled imports', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a1', '2025-01-01', '2025-01-31', 'cancelled');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-10', '2025-01-20');
    expect(r.hasOverlap).toBe(false);
    db.close();
  });

  it('ignores imports on a different account', () => {
    const db = freshDb();
    addImport(db, 'i1', 'a2', '2025-01-01', '2025-01-31', 'validated');
    const r = checkPeriodOverlap(db, 'a1', '2025-01-10', '2025-01-20');
    expect(r.hasOverlap).toBe(false);
    db.close();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/import/periodOverlap.test.ts`
Expected: FAIL — `checkPeriodOverlap` not exported.

- [ ] **Step 3: Implement `periodOverlap.ts`**

Create `src/main/import/periodOverlap.ts`:

```typescript
import type { DatabaseSync } from 'node:sqlite';

export interface OverlappingImport {
  id: string;
  date_range_start: string;
  date_range_end: string;
  status: string;
}

export interface PeriodOverlapResult {
  hasOverlap: boolean;
  overlappingImports: OverlappingImport[];
}

/**
 * Pre-insert contract: call BEFORE inserting the new import row, so the new
 * import never matches itself. Compares against imports that are 'validated'
 * or 'pending_review' for the same account; 'cancelled' imports are ignored.
 * Boundaries are inclusive (end == start counts as an overlap). Non-blocking:
 * this only reports — the caller decides what to do.
 */
export function checkPeriodOverlap(
  db: DatabaseSync,
  accountId: string,
  newStart: string,
  newEnd: string,
): PeriodOverlapResult {
  const rows = db
    .prepare(
      `SELECT id, date_range_start, date_range_end, status
       FROM imports
       WHERE account_id = ?
         AND status IN ('validated', 'pending_review')
         AND date_range_start <= ?
         AND date_range_end   >= ?`,
    )
    .all(accountId, newEnd, newStart) as OverlappingImport[];
  return { hasOverlap: rows.length > 0, overlappingImports: rows };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/import/periodOverlap.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite, lint, typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/main/import/periodOverlap.ts tests/unit/import/periodOverlap.test.ts
git commit -m "feat: add import period overlap detection (#28)"
```

---

## Self-Review

**1. Spec coverage:**

- Spec §3 file structure → File Structure table + Tasks 1–3. ✓
- Spec §5 `checkPeriodOverlap` (interfaces, SQL, inclusive bounds, status filter, pre-insert JSDoc) → Task 3. ✓
- Spec §6.1 `normalizeLabel` → Task 1. ✓
- Spec §6.2 `computeTxHash` (`toFixed(2)`, always-included `orderInImport`, field order/separator) → Task 1. ✓
- Spec §6.3 `assignTxHashes` (statement order, per-base-key counter, returns tx + hash) → Task 2. ✓
- Spec §7 tests (normalizeLabel cases, computeTxHash determinism/canonicalization/sensitivity, assignTxHashes nominal/within-batch/cross-import, checkPeriodOverlap 5 cases) → Tasks 1–3 test steps. ✓
- Spec §4 Level 1 unchanged → no task touches `hashFile.ts`/`duplicateCheck.ts`. ✓

No gaps.

**2. Placeholder scan:** No TBD/TODO/"similar to"/vague steps. Every code step contains complete code.

**3. Type consistency:** `ExtractedTransaction` `{ date; label; amount }` used consistently (Task 2 input). `TransactionWithHash` defined Task 2, adds `tx_hash`. `computeTxHash(accountId, date, amount, labelRaw, orderInImport)` signature identical in Tasks 1 and 2. `checkPeriodOverlap(db, accountId, newStart, newEnd)` and `PeriodOverlapResult`/`OverlappingImport` consistent Task 3. SQL param binding order (`newEnd`, `newStart`) matches the `<= newEnd AND >= newStart` overlap test.

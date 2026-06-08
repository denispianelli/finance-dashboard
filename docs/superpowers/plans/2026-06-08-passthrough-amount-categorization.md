# Passthrough amount-aware categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect passthrough payees (PayPal, SumUp…), keep them out of label-based auto-categorization (history/rules/LLM/fan-out), and categorize them by `label_clean` + exact amount learned from the user's own past categorizations.

**Architecture:** A detector (`buildPassthroughDetector`) flags a label key as passthrough via a seed list or history entropy (≥2 user categories). Passthroughs are routed to an amount-aware history lookup (`findAmountHistoryCategory`) at import, excluded from the LLM pass (`listPendingGroups`), and learned via an amount-scoped fan-out on manual categorization. No new tables — the transactions table is the learning store.

**Tech Stack:** Electron main, `node:sqlite`, Vitest 4.

**Branch:** `feat/passthrough-amount-categorization` (already created off `feat/categorization-dedup`; the spec is committed there). **Depends on `listPendingGroups` from #170.** Do not start until #168/#170 are merged or confirm you are building on the stacked branch.

**Spec:** `docs/superpowers/specs/2026-06-08-passthrough-amount-categorization-design.md`

---

## File Structure

- **Create** `src/main/categorize/passthrough.ts` — `buildPassthroughDetector` (seed + entropy).
- **Modify** `src/main/categorize/history.ts` — add `findAmountHistoryCategory`.
- **Modify** `src/main/categorize/pending.ts` — `listPendingGroups` excludes passthroughs.
- **Create** `src/main/categorize/resolveImportCategory.ts` — the per-transaction import cascade decision (testable; replaces the inline cascade in `insertStatement`).
- **Modify** `src/main/import/insertStatement.ts` — call `resolveImportCategory`.
- **Modify** `src/main/categorize/manage.ts` — amount-scoped fan-out for passthroughs.
- **Tests:** new `passthrough.test.ts`, `amountHistory.test.ts`, `resolveImportCategory.test.ts`, `passthroughPropagate.test.ts`; update `pending.test.ts` + `tests/unit/ipc/categorize.test.ts` (they used `PAYPAL` as a sample label, now excluded).

Perf index on `(label_clean, amount)` from spec §F is **deferred** (YAGNI at current scale; existing `label_clean` lookups are already unindexed and fine).

---

## Task 1: Passthrough detector

**Files:**

- Create: `src/main/categorize/passthrough.ts`
- Test: `tests/unit/categorize/passthrough.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { buildPassthroughDetector } from '../../../src/main/categorize/passthrough';

let db: DatabaseSync;

function insertUserCat(label: string, categoryId: string): void {
  const id = `t-${label}-${categoryId}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', -10, ?, ?, ?, 1)`,
  ).run(id, id, label, label.toUpperCase(), categoryId);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});
afterEach(() => {
  db.close();
});

describe('buildPassthroughDetector', () => {
  it('flags seed payees by whole token, regardless of history', () => {
    const is = buildPassthroughDetector(db);
    expect(is('PRLV SEPA PAYPAL EUROPE')).toBe(true);
    expect(is('CB SUMUP PILLAJO')).toBe(true);
    expect(is('CB CARREFOUR MARKET')).toBe(false);
  });

  it('does not match a seed token embedded in a longer word', () => {
    const is = buildPassthroughDetector(db);
    expect(is('CB PAYPALOOZA FESTIVAL')).toBe(false); // "PAYPALOOZA" != token "PAYPAL"
  });

  it('flags a key the user filed under >=2 distinct categories (entropy)', () => {
    insertUserCat('MYSTORE', 'cat-alimentation');
    insertUserCat('MYSTORE', 'cat-loisirs'); // same label_clean, a second distinct category
    const is = buildPassthroughDetector(db);
    expect(is('MYSTORE')).toBe(true);
  });

  it('does not flag a key with a single user category', () => {
    insertUserCat('ONESHOP', 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    expect(is('ONESHOP')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run tests/unit/categorize/passthrough.test.ts`
Expected: FAIL — `buildPassthroughDetector` not found.

- [ ] **Step 3: Implement** — create `src/main/categorize/passthrough.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import { stableLabelKey } from './labelKey';

/** Payees that settle unrelated purchases under one identical label — categorized
 *  by amount, never by label. Matched as whole tokens (a label key is uppercase and
 *  space-separated), so distinctive names only: no first names / short tokens. */
const PASSTHROUGH_SEED = new Set(['PAYPAL', 'SUMUP', 'LEETCHI']);

function matchesSeed(labelKey: string): boolean {
  return labelKey.split(' ').some((token) => PASSTHROUGH_SEED.has(token));
}

/**
 * Build a predicate telling whether a label key (stableLabelKey output) is a
 * passthrough payee: a seed token (cold-start) OR a key the user has filed under
 * >=2 distinct categories (self-tuning). The entropy map is computed once from the
 * user-categorized rows and reused across the pass.
 */
export function buildPassthroughDetector(db: DatabaseSync): (labelKey: string) => boolean {
  const rows = db
    .prepare(
      `SELECT label_clean, category_id FROM transactions
        WHERE user_modified = 1 AND category_id IS NOT NULL`,
    )
    .all() as unknown as { label_clean: string; category_id: string }[];

  const cats = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = stableLabelKey(r.label_clean);
    let set = cats.get(key);
    if (set === undefined) {
      set = new Set<string>();
      cats.set(key, set);
    }
    set.add(r.category_id);
  }

  return (labelKey: string): boolean =>
    matchesSeed(labelKey) || (cats.get(labelKey)?.size ?? 0) >= 2;
}
```

- [ ] **Step 4: Run it — verify PASS**

Run: `npx vitest run tests/unit/categorize/passthrough.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → exit 0.

```bash
git add src/main/categorize/passthrough.ts tests/unit/categorize/passthrough.test.ts
git commit -m "feat(categorize): passthrough payee detector (seed + history entropy)"
```

---

## Task 2: Amount-aware history lookup

**Files:**

- Modify: `src/main/categorize/history.ts`
- Test: `tests/unit/categorize/amountHistory.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { findAmountHistoryCategory } from '../../../src/main/categorize/history';

let db: DatabaseSync;

function seedCategorized(id: string, labelClean: string, amount: number, categoryId: string): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', ?, ?, ?, ?, 1)`,
  ).run(id, id, amount, labelClean, labelClean, categoryId);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});
afterEach(() => {
  db.close();
});

describe('findAmountHistoryCategory', () => {
  it('returns the learned category for the same label + exact amount (to the cent)', () => {
    seedCategorized('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    expect(findAmountHistoryCategory(db, 'PAYPAL', -17.2)).toBe('cat-alimentation');
  });

  it('does not match a different amount', () => {
    seedCategorized('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    expect(findAmountHistoryCategory(db, 'PAYPAL', -43)).toBeNull();
  });

  it('does not match a different label', () => {
    seedCategorized('p1', 'PAYPAL', -17.2, 'cat-alimentation');
    expect(findAmountHistoryCategory(db, 'SUMUP', -17.2)).toBeNull();
  });

  it('returns null when nothing was learned', () => {
    expect(findAmountHistoryCategory(db, 'PAYPAL', -17.2)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run tests/unit/categorize/amountHistory.test.ts`
Expected: FAIL — `findAmountHistoryCategory` not exported.

- [ ] **Step 3: Implement** — append to `src/main/categorize/history.ts`:

```ts
/**
 * Like findHistoryCategory but matched on label_clean AND the exact amount (to the
 * cent). For passthrough payees (PayPal…) the label is ambiguous but a recurring
 * amount is reliable: (PayPal, 17.20) -> Abonnements. user_modified wins; ties on
 * frequency. Cent-rounded comparison avoids float-equality pitfalls.
 */
export function findAmountHistoryCategory(
  db: DatabaseSync,
  labelClean: string,
  amount: number,
): string | null {
  const cents = Math.round(amount * 100);
  const row = db
    .prepare(
      `SELECT category_id
         FROM transactions
        WHERE label_clean = ?
          AND CAST(ROUND(amount * 100) AS INTEGER) = ?
          AND category_id IS NOT NULL
        GROUP BY category_id
        ORDER BY MAX(user_modified) DESC, COUNT(*) DESC
        LIMIT 1`,
    )
    .get(labelClean, cents) as unknown as { category_id: string } | undefined;
  return row?.category_id ?? null;
}
```

- [ ] **Step 4: Run it — verify PASS**

Run: `npx vitest run tests/unit/categorize/amountHistory.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/main/categorize/history.ts tests/unit/categorize/amountHistory.test.ts
git commit -m "feat(categorize): amount-aware history lookup for passthroughs"
```

---

## Task 3: Exclude passthroughs from the LLM pass

**Files:**

- Modify: `src/main/categorize/pending.ts`
- Modify: `tests/unit/categorize/pending.test.ts` (a #170 test used PAYPAL as a sample label — now excluded)
- Modify: `tests/unit/ipc/categorize.test.ts` (same)

- [ ] **Step 1: Update `listPendingGroups` to drop passthrough groups**

In `src/main/categorize/pending.ts`, add the import:

```ts
import { buildPassthroughDetector } from './passthrough';
```

Then in `listPendingGroups`, build the detector and filter the result. Change the final `return [...groups.values()];` to:

```ts
const isPassthrough = buildPassthroughDetector(db);
return [...groups.values()].filter((g) => !isPassthrough(g.key));
```

(Place the `const isPassthrough = …` line just before the `return`.) Also extend the doc-comment's first line with: `Passthrough payees (PayPal…) are excluded — they are categorized by amount, not label.`

- [ ] **Step 2: Fix the two #170 tests that assumed PAYPAL survives grouping**

In `tests/unit/categorize/pending.test.ts`, the `listPendingGroups` "collapses rows sharing a stable key" test uses `VIR PAYPAL …`. PAYPAL is now a passthrough (excluded), so replace those labels with a non-passthrough recurring label. Change:

```ts
insertTx({ id: 't1', label: 'VIR PAYPAL 12/03/25' });
insertTx({ id: 't2', label: 'VIR PAYPAL 14/05/25' }); // same key as t1
insertTx({ id: 't3', label: 'CARREFOUR MARKET' });

const groups = listPendingGroups(db);

expect(groups).toEqual([
  { key: 'VIR PAYPAL', label: 'VIR PAYPAL 12/03/25', count: 2 },
  { key: 'CARREFOUR MARKET', label: 'CARREFOUR MARKET', count: 1 },
]);
```

to:

```ts
insertTx({ id: 't1', label: 'VIR LOYER 12/03/25' });
insertTx({ id: 't2', label: 'VIR LOYER 14/05/25' }); // same key as t1
insertTx({ id: 't3', label: 'CARREFOUR MARKET' });

const groups = listPendingGroups(db);

expect(groups).toEqual([
  { key: 'VIR LOYER', label: 'VIR LOYER 12/03/25', count: 2 },
  { key: 'CARREFOUR MARKET', label: 'CARREFOUR MARKET', count: 1 },
]);
```

(The `applyCategoryToKey` tests in that file call the function directly with a `'VIR PAYPAL'` key — they do **not** go through `listPendingGroups`, so leave them unchanged; they still pass.)

In `tests/unit/ipc/categorize.test.ts`, the `handleCategorizePending` test inserts `VIR PAYPAL …`. Replace its three inserts + expectation the same way:

```ts
insertUncategorized('t1', 'VIR LOYER 12/03/25');
insertUncategorized('t2', 'VIR LOYER 14/05/25');
insertUncategorized('t3', 'CARREFOUR');
expect(handleCategorizePending()).toEqual({
  groups: [
    { key: 'VIR LOYER', label: 'VIR LOYER 12/03/25', count: 2 },
    { key: 'CARREFOUR', label: 'CARREFOUR', count: 1 },
  ],
});
```

(Leave the `handleCategorizeBatch` tests in that file unchanged — they call the handler with an explicit `{ key, label }` and don't depend on passthrough filtering.)

- [ ] **Step 3: Add a passthrough-exclusion test**

Append to `tests/unit/categorize/pending.test.ts`, inside the `describe('listPendingGroups', …)` block:

```ts
it('excludes passthrough labels (they are categorized by amount, not the LLM)', () => {
  insertTx({ id: 'p1', label: 'PRLV SEPA PAYPAL EUROPE' });
  insertTx({ id: 'p2', label: 'PRLV SEPA PAYPAL EUROPE' });
  insertTx({ id: 'c1', label: 'CARREFOUR MARKET' });

  expect(listPendingGroups(db).map((g) => g.key)).toEqual(['CARREFOUR MARKET']);
});
```

- [ ] **Step 4: Run the affected tests + typecheck**

Run: `npm run typecheck` → exit 0.
Run: `npx vitest run tests/unit/categorize/pending.test.ts tests/unit/ipc/categorize.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/categorize/pending.ts tests/unit/categorize/pending.test.ts tests/unit/ipc/categorize.test.ts
git commit -m "feat(categorize): keep passthroughs out of the LLM pass"
```

---

## Task 4: Import cascade routes passthroughs to amount-history

**Files:**

- Create: `src/main/categorize/resolveImportCategory.ts`
- Test: `tests/unit/categorize/resolveImportCategory.test.ts`
- Modify: `src/main/import/insertStatement.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { loadRules } from '../../../src/main/categorize/rules';
import { buildPassthroughDetector } from '../../../src/main/categorize/passthrough';
import { resolveImportCategory } from '../../../src/main/categorize/resolveImportCategory';

let db: DatabaseSync;

function seedCategorized(id: string, labelClean: string, amount: number, categoryId: string): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', ?, ?, ?, ?, 1)`,
  ).run(id, id, amount, labelClean, labelClean, categoryId);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});
afterEach(() => {
  db.close();
});

describe('resolveImportCategory', () => {
  it('passthrough: matches a learned (label, amount), ignoring label history', () => {
    seedCategorized('p1', 'PRLV SEPA PAYPAL EUROPE', -17.2, 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    const res = resolveImportCategory(db, 'PRLV SEPA PAYPAL EUROPE', -17.2, loadRules(db), is);
    expect(res).toEqual({ categoryId: 'cat-alimentation', ruleId: null });
  });

  it('passthrough with an unseen amount stays uncategorized', () => {
    seedCategorized('p1', 'PRLV SEPA PAYPAL EUROPE', -17.2, 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    const res = resolveImportCategory(db, 'PRLV SEPA PAYPAL EUROPE', -43, loadRules(db), is);
    expect(res).toEqual({ categoryId: null, ruleId: null });
  });

  it('non-passthrough uses label history', () => {
    seedCategorized('c1', 'CARREFOUR MARKET', -10, 'cat-alimentation');
    const is = buildPassthroughDetector(db);
    const res = resolveImportCategory(db, 'CARREFOUR MARKET', -99, loadRules(db), is);
    expect(res).toEqual({ categoryId: 'cat-alimentation', ruleId: null }); // amount irrelevant for normal labels
  });
});
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run tests/unit/categorize/resolveImportCategory.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/main/categorize/resolveImportCategory.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';
import { stableLabelKey } from './labelKey';
import { findHistoryCategory, findAmountHistoryCategory } from './history';
import { matchRule, type CategorizationRule } from './rules';

/**
 * The deterministic per-transaction categorization decision used at import.
 * Passthrough payees (detected) are routed to the amount-aware history (their label
 * is ambiguous); everything else uses the label cascade (history -> rules). Returns
 * the chosen category and the matched rule id (so the caller can bump hit counts).
 */
export function resolveImportCategory(
  db: DatabaseSync,
  labelClean: string,
  amount: number,
  rules: readonly CategorizationRule[],
  isPassthrough: (labelKey: string) => boolean,
): { categoryId: string | null; ruleId: string | null } {
  if (isPassthrough(stableLabelKey(labelClean))) {
    return { categoryId: findAmountHistoryCategory(db, labelClean, amount), ruleId: null };
  }
  const hist = findHistoryCategory(db, labelClean);
  if (hist !== null) return { categoryId: hist, ruleId: null };
  const rule = matchRule(rules, labelClean);
  if (rule !== null) return { categoryId: rule.categoryId, ruleId: rule.id };
  return { categoryId: null, ruleId: null };
}
```

- [ ] **Step 4: Run it — verify PASS**

Run: `npx vitest run tests/unit/categorize/resolveImportCategory.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire it into `insertStatement.ts`**

In `src/main/import/insertStatement.ts`, add imports:

```ts
import { buildPassthroughDetector } from '../categorize/passthrough';
import { resolveImportCategory } from '../categorize/resolveImportCategory';
```

(You may remove the now-unused `findHistoryCategory` and `matchRule` imports if nothing else in the file uses them — check first.)

Just before the `for (const tx of extraction.transactions)` loop (right after `const rules = loadRules(db);`), add:

```ts
const isPassthrough = buildPassthroughDetector(db);
```

Replace the inline cascade — these lines:

```ts
const labelClean = normalizeLabel(tx.label);
let categoryId = findHistoryCategory(db, labelClean);
if (categoryId === null) {
  const rule = matchRule(rules, labelClean);
  if (rule !== null) {
    categoryId = rule.categoryId;
    hits.set(rule.id, (hits.get(rule.id) ?? 0) + 1);
  }
}
```

with:

```ts
const labelClean = normalizeLabel(tx.label);
const { categoryId, ruleId } = resolveImportCategory(
  db,
  labelClean,
  tx.amount,
  rules,
  isPassthrough,
);
if (ruleId !== null) hits.set(ruleId, (hits.get(ruleId) ?? 0) + 1);
```

- [ ] **Step 6: Run the import tests + typecheck**

Run: `npm run typecheck` → exit 0.
Run: `npx vitest run tests/unit/import tests/integration/import/insertStatement.test.ts`
Expected: all pass (existing import behaviour preserved for normal labels).

- [ ] **Step 7: Commit**

```bash
git add src/main/categorize/resolveImportCategory.ts tests/unit/categorize/resolveImportCategory.test.ts src/main/import/insertStatement.ts
git commit -m "feat(import): route passthroughs to amount-history in the cascade"
```

---

## Task 5: Learn on manual categorize (amount-scoped fan-out)

**Files:**

- Modify: `src/main/categorize/manage.ts`
- Test: `tests/unit/categorize/passthroughPropagate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { setTransactionCategory } from '../../../src/main/categorize/manage';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('DELETE FROM accounts');
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('perso', 'Perso', 'checking')").run();
  return db;
}

let seq = 0;
function seed(db: DatabaseSync, label: string, amount: number): string {
  seq += 1;
  const id = `t${String(seq)}`;
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
     VALUES (?, 'perso', ?, '2025-03-01', ?, ?, ?, NULL, 0)`,
  ).run(id, id, amount, label, label);
  return id;
}
function catOf(db: DatabaseSync, id: string): string | null {
  return (
    db.prepare('SELECT category_id AS c FROM transactions WHERE id = ?').get(id) as {
      c: string | null;
    }
  ).c;
}

describe('setTransactionCategory — passthrough amount-scoped fan-out', () => {
  it('fans the category to same (label + amount) rows only', () => {
    const db = freshDb();
    const a = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2); // clicked
    const b = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2); // same label+amount
    const c = seed(db, 'PRLV SEPA PAYPAL EUROPE', -43); // same label, other amount
    const d = seed(db, 'CARREFOUR MARKET', -17.2); // other label, same amount

    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-alimentation' });

    expect(catOf(db, a)).toBe('cat-alimentation');
    expect(catOf(db, b)).toBe('cat-alimentation'); // fanned out
    expect(catOf(db, c)).toBeNull(); // different amount untouched
    expect(catOf(db, d)).toBeNull(); // different label untouched
    db.close();
  });

  it('does not overwrite a row already categorized by hand', () => {
    const db = freshDb();
    const a = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2);
    const b = seed(db, 'PRLV SEPA PAYPAL EUROPE', -17.2);
    setTransactionCategory(db, { transactionId: b, categoryId: 'cat-loisirs' }); // b set first
    setTransactionCategory(db, { transactionId: a, categoryId: 'cat-alimentation' }); // a + fan-out

    expect(catOf(db, a)).toBe('cat-alimentation');
    expect(catOf(db, b)).toBe('cat-loisirs'); // kept (already categorized)
    db.close();
  });
});
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run tests/unit/categorize/passthroughPropagate.test.ts`
Expected: FAIL — `b` is still null (no amount fan-out yet).

- [ ] **Step 3: Implement** — in `src/main/categorize/manage.ts`:

(a) Add the import (next to the existing `stableLabelKey` import):

```ts
import { buildPassthroughDetector } from './passthrough';
```

(b) Change the row fetch in `setTransactionCategory` to also read `amount`:

```ts
const row = db
  .prepare('SELECT label_clean, amount FROM transactions WHERE id = ?')
  .get(input.transactionId) as { label_clean: string; amount: number } | undefined;
```

(c) Replace the propagation block:

```ts
if (PROPAGATING_CATEGORIES.has(input.categoryId)) {
  propagateCategory(db, input.transactionId, row.label_clean, input.categoryId);
}
```

with:

```ts
const isPassthrough = buildPassthroughDetector(db);
if (isPassthrough(stableLabelKey(row.label_clean))) {
  // A passthrough label maps to different categories per amount — fan out by
  // (label + amount), never by label alone.
  propagateCategoryByAmount(db, input.transactionId, row.label_clean, row.amount, input.categoryId);
} else if (PROPAGATING_CATEGORIES.has(input.categoryId)) {
  propagateCategory(db, input.transactionId, row.label_clean, input.categoryId);
}
```

(d) Add the new function (next to `propagateCategory`):

```ts
/** Fan a manually-chosen category out to every still-uncategorized row with the
 *  same label_clean AND the same amount (cent-exact) — the correct scope for a
 *  passthrough payee, where one label legitimately spans many categories. No rule
 *  is created: the categorized rows themselves are the learning store. */
function propagateCategoryByAmount(
  db: DatabaseSync,
  sourceId: string,
  labelClean: string,
  amount: number,
  categoryId: string,
): void {
  const cents = Math.round(amount * 100);
  db.prepare(
    `UPDATE transactions
        SET category_id = ?, user_modified = 1
      WHERE label_clean = ?
        AND CAST(ROUND(amount * 100) AS INTEGER) = ?
        AND id != ?
        AND category_id IS NULL`,
  ).run(categoryId, labelClean, cents, sourceId);
}
```

- [ ] **Step 4: Run it — verify PASS, and confirm the existing propagation still works**

Run: `npx vitest run tests/unit/categorize/passthroughPropagate.test.ts tests/unit/categorize/propagate.test.ts tests/unit/categorize/manage.test.ts`
Expected: all pass (the existing Transfert/Remboursement label propagation is unchanged for non-passthrough labels).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck` → exit 0.

```bash
git add src/main/categorize/manage.ts tests/unit/categorize/passthroughPropagate.test.ts
git commit -m "feat(categorize): learn passthrough categories by (label + amount)"
```

---

## Task 6: Full gate + push + PR

- [ ] **Step 1: Run the full local gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all four succeed.

- [ ] **Step 2: Push**

Run: `git push -u origin feat/passthrough-amount-categorization`
Expected: branch pushed.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(categorize): passthrough payees categorized by amount" --body "$(cat <<'EOF'
## What
Passthrough payees (PayPal, SumUp…) settle unrelated purchases under one identical
label. This stops categorizing them by label and instead categorizes them by
**(label + exact amount)**, learned from the user's own corrections.

## Why
Their label carries no merchant, so the dedup fan-out would stamp one category onto
all of them — harmless with the 3B (AUCUNE) but harmful with a stronger model
(Qwen-7B files PayPal -> Frais bancaires). This is the prerequisite for adopting a
bigger model. See `docs/superpowers/specs/2026-06-08-passthrough-amount-categorization-design.md`.

## How
- `buildPassthroughDetector` — seed list (PAYPAL/SUMUP/LEETCHI, whole-word) + history
  entropy (a key filed under >=2 categories).
- `findAmountHistoryCategory` — learned (label, amount) -> category (cent-exact).
- `listPendingGroups` excludes passthroughs (no LLM, no label fan-out).
- Import cascade (`resolveImportCategory`) routes passthroughs to amount-history.
- Manual categorize fans out by (label + amount), never by label.
- No new tables — the transactions table is the learning store.

## Validation
- [x] Unit tests: detector, amount-history, cascade, pending exclusion, amount fan-out.
- [x] Full local gate green: typecheck, lint, tests, build.
- [ ] Maintainer to run the app: categorize a PayPal at one amount, confirm same-amount
      ones follow and other amounts stay manual.

> Stacked on #170 (dedup). **Do not self-merge** — user-facing; validate in-app first.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL.

---

## Self-Review

**Spec coverage:**

- A. Detection (seed whole-word + entropy ≥2) → Task 1. ✓
- B. `findAmountHistoryCategory` (cent-exact, user_modified wins) → Task 2. ✓
- C. Import cascade branches on passthrough → Task 4 (`resolveImportCategory` + wiring). ✓
- D. `listPendingGroups` excludes passthroughs → Task 3. ✓
- E. Amount-scoped fan-out on manual categorize → Task 5. ✓
- F. Perf index → **intentionally deferred** (YAGNI at ~900 rows; noted in File Structure). Not a gap.
- Seed = `PAYPAL, SUMUP, LEETCHI`, whole-word → Task 1 matches `labelKey.split(' ')`. ✓
- "Amazon / any ≥2-split label becomes amount-driven" → emerges from the entropy detector (Task 1), no extra code. ✓

**Placeholder scan:** No TBD/TODO; every code/test step is complete; the one "remove unused imports if nothing else uses them" (Task 4 Step 5) is a concrete conditional check, not a vague instruction.

**Type/name consistency:** `buildPassthroughDetector(db) => (labelKey) => boolean` used identically in Tasks 1/3/4/5. `findAmountHistoryCategory(db, labelClean, amount)` consistent in Tasks 2/4. `resolveImportCategory(...)` returns `{ categoryId, ruleId }`, consumed exactly that way in `insertStatement`. `propagateCategoryByAmount(db, sourceId, labelClean, amount, categoryId)` defined and called consistently. `CategorizationRule` is the existing exported type from `rules.ts`. ✓

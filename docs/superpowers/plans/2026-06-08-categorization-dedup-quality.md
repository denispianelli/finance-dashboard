# Categorization dedup + one-label-per-call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify each _distinct_ transaction label once, in its own LLM call, and apply the result to all rows sharing that label — removing batch anchoring and cross-batch contradictions — plus a skeleton effect on rows being categorized.

**Architecture:** Group pending transactions by the existing `stableLabelKey(label_clean)`; the renderer iterates groups oldest-first, one `categorize:batch` call per group (no anchoring), and main applies the result to every row of the key. The prompt/parse code is reused unchanged (called with a single-item array). A `Skeleton` shimmer shows in the category cell of uncategorized rows while a pass runs.

**Tech Stack:** Electron + typed IPC, `node:sqlite`, React + Tailwind/shadcn, Vitest 4 (jsdom for renderer).

**Branch:** `feat/categorization-dedup` (already created off `main`; the spec is already committed there). Note: this branch does not contain the GPU tooling from PR #168 — that's fine, the code here is independent. Ideally #168 merges first; otherwise rebase later.

**Spec:** `docs/superpowers/specs/2026-06-08-categorization-dedup-quality-design.md`

---

## File Structure

- `src/shared/types/import.ts` — add `PendingGroup`.
- `src/shared/types/ipc.ts` — flip `categorize:pending` / `categorize:batch` shapes.
- `src/main/categorize/pending.ts` — add `listPendingGroups` + `applyCategoryToKey`; remove `listUncategorized` + `applyCategory`.
- `src/main/ipc/handlers/categorize.ts` — group-based handlers.
- `src/renderer/hooks/useBackgroundCategorization.ts` — one-call-per-group loop.
- `src/renderer/components/ui/skeleton.tsx` — new shadcn primitive.
- `src/renderer/lib/dashboardMap.ts` + `src/renderer/components/dashboard/TxTable.tsx` — `uncategorized` flag + skeleton cell.
- `src/renderer/lib/outletContext.ts`, `src/renderer/components/AppShell.tsx`, `src/renderer/pages/TransactionsPage.tsx` — thread `categorizing`.
- Tests: `tests/unit/categorize/pending.test.ts`, `tests/unit/ipc/categorize.test.ts`, `tests/unit/renderer/useBackgroundCategorization.test.ts`, plus a new `tests/unit/renderer/TxTableSkeleton.test.tsx`; update `tests/unit/renderer/dashboardMap.test.ts` + `tests/unit/renderer/TxTable.test.tsx` for the new field.

`src/main/categorize/llm.ts` is unchanged.

---

## Task 1: Dedup primitives in `pending.ts` (pure logic, TDD)

Adds the two new functions alongside the existing ones (kept until Task 2) so the build stays green.

**Files:**

- Modify: `src/shared/types/import.ts`
- Modify: `src/main/categorize/pending.ts`
- Test: `tests/unit/categorize/pending.test.ts` (replace contents)

- [ ] **Step 1: Add the `PendingGroup` type**

In `src/shared/types/import.ts`, add after the `CategorizeItem` interface (around line 57):

```ts
/** A distinct pending label (grouped by stableLabelKey): classified once by the
 *  LLM, then applied to every transaction sharing it. */
export interface PendingGroup {
  key: string; // stableLabelKey of the group
  label: string; // representative label_raw (the group's oldest row) — the LLM reads this
  count: number; // how many pending transactions share the key
}
```

- [ ] **Step 2: Write the failing tests** (replace the whole file `tests/unit/categorize/pending.test.ts`)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { listPendingGroups, applyCategoryToKey } from '../../../src/main/categorize/pending';

let db: DatabaseSync;

function insertTx(opts: {
  id: string;
  label: string;
  categoryId?: string | null;
  internal?: boolean;
}): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, is_internal_transfer, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', -10, ?, ?, ?, ?, 0)`,
  ).run(
    opts.id,
    opts.id,
    opts.label,
    opts.label.toUpperCase(),
    opts.categoryId ?? null,
    opts.internal === true ? 1 : 0,
  );
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('listPendingGroups', () => {
  it('collapses rows sharing a stable key into one group, oldest-first, with count and representative label', () => {
    insertTx({ id: 't1', label: 'VIR PAYPAL 12/03/25' });
    insertTx({ id: 't2', label: 'VIR PAYPAL 14/05/25' }); // same key as t1
    insertTx({ id: 't3', label: 'CARREFOUR MARKET' });

    const groups = listPendingGroups(db);

    expect(groups).toEqual([
      { key: 'VIR PAYPAL', label: 'VIR PAYPAL 12/03/25', count: 2 },
      { key: 'CARREFOUR MARKET', label: 'CARREFOUR MARKET', count: 1 },
    ]);
  });

  it('excludes categorized and internal-transfer rows', () => {
    insertTx({ id: 't1', label: 'CARREFOUR', categoryId: 'cat-alimentation' });
    insertTx({ id: 't2', label: 'VIR INTERNE', internal: true });
    insertTx({ id: 't3', label: 'ZZZ UNSEEN' });

    expect(listPendingGroups(db).map((g) => g.key)).toEqual(['ZZZ UNSEEN']);
  });
});

describe('applyCategoryToKey', () => {
  it('applies the category to every still-uncategorized row of the key and returns the count', () => {
    insertTx({ id: 't1', label: 'VIR PAYPAL 12/03/25' });
    insertTx({ id: 't2', label: 'VIR PAYPAL 14/05/25' });
    insertTx({ id: 't3', label: 'CARREFOUR' });

    const applied = applyCategoryToKey(db, 'VIR PAYPAL', 'cat-alimentation');

    expect(applied).toBe(2);
    expect(
      db.prepare('SELECT category_id, user_modified FROM transactions WHERE id = ?').get('t1'),
    ).toMatchObject({ category_id: 'cat-alimentation', user_modified: 0 });
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t2')).toMatchObject(
      { category_id: 'cat-alimentation' },
    );
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t3')).toMatchObject(
      { category_id: null },
    );
  });

  it('never overwrites a row categorized meanwhile (manual pick wins)', () => {
    insertTx({ id: 't1', label: 'VIR PAYPAL 12/03/25', categoryId: 'cat-loisirs' });
    insertTx({ id: 't2', label: 'VIR PAYPAL 14/05/25' });

    const applied = applyCategoryToKey(db, 'VIR PAYPAL', 'cat-alimentation');

    expect(applied).toBe(1); // only t2
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1')).toMatchObject(
      {
        category_id: 'cat-loisirs',
      },
    );
  });
});
```

- [ ] **Step 3: Run the tests — verify they FAIL**

Run: `npx vitest run tests/unit/categorize/pending.test.ts`
Expected: FAIL — `listPendingGroups` / `applyCategoryToKey` are not exported yet.

- [ ] **Step 4: Implement the two functions**

In `src/main/categorize/pending.ts`, add these imports at the top (keep the existing `CategorizeItem` import and the existing functions for now):

```ts
import type { PendingGroup } from '@shared/types/import';
import { stableLabelKey } from './labelKey';
```

Then append:

```ts
/**
 * Pending transactions grouped by their stable label key (see stableLabelKey).
 * Each distinct label is one group, so the LLM classifies it once and the result
 * fans out to all rows sharing it — killing the per-row inconsistency we measured.
 * Oldest-first: the representative `label` is the oldest row's faithful label_raw.
 */
export function listPendingGroups(db: DatabaseSync): PendingGroup[] {
  const rows = db
    .prepare(
      `SELECT id, label_raw, label_clean
         FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0
        ORDER BY date ASC, rowid ASC`,
    )
    .all() as unknown as { id: string; label_raw: string; label_clean: string }[];

  const groups = new Map<string, PendingGroup>();
  for (const r of rows) {
    const key = stableLabelKey(r.label_clean);
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { key, label: r.label_raw, count: 1 });
  }
  return [...groups.values()];
}

/**
 * Apply an LLM-suggested category to every *still-uncategorized* row whose stable
 * key matches `key`. stableLabelKey (JS) is the single source of grouping truth —
 * exact, unlike a SQL substring match. `user_modified` stays 0 (auto), so the
 * history tier reuses it on the next import; no rule is created. Returns the count.
 */
export function applyCategoryToKey(db: DatabaseSync, key: string, categoryId: string): number {
  const rows = db
    .prepare(
      `SELECT id, label_clean FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0`,
    )
    .all() as unknown as { id: string; label_clean: string }[];

  const ids = rows.filter((r) => stableLabelKey(r.label_clean) === key).map((r) => r.id);
  if (ids.length === 0) return 0;

  const placeholders = ids.map(() => '?').join(',');
  const res = db
    .prepare(
      `UPDATE transactions SET category_id = ?
        WHERE id IN (${placeholders}) AND category_id IS NULL`,
    )
    .run(categoryId, ...ids);
  return Number(res.changes);
}
```

- [ ] **Step 5: Run the tests — verify they PASS**

Run: `npx vitest run tests/unit/categorize/pending.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck` → expected: exit 0.

```bash
git add src/shared/types/import.ts src/main/categorize/pending.ts tests/unit/categorize/pending.test.ts
git commit -m "feat(categorize): dedup pending transactions by stable label key"
```

---

## Task 2: Flip the IPC contract to groups (one call per label)

Atomic contract change: types + handler + hook move from per-item to per-group together (they share the IPC types, so they must change in one commit to stay green). Removes the now-dead `listUncategorized` / `applyCategory`.

**Files:**

- Modify: `src/shared/types/ipc.ts:7,94-100`
- Modify: `src/main/ipc/handlers/categorize.ts`
- Modify: `src/main/categorize/pending.ts` (remove dead functions)
- Modify: `src/renderer/hooks/useBackgroundCategorization.ts`
- Test: `tests/unit/ipc/categorize.test.ts` (replace), `tests/unit/renderer/useBackgroundCategorization.test.ts` (replace)

- [ ] **Step 1: Update the IPC types**

In `src/shared/types/ipc.ts`, change the import on line 7 from:

```ts
import type { StatementExtraction, CategorizeItem } from './import';
```

to:

```ts
import type { StatementExtraction, PendingGroup } from './import';
```

Then change the two interfaces (around lines 94-100) from:

```ts
export interface CategorizePendingResponse {
  items: CategorizeItem[];
}

export interface CategorizeBatchPayload {
  items: CategorizeItem[];
}
```

to:

```ts
export interface CategorizePendingResponse {
  groups: PendingGroup[];
}

export interface CategorizeBatchPayload {
  key: string;
  label: string;
}
```

(Leave `CategorizeBatchResponse` and the channel map lines unchanged.)

- [ ] **Step 2: Update the handler**

Replace the whole body of `src/main/ipc/handlers/categorize.ts` with:

```ts
import type {
  CategorizePendingResponse,
  CategorizeBatchPayload,
  CategorizeBatchResponse,
} from '@shared/types/ipc';
import { getDb } from '../../db';
import { getModel, isModelAvailable } from '../../llm/llm';
import { modelsDir } from '../../llm/modelsDir';
import { categorizeBatch, type LlmCategory } from '../../categorize/llm';
import { listPendingGroups, applyCategoryToKey } from '../../categorize/pending';

/** Distinct pending labels (drives the background loop — one call per label). */
export function handleCategorizePending(): CategorizePendingResponse {
  return { groups: listPendingGroups(getDb()) };
}

/**
 * Classify ONE distinct label (no batch anchoring) and apply the result to every
 * transaction sharing its key. Best-effort: the renderer loop tolerates both error
 * codes (`model_unavailable` stops the pass, `inference_failed` skips this label).
 */
export async function handleCategorizeBatch(
  payload: CategorizeBatchPayload,
): Promise<CategorizeBatchResponse> {
  const dir = modelsDir();
  if (!isModelAvailable(dir)) return { ok: false, error: 'model_unavailable' };

  const db = getDb();
  const categories = db
    .prepare('SELECT id, name FROM categories WHERE deprecated_at IS NULL ORDER BY position')
    .all() as unknown as LlmCategory[];

  try {
    const model = await getModel(dir);
    const results = await categorizeBatch(model, categories, [
      { id: payload.key, label: payload.label },
    ]);
    const categoryId = results[0]?.categoryId ?? null;
    const applied = categoryId === null ? 0 : applyCategoryToKey(db, payload.key, categoryId);
    return { ok: true, applied };
  } catch {
    return { ok: false, error: 'inference_failed' };
  }
}
```

- [ ] **Step 3: Remove the dead functions from `pending.ts`**

In `src/main/categorize/pending.ts`, delete the `listUncategorized` function and the `applyCategory` function (and their doc comments). Also remove the now-unused `CategorizeItem` import if nothing else uses it (keep the `PendingGroup` and `stableLabelKey` imports and the `DatabaseSync` import).

- [ ] **Step 4: Rewrite the hook** (replace the whole file `src/renderer/hooks/useBackgroundCategorization.ts`)

```ts
import { useCallback, useRef, useState } from 'react';
import { ipc } from '@renderer/ipc/client';

export interface BackgroundCategorization {
  /** True while a categorization pass is in flight. */
  running: boolean;
  /** Count of uncategorized transactions (Σ group counts) — drives the Topbar trigger. */
  pending: number;
  /** Distinct labels still to process in the active pass — drives the running count. */
  remaining: number;
  /** Recompute the pending count (cheap — never loads the model). */
  refresh: () => Promise<void>;
  /** Run a pass over the residual. Idempotent: a no-op while one is already running. */
  run: () => Promise<void>;
}

/**
 * Background classifier for the residual. The heavy LLM pass is user-triggered (the
 * Topbar button). Each *distinct* label is classified in its own call (no batch
 * anchoring) and the result fans out to all rows sharing it (see applyCategoryToKey),
 * with `onApplied` fired per label so the views refetch progressively.
 */
export function useBackgroundCategorization(opts: {
  onApplied: () => void;
}): BackgroundCategorization {
  const { onApplied } = opts;
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [pending, setPending] = useState(0);
  // Guards idempotency without waiting on the async `running` state to settle.
  const runningRef = useRef(false);

  const refresh = useCallback(async () => {
    const { groups } = await ipc.invoke('categorize:pending', {});
    setPending(groups.reduce((sum, g) => sum + g.count, 0));
  }, []);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;

    try {
      const { groups } = await ipc.invoke('categorize:pending', {});
      if (groups.length === 0) {
        setPending(0);
        return;
      }

      setRunning(true);
      setRemaining(groups.length);

      for (const group of groups) {
        const res = await ipc.invoke('categorize:batch', { key: group.key, label: group.label });

        // The model isn't installed: nothing will ever succeed, so stop the pass.
        if (!res.ok && res.error === 'model_unavailable') break;
        // On `inference_failed` we just skip this label and carry on.
        if (res.ok && res.applied > 0) onApplied();

        setRemaining((r) => Math.max(0, r - 1));
      }
    } finally {
      runningRef.current = false;
      setRunning(false);
      setRemaining(0);
      await refresh();
    }
  }, [onApplied, refresh]);

  return { running, pending, remaining, refresh, run };
}
```

- [ ] **Step 5: Replace the handler test** (`tests/unit/ipc/categorize.test.ts`)

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));
vi.mock('../../../src/main/llm/modelsDir', () => ({ modelsDir: () => '/models' }));
vi.mock('../../../src/main/llm/llm', () => ({
  isModelAvailable: vi.fn(),
  getModel: vi.fn(),
}));
vi.mock('../../../src/main/categorize/llm', () => ({ categorizeBatch: vi.fn() }));

import {
  handleCategorizePending,
  handleCategorizeBatch,
} from '../../../src/main/ipc/handlers/categorize';
import { isModelAvailable, getModel } from '../../../src/main/llm/llm';
import { categorizeBatch } from '../../../src/main/categorize/llm';

function insertUncategorized(id: string, label: string): void {
  dbHolder.db
    ?.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, is_internal_transfer, user_modified)
       VALUES (?, 'acc-lcl-default', ?, '2026-01-01', -10, ?, ?, NULL, 0, 0)`,
    )
    .run(id, id, label, label.toUpperCase());
}

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
  vi.mocked(getModel).mockResolvedValue({} as never);
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('handleCategorizePending', () => {
  it('returns distinct pending groups', () => {
    insertUncategorized('t1', 'VIR PAYPAL 12/03/25');
    insertUncategorized('t2', 'VIR PAYPAL 14/05/25');
    insertUncategorized('t3', 'CARREFOUR');
    expect(handleCategorizePending()).toEqual({
      groups: [
        { key: 'VIR PAYPAL', label: 'VIR PAYPAL 12/03/25', count: 2 },
        { key: 'CARREFOUR', label: 'CARREFOUR', count: 1 },
      ],
    });
  });
});

describe('handleCategorizeBatch', () => {
  it('returns model_unavailable without loading the model', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(false);
    const res = await handleCategorizeBatch({ key: 'X', label: 'X' });
    expect(res).toEqual({ ok: false, error: 'model_unavailable' });
    expect(getModel).not.toHaveBeenCalled();
  });

  it('applies the suggestion to every row of the key and returns the count', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    insertUncategorized('t1', 'VIR PAYPAL 12/03/25');
    insertUncategorized('t2', 'VIR PAYPAL 14/05/25');
    vi.mocked(categorizeBatch).mockResolvedValue([
      { id: 'VIR PAYPAL', categoryId: 'cat-alimentation' },
    ]);

    const res = await handleCategorizeBatch({ key: 'VIR PAYPAL', label: 'VIR PAYPAL 12/03/25' });

    expect(res).toEqual({ ok: true, applied: 2 });
    expect(
      dbHolder.db?.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t2'),
    ).toMatchObject({ category_id: 'cat-alimentation' });
  });

  it('applies nothing when the model returns AUCUNE (null)', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    insertUncategorized('t1', 'MYSTERY');
    vi.mocked(categorizeBatch).mockResolvedValue([{ id: 'MYSTERY', categoryId: null }]);

    const res = await handleCategorizeBatch({ key: 'MYSTERY', label: 'MYSTERY' });

    expect(res).toEqual({ ok: true, applied: 0 });
    expect(
      dbHolder.db?.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1'),
    ).toMatchObject({ category_id: null });
  });

  it('returns inference_failed when the model throws', async () => {
    vi.mocked(isModelAvailable).mockReturnValue(true);
    vi.mocked(categorizeBatch).mockRejectedValue(new Error('boom'));
    const res = await handleCategorizeBatch({ key: 'X', label: 'X' });
    expect(res).toEqual({ ok: false, error: 'inference_failed' });
  });
});
```

- [ ] **Step 6: Replace the hook test** (`tests/unit/renderer/useBackgroundCategorization.test.ts`)

```ts
// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({
  ipc: { invoke: vi.fn() },
}));

import { ipc } from '@renderer/ipc/client';
import { useBackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';
import type { PendingGroup } from '@shared/types/import';

const mockInvoke = vi.mocked(ipc.invoke);

function groups(n: number): PendingGroup[] {
  return Array.from({ length: n }, (_, i) => ({
    key: `K${String(i)}`,
    label: `Label ${String(i)}`,
    count: 1,
  }));
}

function batchCalls(): unknown[] {
  return mockInvoke.mock.calls.filter(([channel]) => channel === 'categorize:batch');
}

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useBackgroundCategorization', () => {
  it('makes one call per distinct label, calls onApplied per applied label, ends idle', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(3) });
      return Promise.resolve({ ok: true as const, applied: 2 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(mockInvoke).toHaveBeenCalledWith('categorize:pending', {});
    expect(batchCalls()).toHaveLength(3); // one call per distinct label
    expect(onApplied).toHaveBeenCalledTimes(3);
    expect(result.current.running).toBe(false);
    expect(result.current.remaining).toBe(0);
  });

  it('does nothing when there are no groups', async () => {
    mockInvoke.mockResolvedValue({ groups: [] });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(0);
    expect(onApplied).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it('stops the whole pass on model_unavailable', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(3) });
      return Promise.resolve({ ok: false as const, error: 'model_unavailable' as const });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(1); // stopped after the first label
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('continues past inference_failed without calling onApplied for it', async () => {
    let call = 0;
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(2) });
      call += 1;
      if (call === 1)
        return Promise.resolve({ ok: false as const, error: 'inference_failed' as const });
      return Promise.resolve({ ok: true as const, applied: 1 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.run();
    });

    expect(batchCalls()).toHaveLength(2);
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: a concurrent second run() is a no-op', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(3) });
      return Promise.resolve({ ok: true as const, applied: 1 });
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await Promise.all([result.current.run(), result.current.run()]);
    });

    expect(batchCalls()).toHaveLength(3); // one pass of 3 labels, not two
  });

  it('refresh() sets pending to the total transaction count (Σ group counts)', async () => {
    mockInvoke.mockResolvedValue({
      groups: [
        { key: 'A', label: 'A', count: 3 },
        { key: 'B', label: 'B', count: 2 },
      ],
    });
    const onApplied = vi.fn();
    const { result } = renderHook(() => useBackgroundCategorization({ onApplied }));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.pending).toBe(5);
    expect(batchCalls()).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run the full unit suite + typecheck**

Run: `npm run typecheck` → exit 0.
Run: `npx vitest run tests/unit/categorize tests/unit/ipc/categorize.test.ts tests/unit/renderer/useBackgroundCategorization.test.ts`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/ipc.ts src/main/ipc/handlers/categorize.ts src/main/categorize/pending.ts src/renderer/hooks/useBackgroundCategorization.ts tests/unit/ipc/categorize.test.ts tests/unit/renderer/useBackgroundCategorization.test.ts
git commit -m "feat(categorize): one LLM call per distinct label (no batch anchoring)"
```

---

## Task 3: Skeleton effect on rows being categorized

**Files:**

- Create: `src/renderer/components/ui/skeleton.tsx`
- Modify: `src/renderer/components/dashboard/TxTable.tsx` (TxRow + category cell)
- Modify: `src/renderer/lib/dashboardMap.ts` (`toTxRow`)
- Modify: `src/renderer/lib/outletContext.ts`, `src/renderer/components/AppShell.tsx`, `src/renderer/pages/TransactionsPage.tsx`
- Test: `tests/unit/renderer/TxTableSkeleton.test.tsx` (new); update `tests/unit/renderer/dashboardMap.test.ts` + `tests/unit/renderer/TxTable.test.tsx`

- [ ] **Step 1: Create the `Skeleton` primitive** (`src/renderer/components/ui/skeleton.tsx`)

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@renderer/lib/utils';

/** Pulsing placeholder shown while content is being computed (e.g. a category
 *  being classified by the background LLM). Uses identity-scale tokens only. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-md bg-ink-3', className)} {...props} />;
}
```

- [ ] **Step 2: Add `uncategorized` to `TxRow` and thread `categorizing`** — in `src/renderer/components/dashboard/TxTable.tsx`:

(a) Add the import near the top:

```tsx
import { Skeleton } from '../ui/skeleton';
```

(b) In `interface TxRow` (around line 10-28), add the field:

```tsx
/** True when the transaction has no category yet (drives the categorizing skeleton). */
uncategorized: boolean;
```

(c) In `interface TxTableRowProps` (around line 65-78), add:

```tsx
  /** When true, uncategorized rows show a skeleton in the category cell. */
  categorizing?: boolean;
```

(d) In `TxTableRow`, add `categorizing` to the destructured params:

```tsx
export function TxTableRow({
  row: t,
  categories,
  onReassign,
  onCreateCategory,
  editing = false,
  categorizing = false,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: TxTableRowProps) {
```

(e) Replace the category-cell `<span>` (the block starting `<span className={cn(CELL, 'min-w-0')}>` with the `CategoryPicker` / badge ternary, around lines 126-145) with:

```tsx
<span className={cn(CELL, 'min-w-0')}>
  {categorizing && t.uncategorized ? (
    <Skeleton className="h-3.5 w-24 rounded-full" />
  ) : categories && onReassign && onCreateCategory ? (
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
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.catColor }} />
      <span className="truncate">{t.catName}</span>
    </span>
  )}
</span>
```

- [ ] **Step 3: Set `uncategorized` in `toTxRow`** — in `src/renderer/lib/dashboardMap.ts`, add this property to the object returned by `toTxRow` (e.g. right after the `catName` line):

```ts
    uncategorized: tx.categoryId === null,
```

- [ ] **Step 4: Thread `categorizing` through the outlet context**

(a) `src/renderer/lib/outletContext.ts` — add to `AppOutletContext`:

```ts
  /** True while a background categorization pass is running (drives the skeleton). */
  readonly categorizing: boolean;
```

(b) `src/renderer/components/AppShell.tsx` — in the `<Outlet context={…}>` object (around lines 104-114), add `categorizing: bg.running,` next to `refreshToken`:

```tsx
              {
                refreshToken,
                categorizing: bg.running,
                openImport: () => {
                  setImportOpen(true);
                },
                openCreateAccount: () => {
                  setCreateAccountOpen(true);
                },
              } satisfies AppOutletContext
```

(c) `src/renderer/pages/TransactionsPage.tsx` — read it from the outlet context (line 70):

```tsx
const { refreshToken, categorizing } = useOutletContext<AppOutletContext>();
```

and pass it to the row by adding `categorizing={categorizing}` to the `<TxTableRow … />` element (next to `categories={categories}`):

```tsx
                    <TxTableRow
                      row={toTxRow(t)}
                      categories={categories}
                      categorizing={categorizing}
```

- [ ] **Step 5: Write the skeleton test** (`tests/unit/renderer/TxTableSkeleton.test.tsx`)

```tsx
// @vitest-environment jsdom
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { TxTableRow, type TxRow } from '@renderer/components/dashboard/TxTable';

afterEach(() => {
  cleanup();
});

function row(over: Partial<TxRow> = {}): TxRow {
  return {
    id: 't1',
    date: '01 jan',
    icon: 'wallet',
    main: 'CARREFOUR',
    sub: 'cb carrefour',
    catColor: '#888888',
    catName: 'Non catégorisé',
    amount: -10,
    amountKind: 'expense',
    edited: false,
    originalHint: null,
    editDate: '2026-01-01',
    editAmount: -10,
    editLabel: 'carrefour',
    uncategorized: true,
    ...over,
  };
}

describe('TxTableRow category cell', () => {
  it('shows a skeleton while categorizing an uncategorized row', () => {
    const { container, queryByText } = render(
      <TxTableRow row={row({ uncategorized: true })} categorizing />,
    );
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(queryByText('Non catégorisé')).toBeNull();
  });

  it('shows the category name when not categorizing', () => {
    const { container, getByText } = render(<TxTableRow row={row({ uncategorized: true })} />);
    expect(container.querySelector('.animate-pulse')).toBeNull();
    getByText('Non catégorisé');
  });

  it('never skeletons an already-categorized row, even during a pass', () => {
    const { container, getByText } = render(
      <TxTableRow row={row({ uncategorized: false, catName: 'Alimentation' })} categorizing />,
    );
    expect(container.querySelector('.animate-pulse')).toBeNull();
    getByText('Alimentation');
  });
});
```

- [ ] **Step 6: Fix the two existing renderer tests for the new field**

Run: `npm run typecheck`. It will fail where `TxRow` literals or `toTxRow` expectations lack `uncategorized`:

- `tests/unit/renderer/TxTable.test.tsx`: add `uncategorized: false` to each `TxRow` literal (or `true` if a test specifically represents an uncategorized row).
- `tests/unit/renderer/dashboardMap.test.ts`: add `uncategorized: <expected>` to the expected `toTxRow` output — `true` when the fixture's `categoryId` is `null`, else `false`.

Re-run `npm run typecheck` until it exits 0.

- [ ] **Step 7: Run the renderer tests**

Run: `npx vitest run tests/unit/renderer/TxTableSkeleton.test.tsx tests/unit/renderer/TxTable.test.tsx tests/unit/renderer/dashboardMap.test.ts`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/ui/skeleton.tsx src/renderer/components/dashboard/TxTable.tsx src/renderer/lib/dashboardMap.ts src/renderer/lib/outletContext.ts src/renderer/components/AppShell.tsx src/renderer/pages/TransactionsPage.tsx tests/unit/renderer/TxTableSkeleton.test.tsx tests/unit/renderer/TxTable.test.tsx tests/unit/renderer/dashboardMap.test.ts
git commit -m "feat(transactions): skeleton on rows being categorized"
```

---

## Task 4: Full gate + push + PR

- [ ] **Step 1: Run the full local gate**

Run: `npm run typecheck && npm run lint && npm run test && npm run build`
Expected: all four succeed (the pre-push hook runs typecheck + tests too).

- [ ] **Step 2: Push**

Run: `git push -u origin feat/categorization-dedup`
Expected: branch pushed.

- [ ] **Step 3: Open the PR**

```bash
gh pr create --title "feat(categorize): dedup + one-label-per-call + skeleton" --body "$(cat <<'EOF'
## What
Classify each **distinct** transaction label once, in its own LLM call, and apply
the result to every row sharing it. Removes the two measured root causes of poor
categorization: batch anchoring and cross-batch contradiction (the same PayPal
label got 5 different answers). Adds a skeleton shimmer on rows being categorized.

## Why
A real instrumented pass (136 rows) showed 12-item batches make the small model
streak one category across the batch, and identical labels get contradictory
answers. See `docs/superpowers/specs/2026-06-08-categorization-dedup-quality-design.md`.

## How
- `listPendingGroups` groups pending rows by the existing `stableLabelKey`;
  `applyCategoryToKey` fans the result to all rows of the key.
- IPC flips from per-item batches to one `{ key, label }` call per distinct label.
- Renderer iterates groups oldest-first, progressive refetch per label.
- `Skeleton` shows in the category cell of uncategorized rows while a pass runs.
- AUCUNE rows stay "À catégoriser" (AI-proposes-new-categories is a separate spec).

## Validation
- [x] Unit tests: dedup grouping, key-apply (manual pick wins), handler, hook, skeleton.
- [x] Full local gate green: typecheck, lint, tests, build.
- [ ] Maintainer to run the app and confirm a real pass is consistent + the skeleton
      reads well.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL.

> **Do not self-merge** — this is user-facing/visual; the maintainer validates in-app first (per the project's validate-before-merge rule). Ideally land PR #168 (GPU) first, then rebase this if needed.

---

## Self-Review

**Spec coverage:**

- `listPendingGroups` (group by stableLabelKey, oldest-first, representative label_raw, count) → Task 1. ✓
- `applyCategoryToKey` (all still-NULL rows of key, user_modified 0, no rule, returns count) → Task 1. ✓
- Handler group-based + error codes → Task 2. ✓
- Shared types `PendingGroup` + IPC shapes → Task 1 (type) + Task 2 (contract). ✓
- Hook: pending = Σ counts, remaining = group count, one call per group, error handling, idempotency → Task 2. ✓
- `categorize/llm.ts` unchanged → confirmed (called with single-item array from the handler). ✓
- Skeleton: shadcn primitive, `categorizing` via outlet context, cell shows skeleton when `categorizing && categoryId===null` → Task 3. ✓
- Counters: button = uncategorized transactions (Σ counts), in-flight = distinct labels → Task 2 hook. ✓
- AUCUNE stays "À catégoriser" → handler returns applied 0, row stays NULL; no special handling. ✓
- Tests updated: pending, ipc, hook, + new skeleton, + TxTable/dashboardMap field fix → Tasks 1-3. ✓

**Placeholder scan:** No TBD/TODO; every code/test step has full content; Step 6 of Task 3 gives a concrete mechanical rule (add `uncategorized` to literals) rather than vague "fix tests". ✓

**Type/name consistency:** `PendingGroup { key, label, count }` consistent across import.ts, ipc.ts, pending.ts, handler, hook, and tests. `applyCategoryToKey(db, key, categoryId)` and `listPendingGroups(db)` names consistent. Hook reads `{ groups }`; handler returns `{ groups }`. `categorizing` prop/context field consistent across outletContext, AppShell, TransactionsPage, TxTable. ✓

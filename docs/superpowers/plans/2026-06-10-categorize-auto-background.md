# Auto Background Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LLM categorization pass run automatically after each import, non-blocking (no skeleton, no button), with a per-model memory of labels the LLM could not classify so they are never re-processed in a loop.

**Architecture:** A new `llm_attempts` table (migration 017) remembers label keys the LLM answered `AUCUNE` for, scoped by model id. `listPendingGroups` excludes those keys for the active model. The `categorize:batch` IPC response gains a `residual` count so the renderer can summarize the pass in one toast. UI: the Topbar "Catégoriser (N)" button and the per-row `TxTable` skeleton are removed; `AppShell` triggers `bg.run()` after each successful import.

**Tech Stack:** Electron main (node:sqlite, node-llama-cpp), React renderer (typed IPC), Vitest 4 (jsdom for renderer tests).

**Spec:** `docs/superpowers/specs/2026-06-10-categorize-auto-background-design.md`

**Branch / worktree:** `feat/categorize-auto-background` in `/home/denis/finance-dashboard/.claude/worktrees/categorize-auto-background` (run everything from there).

**Conventions that bite:**

- TS strict; `no-explicit-any` and `no-unsafe-*` are errors; `noUncheckedIndexedAccess` on.
- Renderer tests: `// @vitest-environment jsdom` on line 1 **plus** explicit `afterEach(() => { cleanup(); })`.
- Husky pre-commit reformats staged files — if a commit fails on formatting, re-add and retry.
- Run a single test file: `npx vitest run <path>`.

---

### Task 1: `llm_attempts` table (migration 017) + attempts module

**Files:**

- Create: `src/main/db/migrations/017_llm_attempts.sql`
- Create: `src/main/categorize/attempts.ts`
- Modify: `src/main/db/migrate.ts`
- Test: `tests/unit/categorize/attempts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/categorize/attempts.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { listAttemptedKeys, recordAttempt } from '../../../src/main/categorize/attempts';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('llm attempts', () => {
  it('records an attempt and lists it for the same model', () => {
    recordAttempt(db, 'MYSTERY', 'llama-3.2-3b');
    expect(listAttemptedKeys(db, 'llama-3.2-3b')).toEqual(new Set(['MYSTERY']));
  });

  it('scopes attempts by model id — a stronger model retries past failures', () => {
    recordAttempt(db, 'MYSTERY', 'llama-3.2-3b');
    expect(listAttemptedKeys(db, 'qwen2.5-7b')).toEqual(new Set());
  });

  it('re-records the same key under a new model without a PK conflict', () => {
    recordAttempt(db, 'MYSTERY', 'llama-3.2-3b');
    recordAttempt(db, 'MYSTERY', 'qwen2.5-7b');
    expect(listAttemptedKeys(db, 'qwen2.5-7b')).toEqual(new Set(['MYSTERY']));
    expect(listAttemptedKeys(db, 'llama-3.2-3b')).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/categorize/attempts.test.ts`
Expected: FAIL — cannot resolve `../../../src/main/categorize/attempts`.

- [ ] **Step 3: Write the migration and the module**

Create `src/main/db/migrations/017_llm_attempts.sql`:

```sql
-- Labels the LLM already answered "AUCUNE" for, scoped by the model that answered.
-- Pending groups exclude these keys for the active model, so a residual label is
-- classified at most once per model — installing a stronger model retries them
-- (design 2026-06-10-categorize-auto-background).
CREATE TABLE llm_attempts (
  label_key    TEXT PRIMARY KEY,
  model_id     TEXT NOT NULL,
  attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

In `src/main/db/migrate.ts`, add the import after `sql016`:

```ts
import sql017 from './migrations/017_llm_attempts.sql?raw';
```

and the entry at the end of `MIGRATIONS`:

```ts
  { version: 17, sql: sql017 },
```

Create `src/main/categorize/attempts.ts`:

```ts
import type { DatabaseSync } from 'node:sqlite';

/** Label keys the given model already answered "AUCUNE" for (never re-asked). */
export function listAttemptedKeys(db: DatabaseSync, modelId: string): Set<string> {
  const rows = db
    .prepare('SELECT label_key FROM llm_attempts WHERE model_id = ?')
    .all(modelId) as unknown as { label_key: string }[];
  return new Set(rows.map((r) => r.label_key));
}

/** Record a no-answer attempt; an existing key is re-scoped to the new model. */
export function recordAttempt(db: DatabaseSync, labelKey: string, modelId: string): void {
  db.prepare(
    `INSERT INTO llm_attempts (label_key, model_id) VALUES (?, ?)
     ON CONFLICT(label_key) DO UPDATE
       SET model_id = excluded.model_id, attempted_at = datetime('now')`,
  ).run(labelKey, modelId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/categorize/attempts.test.ts`
Expected: 3 PASS. Also run `npx vitest run tests/unit/categorize tests/unit/ipc` (other suites run `runMigrations` too — the new migration must not break them).

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/017_llm_attempts.sql src/main/db/migrate.ts src/main/categorize/attempts.ts tests/unit/categorize/attempts.test.ts
git commit -m "feat(categorize): add llm_attempts table and per-model attempt memory"
```

---

### Task 2: pending groups — `excludeKeys` + `countPendingForKey`

**Files:**

- Modify: `src/main/categorize/pending.ts`
- Test: `tests/unit/categorize/pending.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/unit/categorize/pending.test.ts`, update the import to include the new function:

```ts
import {
  listPendingGroups,
  applyCategoryToKey,
  countPendingForKey,
} from '../../../src/main/categorize/pending';
```

Add inside `describe('listPendingGroups', ...)`:

```ts
it('excludes keys in excludeKeys (labels the active model already failed on)', () => {
  insertTx({ id: 't1', label: 'MYSTERY SHOP' });
  insertTx({ id: 't2', label: 'CARREFOUR MARKET' });

  const keys = listPendingGroups(db, new Set(['MYSTERY SHOP'])).map((g) => g.key);

  expect(keys).toEqual(['CARREFOUR MARKET']);
});
```

Add a new top-level describe:

```ts
describe('countPendingForKey', () => {
  it('counts only still-uncategorized rows sharing the stable key', () => {
    insertTx({ id: 't1', label: 'VIR LOYER 12/03/25' });
    insertTx({ id: 't2', label: 'VIR LOYER 14/05/25' });
    insertTx({ id: 't3', label: 'VIR LOYER 15/05/25', categoryId: 'cat-x' });
    insertTx({ id: 't4', label: 'CARREFOUR' });

    expect(countPendingForKey(db, 'VIR LOYER')).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/categorize/pending.test.ts`
Expected: FAIL — `countPendingForKey` is not exported; the excludeKeys test fails (2 groups returned).

- [ ] **Step 3: Implement**

In `src/main/categorize/pending.ts`, change the `listPendingGroups` signature and final filter:

```ts
export function listPendingGroups(
  db: DatabaseSync,
  excludeKeys: ReadonlySet<string> = new Set(),
): PendingGroup[] {
```

and the return line becomes:

```ts
return [...groups.values()].filter((g) => !isPassthrough(g.key) && !excludeKeys.has(g.key));
```

Append to the file:

```ts
/** Still-uncategorized transactions sharing this stable key (feeds the residual toast). */
export function countPendingForKey(db: DatabaseSync, key: string): number {
  const rows = db
    .prepare(
      `SELECT label_clean FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0`,
    )
    .all() as unknown as { label_clean: string }[];
  return rows.filter((r) => stableLabelKey(r.label_clean) === key).length;
}
```

Update the doc comment above `listPendingGroups` — append one line: `Keys in excludeKeys (already attempted by the active model) are excluded too.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/categorize/pending.test.ts`
Expected: all PASS (existing tests still call `listPendingGroups(db)` — the new param defaults to an empty set).

- [ ] **Step 5: Commit**

```bash
git add src/main/categorize/pending.ts tests/unit/categorize/pending.test.ts
git commit -m "feat(categorize): exclude attempted keys from pending and count residual per key"
```

---

### Task 3: IPC — record attempts, return `residual`, filter pending

**Files:**

- Modify: `src/shared/types/ipc.ts:104-106`
- Modify: `src/main/ipc/handlers/categorize.ts`
- Modify: `tests/unit/ipc/categorize.test.ts`
- Modify: `tests/unit/renderer/useBackgroundCategorization.test.ts` (mechanical: add `residual` to mocked responses so tsc stays green; behavior changes come in Task 4)

- [ ] **Step 1: Write the failing tests**

In `tests/unit/ipc/categorize.test.ts`:

Replace the llm mock (the handler now identifies the active model instead of just checking availability):

```ts
vi.mock('../../../src/main/llm/llm', () => ({
  findBestPresentModel: vi.fn(),
  getModel: vi.fn(),
}));
```

Replace the import of `isModelAvailable`:

```ts
import { findBestPresentModel, getModel } from '../../../src/main/llm/llm';
import type { ModelSpec } from '../../../src/main/llm/modelRegistry';
```

Add a helper near `insertUncategorized`:

```ts
const SPEC_3B = { id: 'llama-3.2-3b' } as ModelSpec;
const SPEC_7B = { id: 'qwen2.5-7b' } as ModelSpec;
```

(If `as ModelSpec` errors because of missing fields, use `{ id: 'llama-3.2-3b' } as unknown as ModelSpec`.)

In `beforeEach`, after the `getModel` line, add:

```ts
vi.mocked(findBestPresentModel).mockReturnValue(SPEC_3B);
```

Update existing tests:

- `'returns model_unavailable without loading the model'`: replace `vi.mocked(isModelAvailable).mockReturnValue(false);` with `vi.mocked(findBestPresentModel).mockReturnValue(null);`
- In the other three tests, delete the `vi.mocked(isModelAvailable).mockReturnValue(true);` lines (the `beforeEach` now covers it).
- `'applies the suggestion to every row of the key and returns the count'`: expected response becomes `{ ok: true, applied: 2, residual: 0 }`.
- Rename `'applies nothing when the model returns AUCUNE (null)'` to `'records an attempt and returns the residual when the model returns AUCUNE'` and replace its body:

```ts
insertUncategorized('t1', 'MYSTERY');
insertUncategorized('t2', 'MYSTERY 2'); // different key — not part of the residual
vi.mocked(categorizeBatch).mockResolvedValue([{ id: 'MYSTERY', categoryId: null }]);

const res = await handleCategorizeBatch({ key: 'MYSTERY', label: 'MYSTERY' });

expect(res).toEqual({ ok: true, applied: 0, residual: 1 });
expect(
  dbHolder.db?.prepare('SELECT model_id FROM llm_attempts WHERE label_key = ?').get('MYSTERY'),
).toMatchObject({ model_id: 'llama-3.2-3b' });
```

Add new tests at the end of `describe('handleCategorizeBatch', ...)`:

```ts
it('does not record an attempt when inference fails (transient — retried next pass)', async () => {
  vi.mocked(categorizeBatch).mockRejectedValue(new Error('boom'));

  await handleCategorizeBatch({ key: 'X', label: 'X' });

  expect(dbHolder.db?.prepare('SELECT COUNT(*) AS n FROM llm_attempts').get()).toMatchObject({
    n: 0,
  });
});
```

And in `describe('handleCategorizePending', ...)` (note: this describe needs the same `beforeEach` mock — it is file-level, so already covered):

```ts
it('excludes keys already attempted by the active model', () => {
  insertUncategorized('t1', 'MYSTERY');
  insertUncategorized('t2', 'CARREFOUR');
  dbHolder.db
    ?.prepare(`INSERT INTO llm_attempts (label_key, model_id) VALUES ('MYSTERY', 'llama-3.2-3b')`)
    .run();

  expect(handleCategorizePending().groups.map((g) => g.key)).toEqual(['CARREFOUR']);
});

it('keeps attempted keys pending when a different (stronger) model is active', () => {
  insertUncategorized('t1', 'MYSTERY');
  dbHolder.db
    ?.prepare(`INSERT INTO llm_attempts (label_key, model_id) VALUES ('MYSTERY', 'llama-3.2-3b')`)
    .run();
  vi.mocked(findBestPresentModel).mockReturnValue(SPEC_7B);

  expect(handleCategorizePending().groups.map((g) => g.key)).toEqual(['MYSTERY']);
});

it('does not filter by attempts when no model is installed (banner needs the full count)', () => {
  insertUncategorized('t1', 'MYSTERY');
  dbHolder.db
    ?.prepare(`INSERT INTO llm_attempts (label_key, model_id) VALUES ('MYSTERY', 'llama-3.2-3b')`)
    .run();
  vi.mocked(findBestPresentModel).mockReturnValue(null);

  expect(handleCategorizePending().groups.map((g) => g.key)).toEqual(['MYSTERY']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/ipc/categorize.test.ts`
Expected: FAIL — the mock no longer exports `isModelAvailable` (handler imports it), and new expectations fail.

- [ ] **Step 3: Implement the shared type and the handler**

In `src/shared/types/ipc.ts`, the ok-variant gains the residual count:

```ts
export type CategorizeBatchResponse =
  | { ok: true; applied: number; residual: number }
  | { ok: false; error: 'model_unavailable' | 'inference_failed' };
```

Rewrite `src/main/ipc/handlers/categorize.ts`:

```ts
import type {
  CategorizePendingResponse,
  CategorizeBatchPayload,
  CategorizeBatchResponse,
} from '@shared/types/ipc';
import { getDb } from '../../db';
import { findBestPresentModel, getModel } from '../../llm/llm';
import { modelsDir } from '../../llm/modelsDir';
import { categorizeBatch, type LlmCategory } from '../../categorize/llm';
import {
  listPendingGroups,
  applyCategoryToKey,
  countPendingForKey,
} from '../../categorize/pending';
import { listAttemptedKeys, recordAttempt } from '../../categorize/attempts';

/**
 * Distinct pending labels (drives the background loop — one call per label),
 * minus the keys the active model already failed on. With no model installed
 * nothing is filtered: the install banner needs the full residual count.
 */
export function handleCategorizePending(): CategorizePendingResponse {
  const db = getDb();
  const spec = findBestPresentModel(modelsDir());
  const attempted = spec === null ? new Set<string>() : listAttemptedKeys(db, spec.id);
  return { groups: listPendingGroups(db, attempted) };
}

/**
 * Classify ONE distinct label (no batch anchoring) and apply the result to every
 * transaction sharing its key. A valid "AUCUNE" records an attempt for the active
 * model (never re-asked) and reports the rows left over as `residual`; the
 * renderer sums those into the end-of-pass toast. `inference_failed` records
 * nothing — transient, retried on the next pass.
 */
export async function handleCategorizeBatch(
  payload: CategorizeBatchPayload,
): Promise<CategorizeBatchResponse> {
  const dir = modelsDir();
  const spec = findBestPresentModel(dir);
  if (spec === null) return { ok: false, error: 'model_unavailable' };

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
    if (categoryId === null) {
      recordAttempt(db, payload.key, spec.id);
      return { ok: true, applied: 0, residual: countPendingForKey(db, payload.key) };
    }
    return { ok: true, applied: applyCategoryToKey(db, payload.key, categoryId), residual: 0 };
  } catch {
    return { ok: false, error: 'inference_failed' };
  }
}
```

(`isModelAvailable` stays exported from `llm.ts` — other handlers still use it.)

- [ ] **Step 4: Keep the hook test compiling**

In `tests/unit/renderer/useBackgroundCategorization.test.ts`, add `residual: 0` next to every `applied:` in mocked batch responses (3 places — grep `applied:` in the file). Example:

```ts
return Promise.resolve({ ok: true as const, applied: 2, residual: 0 });
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/unit/ipc/categorize.test.ts tests/unit/renderer/useBackgroundCategorization.test.ts && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/ipc.ts src/main/ipc/handlers/categorize.ts tests/unit/ipc/categorize.test.ts tests/unit/renderer/useBackgroundCategorization.test.ts
git commit -m "feat(categorize): record AUCUNE attempts per model and expose residual via IPC"
```

---

### Task 4: renderer hook — silent stop, totals, end-of-pass toast

**Files:**

- Modify: `src/renderer/hooks/useBackgroundCategorization.ts`
- Test: `tests/unit/renderer/useBackgroundCategorization.test.ts`

- [ ] **Step 1: Update/write the failing tests**

In `tests/unit/renderer/useBackgroundCategorization.test.ts`:

Update the sonner mock so the success spy is reset too:

```ts
beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
});
```

Replace the test `'stops the whole pass on model_unavailable'` (the toast is gone — automatic passes stop silently):

```ts
it('stops the whole pass silently on model_unavailable (the banner is the call to action)', async () => {
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
  expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
});
```

Add new tests at the end of the describe:

```ts
it('shows one summary toast with applied and residual totals at the end of a pass', async () => {
  let call = 0;
  mockInvoke.mockImplementation((channel) => {
    if (channel === 'categorize:pending') return Promise.resolve({ groups: groups(2) });
    call += 1;
    if (call === 1) return Promise.resolve({ ok: true as const, applied: 3, residual: 0 });
    return Promise.resolve({ ok: true as const, applied: 0, residual: 2 });
  });
  const { result } = renderHook(() => useBackgroundCategorization({ onApplied: vi.fn() }));

  await act(async () => {
    await result.current.run();
  });

  expect(vi.mocked(toast.success)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
    'Catégorisation terminée — 3 transactions catégorisées, 2 à classer manuellement',
  );
});

it('shows no toast when the pass did nothing (no groups)', async () => {
  mockInvoke.mockResolvedValue({ groups: [] });
  const { result } = renderHook(() => useBackgroundCategorization({ onApplied: vi.fn() }));

  await act(async () => {
    await result.current.run();
  });

  expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/unit/renderer/useBackgroundCategorization.test.ts`
Expected: the two new tests and the rewritten model_unavailable test FAIL (current code toasts an error and never toasts success).

- [ ] **Step 3: Implement**

In `src/renderer/hooks/useBackgroundCategorization.ts`:

Update the hook doc comment (it still says the pass is user-triggered via the Topbar button):

```ts
/**
 * Background classifier for the residual. The pass runs automatically (after an
 * import, or when the model install finishes) — never user-triggered. Each
 * *distinct* label is classified in its own call (no batch anchoring) and the
 * result fans out to all rows sharing it (see applyCategoryToKey), with
 * `onApplied` fired per label so the views refetch progressively. One summary
 * toast reports what was applied and what is left to do manually.
 */
```

Update the `pending` field comment in the interface: `/** Count of uncategorized transactions (Σ group counts) — drives the install banner. */`

Replace the `run` callback:

```ts
const run = useCallback(async () => {
  if (runningRef.current) return;
  runningRef.current = true;

  let applied = 0;
  let residual = 0;
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

      // No model (e.g. removed in Settings mid-pass): stop silently — the
      // install banner is the call to action, not an error toast.
      if (!res.ok && res.error === 'model_unavailable') break;
      // On `inference_failed` we just skip this label and carry on.
      if (res.ok) {
        applied += res.applied;
        residual += res.residual;
        if (res.applied > 0) onApplied();
      }

      setRemaining((r) => Math.max(0, r - 1));
    }
  } finally {
    runningRef.current = false;
    setRunning(false);
    setRemaining(0);
    await refresh();
  }
  if (applied > 0 || residual > 0) {
    const s = applied > 1 ? 's' : '';
    toast.success(
      `Catégorisation terminée — ${String(applied)} transaction${s} catégorisée${s}, ${String(residual)} à classer manuellement`,
    );
  }
}, [onApplied, refresh]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/renderer/useBackgroundCategorization.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useBackgroundCategorization.ts tests/unit/renderer/useBackgroundCategorization.test.ts
git commit -m "feat(categorize): summarize the pass in one toast and stop silently without a model"
```

---

### Task 5: remove the Topbar "Catégoriser (N)" button

**Files:**

- Modify: `src/renderer/components/Topbar.tsx`
- Modify: `src/renderer/components/AppShell.tsx` (props passed to `<Topbar>` only)
- Test: `tests/unit/renderer/Topbar.test.tsx`

- [ ] **Step 1: Update the tests**

In `tests/unit/renderer/Topbar.test.tsx`:

- Delete the whole `describe('Topbar categorize trigger button', ...)` block (4 tests).
- Keep `describe('Topbar categorization chip', ...)` unchanged — the running chip stays.
- If `userEvent` or `vi` becomes unused after the deletion (the sidebar-toggle describe still uses both — check before removing imports), leave imports as-is.

- [ ] **Step 2: Run the tests (still green — removal only)**

Run: `npx vitest run tests/unit/renderer/Topbar.test.tsx`
Expected: PASS (deleted tests are simply gone).

- [ ] **Step 3: Remove the button from the component**

In `src/renderer/components/Topbar.tsx`:

- Remove the `pendingCount = 0` and `onCategorize` parameters and their two prop-type lines.
- Replace the chip/button conditional (the `{categorizing ? ( ... ) : pendingCount > 0 && onCategorize ? ( ... ) : null}` block) with the chip only:

```tsx
{
  categorizing ? (
    <span
      aria-live="polite"
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border border-line-2 bg-ink-3 px-[9px] font-sans text-[11px] font-medium text-paper-soft"
    >
      <Sparkles size={12} strokeWidth={1.6} className="shrink-0 text-brass" />
      <span>Catégorisation IA… ({categorizeRemaining})</span>
    </span>
  ) : null;
}
```

In `src/renderer/components/AppShell.tsx`, remove these two props from the `<Topbar>` element (keep `categorizing` and `categorizeRemaining`):

```tsx
          pendingCount={bg.pending}
          onCategorize={() => {
            void bg.run();
          }}
```

Also update the comment above the `refresh` effect (it still mentions the Topbar trigger and the user's click):

```tsx
// Keep the pending count current (on mount, and after each import / edit) so the
// model-install banner can size its message. This is a cheap COUNT — it never
// loads the model.
```

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/renderer/Topbar.test.tsx && npx tsc --noEmit`
Expected: PASS, tsc clean (no remaining reference to the removed props).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/Topbar.tsx src/renderer/components/AppShell.tsx tests/unit/renderer/Topbar.test.tsx
git commit -m "feat(categorize): drop the manual Topbar categorize trigger"
```

---

### Task 6: remove the per-row skeleton and the `categorizing` plumbing

**Files:**

- Modify: `src/renderer/components/dashboard/TxTable.tsx`
- Modify: `src/renderer/lib/dashboardMap.ts`
- Modify: `src/renderer/lib/outletContext.ts`
- Modify: `src/renderer/pages/TransactionsPage.tsx:70` and `:227`
- Modify: `src/renderer/components/AppShell.tsx` (Outlet context)
- Delete: `tests/unit/renderer/TxTableSkeleton.test.tsx`
- Modify: `tests/unit/renderer/TxTable.test.tsx`, `tests/unit/renderer/dashboardMap.test.ts` (fixtures only)

- [ ] **Step 1: Remove the skeleton from TxTable**

In `src/renderer/components/dashboard/TxTable.tsx`:

- Remove the `import { Skeleton } from '../ui/skeleton';` line.
- In `TxRow`, remove the `uncategorized: boolean;` field and its doc comment (it existed only to drive the skeleton).
- In `TxTableRowProps`, remove the `categorizing?: boolean;` prop and its doc comment; remove `categorizing = false,` from the destructure.
- Replace the category cell conditional — delete the skeleton branch so it reads:

```tsx
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
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.catColor }} />
      <span className="truncate">{t.catName}</span>
    </span>
  )}
</span>
```

- [ ] **Step 2: Remove the plumbing**

- `src/renderer/lib/dashboardMap.ts`: delete the line `uncategorized: tx.categoryId === null,` (around line 68).
- `src/renderer/lib/outletContext.ts`: delete the `categorizing` field and its doc comment from `AppOutletContext`.
- `src/renderer/pages/TransactionsPage.tsx`: line 70 becomes `const { refreshToken } = useOutletContext<AppOutletContext>();`; delete the `categorizing={categorizing}` prop on `<TxTableRow>` (line ~227).
- `src/renderer/components/AppShell.tsx`: in the `<Outlet context={...}>` object, delete `categorizing: bg.running,`.

- [ ] **Step 3: Update the tests**

- Delete `tests/unit/renderer/TxTableSkeleton.test.tsx` (`git rm tests/unit/renderer/TxTableSkeleton.test.tsx`). Its "category cell stays editable" concern is now structural: the picker renders unconditionally, covered by `TxTable.test.tsx`.
- In `tests/unit/renderer/TxTable.test.tsx` and `tests/unit/renderer/dashboardMap.test.ts`, remove `uncategorized: ...` from row fixtures/expectations (grep the two files for `uncategorized`).

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/renderer && npx tsc --noEmit && npx eslint src tests`
Expected: all PASS, tsc and eslint clean (eslint catches now-unused imports such as `Skeleton`).

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer tests/unit/renderer
git commit -m "feat(categorize): keep the category cell editable during a pass (drop the skeleton)"
```

---

### Task 7: auto-run the pass after each import

**Files:**

- Modify: `src/renderer/components/AppShell.tsx`
- Create: `tests/unit/renderer/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/AppShell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { BackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('@renderer/hooks/useBackgroundCategorization', () => ({
  useBackgroundCategorization: vi.fn(),
}));
vi.mock('@renderer/hooks/useModelStatus', () => ({ useModelStatus: vi.fn() }));
vi.mock('@renderer/hooks/useNetWorthSummary', () => ({
  useNetWorthSummary: () => ({ netWorth: 0, monthDelta: null }),
}));
vi.mock('@renderer/components/Sidebar', () => ({ Sidebar: () => <div /> }));
vi.mock('@renderer/components/model/ModelDownloadIndicator', () => ({
  ModelDownloadIndicator: () => null,
}));
vi.mock('@renderer/components/accounts/CreateAccountModal', () => ({
  CreateAccountModal: () => null,
}));
// The modal is replaced by a button that reports a successful import directly.
vi.mock('@renderer/components/ImportModal', () => ({
  ImportModal: ({ open, onImported }: { open: boolean; onImported: () => void }) =>
    open ? (
      <button type="button" onClick={onImported}>
        simulate-import-success
      </button>
    ) : null,
}));

import { ipc } from '@renderer/ipc/client';
import { useBackgroundCategorization } from '@renderer/hooks/useBackgroundCategorization';
import { useModelStatus } from '@renderer/hooks/useModelStatus';
import { AppShell } from '@renderer/components/AppShell';

const bg: BackgroundCategorization = {
  running: false,
  pending: 0,
  remaining: 0,
  refresh: vi.fn(() => Promise.resolve()),
  run: vi.fn(() => Promise.resolve()),
};

beforeEach(() => {
  vi.mocked(useBackgroundCategorization).mockReturnValue(bg);
  vi.mocked(useModelStatus).mockReturnValue({ state: 'absent' } as never);
  vi.mocked(ipc.invoke).mockResolvedValue({ value: false } as never);
  vi.mocked(bg.run).mockClear();
});

afterEach(() => {
  cleanup();
});

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<div />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppShell post-import categorization', () => {
  it('runs a background pass automatically after a successful import', async () => {
    renderShell();

    await userEvent.click(screen.getByRole('button', { name: 'Importer un relevé' }));
    await userEvent.click(screen.getByRole('button', { name: 'simulate-import-success' }));

    expect(bg.run).toHaveBeenCalledTimes(1);
  });

  it('does not run a pass on mount', () => {
    renderShell();

    expect(bg.run).not.toHaveBeenCalled();
  });
});
```

(If `useModelStatus`'s return type makes the `as never` cast fail lint, mock the full shape it returns instead — check `src/renderer/hooks/useModelStatus.ts` first.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/renderer/AppShell.test.tsx`
Expected: the first test FAILS (`bg.run` never called — import currently only bumps `refreshToken`); the mount test passes.

- [ ] **Step 3: Implement**

In `src/renderer/components/AppShell.tsx`, the `ImportModal` `onImported` becomes:

```tsx
        onImported={() => {
          setRefreshToken((t) => t + 1);
          // Kick off the LLM pass over what the deterministic cascade left
          // uncategorized. Non-blocking: rows stay editable during the pass.
          void bg.run();
        }}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/renderer/AppShell.test.tsx`
Expected: 2 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/AppShell.tsx tests/unit/renderer/AppShell.test.tsx
git commit -m "feat(categorize): run the LLM pass automatically after each import"
```

---

### Task 8: full gate, push, PR

- [ ] **Step 1: Full verification (Definition of done)**

```bash
npx eslint src tests && npx tsc --noEmit && npx vitest run && npm run build
```

Expected: all clean/green. Fix anything that fails before proceeding.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/categorize-auto-background
gh pr create --title "feat(categorize): auto background categorization, non-blocking" --body "$(cat <<'EOF'
## Summary
- Run the LLM categorization pass automatically after each import (and still after a model install) — the manual Topbar button is gone.
- Remove the per-row skeleton: the category cell stays editable during a pass; a manual pick always wins (the pass only writes `WHERE category_id IS NULL`).
- New `llm_attempts` table (migration 017): labels the LLM answered "AUCUNE" for are remembered per model and never re-asked — fixes the "button does nothing" loop. A stronger model retries them.
- One end-of-pass toast: "Catégorisation terminée — X transactions catégorisées, Y à classer manuellement".

Spec: `docs/superpowers/specs/2026-06-10-categorize-auto-background-design.md`
Plan: `docs/superpowers/plans/2026-06-10-categorize-auto-background.md`

## Test plan
- [ ] CI green (lint, typecheck, unit, build)
- [ ] Maintainer in-app validation: import a statement → pass starts alone, rows stay editable, toast summarizes, re-import does not re-ask failed labels

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Stop — maintainer validation gate**

This is a UI-behavior PR: per the maintainer's standing instruction, **do not self-merge**. Report the PR URL and wait for in-app validation (import a statement, watch the pass run in the background, edit a row mid-pass, check the toast and that a second import does not re-process AUCUNE labels).

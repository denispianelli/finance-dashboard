# Rules Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click "create a rule from this correction" (toast action → pre-filled dialog, retroactive application to uncategorized rows) plus a rules audit/management section in the Categories page.

**Architecture:** The label-key logic moves to `src/shared/` (renderer needs the token suggestion; main keeps a re-export shim). A new `rulesManage.ts` in main does CRUD + retroactive application reusing the existing `matchRule` engine; four new typed IPC channels expose it. In the renderer: `useRules` (CRUD hook), `RuleDialog` (creation, pre-filled), a toast action wired through `useDashboard.reassign`, and `RulesSection` appended to the Categories page.

**Tech Stack:** Electron main (node:sqlite), React renderer (typed IPC, sonner toasts, shadcn dialog), Vitest 4 (jsdom for renderer tests).

**Spec:** `docs/superpowers/specs/2026-06-11-rules-phase1-design.md`

**Branch / worktree:** `feat/rules-phase1` in `/home/denis/finance-dashboard/.claude/worktrees/rules-phase1` (run everything from there).

**Conventions that bite:**

- TS strict; `no-explicit-any`/`no-unsafe-*` errors; `noUncheckedIndexedAccess` on.
- Renderer tests: `// @vitest-environment jsdom` on line 1 **plus** explicit `afterEach(() => { cleanup(); })`.
- Husky pre-commit reformats staged files — if a commit fails on formatting, re-add and retry.
- Migrations seed ~40 rules (`cr-001`…): backend tests must use distinctive labels (`ZZZ…`) that no seed rule matches, and must not assert absolute rule counts.

---

### Task 1: shared label-key module + `suggestRuleToken`

**Files:**

- Create: `src/shared/categorize/labelKey.ts`
- Modify: `src/main/categorize/labelKey.ts` (becomes a re-export shim)
- Test: `tests/unit/categorize/ruleToken.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/categorize/ruleToken.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { suggestRuleToken } from '../../../src/shared/categorize/labelKey';

describe('suggestRuleToken', () => {
  it('suggests the first significant token as a contains rule', () => {
    expect(suggestRuleToken('CB CARREFOUR MARKET PARIS 11')).toEqual({
      matchType: 'contains',
      value: 'CARREFOUR',
    });
  });

  it('skips bank stopwords and short tokens', () => {
    expect(suggestRuleToken('PAIEMENT CB NETFLIX')).toEqual({
      matchType: 'contains',
      value: 'NETFLIX',
    });
  });

  it('skips digit-bearing tokens', () => {
    expect(suggestRuleToken('VIR 12345678 EDF5521 BOULANGERIE')).toEqual({
      matchType: 'contains',
      value: 'BOULANGERIE',
    });
  });

  it('falls back to an exact rule on the stable key when no token qualifies', () => {
    // Only stopwords + digits: stableLabelKey returns the full normalized label.
    expect(suggestRuleToken('VIR SEPA 123456')).toEqual({
      matchType: 'exact',
      value: 'VIR SEPA 123456',
    });
  });

  it('uppercases its input (label_clean is already upper, but be defensive)', () => {
    expect(suggestRuleToken('cb carrefour market')).toEqual({
      matchType: 'contains',
      value: 'CARREFOUR',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/categorize/ruleToken.test.ts`
Expected: FAIL — cannot resolve `src/shared/categorize/labelKey`.

- [ ] **Step 3: Implement**

Create `src/shared/categorize/labelKey.ts` by **moving the entire current content** of `src/main/categorize/labelKey.ts` (the `KEY_STOPWORDS` set and `stableLabelKey` — copy verbatim, doc comments included), then append:

```ts
/** A rule prefill derived from a corrected label. */
export interface RuleSuggestion {
  matchType: 'contains' | 'exact';
  value: string;
}

/**
 * Prefill for "create a rule from this correction": the first label token that
 * looks like a payee (length ≥ 4, no digit, not generic bank vocabulary) becomes a
 * `contains` rule. When nothing qualifies (pure reference labels), fall back to an
 * `exact` rule on the stable key so the rule never over-matches.
 */
export function suggestRuleToken(labelClean: string): RuleSuggestion {
  const token = labelClean
    .toUpperCase()
    .split(/\s+/)
    .find((t) => t.length >= 4 && !/\d/.test(t) && !KEY_STOPWORDS.has(t));
  if (token !== undefined) return { matchType: 'contains', value: token };
  return { matchType: 'exact', value: stableLabelKey(labelClean) };
}
```

Replace the whole content of `src/main/categorize/labelKey.ts` with:

```ts
// The label-key logic lives in shared/ (the renderer needs suggestRuleToken for
// the rule-creation prefill); this shim keeps the historical main-process import
// path stable.
export { stableLabelKey, suggestRuleToken, type RuleSuggestion } from '@shared/categorize/labelKey';
```

(If the `@shared` alias is not resolved from main code — check existing main files: they import `@shared/types/...`, so it is — keep the alias form.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/categorize/ && npx tsc --noEmit`
Expected: all PASS (including the existing `labelKey.test.ts`, which still imports the main path through the shim), tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/categorize/labelKey.ts src/main/categorize/labelKey.ts tests/unit/categorize/ruleToken.test.ts
git commit -m "feat(categorize): share the label-key logic and suggest a rule token from a label"
```

---

### Task 2: shared rule types

**Files:**

- Create: `src/shared/types/rules.ts`
- Modify: `src/main/categorize/rules.ts:1-10` (import the shared MatchType)

- [ ] **Step 1: Create the shared types**

Create `src/shared/types/rules.ts`:

```ts
/** How a categorization rule matches a (normalized) transaction label. */
export type RuleMatchType = 'contains' | 'exact' | 'regex';

/** A categorization rule as exposed to the renderer (audit view + dialog). */
export interface RuleDTO {
  readonly id: string;
  readonly matchType: RuleMatchType;
  readonly matchValue: string;
  readonly categoryId: string;
  readonly hitCount: number;
  readonly createdAt: string;
}

/** Create/update input — id-less; update carries the id in its payload. */
export interface RuleInput {
  readonly matchType: RuleMatchType;
  readonly matchValue: string;
  readonly categoryId: string;
}
```

- [ ] **Step 2: Point the engine's MatchType at the shared one**

In `src/main/categorize/rules.ts`, replace:

```ts
export type MatchType = 'contains' | 'exact' | 'regex';
```

with:

```ts
import type { RuleMatchType } from '@shared/types/rules';

export type MatchType = RuleMatchType;
```

(Keep the `export type MatchType` alias so existing imports don't churn. The `import type` line goes at the top of the file with the other imports.)

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && npx vitest run tests/unit/categorize/rules.test.ts`
Expected: clean / PASS.

```bash
git add src/shared/types/rules.ts src/main/categorize/rules.ts
git commit -m "feat(categorize): add shared rule types"
```

---

### Task 3: `rulesManage` backend (CRUD + retroactive application)

**Files:**

- Create: `src/main/categorize/rulesManage.ts`
- Test: `tests/unit/categorize/rulesManage.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/categorize/rulesManage.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  InvalidRuleError,
} from '../../../src/main/categorize/rulesManage';

let db: DatabaseSync;

function insertTx(opts: { id: string; label: string; categoryId?: string | null }): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, is_internal_transfer, user_modified)
     VALUES (?, 'acc-lcl-default', ?, '2026-01-01', -10, ?, ?, ?, 0, 0)`,
  ).run(opts.id, opts.id, opts.label, opts.label.toUpperCase(), opts.categoryId ?? null);
}

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

describe('createRule', () => {
  it('creates the rule and retroactively categorizes matching uncategorized rows', () => {
    insertTx({ id: 't1', label: 'CB ZZZSHOP PARIS' });
    insertTx({ id: 't2', label: 'ZZZSHOP LYON 22' });
    insertTx({ id: 't3', label: 'OTHER THING' });

    const { rule, applied } = createRule(db, {
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
    });

    expect(applied).toBe(2);
    expect(rule).toMatchObject({
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
      hitCount: 2,
    });
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1')).toMatchObject(
      { category_id: 'cat-alimentation' },
    );
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t3')).toMatchObject(
      { category_id: null },
    );
  });

  it('never overwrites an already-categorized row', () => {
    insertTx({ id: 't1', label: 'ZZZSHOP', categoryId: 'cat-loisirs' });

    const { applied } = createRule(db, {
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
    });

    expect(applied).toBe(0);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1')).toMatchObject(
      { category_id: 'cat-loisirs' },
    );
  });

  it('keeps user_modified at 0 on rule-applied rows', () => {
    insertTx({ id: 't1', label: 'ZZZSHOP' });
    createRule(db, {
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
    });
    expect(
      db.prepare('SELECT user_modified FROM transactions WHERE id = ?').get('t1'),
    ).toMatchObject({ user_modified: 0 });
  });

  it.each([
    {
      name: 'empty value',
      input: { matchType: 'contains', matchValue: '   ', categoryId: 'cat-alimentation' },
    },
    {
      name: 'bad regex',
      input: { matchType: 'regex', matchValue: '(unclosed', categoryId: 'cat-alimentation' },
    },
    {
      name: 'unknown category',
      input: { matchType: 'contains', matchValue: 'ZZZSHOP', categoryId: 'cat-nope' },
    },
  ] as const)('rejects $name with InvalidRuleError', ({ input }) => {
    expect(() => createRule(db, { ...input })).toThrow(InvalidRuleError);
    expect(
      db
        .prepare('SELECT count(*) n FROM categorization_rules WHERE match_value = ?')
        .get(input.matchValue),
    ).toMatchObject({ n: 0 });
  });
});

describe('listRules', () => {
  it('returns rules in matching order with the created rule last', () => {
    const { rule } = createRule(db, {
      matchType: 'exact',
      matchValue: 'ZZZ EXACT',
      categoryId: 'cat-alimentation',
    });
    const rules = listRules(db);
    expect(rules.length).toBeGreaterThan(1); // seeds + the new one
    expect(rules[rules.length - 1]).toMatchObject({ id: rule.id, matchValue: 'ZZZ EXACT' });
    // Seed rules are present and exposed like any rule.
    expect(rules[0]).toMatchObject({ id: 'cr-001' });
  });
});

describe('updateRule', () => {
  it('updates fields and re-runs the retroactive pass on uncategorized rows', () => {
    const { rule } = createRule(db, {
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
    });
    insertTx({ id: 't1', label: 'YYYMART CENTER' });

    const { applied } = updateRule(db, {
      id: rule.id,
      matchType: 'contains',
      matchValue: 'YYYMART',
      categoryId: 'cat-loisirs',
    });

    expect(applied).toBe(1);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1')).toMatchObject(
      { category_id: 'cat-loisirs' },
    );
    const updated = listRules(db).find((r) => r.id === rule.id);
    expect(updated).toMatchObject({ matchValue: 'YYYMART', categoryId: 'cat-loisirs' });
  });

  it('rejects invalid input without touching the rule', () => {
    const { rule } = createRule(db, {
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
    });
    expect(() =>
      updateRule(db, {
        id: rule.id,
        matchType: 'regex',
        matchValue: '(bad',
        categoryId: 'cat-alimentation',
      }),
    ).toThrow(InvalidRuleError);
    expect(listRules(db).find((r) => r.id === rule.id)).toMatchObject({ matchValue: 'ZZZSHOP' });
  });
});

describe('deleteRule', () => {
  it('removes the rule and leaves categorized rows untouched', () => {
    insertTx({ id: 't1', label: 'ZZZSHOP' });
    const { rule } = createRule(db, {
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
    });

    deleteRule(db, rule.id);

    expect(listRules(db).find((r) => r.id === rule.id)).toBeUndefined();
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1')).toMatchObject(
      { category_id: 'cat-alimentation' },
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/categorize/rulesManage.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/main/categorize/rulesManage.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { RuleDTO, RuleInput } from '@shared/types/rules';
import { matchRule, type CategorizationRule } from './rules';

/** Input failed validation (empty value, bad regex, unknown category). */
export class InvalidRuleError extends Error {
  constructor(reason: string) {
    super(`invalid rule: ${reason}`);
    this.name = 'InvalidRuleError';
  }
}

interface RuleRow {
  id: string;
  match_type: string;
  match_value: string;
  category_id: string;
  hit_count: number;
  created_at: string;
}

function toDTO(r: RuleRow): RuleDTO {
  return {
    id: r.id,
    matchType: r.match_type as RuleDTO['matchType'],
    matchValue: r.match_value,
    categoryId: r.category_id,
    hitCount: r.hit_count,
    createdAt: r.created_at,
  };
}

function getRow(db: DatabaseSync, id: string): RuleRow {
  const row = db
    .prepare(
      'SELECT id, match_type, match_value, category_id, hit_count, created_at FROM categorization_rules WHERE id = ?',
    )
    .get(id) as unknown as RuleRow | undefined;
  if (row === undefined) throw new InvalidRuleError(`no rule ${id}`);
  return row;
}

/** All rules in matching order (rowid ASC = creation order, first match wins). */
export function listRules(db: DatabaseSync): RuleDTO[] {
  const rows = db
    .prepare(
      'SELECT id, match_type, match_value, category_id, hit_count, created_at FROM categorization_rules ORDER BY rowid ASC',
    )
    .all() as unknown as RuleRow[];
  return rows.map(toDTO);
}

function validate(db: DatabaseSync, input: RuleInput): string {
  const value = input.matchValue.trim();
  if (value === '') throw new InvalidRuleError('empty match value');
  if (!['contains', 'exact', 'regex'].includes(input.matchType)) {
    throw new InvalidRuleError(`bad match type ${input.matchType}`);
  }
  if (input.matchType === 'regex') {
    try {
      new RegExp(value);
    } catch {
      throw new InvalidRuleError('regex does not compile');
    }
  }
  const cat = db
    .prepare('SELECT 1 FROM categories WHERE id = ? AND deprecated_at IS NULL')
    .get(input.categoryId);
  if (cat === undefined) throw new InvalidRuleError(`unknown category ${input.categoryId}`);
  return value;
}

/**
 * Apply ONE rule to every still-uncategorized transaction (same matcher as the
 * import cascade) and bump its hit_count by the rows applied. Never overwrites —
 * a manual pick always wins. Returns the applied count.
 */
function applyRetroactively(db: DatabaseSync, rule: CategorizationRule): number {
  const rows = db
    .prepare(
      `SELECT id, label_clean FROM transactions
        WHERE category_id IS NULL AND is_internal_transfer = 0`,
    )
    .all() as unknown as { id: string; label_clean: string }[];
  const ids = rows.filter((r) => matchRule([rule], r.label_clean) !== null).map((r) => r.id);
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const res = db
    .prepare(
      `UPDATE transactions SET category_id = ?
        WHERE id IN (${placeholders}) AND category_id IS NULL`,
    )
    .run(rule.categoryId, ...ids);
  const applied = Number(res.changes);
  db.prepare('UPDATE categorization_rules SET hit_count = hit_count + ? WHERE id = ?').run(
    applied,
    rule.id,
  );
  return applied;
}

/** Validate, insert, retroactively apply — atomically. */
export function createRule(db: DatabaseSync, input: RuleInput): { rule: RuleDTO; applied: number } {
  const value = validate(db, input);
  const id = randomUUID();
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO categorization_rules (id, match_type, match_value, category_id) VALUES (?, ?, ?, ?)',
    ).run(id, input.matchType, value, input.categoryId);
    const applied = applyRetroactively(db, {
      id,
      matchType: input.matchType,
      matchValue: value,
      categoryId: input.categoryId,
    });
    db.exec('COMMIT');
    return { rule: toDTO(getRow(db, id)), applied };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Validate, update in place (created_at and hit_count kept), re-run the retroactive pass. */
export function updateRule(
  db: DatabaseSync,
  input: RuleInput & { id: string },
): { rule: RuleDTO; applied: number } {
  const value = validate(db, input);
  getRow(db, input.id); // existence check before writing
  db.exec('BEGIN');
  try {
    db.prepare(
      'UPDATE categorization_rules SET match_type = ?, match_value = ?, category_id = ? WHERE id = ?',
    ).run(input.matchType, value, input.categoryId, input.id);
    const applied = applyRetroactively(db, {
      id: input.id,
      matchType: input.matchType,
      matchValue: value,
      categoryId: input.categoryId,
    });
    db.exec('COMMIT');
    return { rule: toDTO(getRow(db, input.id)), applied };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

/** Delete the rule. Already-categorized rows are untouched (no reverse magic). */
export function deleteRule(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM categorization_rules WHERE id = ?').run(id);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/categorize/rulesManage.test.ts && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/categorize/rulesManage.ts tests/unit/categorize/rulesManage.test.ts
git commit -m "feat(categorize): rule CRUD with retroactive application to the uncategorized residual"
```

---

### Task 4: IPC channels + handlers

**Files:**

- Modify: `src/shared/types/ipc.ts` (contract entries)
- Modify: `src/main/ipc/channels.ts`
- Create: `src/main/ipc/handlers/rules.ts`
- Modify: `src/main/ipc/register.ts`
- Test: `tests/unit/ipc/rules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ipc/rules.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import {
  handleRulesList,
  handleRulesCreate,
  handleRulesUpdate,
  handleRulesDelete,
} from '../../../src/main/ipc/handlers/rules';

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
});

describe('rules IPC handlers', () => {
  it('creates, lists, updates and deletes a rule end to end', () => {
    const created = handleRulesCreate({
      matchType: 'contains',
      matchValue: 'ZZZSHOP',
      categoryId: 'cat-alimentation',
    });
    if (!created.ok) throw new Error('expected ok');
    expect(created.rule.matchValue).toBe('ZZZSHOP');

    expect(handleRulesList().rules.some((r) => r.id === created.rule.id)).toBe(true);

    const updated = handleRulesUpdate({
      id: created.rule.id,
      matchType: 'exact',
      matchValue: 'ZZZ EXACT',
      categoryId: 'cat-alimentation',
    });
    if (!updated.ok) throw new Error('expected ok');
    expect(updated.rule.matchType).toBe('exact');

    expect(handleRulesDelete({ id: created.rule.id })).toEqual({ ok: true });
    expect(handleRulesList().rules.some((r) => r.id === created.rule.id)).toBe(false);
  });

  it('maps InvalidRuleError to the typed invalid_rule error', () => {
    expect(
      handleRulesCreate({ matchType: 'regex', matchValue: '(bad', categoryId: 'cat-alimentation' }),
    ).toEqual({ ok: false, error: 'invalid_rule' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/ipc/rules.test.ts`
Expected: FAIL — handlers module not found.

- [ ] **Step 3: Implement**

In `src/shared/types/ipc.ts`, add near the other imports/types (top of file imports `PendingGroup` etc. from './import' — add an import from './rules'):

```ts
import type { RuleDTO, RuleInput } from './rules';
```

(Match the file's existing relative-import style — check how it imports the other shared types and mirror it.)

Add the response/payload types next to the categorize types:

```ts
export type RulesMutationResponse =
  | { ok: true; rule: RuleDTO; applied: number }
  | { ok: false; error: 'invalid_rule' };
```

Add to the `IpcContract` interface after the `categorize:*` entries:

```ts
  'rules:list': { payload: Record<string, never>; response: { rules: RuleDTO[] } };
  'rules:create': { payload: RuleInput; response: RulesMutationResponse };
  'rules:update': { payload: RuleInput & { id: string }; response: RulesMutationResponse };
  'rules:delete': { payload: { id: string }; response: { ok: true } };
```

In `src/main/ipc/channels.ts`, add to `CHANNELS`:

```ts
  rulesList: 'rules:list',
  rulesCreate: 'rules:create',
  rulesUpdate: 'rules:update',
  rulesDelete: 'rules:delete',
```

Create `src/main/ipc/handlers/rules.ts`:

```ts
import type { RuleInput } from '@shared/types/rules';
import type { RulesMutationResponse, IpcResponse } from '@shared/types/ipc';
import { getDb } from '../../db';
import {
  listRules,
  createRule,
  updateRule,
  deleteRule,
  InvalidRuleError,
} from '../../categorize/rulesManage';

export function handleRulesList(): IpcResponse<'rules:list'> {
  return { rules: listRules(getDb()) };
}

export function handleRulesCreate(payload: RuleInput): RulesMutationResponse {
  try {
    const { rule, applied } = createRule(getDb(), payload);
    return { ok: true, rule, applied };
  } catch (e) {
    if (e instanceof InvalidRuleError) return { ok: false, error: 'invalid_rule' };
    throw e;
  }
}

export function handleRulesUpdate(payload: RuleInput & { id: string }): RulesMutationResponse {
  try {
    const { rule, applied } = updateRule(getDb(), payload);
    return { ok: true, rule, applied };
  } catch (e) {
    if (e instanceof InvalidRuleError) return { ok: false, error: 'invalid_rule' };
    throw e;
  }
}

export function handleRulesDelete(payload: { id: string }): { ok: true } {
  deleteRule(getDb(), payload.id);
  return { ok: true };
}
```

(If `IpcResponse<'rules:list'>` is awkward — check how other handlers type their returns, e.g. `handleCategorizePending(): CategorizePendingResponse` uses a named type; if there is no named type for the list response, inline `{ rules: RuleDTO[] }` with the import instead.)

In `src/main/ipc/register.ts`: add the import and four registrations following the existing pattern:

```ts
import {
  handleRulesList,
  handleRulesCreate,
  handleRulesUpdate,
  handleRulesDelete,
} from './handlers/rules';
```

```ts
register(CHANNELS.rulesList, () => handleRulesList());
register(CHANNELS.rulesCreate, handleRulesCreate);
register(CHANNELS.rulesUpdate, handleRulesUpdate);
register(CHANNELS.rulesDelete, handleRulesDelete);
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/ipc/ && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/ipc.ts src/shared/types/rules.ts src/main/ipc tests/unit/ipc/rules.test.ts
git commit -m "feat(categorize): expose rule CRUD over typed IPC"
```

---

### Task 5: `useRules` renderer hook

**Files:**

- Create: `src/renderer/hooks/useRules.ts`
- Test: `tests/unit/renderer/useRules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/useRules.test.ts`:

```ts
// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { toast } from 'sonner';
import { useRules } from '@renderer/hooks/useRules';
import type { RuleDTO } from '@shared/types/rules';

const mockInvoke = vi.mocked(ipc.invoke);

const RULE: RuleDTO = {
  id: 'r1',
  matchType: 'contains',
  matchValue: 'ZZZSHOP',
  categoryId: 'cat-alimentation',
  hitCount: 3,
  createdAt: '2026-06-11 10:00:00',
};

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.success).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useRules', () => {
  it('loads the rules on mount', async () => {
    mockInvoke.mockResolvedValue({ rules: [RULE] });
    const { result } = renderHook(() => useRules());
    await act(async () => {});
    expect(result.current.rules).toEqual([RULE]);
  });

  it('updateRule reloads and toasts with the applied count', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'rules:list') return Promise.resolve({ rules: [RULE] });
      return Promise.resolve({ ok: true as const, rule: RULE, applied: 2 });
    });
    const { result } = renderHook(() => useRules());
    await act(async () => {});

    let ok = false;
    await act(async () => {
      ok = await result.current.updateRule({
        id: 'r1',
        matchType: 'contains',
        matchValue: 'ZZZSHOP',
        categoryId: 'cat-loisirs',
      });
    });

    expect(ok).toBe(true);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'Règle mise à jour — 2 transactions catégorisées',
    );
  });

  it('updateRule returns false on invalid_rule (no toast)', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'rules:list') return Promise.resolve({ rules: [RULE] });
      return Promise.resolve({ ok: false as const, error: 'invalid_rule' as const });
    });
    const { result } = renderHook(() => useRules());
    await act(async () => {});

    let ok = true;
    await act(async () => {
      ok = await result.current.updateRule({
        id: 'r1',
        matchType: 'regex',
        matchValue: '(bad',
        categoryId: 'cat-loisirs',
      });
    });

    expect(ok).toBe(false);
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('deleteRule reloads and toasts', async () => {
    mockInvoke.mockImplementation((channel) => {
      if (channel === 'rules:list') return Promise.resolve({ rules: [] });
      return Promise.resolve({ ok: true as const });
    });
    const { result } = renderHook(() => useRules());
    await act(async () => {});

    await act(async () => {
      await result.current.deleteRule('r1');
    });

    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Règle supprimée');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/renderer/useRules.test.ts`
Expected: FAIL — hook module not found.

- [ ] **Step 3: Implement**

Create `src/renderer/hooks/useRules.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { RuleDTO, RuleInput } from '@shared/types/rules';
import { ipc } from '@renderer/ipc/client';

function appliedSuffix(applied: number): string {
  if (applied === 0) return '';
  return ` — ${String(applied)} transaction${applied > 1 ? 's' : ''} catégorisée${applied > 1 ? 's' : ''}`;
}

export interface UseRules {
  rules: RuleDTO[];
  reload: () => Promise<void>;
  /** Returns false when the backend rejects the input (invalid_rule). */
  updateRule: (input: RuleInput & { id: string }) => Promise<boolean>;
  deleteRule: (id: string) => Promise<void>;
}

/** Rule list + mutations for the audit section. Creation lives in RuleDialog. */
export function useRules(): UseRules {
  const [rules, setRules] = useState<RuleDTO[]>([]);

  const reload = useCallback(async () => {
    const { rules: next } = await ipc.invoke('rules:list', {});
    setRules(next);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateRule = useCallback(
    async (input: RuleInput & { id: string }) => {
      const res = await ipc.invoke('rules:update', input);
      if (!res.ok) return false;
      toast.success(`Règle mise à jour${appliedSuffix(res.applied)}`);
      await reload();
      return true;
    },
    [reload],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await ipc.invoke('rules:delete', { id });
      toast.success('Règle supprimée');
      await reload();
    },
    [reload],
  );

  return { rules, reload, updateRule, deleteRule };
}
```

Note: the test expects `'Règle mise à jour — 2 transactions catégorisées'` — the suffix only appears when `applied > 0`, plural when `> 1`. The code above produces exactly that.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/renderer/useRules.test.ts && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useRules.ts tests/unit/renderer/useRules.test.ts
git commit -m "feat(categorize): add the useRules hook (list, update, delete)"
```

---

### Task 6: `RuleDialog` (creation, pre-filled)

**Files:**

- Create: `src/renderer/components/categories/RuleDialog.tsx`
- Test: `tests/unit/renderer/RuleDialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/RuleDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CategoryDTO } from '@shared/types/category';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { toast } from 'sonner';
import { RuleDialog, type RuleProposal } from '@renderer/components/categories/RuleDialog';

const mockInvoke = vi.mocked(ipc.invoke);

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat-alimentation',
    name: 'Alimentation',
    icon: null,
    color: '#22c55e',
    parentId: null,
    isDefault: true,
    position: 1,
  },
  {
    id: 'cat-loisirs',
    name: 'Loisirs',
    icon: null,
    color: '#3b82f6',
    parentId: null,
    isDefault: true,
    position: 2,
  },
];

const PROPOSAL: RuleProposal = {
  labelClean: 'CB CARREFOUR MARKET PARIS 11',
  categoryId: 'cat-alimentation',
};

beforeEach(() => {
  mockInvoke.mockReset();
  vi.mocked(toast.success).mockReset();
});

afterEach(() => {
  cleanup();
});

function renderDialog(over: Partial<Parameters<typeof RuleDialog>[0]> = {}) {
  return render(
    <RuleDialog
      proposal={PROPOSAL}
      categories={CATEGORIES}
      onClose={vi.fn()}
      onCreated={vi.fn()}
      {...over}
    />,
  );
}

describe('RuleDialog', () => {
  it('pre-fills the suggested token, contains type and the chosen category', () => {
    renderDialog();
    expect(screen.getByLabelText('Valeur')).toHaveProperty('value', 'CARREFOUR');
    expect(screen.getByLabelText('Type de règle')).toHaveProperty('value', 'contains');
    expect(screen.getByLabelText('Catégorie')).toHaveProperty('value', 'cat-alimentation');
  });

  it('creates the rule and reports the applied count', async () => {
    mockInvoke.mockResolvedValue({
      ok: true,
      rule: {
        id: 'r1',
        matchType: 'contains',
        matchValue: 'CARREFOUR',
        categoryId: 'cat-alimentation',
        hitCount: 3,
        createdAt: 'x',
      },
      applied: 3,
    });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onCreated, onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Créer la règle' }));

    expect(mockInvoke).toHaveBeenCalledWith('rules:create', {
      matchType: 'contains',
      matchValue: 'CARREFOUR',
      categoryId: 'cat-alimentation',
    });
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
      'Règle créée — 3 transactions catégorisées',
    );
    expect(onCreated).toHaveBeenCalledWith(3);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an inline error on invalid_rule and stays open', async () => {
    mockInvoke.mockResolvedValue({ ok: false, error: 'invalid_rule' });
    const onClose = vi.fn();
    renderDialog({ onClose });

    await userEvent.click(screen.getByRole('button', { name: 'Créer la règle' }));

    expect(screen.getByText(/Règle invalide/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled();
  });

  it('renders nothing without a proposal', () => {
    const { container } = renderDialog({ proposal: null });
    expect(container.firstChild).toBeNull();
  });
});
```

(If `CategoryDTO` fields differ — check `src/shared/types/category.ts` and adjust the fixture to the real shape before running.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/renderer/RuleDialog.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

Create `src/renderer/components/categories/RuleDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { CategoryDTO } from '@shared/types/category';
import type { RuleMatchType } from '@shared/types/rules';
import { suggestRuleToken } from '@shared/categorize/labelKey';
import { ipc } from '@renderer/ipc/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';

/** What the reassign toast hands over: the corrected label + chosen category. */
export interface RuleProposal {
  labelClean: string;
  categoryId: string;
}

const FIELD =
  'h-9 w-full rounded-md border border-line-2 bg-ink-3 px-2.5 text-[13px] text-paper focus:outline-none focus:ring-1 focus:ring-brass';

/**
 * "Create a rule from this correction": pre-filled with the suggested significant
 * token (fallback: exact stable key) and the category just chosen; everything is
 * editable before validating. Validation errors come back inline, not as toasts.
 */
export function RuleDialog({
  proposal,
  categories,
  onClose,
  onCreated,
}: {
  proposal: RuleProposal | null;
  categories: CategoryDTO[];
  onClose: () => void;
  onCreated: (applied: number) => void;
}) {
  const [matchType, setMatchType] = useState<RuleMatchType>('contains');
  const [matchValue, setMatchValue] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Re-seed the fields each time a new proposal arrives.
  useEffect(() => {
    if (proposal === null) return;
    const suggestion = suggestRuleToken(proposal.labelClean);
    setMatchType(suggestion.matchType);
    setMatchValue(suggestion.value);
    setCategoryId(proposal.categoryId);
    setError(null);
  }, [proposal]);

  if (proposal === null) return null;

  const submit = async (): Promise<void> => {
    const res = await ipc.invoke('rules:create', { matchType, matchValue, categoryId });
    if (!res.ok) {
      setError('Règle invalide — vérifie la valeur (regex ?) et la catégorie.');
      return;
    }
    const n = res.applied;
    toast.success(
      `Règle créée${n > 0 ? ` — ${String(n)} transaction${n > 1 ? 's' : ''} catégorisée${n > 1 ? 's' : ''}` : ''}`,
    );
    onCreated(n);
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Créer une règle</DialogTitle>
        </DialogHeader>
        <p className="font-mono text-[11px] text-paper-dim">{proposal.labelClean}</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-paper-soft">
            Type de règle
            <select
              aria-label="Type de règle"
              className={FIELD}
              value={matchType}
              onChange={(e) => {
                setMatchType(e.target.value as RuleMatchType);
              }}
            >
              <option value="contains">Contient</option>
              <option value="exact">Exact</option>
              <option value="regex">Regex</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-paper-soft">
            Valeur
            <input
              aria-label="Valeur"
              className={FIELD}
              value={matchValue}
              onChange={(e) => {
                setMatchValue(e.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-paper-soft">
            Catégorie
            <select
              aria-label="Catégorie"
              className={FIELD}
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {error !== null && <p className="text-[12px] text-flag">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              void submit();
            }}
          >
            Créer la règle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

(Check `src/renderer/components/ui/dialog.tsx` exports before using — ImportModal imports `Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle` style; mirror what exists. If `text-flag` is not a valid token, use the inline style pattern from the ImportModal overlap banner: `style={{ color: 'hsl(var(--flag))' }}`.)

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/renderer/RuleDialog.test.tsx && npx tsc --noEmit`
Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/categories/RuleDialog.tsx tests/unit/renderer/RuleDialog.test.tsx
git commit -m "feat(categorize): add the pre-filled rule creation dialog"
```

---

### Task 7: toast action wiring (useDashboard + both pages)

**Files:**

- Modify: `src/renderer/hooks/useDashboard.ts`
- Modify: `src/renderer/pages/TransactionsPage.tsx`
- Modify: `src/renderer/pages/DashboardPage.tsx`
- Test: `tests/unit/renderer/useDashboardRuleAction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/useDashboardRuleAction.test.ts`:

```ts
// @vitest-environment jsdom
import { renderHook, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { toast } from 'sonner';
import { useDashboard } from '@renderer/hooks/useDashboard';

const mockInvoke = vi.mocked(ipc.invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  // Generic resolutions for the mount-time fetches (accounts, categories, …).
  mockInvoke.mockResolvedValue({
    accounts: [],
    categories: [],
    transactions: [],
    balance: 0,
    series: [],
  } as never);
  vi.mocked(toast.success).mockReset();
});

afterEach(() => {
  cleanup();
});

describe('useDashboard reassign → rule proposal', () => {
  it('offers a "Créer une règle" toast action when the label is provided', async () => {
    const onProposeRule = vi.fn();
    const { result } = renderHook(() => useDashboard(0, { onProposeRule }));

    await act(async () => {
      await result.current.reassign('t1', 'cat-alimentation', 'CB CARREFOUR MARKET');
    });

    const call = vi
      .mocked(toast.success)
      .mock.calls.find(([msg]) => msg === 'Transaction reclassée');
    expect(call).toBeDefined();
    const opts = call?.[1] as { action?: { label: string; onClick: () => void } } | undefined;
    expect(opts?.action?.label).toBe('Créer une règle');

    opts?.action?.onClick();
    expect(onProposeRule).toHaveBeenCalledWith({
      labelClean: 'CB CARREFOUR MARKET',
      categoryId: 'cat-alimentation',
    });
  });

  it('keeps the plain toast when no label is provided', async () => {
    const { result } = renderHook(() => useDashboard(0, { onProposeRule: vi.fn() }));

    await act(async () => {
      await result.current.reassign('t1', 'cat-alimentation');
    });

    const call = vi
      .mocked(toast.success)
      .mock.calls.find(([msg]) => msg === 'Transaction reclassée');
    expect(call?.[1]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/renderer/useDashboardRuleAction.test.ts`
Expected: FAIL — `reassign` does not accept a third argument / no action option passed.

- [ ] **Step 3: Implement the hook change**

In `src/renderer/hooks/useDashboard.ts`:

Add the proposal type and extend the options interface:

```ts
import type { RuleProposal } from '@renderer/components/categories/RuleDialog';
```

```ts
export interface UseDashboardOptions {
  /** (existing transactionLimit doc comment stays) */
  readonly transactionLimit?: number;
  /** When set, the reassign toast offers a "Créer une règle" action. */
  readonly onProposeRule?: (proposal: RuleProposal) => void;
}
```

Update the `UseDashboard` interface entry and the `reassign` implementation:

```ts
  /** Reassign a transaction to a category and refresh the view. When `labelClean`
   *  is provided (and the page handles proposals), the success toast offers to
   *  turn the correction into a rule. */
  reassign: (transactionId: string, categoryId: string, labelClean?: string) => Promise<void>;
  /** Force a refetch (e.g. after a rule creation retroactively categorized rows). */
  refresh: () => void;
```

```ts
const { transactionLimit, onProposeRule } = options;
// …
const reassign = useCallback(
  async (transactionId: string, categoryId: string, labelClean?: string) => {
    try {
      await ipc.invoke('transactions:setCategory', { transactionId, categoryId });
      setTick((t) => t + 1);
      if (labelClean !== undefined && onProposeRule !== undefined) {
        toast.success('Transaction reclassée', {
          action: {
            label: 'Créer une règle',
            onClick: () => {
              onProposeRule({ labelClean, categoryId });
            },
          },
        });
      } else {
        toast.success('Transaction reclassée');
      }
    } catch (e) {
      toast.error(`Reclassement impossible : ${errMessage(e)}`);
    }
  },
  [onProposeRule],
);

const refresh = useCallback(() => {
  setTick((t) => t + 1);
}, []);
```

Add `refresh` to the returned object.

- [ ] **Step 4: Wire both pages**

In `src/renderer/pages/TransactionsPage.tsx`:

- Add imports: `import { RuleDialog, type RuleProposal } from '../components/categories/RuleDialog';` and `useState` if not already imported.
- Add state inside the component: `const [ruleProposal, setRuleProposal] = useState<RuleProposal | null>(null);`
- Pass the option into the hook call (find the `useDashboard(refreshToken, { transactionLimit: … })` call and add `onProposeRule: setRuleProposal`). Destructure `refresh` too.
- At the `<TxTableRow>` callsite (~line 227), change `onReassign={(txId, catId) => { void reassign(txId, catId); }}` to `onReassign={(txId, catId) => { void reassign(txId, catId, t.labelClean); }}` (`t` is the `DashboardTransaction` in scope of the row map).
- Render the dialog once, near the end of the page's JSX:

```tsx
<RuleDialog
  proposal={ruleProposal}
  categories={categories}
  onClose={() => {
    setRuleProposal(null);
  }}
  onCreated={() => {
    refresh();
  }}
/>
```

In `src/renderer/pages/DashboardPage.tsx`: same four edits (state, hook option + `refresh`, `t.labelClean` at the reassign callsite ~line 167 — check the variable name holding the transaction in that map and use its `labelClean` —, render `<RuleDialog>` once).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/unit/renderer/ && npx tsc --noEmit && npx eslint src/renderer`
Expected: all PASS (existing TransactionsPage/DashboardPage tests must stay green — if one stubs `useDashboard`, add the new `refresh` field to its stub), tsc + eslint clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/useDashboard.ts src/renderer/pages tests/unit/renderer/useDashboardRuleAction.test.ts
git commit -m "feat(categorize): offer rule creation from the reassign toast"
```

---

### Task 8: `RulesSection` in the Categories page

**Files:**

- Create: `src/renderer/components/categories/RulesSection.tsx`
- Modify: `src/renderer/pages/CategoriesPage.tsx`
- Test: `tests/unit/renderer/RulesSection.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/renderer/RulesSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CategoryDTO } from '@shared/types/category';
import type { RuleDTO } from '@shared/types/rules';

vi.mock('@renderer/ipc/client', () => ({ ipc: { invoke: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ipc } from '@renderer/ipc/client';
import { RulesSection } from '@renderer/components/categories/RulesSection';

const mockInvoke = vi.mocked(ipc.invoke);

const CATEGORIES: CategoryDTO[] = [
  {
    id: 'cat-alimentation',
    name: 'Alimentation',
    icon: null,
    color: '#22c55e',
    parentId: null,
    isDefault: true,
    position: 1,
  },
  {
    id: 'cat-loisirs',
    name: 'Loisirs',
    icon: null,
    color: '#3b82f6',
    parentId: null,
    isDefault: true,
    position: 2,
  },
];

const RULES: RuleDTO[] = [
  {
    id: 'cr-001',
    matchType: 'contains',
    matchValue: 'NETFLIX',
    categoryId: 'cat-loisirs',
    hitCount: 12,
    createdAt: '2026-05-15 10:00:00',
  },
  {
    id: 'r-user',
    matchType: 'exact',
    matchValue: 'ZZZ EXACT',
    categoryId: 'cat-alimentation',
    hitCount: 0,
    createdAt: '2026-06-11 09:00:00',
  },
];

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation((channel) => {
    if (channel === 'rules:list') return Promise.resolve({ rules: RULES });
    if (channel === 'rules:delete') return Promise.resolve({ ok: true as const });
    return Promise.resolve({
      ok: true as const,
      rule: RULES[1],
      applied: 0,
    });
  });
});

afterEach(() => {
  cleanup();
});

describe('RulesSection', () => {
  it('lists rules with value, category, hit count and creation date', async () => {
    render(<RulesSection categories={CATEGORIES} />);
    expect(await screen.findByText('NETFLIX')).toBeTruthy();
    expect(screen.getByText('Loisirs')).toBeTruthy();
    expect(screen.getByText('12 ×')).toBeTruthy();
    expect(screen.getByText('ZZZ EXACT')).toBeTruthy();
    expect(screen.getByText('2026-05-15')).toBeTruthy();
  });

  it('deletes a rule after the confirmation step', async () => {
    render(<RulesSection categories={CATEGORIES} />);
    await screen.findByText('NETFLIX');

    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer la règle' })[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la suppression' }));

    expect(mockInvoke).toHaveBeenCalledWith('rules:delete', { id: 'cr-001' });
  });

  it('edits a rule inline', async () => {
    render(<RulesSection categories={CATEGORIES} />);
    await screen.findByText('NETFLIX');

    await userEvent.click(screen.getAllByRole('button', { name: 'Modifier la règle' })[0]!);
    const valueInput = screen.getByLabelText('Valeur de la règle');
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, 'NETFLIX FR');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer la règle' }));

    expect(mockInvoke).toHaveBeenCalledWith('rules:update', {
      id: 'cr-001',
      matchType: 'contains',
      matchValue: 'NETFLIX FR',
      categoryId: 'cat-loisirs',
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/renderer/RulesSection.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement**

Create `src/renderer/components/categories/RulesSection.tsx`:

```tsx
import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import type { CategoryDTO } from '@shared/types/category';
import type { RuleDTO, RuleMatchType } from '@shared/types/rules';
import { Card, CardHeader, CardTitle } from '../ui/card';
import { Overline } from '../ui/overline';
import { useRules } from '../../hooks/useRules';
import { cn } from '../../lib/utils';

const FIELD =
  'h-8 rounded-md border border-line-2 bg-ink-3 px-2 text-[12px] text-paper focus:outline-none focus:ring-1 focus:ring-brass';
const ICON_BTN = 'rounded p-1 text-paper-dim hover:text-paper hover:bg-ink-2';

const TYPE_LABEL: Record<RuleMatchType, string> = {
  contains: 'contient',
  exact: 'exact',
  regex: 'regex',
};

/**
 * Audit/repair surface for the categorization rules (ADR-019: rules are the
 * engine now). Lists ALL rules — seed and user — in matching order (first match
 * wins); creation stays contextual (RuleDialog from the reassign toast).
 */
export function RulesSection({ categories }: { categories: CategoryDTO[] }) {
  const { rules, updateRule, deleteRule } = useRules();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3.5">
          <Overline>— II</Overline>
          <CardTitle>Règles</CardTitle>
        </div>
      </CardHeader>
      <p className="pb-1 font-sans text-[11px] text-paper-dim">
        Appliquées dans l'ordre à l'import (première règle qui matche). Crée une règle depuis une
        correction : reclasse une transaction, puis « Créer une règle » dans la notification.
      </p>
      <div className="flex flex-col">
        {rules.map((r) => (
          <RuleRow
            key={r.id}
            rule={r}
            categories={categories}
            onUpdate={updateRule}
            onDelete={deleteRule}
          />
        ))}
      </div>
    </Card>
  );
}

function RuleRow({
  rule,
  categories,
  onUpdate,
  onDelete,
}: {
  rule: RuleDTO;
  categories: CategoryDTO[];
  onUpdate: (input: {
    id: string;
    matchType: RuleMatchType;
    matchValue: string;
    categoryId: string;
  }) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [matchType, setMatchType] = useState<RuleMatchType>(rule.matchType);
  const [matchValue, setMatchValue] = useState(rule.matchValue);
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const category = categories.find((c) => c.id === rule.categoryId);

  if (editing) {
    return (
      <div className="flex items-center gap-2 border-b border-line-1 py-2">
        <select
          aria-label="Type de la règle"
          className={FIELD}
          value={matchType}
          onChange={(e) => {
            setMatchType(e.target.value as RuleMatchType);
          }}
        >
          <option value="contains">Contient</option>
          <option value="exact">Exact</option>
          <option value="regex">Regex</option>
        </select>
        <input
          aria-label="Valeur de la règle"
          className={cn(FIELD, 'min-w-0 flex-1')}
          value={matchValue}
          onChange={(e) => {
            setMatchValue(e.target.value);
          }}
        />
        <select
          aria-label="Catégorie de la règle"
          className={FIELD}
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
          }}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="Enregistrer la règle"
          className={ICON_BTN}
          onClick={() => {
            void onUpdate({ id: rule.id, matchType, matchValue, categoryId }).then((ok) => {
              if (ok) setEditing(false);
            });
          }}
        >
          <Check size={14} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          aria-label="Annuler la modification"
          className={ICON_BTN}
          onClick={() => {
            setEditing(false);
            setMatchType(rule.matchType);
            setMatchValue(rule.matchValue);
            setCategoryId(rule.categoryId);
          }}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2.5 border-b border-line-1 py-2">
      <span className="w-16 shrink-0 rounded-sm border border-line-2 bg-ink-3 px-1.5 py-0.5 text-center font-sans text-[10px] uppercase tracking-[0.08em] text-paper-mute">
        {TYPE_LABEL[rule.matchType]}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-paper">
        {rule.matchValue}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 font-sans text-[11px] text-paper-soft">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: category?.color ?? '#888888' }}
        />
        {category?.name ?? rule.categoryId}
      </span>
      <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-paper-dim">
        {rule.hitCount} ×
      </span>
      <span className="hidden w-20 shrink-0 text-right font-mono text-[10px] text-paper-dim xl:block">
        {rule.createdAt.slice(0, 10)}
      </span>
      <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Modifier la règle"
          className={ICON_BTN}
          onClick={() => {
            setEditing(true);
          }}
        >
          <Pencil size={14} strokeWidth={1.8} />
        </button>
        {confirming ? (
          <button
            type="button"
            aria-label="Confirmer la suppression"
            className={cn(ICON_BTN, 'text-flag')}
            onClick={() => {
              void onDelete(rule.id);
            }}
          >
            <Check size={14} strokeWidth={1.8} />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Supprimer la règle"
            className={ICON_BTN}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        )}
      </span>
    </div>
  );
}
```

(Style notes: mirror `CategoryRow` in `CategoriesPage.tsx` for the edit/confirm interaction patterns and class vocabulary — read it first. If `text-flag` isn't a token, use `style={{ color: 'hsl(var(--flag))' }}`.)

In `src/renderer/pages/CategoriesPage.tsx`:

- Import: `import { RulesSection } from '../components/categories/RulesSection';`
- Wrap the page's single `<Card>…</Card>` in a fragment and append `<RulesSection categories={categories} />` after it:

```tsx
return (
  <>
    <Card>{/* existing content unchanged */}</Card>
    <RulesSection categories={categories} />
  </>
);
```

- Update the explanatory paragraph (it predates the rules surface):

```tsx
<p className="pb-1 font-sans text-[11px] text-paper-dim">
  La catégorisation est déterministe : tes règles à l'import, puis l'apprentissage de tes
  corrections. Les règles se gèrent dans la section ci-dessous.
</p>
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/unit/renderer/ && npx tsc --noEmit && npx eslint src tests`
Expected: all PASS — if `CategoriesPage.test.tsx` renders the page, it now fires a `rules:list` invoke: extend its ipc mock to resolve `{ rules: [] }` for that channel. Lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/categories/RulesSection.tsx src/renderer/pages/CategoriesPage.tsx tests/unit/renderer
git commit -m "feat(categorize): add the rules audit section to the categories page"
```

---

### Task 9: full gate, push, PR

- [ ] **Step 1: Full verification (Definition of done)**

```bash
npx eslint src tests && npx tsc --noEmit && npx vitest run tests/unit && npm run build
```

Expected: all clean/green. Fix anything that fails before proceeding.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/rules-phase1
gh pr create --title "feat(categorize): one-click rules from corrections + rules audit section" --body "$(cat <<'EOF'
## Summary
ADR-019 phase 1a — strengthen deterministic categorization before the LLM removal:
- Reassigning a transaction now offers « Créer une règle » on the success toast → a pre-filled dialog (suggested significant token, `contains`; fallback `exact` on the stable key; category pre-selected; everything editable).
- Creating a rule retroactively categorizes the still-uncategorized matching rows (never overwrites a set category) and bumps `hit_count`.
- New « Règles » section in the Categories page: every rule (seed + user) with type badge, value, category, hit count; inline edit and confirmed delete. First-match-wins order, no reordering (YAGNI).
- The import cascade and matching engine are untouched; the label-key logic moved to `src/shared/` (re-export shim keeps main imports stable).

Spec: `docs/superpowers/specs/2026-06-11-rules-phase1-design.md`
Plan: `docs/superpowers/plans/2026-06-11-rules-phase1.md`

## Test plan
- [ ] CI green (lint, typecheck, unit, build)
- [ ] Maintainer in-app validation: reclasser une transaction → action « Créer une règle » → dialogue pré-rempli → règle créée + rétroactivité visible; section Règles (liste, édition, suppression) dans Catégories

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Stop — maintainer validation gate**

UI PR: per the maintainer's standing instruction, **do not self-merge**. Report the PR URL and wait for in-app validation.

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

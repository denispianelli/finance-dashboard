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

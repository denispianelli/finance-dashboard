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
    insertTx({ id: 't1', label: 'VIR LOYER 12/03/25' });
    insertTx({ id: 't2', label: 'VIR LOYER 14/05/25' }); // same key as t1
    insertTx({ id: 't3', label: 'CARREFOUR MARKET' });

    const groups = listPendingGroups(db);

    expect(groups).toEqual([
      { key: 'VIR LOYER', label: 'VIR LOYER 12/03/25', count: 2 },
      { key: 'CARREFOUR MARKET', label: 'CARREFOUR MARKET', count: 1 },
    ]);
  });

  it('excludes categorized and internal-transfer rows', () => {
    insertTx({ id: 't1', label: 'CARREFOUR', categoryId: 'cat-alimentation' });
    insertTx({ id: 't2', label: 'VIR INTERNE', internal: true });
    insertTx({ id: 't3', label: 'ZZZ UNSEEN' });

    expect(listPendingGroups(db).map((g) => g.key)).toEqual(['ZZZ UNSEEN']);
  });

  it('excludes passthrough labels (they are categorized by amount, not the LLM)', () => {
    insertTx({ id: 'p1', label: 'PRLV SEPA PAYPAL EUROPE' });
    insertTx({ id: 'p2', label: 'PRLV SEPA PAYPAL EUROPE' });
    insertTx({ id: 'c1', label: 'CARREFOUR MARKET' });

    expect(listPendingGroups(db).map((g) => g.key)).toEqual(['CARREFOUR MARKET']);
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

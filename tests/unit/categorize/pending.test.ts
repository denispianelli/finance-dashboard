import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { listUncategorized, applyCategory } from '../../../src/main/categorize/pending';

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

describe('listUncategorized', () => {
  it('returns only uncategorized, non-internal-transfer rows (oldest first)', () => {
    insertTx({ id: 't1', label: 'ZZZ UNSEEN A' });
    insertTx({ id: 't2', label: 'CARREFOUR', categoryId: 'cat-alimentation' });
    insertTx({ id: 't3', label: 'VIR INTERNE', internal: true });
    insertTx({ id: 't4', label: 'ZZZ UNSEEN B' });

    const items = listUncategorized(db);

    expect(items.map((i) => i.id)).toEqual(['t1', 't4']);
    expect(items[0]).toEqual({ id: 't1', label: 'ZZZ UNSEEN A' });
  });
});

describe('applyCategory', () => {
  it('writes the category only when the row is still uncategorized', () => {
    insertTx({ id: 't1', label: 'ZZZ UNSEEN A' });

    expect(applyCategory(db, 't1', 'cat-alimentation')).toBe(true);
    expect(
      db.prepare('SELECT category_id, user_modified FROM transactions WHERE id = ?').get('t1'),
    ).toMatchObject({ category_id: 'cat-alimentation', user_modified: 0 });
  });

  it('never overwrites a category set meanwhile (manual pick wins)', () => {
    insertTx({ id: 't1', label: 'ZZZ', categoryId: 'cat-loisirs' });

    expect(applyCategory(db, 't1', 'cat-alimentation')).toBe(false);
    expect(db.prepare('SELECT category_id FROM transactions WHERE id = ?').get('t1')).toMatchObject(
      {
        category_id: 'cat-loisirs',
      },
    );
  });
});

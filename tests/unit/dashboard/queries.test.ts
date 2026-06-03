import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getAccountSummaries, getTransactions } from '../../../src/main/dashboard/queries';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function seedAccount(db: DatabaseSync, id: string, name: string): void {
  db.prepare("INSERT INTO accounts (id, name, type) VALUES (?, ?, 'checking')").run(id, name);
}

function seedCategory(
  db: DatabaseSync,
  id: string,
  name: string,
  color = '#000000',
  icon = 'wallet',
): void {
  db.prepare('INSERT INTO categories (id, name, color, icon) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    color,
    icon,
  );
}

function seedTx(
  db: DatabaseSync,
  args: {
    id: string;
    accountId: string;
    date: string;
    amount: number;
    label?: string;
    categoryId?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.id,
    args.accountId,
    args.id, // tx_hash unique per id is fine for tests
    args.date,
    args.amount,
    args.label ?? args.id,
    args.label ?? args.id,
    args.categoryId ?? null,
  );
}

describe('getAccountSummaries', () => {
  it('returns balance as the net sum of transaction amounts and the tx count', () => {
    const db = freshDb();
    seedAccount(db, 'a1', 'Compte courant');
    seedTx(db, { id: 't1', accountId: 'a1', date: '2026-05-01', amount: 100 });
    seedTx(db, { id: 't2', accountId: 'a1', date: '2026-05-02', amount: -30 });

    const summaries = getAccountSummaries(db);
    const a1 = summaries.find((s) => s.id === 'a1');
    expect(a1).toMatchObject({ id: 'a1', name: 'Compte courant', balance: 70, txCount: 2 });
    db.close();
  });

  it('includes accounts with no transactions (balance 0, count 0)', () => {
    const db = freshDb();
    seedAccount(db, 'empty', 'Livret');

    const summaries = getAccountSummaries(db);
    const empty = summaries.find((s) => s.id === 'empty');
    expect(empty).toMatchObject({ balance: 0, txCount: 0 });
    db.close();
  });
});

describe('getTransactions', () => {
  it('joins the current category name/color/icon, newest first', () => {
    const db = freshDb();
    seedAccount(db, 'a1', 'Compte');
    seedCategory(db, 'food', 'Alimentation', '#7AB890', 'shop');
    seedTx(db, { id: 'old', accountId: 'a1', date: '2026-05-01', amount: -10, categoryId: 'food' });
    seedTx(db, { id: 'new', accountId: 'a1', date: '2026-05-10', amount: -20, categoryId: 'food' });

    const rows = getTransactions(db, { accountId: 'a1' });
    expect(rows.map((r) => r.id)).toEqual(['new', 'old']);
    expect(rows[0]).toMatchObject({
      categoryId: 'food',
      categoryName: 'Alimentation',
      categoryColor: '#7AB890',
      categoryIcon: 'shop',
    });
    db.close();
  });

  it('returns null category fields when the transaction is uncategorized', () => {
    const db = freshDb();
    seedAccount(db, 'a1', 'Compte');
    seedTx(db, { id: 't1', accountId: 'a1', date: '2026-05-01', amount: -10, categoryId: null });

    const [row] = getTransactions(db, { accountId: 'a1' });
    expect(row).toMatchObject({
      categoryId: null,
      categoryName: null,
      categoryColor: null,
      categoryIcon: null,
    });
    db.close();
  });

  it('filters by date range', () => {
    const db = freshDb();
    seedAccount(db, 'a1', 'Compte');
    seedTx(db, { id: 'jan', accountId: 'a1', date: '2026-01-15', amount: 1 });
    seedTx(db, { id: 'may', accountId: 'a1', date: '2026-05-15', amount: 1 });
    seedTx(db, { id: 'dec', accountId: 'a1', date: '2026-12-15', amount: 1 });

    const rows = getTransactions(db, { from: '2026-05-01', to: '2026-05-31' });
    expect(rows.map((r) => r.id)).toEqual(['may']);
    db.close();
  });

  it('respects the limit (default cap aside)', () => {
    const db = freshDb();
    seedAccount(db, 'a1', 'Compte');
    for (let i = 0; i < 5; i++) {
      const n = String(i + 1);
      seedTx(db, { id: `t${n}`, accountId: 'a1', date: `2026-05-0${n}`, amount: 1 });
    }

    const rows = getTransactions(db, { accountId: 'a1', limit: 2 });
    expect(rows).toHaveLength(2);
    db.close();
  });

  it('scopes to the requested account only', () => {
    const db = freshDb();
    seedAccount(db, 'a1', 'A');
    seedAccount(db, 'a2', 'B');
    seedTx(db, { id: 't1', accountId: 'a1', date: '2026-05-01', amount: 1 });
    seedTx(db, { id: 't2', accountId: 'a2', date: '2026-05-01', amount: 1 });

    const rows = getTransactions(db, { accountId: 'a1' });
    expect(rows.map((r) => r.id)).toEqual(['t1']);
    db.close();
  });

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
});

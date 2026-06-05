import { describe, it, expect, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

import {
  handleTransactionsUpdate,
  handleTransactionsDelete,
  handleTransactionsRestore,
} from '../../../src/main/ipc/handlers/transactions';

function setup(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'C', 'checking')").run();
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, user_modified)
     VALUES ('t1', 'a1', 't1', '2026-05-14', -10, 'RAW', 'Lbl', 0)`,
  ).run();
  dbHolder.db = db;
  return db;
}

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
});

describe('transactions IPC handlers', () => {
  it('update returns ok and writes the change', () => {
    const db = setup();
    expect(handleTransactionsUpdate({ transactionId: 't1', amount: -20 })).toEqual({ ok: true });
    expect(db.prepare('SELECT amount FROM transactions WHERE id = ?').get('t1')).toMatchObject({
      amount: -20,
    });
  });

  it('delete returns a snapshot and restore puts the row back', () => {
    const db = setup();
    const res = handleTransactionsDelete({ transactionId: 't1' });
    expect(res.ok).toBe(true);
    expect(res.snapshot.id).toBe('t1');
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });

    expect(handleTransactionsRestore({ transaction: res.snapshot })).toEqual({ ok: true });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 1 });
  });
});

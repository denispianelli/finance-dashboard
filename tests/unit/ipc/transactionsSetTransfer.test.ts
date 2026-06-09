import { describe, it, expect, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
db.exec('DELETE FROM accounts');
db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'A', 'checking')").run();
db.prepare(
  `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean)
   VALUES ('t1', 'a1', 't1', '2026-04-10', -500, 'x', 'X')`,
).run();

vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

import { handleTransactionsSetTransfer } from '../../../src/main/ipc/handlers/transactionsSetTransfer';

afterEach(() => {
  vi.clearAllMocks();
});

function read(id: string): { is_internal_transfer: number; user_modified: number } {
  return db
    .prepare('SELECT is_internal_transfer, user_modified FROM transactions WHERE id = ?')
    .get(id) as { is_internal_transfer: number; user_modified: number };
}

describe('transactions:setTransfer handler', () => {
  it('marks a transaction as a transfer and locks it from the auto pass', () => {
    expect(handleTransactionsSetTransfer({ transactionId: 't1', isTransfer: true })).toEqual({
      ok: true,
    });
    expect(read('t1')).toEqual({ is_internal_transfer: 1, user_modified: 1 });
  });

  it('un-marks a transaction (still locked)', () => {
    handleTransactionsSetTransfer({ transactionId: 't1', isTransfer: false });
    expect(read('t1')).toEqual({ is_internal_transfer: 0, user_modified: 1 });
  });

  it('throws on a stale id instead of reporting a false success', () => {
    expect(() =>
      handleTransactionsSetTransfer({ transactionId: 'gone', isTransfer: true }),
    ).toThrow(/not found/);
  });
});

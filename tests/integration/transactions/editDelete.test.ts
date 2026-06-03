import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
} from '../../../src/main/transactions/mutate';
import { getTransactions } from '../../../src/main/dashboard/queries';

function db(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  runMigrations(d);
  d.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'C', 'checking')").run();
  d.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean)
     VALUES ('t1', 'a1', 't1', '2026-05-14', -84.3, 'CB CARREFOUR', 'Carrefour')`,
  ).run();
  return d;
}

describe('edit + delete lifecycle', () => {
  it('edits an amount, preserves the original, then deletes and restores', () => {
    const d = db();
    updateTransaction(d, { transactionId: 't1', amount: -90 });
    let tx = getTransactions(d, { accountId: 'a1' })[0];
    expect(tx?.amount).toBe(-90);
    expect(tx?.originalAmount).toBe(-84.3);
    expect(tx?.editedAt).not.toBeNull();

    const snap = deleteTransaction(d, 't1');
    expect(getTransactions(d, { accountId: 'a1' })).toHaveLength(0);

    restoreTransaction(d, snap);
    tx = getTransactions(d, { accountId: 'a1' })[0];
    expect(tx?.amount).toBe(-90); // edit survives the round-trip
    expect(tx?.originalAmount).toBe(-84.3);
    d.close();
  });
});

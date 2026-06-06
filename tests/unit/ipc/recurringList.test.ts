import { describe, it, expect, vi, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
db.exec('DELETE FROM accounts');
db.prepare("INSERT INTO accounts (id, name, type) VALUES ('a1', 'A', 'checking')").run();
let n = 0;
function seed(date: string, amount: number, label: string, transfer = false): void {
  n += 1;
  db.prepare(
    `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, is_internal_transfer)
     VALUES (?, 'a1', ?, ?, ?, ?, ?, ?)`,
  ).run(`t${String(n)}`, `t${String(n)}`, date, amount, label, label, transfer ? 1 : 0);
}
for (const m of ['2026-01', '2026-02', '2026-03']) seed(`${m}-15`, -10, 'SPOTIFY');
seed('2026-01-20', -500, 'TRANSFER', true);
seed('2026-02-20', -500, 'TRANSFER', true);
seed('2026-03-20', -500, 'TRANSFER', true);

vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

import { handleRecurringList } from '../../../src/main/ipc/handlers/recurringList';

afterEach(() => {
  vi.clearAllMocks();
});

describe('recurring:list handler', () => {
  it('returns detected subscriptions and the monthly total, excluding transfers', () => {
    const res = handleRecurringList();
    expect(res.subscriptions.map((s) => s.label)).toEqual(['SPOTIFY']);
    expect(res.monthlyTotal).toBeCloseTo(10, 5);
  });
});

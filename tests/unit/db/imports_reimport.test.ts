import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import sql018 from '../../../src/main/db/migrations/018_imports_allow_reimport.sql?raw';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

function insertImport(db: DatabaseSync, id: string, hash: string): void {
  db.prepare(
    `INSERT INTO imports
       (id, account_id, file_hash, source_type, date_range_start, date_range_end,
        closing_balance, closing_balance_date, status)
     VALUES (?, 'acc-lcl-default', ?, 'pdf', '2025-07-01', '2025-07-31', 100, '2025-07-31', 'validated')`,
  ).run(id, hash);
}

function insertTx(db: DatabaseSync, id: string, importId: string): void {
  db.prepare(
    `INSERT INTO transactions
       (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
        is_internal_transfer, user_modified)
     VALUES (?, 'acc-lcl-default', ?, ?, '2025-07-02', -10, 'A', 'A', 0, 0)`,
  ).run(id, importId, id);
}

describe('imports.file_hash after migration 018 (re-import allowed)', () => {
  it('allows two import rows with the same file hash', () => {
    const db = freshDb();
    insertImport(db, 'i1', 'same-hash');
    expect(() => {
      insertImport(db, 'i2', 'same-hash');
    }).not.toThrow();
    db.close();
  });

  it('keeps the transactions → imports foreign key enforced', () => {
    const db = freshDb();
    expect(() => {
      insertTx(db, 't1', 'missing-import');
    }).toThrow();
    db.close();
  });

  it('rebuilds a populated table without losing rows or breaking references (FK-on upgrade path)', () => {
    const db = freshDb();
    insertImport(db, 'i1', 'h-file');
    insertTx(db, 't1', 'i1');

    // Re-run the rebuild on live data exactly the way the migration runner does
    // for a rebuildsTables migration: FKs off around the transaction, then checked.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    db.exec(sql018);
    db.exec('COMMIT');
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.exec('PRAGMA foreign_keys = ON');

    expect(db.prepare('SELECT * FROM imports WHERE id = ?').get('i1')).toMatchObject({
      file_hash: 'h-file',
      closing_balance: 100,
      status: 'validated',
    });
    expect(db.prepare('SELECT import_id FROM transactions WHERE id = ?').get('t1')).toMatchObject({
      import_id: 'i1',
    });
    db.close();
  });
});

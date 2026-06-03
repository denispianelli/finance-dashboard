import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';
import { insertStatement } from '../../../src/main/import/insertStatement';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

describe('insertStatement — real LCL fixture', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'inserts one validated import and all 46 transactions',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      const buffer = readFileSync(FIXTURE_PATH);

      const r = await insertStatement(db, 'acc-lcl-default', buffer);

      expect(r.insertedCount).toBe(46);
      expect(r.skippedCount).toBe(0);
      expect(db.prepare('SELECT count(*) n FROM imports').get()).toMatchObject({ n: 1 });
      expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 46 });
      const imp = db.prepare('SELECT status FROM imports').get() as { status: string };
      expect(imp.status).toBe('validated');
      db.close();
    },
  );

  it.skipIf(!existsSync(FIXTURE_PATH))(
    'skips transactions whose tx_hash already exists for the account',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      const buffer = readFileSync(FIXTURE_PATH);

      const pre = await extractStatement(db, 'acc-lcl-default', buffer);
      db.prepare(
        `INSERT INTO imports
           (id, account_id, file_hash, source_type, date_range_start, date_range_end, status)
         VALUES ('prior', 'acc-lcl-default', 'other-file-hash', 'pdf', ?, ?, 'validated')`,
      ).run(pre.dateRangeStart, pre.dateRangeEnd);
      const seedTx = db.prepare(
        `INSERT INTO transactions
           (id, account_id, import_id, tx_hash, date, amount, label_raw, label_clean,
            category_id, is_internal_transfer, user_modified)
         VALUES (?, 'acc-lcl-default', 'prior', ?, ?, ?, ?, ?, NULL, 0, 0)`,
      );
      for (let i = 0; i < 3; i++) {
        const t = pre.transactions[i];
        if (!t) throw new Error('fixture has fewer than 3 transactions');
        seedTx.run(`seed-${String(i)}`, t.tx_hash, t.date, t.amount, t.label, t.label);
      }

      const r = await insertStatement(db, 'acc-lcl-default', buffer);

      expect(r.skippedCount).toBe(3);
      expect(r.insertedCount).toBe(43);
      expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 46 });
      db.close();
    },
  );
});

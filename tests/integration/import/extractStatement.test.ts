import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';
import { insertStatement } from '../../../src/main/import/insertStatement';

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

describe('extractStatement — real LCL fixture', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))(
    'extracts a balanced, non-overlapping, all-new statement on a fresh DB',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      const buffer = readFileSync(FIXTURE_PATH);

      const r = await extractStatement(db, 'acc-lcl-default', buffer);

      expect(r.transactions).toHaveLength(46);
      expect(r.newCount).toBe(46);
      expect(r.duplicateCount).toBe(0);
      expect(r.arithmetic.status).toBe('passed');
      expect(r.periodOverlap.hasOverlap).toBe(false);
      expect(r.alreadyImported).toBe(false);
      expect(r.dateRangeStart).toBe('2025-10-31');
      expect(r.dateRangeEnd).toBe('2025-12-02');
      for (const tx of r.transactions) {
        expect(tx.tx_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(tx.isDuplicate).toBe(false);
      }
      db.close();
    },
  );

  it.skipIf(!existsSync(FIXTURE_PATH))(
    'reports all duplicates and an overlap after a prior insert of the same statement',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      const buffer = readFileSync(FIXTURE_PATH);

      await insertStatement(db, 'acc-lcl-default', buffer);
      const r = await extractStatement(db, 'acc-lcl-default', buffer);

      expect(r.duplicateCount).toBe(46);
      expect(r.newCount).toBe(0);
      expect(r.periodOverlap.hasOverlap).toBe(true);
      expect(r.alreadyImported).toBe(true);
      for (const tx of r.transactions) {
        expect(tx.isDuplicate).toBe(true);
      }
      db.close();
    },
  );
});

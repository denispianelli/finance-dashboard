import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../../src/main/db/migrate';
import { extractStatement } from '../../../../src/main/import/extractStatement';
import { insertStatement } from '../../../../src/main/import/insertStatement';

const FIXTURE = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.ofx');
const FIXTURE_2 = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE_2.ofx');

describe('extractStatement — real LCL OFX fixture', () => {
  it.skipIf(!existsSync(FIXTURE))('extracts all-new with fitid hashes on a fresh DB', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const buf = readFileSync(FIXTURE);
    const r = await extractStatement(db, 'acc-lcl-default', buf);
    expect(r.transactions.length).toBeGreaterThan(0);
    expect(r.duplicateCount).toBe(0);
    for (const t of r.transactions) {
      expect(t.fitid).not.toBeNull();
      expect(t.tx_hash).toMatch(/^[0-9a-f]{64}$/);
    }
    db.close();
  });

  it.skipIf(!existsSync(FIXTURE) || !existsSync(FIXTURE_2))(
    'detects period overlap and deduplicates shared FITIDs across two overlapping exports',
    async () => {
      const db = new DatabaseSync(':memory:');
      runMigrations(db);
      // Insert the longer export first (e.g. 17/02–17/05)
      const buf1 = readFileSync(FIXTURE);
      await insertStatement(db, 'acc-lcl-default', buf1, { acknowledgedCannotVerify: true });

      // Extract the shorter, overlapping export (e.g. 01/03–17/05)
      const buf2 = readFileSync(FIXTURE_2);
      const r = await extractStatement(db, 'acc-lcl-default', buf2);

      // Every transaction in the shorter export shares a FITID with the longer one
      expect(r.duplicateCount).toBe(r.transactions.length);
      expect(r.newCount).toBe(0);
      // Period overlap is detected
      expect(r.periodOverlap.hasOverlap).toBe(true);
      db.close();
    },
  );

  it.skipIf(!existsSync(FIXTURE))('reports all duplicates after a prior insert', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const buf = readFileSync(FIXTURE);
    await insertStatement(db, 'acc-lcl-default', buf, { acknowledgedCannotVerify: true });
    const r = await extractStatement(db, 'acc-lcl-default', buf);
    expect(r.newCount).toBe(0);
    expect(r.duplicateCount).toBe(r.transactions.length);
    expect(r.alreadyImported).toBe(true);
    db.close();
  });
});

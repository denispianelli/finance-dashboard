import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../../src/main/db/migrate';
import { extractStatement } from '../../../../src/main/import/extractStatement';
import { insertStatement } from '../../../../src/main/import/insertStatement';

const FIXTURE = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.ofx');

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

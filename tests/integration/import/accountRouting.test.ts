import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { readIdentifier } from '../../../src/main/import/accountIdentifier';
import { findAccountByIdentifier, learnAccountRoute } from '../../../src/main/import/accountRoutes';

const OFX_FIXTURE = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.ofx');

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  db.prepare(
    "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-lcl','LCL','checking','lcl','EUR')",
  ).run();
});

describe('account routing — real LCL OFX fixture', () => {
  it.skipIf(!existsSync(OFX_FIXTURE))('learns then auto-resolves the same account', async () => {
    const buf = readFileSync(OFX_FIXTURE);
    const { identifier } = await readIdentifier(buf, OFX_FIXTURE);
    expect(identifier).toMatch(/^ofx:/);

    if (identifier === null) throw new Error('identifier must not be null for OFX fixture');
    learnAccountRoute(db, identifier, 'acc-lcl');

    const second = await readIdentifier(buf, OFX_FIXTURE);
    if (second.identifier === null) throw new Error('second identifier must not be null');
    expect(findAccountByIdentifier(db, second.identifier)).toBe('acc-lcl');
    db.close();
  });
});

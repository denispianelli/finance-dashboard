import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

let testDb: DatabaseSync;
vi.mock('../../../src/main/db', () => ({
  getDb: () => testDb,
}));

const { handleImportExtract } = await import('../../../src/main/ipc/handlers/importExtract');
const { handleImportConfirm } = await import('../../../src/main/ipc/handlers/importConfirm');

const FIXTURE_PATH = resolve('spike-fixtures/LCL_STATEMENT_FIXTURE.pdf');

beforeEach(() => {
  testDb = new DatabaseSync(':memory:');
  runMigrations(testDb);
});

describe('handleImportExtract', () => {
  it('returns ok:false unsupported_format for a non-PDF non-OFX file', async () => {
    const res = await handleImportExtract({
      path: resolve('package.json'),
      accountId: 'acc-lcl-default',
    });
    expect(res).toEqual({ ok: false, error: 'unsupported_format' });
  });

  it.skipIf(!existsSync(FIXTURE_PATH))(
    'returns ok:true with the extraction for the real fixture',
    async () => {
      const res = await handleImportExtract({
        path: FIXTURE_PATH,
        accountId: 'acc-lcl-default',
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.extraction.newCount).toBe(46);
        expect(res.extraction.arithmetic.status).toBe('passed');
      }
    },
  );
});

describe('handleImportConfirm', () => {
  it.skipIf(!existsSync(FIXTURE_PATH))('inserts and returns ok:true with counts', async () => {
    const res = await handleImportConfirm({
      path: FIXTURE_PATH,
      accountId: 'acc-lcl-default',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.insertedCount).toBe(46);
      expect(res.skippedCount).toBe(0);
    }
  });

  it('returns ok:false unsupported_format for a non-PDF non-OFX file', async () => {
    const res = await handleImportConfirm({
      path: resolve('package.json'),
      accountId: 'acc-lcl-default',
    });
    expect(res).toEqual({ ok: false, error: 'unsupported_format' });
  });
});

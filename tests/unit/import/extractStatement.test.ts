import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';
import { ImportError } from '../../../src/main/import/importError';

describe('extractStatement — failures', () => {
  it('throws ImportError("not_pdf") for a non-PDF buffer', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(
      extractStatement(db, 'acc-lcl-default', Buffer.from('this is not a pdf')),
    ).rejects.toMatchObject({ name: 'ImportError', code: 'not_pdf' });
    db.close();
  });

  it('ImportError carries a code property', () => {
    const err = new ImportError('unknown_bank');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('unknown_bank');
  });
});

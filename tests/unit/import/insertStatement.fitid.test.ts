import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

vi.mock('../../../src/main/import/extractStatement', () => ({
  extractStatement: () =>
    Promise.resolve({
      transactions: [
        {
          date: '2026-02-03',
          label: 'A',
          amount: -10,
          tx_hash: 'h1',
          fitid: 'F1',
          isDuplicate: false,
        },
      ],
      arithmetic: {
        status: 'cannot_verify',
        openingBalance: null,
        closingBalance: 0,
        computedClosing: null,
        delta: null,
      },
      periodOverlap: { hasOverlap: false, overlappingImports: [] },
      newCount: 1,
      duplicateCount: 0,
      fileHash: 'fh',
      alreadyImported: false,
      dateRangeStart: '2026-02-03',
      dateRangeEnd: '2026-02-03',
    }),
}));

const { insertStatement } = await import('../../../src/main/import/insertStatement');

describe('insertStatement fitid', () => {
  it('persists fitid for OFX transactions', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await insertStatement(db, 'acc-lcl-default', Buffer.from('x'), {
      acknowledgedCannotVerify: true,
    });
    const row = db.prepare('SELECT fitid FROM transactions').get() as unknown as {
      fitid: string | null;
    };
    expect(row.fitid).toBe('F1');
    db.close();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

vi.mock('../../../src/main/import/pdf/extract', () => ({
  extractPdfText: () => Promise.resolve({ pages: [], hasText: false }),
}));

const { extractStatement } = await import('../../../src/main/import/extractStatement');

describe('extractStatement — no_text', () => {
  it('throws ImportError("no_text") for a PDF that parses but has no text layer', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(
      extractStatement(db, 'acc-lcl-default', Buffer.from('%PDF-1.4 image-only')),
    ).rejects.toMatchObject({ name: 'ImportError', code: 'no_text' });
    db.close();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

vi.mock('../../../src/main/import/pdf/extract', () => ({
  extractPdfText: () => Promise.resolve({ pages: [], hasText: false }),
}));

const { extractPdf } = await import('../../../src/main/import/extractPdf');

describe('extractPdf', () => {
  it('throws ImportError(no_text) when the PDF has no text layer', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(
      extractPdf(db, 'acc-lcl-default', Buffer.from('%PDF-1.4 image-only')),
    ).rejects.toMatchObject({ name: 'ImportError', code: 'no_text' });
    db.close();
  });

  it('throws ImportError(not_pdf) for non-PDF content', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(extractPdf(db, 'acc-lcl-default', Buffer.from('not a pdf'))).rejects.toMatchObject(
      { name: 'ImportError', code: 'not_pdf' },
    );
    db.close();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { PdfPage } from '../../../src/main/import/pdf/extract';

const dbHolder: { db: DatabaseSync | null } = { db: null };
vi.mock('../../../src/main/db', () => ({ getDb: () => dbHolder.db }));

vi.mock('../../../src/main/import/readImportFile', () => ({
  readImportFile: vi.fn(() => Buffer.from('%PDF-1.4 fake')),
}));
const extractMock = vi.fn();
// Full mock (no importOriginal): the handler only uses extractPdfText at runtime,
// and pulling the real module would drag pdfjs-dist into the test graph.
vi.mock('../../../src/main/import/pdf/extract', () => ({
  extractPdfText: (...a: unknown[]) => extractMock(...a) as unknown,
}));

import {
  handleBanksLearn,
  handleBanksPrepareMapping,
} from '../../../src/main/ipc/handlers/learnBank';
import { detectBank } from '../../../src/main/import/detectBank';

function headerPages(): PdfPage[] {
  return [
    {
      pageNumber: 1,
      items: [
        { str: 'Date', x: 40, y: 650, width: 0 },
        { str: 'Libellé', x: 140, y: 650, width: 0 },
        { str: 'Débit', x: 420, y: 650, width: 0 },
        { str: 'Crédit', x: 480, y: 650, width: 0 },
        { str: '10/06/26', x: 40, y: 630, width: 0 },
        { str: 'VIR RECU', x: 140, y: 630, width: 0 },
        { str: '109,43', x: 480, y: 630, width: 0 },
        { str: '30,65', x: 420, y: 610, width: 0 },
      ],
    },
  ];
}

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  dbHolder.db = db;
  extractMock.mockResolvedValue({ hasText: true, pages: headerPages() });
});

afterEach(() => {
  dbHolder.db?.close();
  dbHolder.db = null;
  vi.clearAllMocks();
});

describe('handleBanksPrepareMapping', () => {
  it('returns the deterministic suggestion with the header tokens', async () => {
    const res = await handleBanksPrepareMapping({ path: '/x/releve.pdf' });
    expect(res).toEqual({
      ok: true,
      suggested: { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null },
      headerTokens: ['Date', 'Libellé', 'Débit', 'Crédit'],
    });
  });

  it('returns no_text when the PDF has no extractible text', async () => {
    extractMock.mockResolvedValue({ hasText: false, pages: [] });
    expect(await handleBanksPrepareMapping({ path: '/x/releve.pdf' })).toEqual({
      ok: false,
      error: 'no_text',
    });
  });
});

describe('handleBanksLearn', () => {
  it('persists the bank from a user-confirmed order without any model', async () => {
    const res = await handleBanksLearn({
      path: '/x/releve.pdf',
      bankName: 'Société Générale',
      order: { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null },
    });
    expect(res).toEqual({ ok: true, bankId: 'societe-generale' });
    expect(
      dbHolder.db
        ?.prepare('SELECT date_col FROM bank_column_mappings WHERE bank_id = ?')
        .get('societe-generale'),
    ).toBeDefined();
  });

  it('rejects an invalid order with invalid_mapping and persists nothing', async () => {
    const res = await handleBanksLearn({
      path: '/x/releve.pdf',
      bankName: 'Bad Bank',
      order: { date: 1, valeur: null, label: 1, debit: 2, credit: null, balance: null },
    });
    expect(res).toEqual({ ok: false, error: 'invalid_mapping' });
    expect(
      dbHolder.db?.prepare('SELECT 1 FROM banks WHERE id = ?').get('bad-bank'),
    ).toBeUndefined();
  });

  it('is re-detectable right after learning, even when the typed name is not printed', async () => {
    // The fixture's masthead does NOT contain "Ma Banque Mystère" (the bank name
    // is a logo image in real statements): the stored signature must fall back to
    // something the document actually carries, or every re-import loops back to
    // the assistant forever.
    const res = await handleBanksLearn({
      path: '/x/releve.pdf',
      bankName: 'Ma Banque Mystère',
      order: { date: 1, valeur: null, label: 2, debit: 3, credit: 4, balance: null },
    });
    expect(res).toEqual({ ok: true, bankId: 'ma-banque-mystere' });

    const db = dbHolder.db;
    if (db === null) throw new Error('db not initialized');
    expect(detectBank(db, headerPages())?.bankId).toBe('ma-banque-mystere');
  });
});

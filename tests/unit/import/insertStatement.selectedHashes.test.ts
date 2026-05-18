import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import type { StatementExtraction } from '@shared/types/import';

const extractMock = vi.fn();
vi.mock('../../../src/main/import/extractStatement', () => ({
  extractStatement: (...args: unknown[]) => extractMock(...args) as unknown,
}));

const { insertStatement } = await import('../../../src/main/import/insertStatement');

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

function makeTx(hash: string, isDuplicate = false) {
  return {
    date: '2026-01-01',
    label: 'Test',
    amount: -10,
    tx_hash: hash,
    fitid: null,
    isDuplicate,
  };
}

function baseExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [makeTx('h1'), makeTx('h2'), makeTx('h3')],
    arithmetic: {
      status: 'passed',
      openingBalance: 100,
      closingBalance: 70,
      computedClosing: 70,
      delta: 0,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 3,
    duplicateCount: 0,
    fileHash: 'aabbcc',
    alreadyImported: false,
    dateRangeStart: '2026-01-01',
    dateRangeEnd: '2026-01-31',
    sourceType: 'ofx',
    ...over,
  };
}

beforeEach(() => {
  extractMock.mockReset();
});

describe('insertStatement — selectedHashes', () => {
  it('inserts only selected hashes when selectedHashes is provided', async () => {
    const db = freshDb();
    extractMock.mockResolvedValueOnce(baseExtraction());

    const result = await insertStatement(db, 'acc-lcl-default', Buffer.from(''), {
      selectedHashes: ['h1', 'h3'],
    });

    expect(result.insertedCount).toBe(2);
    expect(result.skippedCount).toBe(0); // duplicateCount only, not user-deselected h2
    const rows = db.prepare('SELECT tx_hash FROM transactions ORDER BY tx_hash').all() as {
      tx_hash: string;
    }[];
    expect(rows.map((r) => r.tx_hash)).toEqual(['h1', 'h3']);
  });

  it('inserts all non-duplicates when selectedHashes is omitted', async () => {
    const db = freshDb();
    extractMock.mockResolvedValueOnce(baseExtraction());

    const result = await insertStatement(db, 'acc-lcl-default', Buffer.from(''), {});

    expect(result.insertedCount).toBe(3);
    const rows = db.prepare('SELECT tx_hash FROM transactions ORDER BY tx_hash').all() as {
      tx_hash: string;
    }[];
    expect(rows.map((r) => r.tx_hash)).toEqual(['h1', 'h2', 'h3']);
  });

  it('skips duplicates even when their hash is in selectedHashes', async () => {
    const db = freshDb();
    extractMock.mockResolvedValueOnce(
      baseExtraction({ transactions: [makeTx('h1'), makeTx('h2', true)] }),
    );

    const result = await insertStatement(db, 'acc-lcl-default', Buffer.from(''), {
      selectedHashes: ['h1', 'h2'],
    });

    expect(result.insertedCount).toBe(1);
    const rows = db.prepare('SELECT tx_hash FROM transactions').all() as { tx_hash: string }[];
    expect(rows.map((r) => r.tx_hash)).toEqual(['h1']);
  });
});

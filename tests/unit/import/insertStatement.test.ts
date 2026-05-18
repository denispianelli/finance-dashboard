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

function baseExtraction(over: Partial<StatementExtraction> = {}): StatementExtraction {
  return {
    transactions: [
      {
        date: '2025-11-01',
        label: 'A',
        amount: -10,
        tx_hash: 'h1',
        fitid: null,
        isDuplicate: false,
      },
      {
        date: '2025-11-02',
        label: 'B',
        amount: 20,
        tx_hash: 'h2',
        fitid: null,
        isDuplicate: false,
      },
    ],
    arithmetic: {
      status: 'passed',
      openingBalance: 0,
      closingBalance: 10,
      computedClosing: 10,
      delta: 0,
    },
    periodOverlap: { hasOverlap: false, overlappingImports: [] },
    newCount: 2,
    duplicateCount: 0,
    fileHash: 'file-hash-1',
    alreadyImported: false,
    dateRangeStart: '2025-11-01',
    dateRangeEnd: '2025-11-02',
    sourceType: 'pdf',
    ...over,
  };
}

beforeEach(() => {
  extractMock.mockReset();
});

describe('insertStatement — guards', () => {
  it('refuses an already-imported file and writes nothing', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(baseExtraction({ alreadyImported: true }));
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toMatchObject({
      code: 'already_imported',
    });
    expect(db.prepare('SELECT count(*) n FROM imports').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });
    db.close();
  });

  it('refuses when arithmetic failed and writes nothing', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        arithmetic: {
          status: 'failed',
          openingBalance: 0,
          closingBalance: 999,
          computedClosing: 10,
          delta: -989,
        },
      }),
    );
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toMatchObject({
      code: 'arithmetic_failed',
    });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });
    db.close();
  });

  it('refuses cannot_verify without acknowledgement', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: 10,
          computedClosing: null,
          delta: null,
        },
      }),
    );
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toMatchObject({
      code: 'cannot_verify_unacknowledged',
    });
    db.close();
  });

  it('inserts cannot_verify when acknowledged', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        arithmetic: {
          status: 'cannot_verify',
          openingBalance: null,
          closingBalance: 10,
          computedClosing: null,
          delta: null,
        },
      }),
    );
    const r = await insertStatement(db, 'acc-lcl-default', Buffer.from('x'), {
      acknowledgedCannotVerify: true,
    });
    expect(r.insertedCount).toBe(2);
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 2 });
    db.close();
  });
});

describe('insertStatement — atomicity', () => {
  it('rolls back fully when a transaction insert violates UNIQUE mid-batch', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        transactions: [
          {
            date: '2025-11-01',
            label: 'A',
            amount: -10,
            tx_hash: 'dup',
            fitid: null,
            isDuplicate: false,
          },
          {
            date: '2025-11-02',
            label: 'B',
            amount: 20,
            tx_hash: 'dup',
            fitid: null,
            isDuplicate: false,
          },
        ],
      }),
    );
    await expect(insertStatement(db, 'acc-lcl-default', Buffer.from('x'))).rejects.toThrow();
    expect(db.prepare('SELECT count(*) n FROM imports').get()).toMatchObject({ n: 0 });
    expect(db.prepare('SELECT count(*) n FROM transactions').get()).toMatchObject({ n: 0 });
    db.close();
  });
});

describe('insertStatement — happy path', () => {
  it('inserts one validated import and the non-duplicate transactions', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        transactions: [
          {
            date: '2025-11-01',
            label: 'Café',
            amount: -10,
            tx_hash: 'h1',
            fitid: null,
            isDuplicate: false,
          },
          {
            date: '2025-11-02',
            label: 'Salaire',
            amount: 20,
            tx_hash: 'h2',
            fitid: null,
            isDuplicate: true,
          },
        ],
        newCount: 1,
        duplicateCount: 1,
      }),
    );
    const r = await insertStatement(db, 'acc-lcl-default', Buffer.from('x'));
    expect(r.insertedCount).toBe(1);
    expect(r.skippedCount).toBe(1);

    const imp = db.prepare('SELECT * FROM imports').get() as {
      id: string;
      status: string;
      account_id: string;
    };
    expect(imp.status).toBe('validated');
    expect(imp.account_id).toBe('acc-lcl-default');
    expect(imp.id).toBe(r.importId);

    const txs = db.prepare('SELECT * FROM transactions').all() as {
      label_raw: string;
      label_clean: string;
      category_id: string | null;
      confidence: number | null;
      import_id: string;
    }[];
    expect(txs).toHaveLength(1);
    expect(txs[0]?.label_raw).toBe('Café');
    expect(txs[0]?.label_clean).toBe('CAFE');
    expect(txs[0]?.category_id).toBeNull();
    expect(txs[0]?.confidence).toBeNull();
    expect(txs[0]?.import_id).toBe(r.importId);
    db.close();
  });
});

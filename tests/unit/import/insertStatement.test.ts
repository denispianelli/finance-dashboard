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
    closingBalance: 10,
    closingBalanceDate: '2025-11-02',
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

describe('insertStatement — closing balance persistence (ADR-014)', () => {
  it('persists the closing balance and its as-of date', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({ closingBalance: 1234.56, closingBalanceDate: '2025-11-02' }),
    );
    const r = await insertStatement(db, 'acc-lcl-default', Buffer.from('x'));
    const row = db
      .prepare('SELECT closing_balance, closing_balance_date FROM imports WHERE id = ?')
      .get(r.importId) as { closing_balance: number | null; closing_balance_date: string | null };
    expect(row).toEqual({ closing_balance: 1234.56, closing_balance_date: '2025-11-02' });
    db.close();
  });

  it('stores NULL when the statement carries no closing balance', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({ closingBalance: null, closingBalanceDate: null }),
    );
    const r = await insertStatement(db, 'acc-lcl-default', Buffer.from('x'));
    const row = db
      .prepare('SELECT closing_balance, closing_balance_date FROM imports WHERE id = ?')
      .get(r.importId) as { closing_balance: number | null; closing_balance_date: string | null };
    expect(row).toEqual({ closing_balance: null, closing_balance_date: null });
    db.close();
  });
});

describe('insertStatement — rule-based categorization', () => {
  it('assigns category_id from a matching seeded rule and bumps its hit_count', async () => {
    const db = freshDb();
    extractMock.mockResolvedValue(
      baseExtraction({
        transactions: [
          {
            date: '2025-11-01',
            label: 'CB CARREFOUR MARKET PARIS 11',
            amount: -42,
            tx_hash: 'h1',
            fitid: null,
            isDuplicate: false,
          },
          {
            date: '2025-11-02',
            label: 'PAIEMENT DIVERS XYZ',
            amount: -7,
            tx_hash: 'h2',
            fitid: null,
            isDuplicate: false,
          },
        ],
        newCount: 2,
        duplicateCount: 0,
      }),
    );
    await insertStatement(db, 'acc-lcl-default', Buffer.from('x'));

    const matched = db
      .prepare('SELECT category_id FROM transactions WHERE tx_hash = ?')
      .get('h1') as { category_id: string | null };
    expect(matched.category_id).toBe('cat-alimentation');

    const unmatched = db
      .prepare('SELECT category_id FROM transactions WHERE tx_hash = ?')
      .get('h2') as { category_id: string | null };
    expect(unmatched.category_id).toBeNull();

    const carrefourRule = db
      .prepare('SELECT hit_count FROM categorization_rules WHERE match_value = ?')
      .get('CARREFOUR') as { hit_count: number };
    expect(carrefourRule.hit_count).toBe(1);
    db.close();
  });
});

describe('insertStatement — history cascade', () => {
  it('reuses a previously-seen user category, overriding the seed rule', async () => {
    const db = freshDb();
    // A past CARREFOUR transaction the user manually moved to Loisirs (not the
    // default Alimentation rule).
    db.prepare(
      `INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, category_id, user_modified)
       VALUES ('prior', 'acc-lcl-default', 'prior', '2026-04-01', -10, 'CB CARREFOUR', 'CB CARREFOUR', 'cat-loisirs', 1)`,
    ).run();
    extractMock.mockResolvedValue(
      baseExtraction({
        transactions: [
          {
            date: '2026-05-01',
            label: 'CB CARREFOUR',
            amount: -12,
            tx_hash: 'new1',
            fitid: null,
            isDuplicate: false,
          },
        ],
        newCount: 1,
        duplicateCount: 0,
      }),
    );
    await insertStatement(db, 'acc-lcl-default', Buffer.from('x'));
    const row = db.prepare("SELECT category_id FROM transactions WHERE tx_hash = 'new1'").get() as {
      category_id: string | null;
    };
    expect(row.category_id).toBe('cat-loisirs');
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
      import_id: string;
    }[];
    expect(txs).toHaveLength(1);
    expect(txs[0]?.label_raw).toBe('Café');
    expect(txs[0]?.label_clean).toBe('CAFE');
    expect(txs[0]?.category_id).toBeNull();
    expect(txs[0]?.import_id).toBe(r.importId);
    db.close();
  });
});

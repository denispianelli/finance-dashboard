// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  createWrapper,
  createSupport,
  listSupportRows,
  getSupportHistory,
} from '../../../src/main/investment/investmentRepo';
import {
  setQuoteSymbol,
  setSupportIsin,
  writeQuoteValuation,
  listQuotableSupports,
} from '../../../src/main/investment/investmentRepo';

function seedSupport(db: DatabaseSync): string {
  const w = createWrapper(db, { name: 'PEA', type: 'pea' });
  const s = createSupport(db, {
    wrapperId: w.id,
    name: 'World',
    isin: 'IE00B4L5Y983',
    classId: null,
  });
  db.prepare(
    "INSERT INTO support_operations (id, support_id, op_date, kind, quantity, net, raw_label, op_hash, source) VALUES (?,?,?,?,?,?,?,?,'fortuneo_csv')",
  ).run('op1', s.id, '2026-01-10', 'buy', 2, -200, 'WORLD', 'h1');
  db.prepare(
    "INSERT INTO support_operations (id, support_id, op_date, kind, quantity, net, raw_label, op_hash, source) VALUES (?,?,?,?,?,?,?,?,'fortuneo_csv')",
  ).run('op2', s.id, '2026-02-10', 'buy', 1, -110, 'WORLD', 'h2');
  return s.id;
}

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  runMigrations(db);
});

describe('listQuotableSupports', () => {
  it('lists supports with an ISIN and positive net shares', () => {
    const id = seedSupport(db);
    const q = listQuotableSupports(db);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({ id, isin: 'IE00B4L5Y983', quoteSymbol: null, shares: 3 });
  });

  it('excludes a support whose position is fully closed', () => {
    const id = seedSupport(db); // 3 shares net
    db.prepare(
      "INSERT INTO support_operations (id, support_id, op_date, kind, quantity, net, raw_label, op_hash, source) VALUES (?,?,?,?,?,?,?,?,'fortuneo_csv')",
    ).run('op3', id, '2026-03-10', 'sell', 3, 360, 'WORLD', 'h3');
    expect(listQuotableSupports(db)).toHaveLength(0);
  });
});

describe('writeQuoteValuation', () => {
  it('inserts a quote valuation and upserts on the same date', () => {
    const id = seedSupport(db);
    expect(writeQuoteValuation(db, id, '2026-06-15', 372)).toBe('written');
    expect(writeQuoteValuation(db, id, '2026-06-15', 375)).toBe('written');
    const vals = getSupportHistory(db, id).valuations.filter((v) => v.source === 'quote');
    expect(vals).toHaveLength(1);
    expect(vals[0]?.value).toBe(375);
  });

  it('skips when a declared value already covers that date', () => {
    const id = seedSupport(db);
    db.prepare(
      "INSERT INTO support_valuations (id, support_id, as_of, value, source) VALUES (?,?,?,?,'declared')",
    ).run('dv', id, '2026-06-15', 999);
    expect(writeQuoteValuation(db, id, '2026-06-15', 372)).toBe('skipped_declared');
    const quotes = getSupportHistory(db, id).valuations.filter((v) => v.source === 'quote');
    expect(quotes).toHaveLength(0);
  });
});

describe('setSupportIsin', () => {
  it('sets the ISIN and clears any cached ticker so it re-resolves', () => {
    const id = seedSupport(db);
    setQuoteSymbol(db, id, 'EUNL.DE');
    expect(listQuotableSupports(db)[0]?.quoteSymbol).toBe('EUNL.DE');
    setSupportIsin(db, id, 'IE00BK5BQT80');
    const row = listQuotableSupports(db)[0];
    expect(row?.isin).toBe('IE00BK5BQT80');
    expect(row?.quoteSymbol).toBeNull();
  });

  it('clears the ISIN when passed null (support drops out of quotable list)', () => {
    const id = seedSupport(db);
    setSupportIsin(db, id, null);
    expect(listQuotableSupports(db)).toHaveLength(0);
  });
});

describe('setQuoteSymbol + currentValueSource', () => {
  it('caches the symbol and exposes the latest valuation source', () => {
    const id = seedSupport(db);
    setQuoteSymbol(db, id, 'EUNL.DE');
    writeQuoteValuation(db, id, '2026-06-15', 372);
    const support = listSupportRows(db).find((s) => s.id === id);
    expect(support?.currentValue).toBe(372);
    expect(support?.currentValueSource).toBe('quote');
    expect(listQuotableSupports(db)[0]?.quoteSymbol).toBe('EUNL.DE');
  });
});

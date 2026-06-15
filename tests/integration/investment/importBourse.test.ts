// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  createWrapper,
  listSupportRows,
  getSupportHistory,
} from '../../../src/main/investment/investmentRepo';
import { importBourseCsv, listOperations } from '../../../src/main/investment/importBourseCsv';
import type { ParsedOp } from '@shared/types/investment';

const ops: ParsedOp[] = [
  {
    opDate: '2024-01-01',
    kind: 'buy',
    quantity: 100,
    unitPrice: 5,
    gross: -500,
    fees: -2,
    net: -502,
    currency: 'EUR',
    rawLabel: 'WORLD ETF',
  },
  {
    opDate: '2024-06-01',
    kind: 'buy',
    quantity: 50,
    unitPrice: 6,
    gross: -300,
    fees: -2,
    net: -302,
    currency: 'EUR',
    rawLabel: 'WORLD ETF',
  },
  {
    opDate: '2024-09-01',
    kind: 'sell',
    quantity: 150,
    unitPrice: 7,
    gross: 1050,
    fees: -3,
    net: 1047,
    currency: 'EUR',
    rawLabel: 'WORLD ETF',
  },
];

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('importBourseCsv', () => {
  it('creates a support, writes flows from operations, and is idempotent on re-import', () => {
    const db = freshDb();
    const w = createWrapper(db, { name: 'PEA', type: 'pea' });

    const r1 = importBourseCsv(db, w.id, ops);
    expect(r1.operationsImported).toBe(3);
    expect(r1.alreadyPresent).toBe(0);
    expect(r1.createdSupports).toHaveLength(1);

    const support = listSupportRows(db, w.id)[0];
    expect(support?.name).toBe('WORLD ETF');
    const sid = support?.id ?? '';
    const hist = getSupportHistory(db, sid);
    // flows = −net of each op: +502, +302, −1047
    expect(hist.flows.map((f) => Math.round(f.amount))).toEqual([502, 302, -1047]);
    // closed (100+50−150 = 0 shares) ⇒ opening 0 at 2024-01-01 AND closing 0 at 2024-09-01
    expect(hist.valuations.find((v) => v.date === '2024-01-01')?.value).toBe(0);
    expect(hist.valuations.find((v) => v.date === '2024-09-01')?.value).toBe(0);
    expect(listOperations(db, sid)).toHaveLength(3);

    // Re-import same ops → nothing new, no duplicate flows/valuations.
    const r2 = importBourseCsv(db, w.id, ops);
    expect(r2.operationsImported).toBe(0);
    expect(r2.alreadyPresent).toBe(3);
    expect(getSupportHistory(db, sid).flows).toHaveLength(3);
    expect(listOperations(db, sid)).toHaveLength(3);
  });

  it('an open position (net shares > 0) gets only the opening 0-valuation', () => {
    const db = freshDb();
    const w = createWrapper(db, { name: 'PEA', type: 'pea' });
    importBourseCsv(db, w.id, ops.slice(0, 1)); // single buy, 100 shares — still open

    const support = listSupportRows(db, w.id)[0];
    const sid = support?.id ?? '';
    const hist = getSupportHistory(db, sid);

    // Opening 0-valuation exists at 2024-01-01
    expect(hist.valuations.find((v) => v.date === '2024-01-01')?.value).toBe(0);
    // No closing 0 (still open, 100 shares remain)
    expect(hist.valuations).toHaveLength(1);
    // Single flow: +502 (−net of the buy)
    expect(hist.flows).toHaveLength(1);
    expect(Math.round(hist.flows[0]?.amount ?? 0)).toBe(502);
  });
});

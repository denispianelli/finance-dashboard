// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  createWrapper,
  listWrapperRows,
  deleteWrapper,
  createSupport,
  listSupportRows,
  applyUpdate,
  getSupportHistory,
} from '../../../src/main/investment/investmentRepo';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('investmentRepo', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = freshDb();
  });

  it('creates a wrapper and a support, tracks currentValue from the latest valuation', () => {
    const w = createWrapper(db, { name: 'PEA', type: 'pea' });
    expect(listWrapperRows(db).map((x) => x.name)).toContain('PEA');
    const s = createSupport(db, { wrapperId: w.id, name: 'World ETF', isin: null, classId: null });
    expect(listSupportRows(db, w.id)).toHaveLength(1);
    expect(listSupportRows(db, w.id)[0]?.currentValue).toBe(0);

    applyUpdate(db, { supportId: s.id, asOf: '2024-01-01', value: 1000, flow: 1000 });
    applyUpdate(db, { supportId: s.id, asOf: '2024-06-01', value: 1080, flow: 0 });
    expect(listSupportRows(db, w.id)[0]?.currentValue).toBe(1080);

    const hist = getSupportHistory(db, s.id);
    expect(hist.valuations).toHaveLength(2);
    expect(hist.flows).toHaveLength(1); // the 0-flow update added no flow row
    expect(hist.valuations[0]).toEqual({ date: '2024-01-01', value: 1000 });
    expect(hist.flows[0]).toEqual({ date: '2024-01-01', amount: 1000 });
  });

  it('deleteWrapper cascades to supports + history', () => {
    const w = createWrapper(db, { name: 'AV', type: 'av' });
    const s = createSupport(db, { wrapperId: w.id, name: 'Euro fund', isin: null, classId: null });
    applyUpdate(db, { supportId: s.id, asOf: '2024-01-01', value: 500, flow: 500 });
    deleteWrapper(db, w.id);
    expect(listWrapperRows(db)).toHaveLength(0);
    expect(listSupportRows(db)).toHaveLength(0);
    expect(getSupportHistory(db, s.id).valuations).toHaveLength(0);
  });
});

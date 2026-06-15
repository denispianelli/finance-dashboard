// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getNetWorth } from '../../../src/main/dashboard/consolidated';
import { getAllocation } from '../../../src/main/patrimoine/allocation';
import { upsertClass, listHoldings } from '../../../src/main/patrimoine/assetClassRepo';
import {
  createWrapper,
  createSupport,
  applyUpdate,
} from '../../../src/main/investment/investmentRepo';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('DELETE FROM accounts'); // drop the seeded default account (null balance anyway)
  db.exec('DELETE FROM asset_classes'); // start from no classes
  return db;
}

describe('investment integration', () => {
  it('a support feeds net worth and allocation, and the two reconcile', () => {
    const db = freshDb();
    const actions = upsertClass(db, { name: 'Actions', color: '#D4B062', targetPct: 0.5 });
    const w = createWrapper(db, { name: 'PEA', type: 'pea' });
    const s = createSupport(db, {
      wrapperId: w.id,
      name: 'World ETF',
      isin: null,
      classId: actions.id,
    });
    applyUpdate(db, { supportId: s.id, asOf: '2024-01-01', value: 5000, flow: 5000 });
    applyUpdate(db, { supportId: s.id, asOf: '2024-06-01', value: 5300, flow: 0 });

    const nw = getNetWorth(db);
    expect(nw.total).toBeCloseTo(5300, 2);
    expect(nw.supports.find((x) => x.supportId === s.id)?.value).toBeCloseTo(5300, 2);

    const alloc = getAllocation(db);
    expect(alloc.slices.find((sl) => sl.classId === actions.id)?.value).toBeCloseTo(5300, 2);
    expect(alloc.total).toBe(nw.total); // reconcile to the cent

    expect(listHoldings(db).find((h) => h.id === s.id)?.kind).toBe('support');
  });
});

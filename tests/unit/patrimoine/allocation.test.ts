// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getAllocation } from '../../../src/main/patrimoine/allocation';
import { getNetWorth } from '../../../src/main/dashboard/consolidated';
import { upsertClass, assignClass } from '../../../src/main/patrimoine/assetClassRepo';
import { upsertAsset } from '../../../src/main/patrimoine/assetRepo';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

afterEach(() => {
  // nothing to clean — each test uses its own in-memory DB
});

const PARSED: ParsedLoanTable = {
  name: 'P',
  loanNumber: null,
  principal: 3000,
  nominalRate: 1,
  termMonths: 1,
  startDate: '2018-05-05',
  totals: { capital: 3000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2018-06-05',
      capital: 3000,
      interest: 0,
      insurance: 0,
      fees: 0,
      payment: 3000,
      balanceAfter: 2000,
    },
  ],
};

describe('getAllocation', () => {
  it('Test A — immo slice = asset*share − crd*share, total reconciles with getNetWorth', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');

    const immo = upsertClass(db, {
      name: 'Immo',
      color: '#ff0000',
      targetPct: 0.6,
    });

    upsertAsset(db, {
      name: 'RP',
      kind: 'property',
      declaredValue: 300000,
      share: 0.5,
      valuedAt: '2026-06-14',
      classId: immo.id,
    });

    const loanId = saveLoan(db, { parsed: PARSED, name: 'Prêt RP', share: 0.5 });
    assignClass(db, { kind: 'loan', id: loanId, classId: immo.id });

    const allocation = getAllocation(db);
    const nw = getNetWorth(db);

    // asset contribution: 300000 * 0.5 = 150000
    // loan CRD contribution: -2000 * 0.5 = -1000
    // immo slice value = 149000
    const immoSlice = allocation.slices.find((s) => s.classId === immo.id);
    expect(immoSlice).toBeDefined();
    expect(immoSlice?.value).toBeCloseTo(149000, 2);
    expect(immoSlice?.name).toBe('Immo');

    // total must reconcile with net worth to the cent
    expect(allocation.total).toBe(nw.total);

    db.close();
  });

  it('Test C — reconciles EXACTLY with getNetWorth on fractional shares (per-contribution rounding)', () => {
    // Two assets whose half-share lands on a half-cent (100.01 * 0.5 = 50.005).
    // getNetWorth rounds each contribution before summing → 50.01 + 50.01 = 100.02.
    // A naive sum-then-round would give round2(50.005 + 50.005) = 100.01 — a cent off.
    // getAllocation must round each contribution the same way, so the totals match exactly.
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');

    const c = upsertClass(db, { name: 'C', color: '#abc', targetPct: null });
    for (const name of ['A1', 'A2']) {
      upsertAsset(db, {
        name,
        kind: 'autre',
        declaredValue: 100.01,
        share: 0.5,
        valuedAt: '2026-06-14',
        classId: c.id,
      });
    }

    const allocation = getAllocation(db);
    const nw = getNetWorth(db);

    expect(allocation.total).toBe(100.02);
    expect(nw.total).toBe(100.02);
    expect(allocation.total).toBe(nw.total); // exact, not toBeCloseTo
    expect(allocation.slices.find((s) => s.classId === c.id)?.value).toBe(100.02);

    db.close();
  });

  it('Test B — unclassified asset appears in Non classé bucket', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');

    upsertAsset(db, {
      name: 'Bien sans classe',
      kind: 'autre',
      declaredValue: 10000,
      share: 1,
      valuedAt: '2026-06-14',
      classId: null,
    });

    const allocation = getAllocation(db);
    const nw = getNetWorth(db);

    const unclassified = allocation.slices.find((s) => s.classId === null);
    expect(unclassified).toBeDefined();
    expect(unclassified?.name).toBe('Non classé');
    expect(unclassified?.value).toBeCloseTo(10000, 2);

    // total must reconcile with net worth
    expect(allocation.total).toBe(nw.total);

    db.close();
  });
});

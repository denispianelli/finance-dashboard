import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getNetWorth } from '../../../src/main/dashboard/consolidated';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import { upsertAsset } from '../../../src/main/patrimoine/assetRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'P',
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

describe('getNetWorth with loans and assets', () => {
  it('total = accounts + asset*share − crd*share, with breakdowns', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    db.exec('DELETE FROM accounts');
    db.prepare(
      "INSERT INTO accounts (id, name, type, declared_balance, declared_balance_date) VALUES ('a','A','checking',1000,'2026-01-01')",
    ).run();
    saveLoan(db, { parsed: PARSED, name: 'Prêt', share: 0.5 }); // crd today = 2000 (after last row)
    upsertAsset(db, {
      name: 'RP',
      kind: 'property',
      declaredValue: 300000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });

    const nw = getNetWorth(db);
    // 1000 + 300000*0.5 − 2000*0.5 = 1000 + 150000 − 1000 = 150000
    expect(nw.total).toBe(150000);
    expect(nw.loans[0]?.contribution).toBe(-1000);
    expect(nw.assets[0]?.contribution).toBe(150000);
    db.close();
  });
});

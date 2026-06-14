import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getConsolidatedCashflow } from '../../../src/main/dashboard/consolidated';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'P',
  loanNumber: null,
  principal: 1000,
  nominalRate: 1,
  termMonths: 1,
  startDate: '2026-01-01',
  totals: { capital: 1000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2026-01-05',
      capital: 685.43,
      interest: 214.57,
      insurance: 48.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 314.57,
    },
  ],
};

describe('getConsolidatedCashflow with a matched loan payment', () => {
  it('counts interest+insurance as the month expense, not the full debit', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    const inst = db.prepare('SELECT id FROM loan_installments WHERE loan_id = ?').get(loanId) as {
      id: string;
    };
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, loan_installment_id) VALUES ('m','acc-lcl-default','h','2026-01-05',-948.56,'PRET','PRET',?)",
    ).run(inst.id);

    const series = getConsolidatedCashflow(db, 'month');
    const jan = series.find((p) => p.period === '2026-01');
    expect(jan?.expense).toBeCloseTo(-263.13, 2); // not -948.56
    db.close();
  });
});

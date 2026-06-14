import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { getConsolidatedCashflow } from '../../../src/main/dashboard/consolidated';
import { getTransactions } from '../../../src/main/dashboard/queries';
import { periodTotals } from '../../../src/renderer/lib/reports';
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

describe('SQL cashflow and JS reports agree on the loan split', () => {
  it('produce the same monthly expense for a mixed month', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    const inst = db.prepare('SELECT id FROM loan_installments WHERE loan_id = ?').get(loanId) as {
      id: string;
    };
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean, loan_installment_id) VALUES ('m','acc-lcl-default','h','2026-01-05',-948.56,'PRET','PRET',?)",
    ).run(inst.id);
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES ('e','acc-lcl-default','h2','2026-01-10',-30,'X','X')",
    ).run();
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES ('i','acc-lcl-default','h3','2026-01-12',2000,'SAL','SAL')",
    ).run();

    const sql = getConsolidatedCashflow(db, 'month').find((p) => p.period === '2026-01');
    const js = periodTotals(getTransactions(db, { from: '2026-01-01', to: '2026-01-31' }));
    expect(sql?.expense).toBeCloseTo(js.expense, 2);
    expect(sql?.income).toBeCloseTo(js.income, 2);
    db.close();
  });
});

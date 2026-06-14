import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import {
  saveLoan,
  listLoans,
  deleteLoan,
  crdAt,
  findLoanByNumber,
  replaceLoan,
} from '../../../src/main/patrimoine/loanRepo';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'Prêt test',
  loanNumber: 'LN-TEST-1',
  principal: 3000,
  nominalRate: 1,
  termMonths: 3,
  startDate: '2018-05-05',
  totals: { capital: 3000, interest: 5, insurance: 3 },
  installments: [
    {
      seq: 1,
      dueDate: '2018-06-05',
      capital: 997.5,
      interest: 2.5,
      insurance: 1,
      fees: 0,
      payment: 1001,
      balanceAfter: 2002.5,
    },
    {
      seq: 2,
      dueDate: '2018-07-05',
      capital: 998.33,
      interest: 1.67,
      insurance: 1,
      fees: 0,
      payment: 1001,
      balanceAfter: 1004.17,
    },
    {
      seq: 3,
      dueDate: '2018-08-05',
      capital: 1004.17,
      interest: 0.83,
      insurance: 1,
      fees: 0,
      payment: 1006,
      balanceAfter: 0,
    },
  ],
};

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

describe('loanRepo', () => {
  it('saves a loan with its installments and lists it back', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'Mon prêt', share: 0.5 });
    const loans = listLoans(db, '2018-07-10');
    expect(loans).toHaveLength(1);
    expect(loans[0]?.name).toBe('Mon prêt');
    expect(loans[0]?.share).toBe(0.5);
    expect(loans[0]?.endDate).toBe('2018-08-05');
    db.close();
    void id;
  });

  it('crdAt is a lookup: principal before the first row, balance_after at/after a row, 0 at the end', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'x', share: 1 });
    expect(crdAt(db, id, '2018-05-01')).toBe(3000); // before first due date
    expect(crdAt(db, id, '2018-06-05')).toBe(2002.5); // on a due date
    expect(crdAt(db, id, '2018-07-20')).toBe(1004.17); // between rows
    expect(crdAt(db, id, '2030-01-01')).toBe(0); // after the end
    db.close();
  });

  it('computes card stats: next installment, interest this year, remaining cost', () => {
    const db = freshDb();
    saveLoan(db, { parsed: PARSED, name: 'x', share: 0.5 });
    const [loan] = listLoans(db, '2018-07-01');
    expect(loan?.crd).toBe(2002.5);
    expect(loan?.nextInstallment?.dueDate).toBe('2018-07-05');
    expect(loan?.remainingCost).toBe(2.5); // interest of installments 2 + 3 = 1.67 + 0.83
    expect(loan?.interestThisYear).toBe(5); // all three rows are in 2018
    expect(loan?.remainingInsurance).toBe(2); // insurance of installments 2 + 3 = 1 + 1
    expect(loan?.insuranceThisYear).toBe(3); // insurance of all three 2018 rows = 1 + 1 + 1
    db.close();
  });

  it('deletes a loan and cascades its installments', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'x', share: 0.5 });
    deleteLoan(db, id);
    expect(listLoans(db, '2018-07-01')).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) c FROM loan_installments').get()).toEqual({ c: 0 });
    db.close();
  });

  it('finds a loan by its bank number', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'Mon prêt', share: 0.5 });
    expect(findLoanByNumber(db, 'LN-TEST-1')).toEqual({ id, name: 'Mon prêt', share: 0.5 });
    expect(findLoanByNumber(db, 'unknown')).toBeNull();
    db.close();
  });

  it('replaceLoan keeps the id, swaps the schedule and updates the header', () => {
    const db = freshDb();
    const id = saveLoan(db, { parsed: PARSED, name: 'Mon prêt', share: 0.5 });
    // A reissued table: same loan number, fewer rows, a different remaining balance.
    const reissued: ParsedLoanTable = {
      ...PARSED,
      principal: 1500,
      installments: [
        {
          seq: 1,
          dueDate: '2020-01-05',
          capital: 700,
          interest: 0,
          insurance: 0,
          fees: 0,
          payment: 700,
          balanceAfter: 800,
        },
        {
          seq: 2,
          dueDate: '2020-02-05',
          capital: 800,
          interest: 0,
          insurance: 0,
          fees: 0,
          payment: 800,
          balanceAfter: 0,
        },
      ],
      totals: { capital: 1500, interest: 0, insurance: 0 },
    };
    const sameId = replaceLoan(db, id, { parsed: reissued, name: 'Mon prêt', share: 0.5 });
    expect(sameId).toBe(id);
    const loans = listLoans(db, '2020-01-10');
    expect(loans).toHaveLength(1); // replaced, not duplicated
    expect(loans[0]?.principal).toBe(1500);
    expect(crdAt(db, id, '2020-01-10')).toBe(800);
    expect(db.prepare('SELECT COUNT(*) c FROM loan_installments').get()).toEqual({ c: 2 });
    db.close();
  });
});

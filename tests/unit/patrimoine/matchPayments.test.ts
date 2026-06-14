import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import {
  matchLoanPayments,
  unlinkPayment,
  loanMatchCount,
} from '../../../src/main/patrimoine/matchPayments';
import type { ParsedLoanTable } from '@shared/types/patrimoine';

const PARSED: ParsedLoanTable = {
  name: 'P',
  loanNumber: 'LN1',
  principal: 2000,
  nominalRate: 1,
  termMonths: 2,
  startDate: '2026-01-01',
  totals: { capital: 2000, interest: 0, insurance: 0 },
  installments: [
    {
      seq: 1,
      dueDate: '2026-01-05',
      capital: 900,
      interest: 40,
      insurance: 8.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 1100,
    },
    {
      seq: 2,
      dueDate: '2026-02-05',
      capital: 905,
      interest: 35,
      insurance: 8.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 195,
    },
  ],
};

function tx(db: DatabaseSync, id: string, date: string, amount: number): void {
  db.prepare(
    "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES (?, 'acc-lcl-default', ?, ?, ?, 'PRET', 'PRET')",
  ).run(id, id, date, amount);
}

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  runMigrations(db);
  return db;
}

describe('matchLoanPayments', () => {
  it('links debits to installments by amount within the date window', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-06', -948.56); // 1 day after due → matches installment 1
    tx(db, 't2', '2026-02-04', -948.56); // 1 day before → matches installment 2
    tx(db, 't3', '2026-02-20', -50); // unrelated
    const linked = matchLoanPayments(db, loanId);
    expect(linked).toBe(2);
    expect(loanMatchCount(db, loanId, '2026-03-01')).toEqual({ matched: 2, due: 2 });
    db.close();
  });

  it('leaves a debit unmatched when outside the amount tolerance or date window', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-06', -900.0); // wrong amount
    tx(db, 't2', '2026-01-20', -948.56); // 15 days off → outside ±7
    expect(matchLoanPayments(db, loanId)).toBe(0);
    db.close();
  });

  it('is idempotent and one-to-one', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-05', -948.56);
    expect(matchLoanPayments(db, loanId)).toBe(1);
    expect(matchLoanPayments(db, loanId)).toBe(0); // already linked, no double
    db.close();
  });

  it('unlinks a payment', () => {
    const db = freshDb();
    const loanId = saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    tx(db, 't1', '2026-01-05', -948.56);
    matchLoanPayments(db, loanId);
    unlinkPayment(db, 't1');
    expect(loanMatchCount(db, loanId, '2026-03-01').matched).toBe(0);
    db.close();
  });
});

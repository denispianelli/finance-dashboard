// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { saveLoan } from '../../../src/main/patrimoine/loanRepo';
import { matchAllLoans } from '../../../src/main/patrimoine/matchPayments';
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
      capital: 900,
      interest: 40,
      insurance: 8.56,
      fees: 0,
      payment: 948.56,
      balanceAfter: 100,
    },
  ],
};

describe('matchAllLoans', () => {
  let db: DatabaseSync;

  afterEach(() => {
    db.close();
  });

  it('matches debits across every loan', () => {
    db = new DatabaseSync(':memory:');
    runMigrations(db);
    saveLoan(db, { parsed: PARSED, name: 'P', share: 1 });
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES ('m','acc-lcl-default','h','2026-01-05',-948.56,'PRET','PRET')",
    ).run();
    expect(matchAllLoans(db)).toBe(1);
  });
});

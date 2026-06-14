import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));

const {
  handlePatrimoineCreateLoan,
  handlePatrimoineListLoans,
  handlePatrimoineDeleteLoan,
  handlePatrimoineUpsertAsset,
  handlePatrimoineListAssets,
} = await import('../../../src/main/ipc/handlers/patrimoine');

beforeEach(() => {
  db.exec('DELETE FROM loans; DELETE FROM assets;');
});

describe('patrimoine handlers', () => {
  it('creates and lists a loan', () => {
    const { id } = handlePatrimoineCreateLoan({
      name: 'Prêt',
      share: 0.5,
      parsed: {
        name: 'Prêt',
        loanNumber: null,
        principal: 1000,
        nominalRate: 1,
        termMonths: 1,
        startDate: '2020-01-01',
        totals: { capital: 1000, interest: 0, insurance: 0 },
        installments: [
          {
            seq: 1,
            dueDate: '2020-02-01',
            capital: 1000,
            interest: 0,
            insurance: 0,
            fees: 0,
            payment: 1000,
            balanceAfter: 0,
          },
        ],
      },
    });
    expect(handlePatrimoineListLoans().loans).toHaveLength(1);
    handlePatrimoineDeleteLoan({ id });
    expect(handlePatrimoineListLoans().loans).toHaveLength(0);
  });

  it('upserts and lists an asset', () => {
    handlePatrimoineUpsertAsset({
      name: 'RP',
      kind: 'property',
      declaredValue: 300000,
      share: 0.5,
      valuedAt: '2026-06-14',
    });
    expect(handlePatrimoineListAssets().assets).toHaveLength(1);
  });
});

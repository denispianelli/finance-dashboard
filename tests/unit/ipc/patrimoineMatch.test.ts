import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';

const db = new DatabaseSync(':memory:');
runMigrations(db);
vi.mock('../../../src/main/db', () => ({ getDb: () => db }));
// The handler imports `electron` for `dialog`; mock it so this unit test never
// loads the real Electron binary (whose install flakes on the macOS CI runner).
vi.mock('electron', () => ({ dialog: { showOpenDialog: vi.fn() } }));

const { handlePatrimoineDetectPayments, handlePatrimoineUnlinkPayment } =
  await import('../../../src/main/ipc/handlers/patrimoine');
const { saveLoan } = await import('../../../src/main/patrimoine/loanRepo');

beforeEach(() => {
  db.exec('DELETE FROM transactions; DELETE FROM loans;');
});

describe('patrimoine match handlers', () => {
  it('detects and unlinks a loan payment', () => {
    const loanId = saveLoan(db, {
      name: 'P',
      share: 1,
      parsed: {
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
      },
    });
    db.prepare(
      "INSERT INTO transactions (id, account_id, tx_hash, date, amount, label_raw, label_clean) VALUES ('m','acc-lcl-default','h','2026-01-05',-948.56,'PRET','PRET')",
    ).run();
    expect(handlePatrimoineDetectPayments({ loanId }).matched).toBe(1);
    expect(handlePatrimoineUnlinkPayment({ transactionId: 'm' })).toEqual({ ok: true });
    expect(handlePatrimoineDetectPayments({ loanId }).matched).toBe(1); // re-detectable after unlink
    void loanId;
  });
});

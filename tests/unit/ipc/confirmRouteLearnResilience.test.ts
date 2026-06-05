import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../../src/main/db/migrate';
import { findAccountByIdentifier } from '../../../src/main/import/accountRoutes';

let testDb: DatabaseSync;
vi.mock('../../../src/main/db', () => ({ getDb: () => testDb }));

// Make route reading throw a non-ImportError runtime error to prove the
// handler still returns ok:true for an import whose rows were written.
vi.mock('../../../src/main/import/accountIdentifier', () => ({
  readIdentifier: vi.fn(() => {
    throw new Error('boom');
  }),
}));

const { handleImportConfirm } = await import('../../../src/main/ipc/handlers/importConfirm');

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260504<TRNAMT>2500.00<FITID>SAL<NAME>SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2500.00<DTASOF>20260504</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

function writeOfx(): string {
  const dir = mkdtempSync(join(tmpdir(), 'confirm-resilience-'));
  const p = join(dir, 'statement.ofx');
  writeFileSync(p, OFX);
  return p;
}

beforeEach(() => {
  testDb = new DatabaseSync(':memory:');
  runMigrations(testDb);
  testDb
    .prepare(
      "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-a','A','checking','lcl','EUR')",
    )
    .run();
});

describe('handleImportConfirm — route learning is best-effort', () => {
  it('still succeeds when readIdentifier throws (no route learned)', async () => {
    const res = await handleImportConfirm({
      path: writeOfx(),
      accountId: 'acc-a',
      acknowledgedCannotVerify: true,
    });
    expect(res.ok).toBe(true);
    // route learning was skipped because readIdentifier threw
    expect(findAccountByIdentifier(testDb, 'ofx:30002:00012345')).toBeNull();
  });
});

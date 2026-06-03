import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMigrations } from '../../../src/main/db/migrate';
import { learnAccountRoute } from '../../../src/main/import/accountRoutes';

let testDb: DatabaseSync;
vi.mock('../../../src/main/db', () => ({ getDb: () => testDb }));

const { handleImportResolveAccount } =
  await import('../../../src/main/ipc/handlers/importResolveAccount');

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
  const dir = mkdtempSync(join(tmpdir(), 'resolve-'));
  const p = join(dir, 'statement.ofx');
  writeFileSync(p, OFX);
  return p;
}

beforeEach(() => {
  testDb = new DatabaseSync(':memory:');
  runMigrations(testDb);
});

describe('handleImportResolveAccount', () => {
  it('returns identifier with no match when route is unknown', async () => {
    const res = await handleImportResolveAccount({ path: writeOfx() });
    expect(res).toEqual({
      ok: true,
      identifier: 'ofx:30002:00012345',
      matchedAccountId: null,
      sourceType: 'ofx',
      detectedBank: 'LCL',
    });
  });

  it('returns the matched account when a route exists', async () => {
    testDb
      .prepare(
        "INSERT INTO accounts (id, name, type, bank_id, currency) VALUES ('acc-a','A','checking','lcl','EUR')",
      )
      .run();
    learnAccountRoute(testDb, 'ofx:30002:00012345', 'acc-a');
    const res = await handleImportResolveAccount({ path: writeOfx() });
    expect(res).toMatchObject({ ok: true, matchedAccountId: 'acc-a' });
  });
});

import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../../src/main/db/migrate';
import { extractOfx } from '../../../../src/main/import/ofx/extractOfx';
import type { ImportError } from '../../../../src/main/import/importError';

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>1<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260203<TRNAMT>-10.00<FITID>F1<NAME>A</STMTTRN>
<STMTTRN><DTPOSTED>20260210<TRNAMT>20.00<FITID>F2<NAME>B</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>10.00<DTASOF>20260210</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('extractOfx', () => {
  it('produces a NormalizedStatement with date range and null opening balance', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const r = extractOfx(db, 'acc-lcl-default', Buffer.from(OFX));
    expect(r.bankId).toBe('lcl');
    expect(r.openingBalance).toBeNull();
    expect(r.closingBalance).toBe(10);
    expect(r.openingDate).toBe('2026-02-03');
    expect(r.closingDate).toBe('2026-02-10');
    expect(r.transactions).toEqual([
      { date: '2026-02-03', label: 'A', amount: -10, fitid: 'F1' },
      { date: '2026-02-10', label: 'B', amount: 20, fitid: 'F2' },
    ]);
    db.close();
  });

  it('throws unknown_bank when the account has no resolvable bank', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    let code: string | undefined;
    try {
      extractOfx(db, 'no-such-account', Buffer.from(OFX));
    } catch (e) {
      code = (e as ImportError).code;
    }
    expect(code).toBe('unknown_bank');
    db.close();
  });

  it('throws malformed_ofx on unparseable content', () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    let code: string | undefined;
    try {
      extractOfx(db, 'acc-lcl-default', Buffer.from('garbage'));
    } catch (e) {
      code = (e as ImportError).code;
    }
    expect(code).toBe('malformed_ofx');
    db.close();
  });
});

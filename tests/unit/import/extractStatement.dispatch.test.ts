import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';

const OFX = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>1</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260203<TRNAMT>-10.00<FITID>F1<NAME>A</STMTTRN>
<STMTTRN><DTPOSTED>20260210<TRNAMT>-10.00<FITID>F2<NAME>A</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>0<DTASOF>20260210</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('extractStatement dispatch', () => {
  it('extracts an OFX statement with fitid-based hashes', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    const r = await extractStatement(db, 'acc-lcl-default', Buffer.from(OFX));
    expect(r.transactions).toHaveLength(2);
    // Two same-day/same-amount/same-label tx stay distinct via distinct FITID:
    const tx0 = r.transactions[0];
    const tx1 = r.transactions[1];
    expect(tx0?.tx_hash).not.toBe(tx1?.tx_hash);
    expect(tx0?.fitid).toBe('F1');
    expect(r.newCount).toBe(2);
    expect(r.dateRangeStart).toBe('2026-02-03');
    expect(r.dateRangeEnd).toBe('2026-02-10');
    db.close();
  });

  it('throws unsupported_format for non-PDF non-OFX content', async () => {
    const db = new DatabaseSync(':memory:');
    runMigrations(db);
    await expect(
      extractStatement(db, 'acc-lcl-default', Buffer.from('plain text, no format')),
    ).rejects.toMatchObject({ name: 'ImportError', code: 'unsupported_format' });
    db.close();
  });
});

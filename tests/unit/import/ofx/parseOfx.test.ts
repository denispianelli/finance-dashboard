import { describe, it, expect } from 'vitest';
import { parseOfx } from '../../../../src/main/import/ofx/parseOfx';

const OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0<SEVERITY>INFO</STATUS>
<FI><ORG>LCL<FID>123</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260201<DTEND>20260516
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260203120000<TRNAMT>-42.50<FITID>F1<NAME>CB CAFE&amp;CO</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260205<TRNAMT>1500.00<FITID>F2<MEMO>VIREMENT SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>1457.50<DTASOF>20260516</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('parseOfx', () => {
  it('parses transactions, dates, amounts, label fallback and entities', () => {
    const r = parseOfx(Buffer.from(OFX));
    expect(r.org).toBe('LCL');
    expect(r.bankId).toBe('30002');
    expect(r.ledgerBalance).toBe(1457.5);
    expect(r.transactions).toEqual([
      { date: '2026-02-03', amount: -42.5, fitid: 'F1', label: 'CB CAFE&CO' },
      { date: '2026-02-05', amount: 1500, fitid: 'F2', label: 'VIREMENT SALAIRE' },
    ]);
  });

  it('throws on content with no STMTTRN', () => {
    expect(() => parseOfx(Buffer.from('<OFX></OFX>'))).toThrow();
  });

  it('handles comma decimal separators', () => {
    const ofx = OFX.replace('-42.50', '-42,50');
    const tx = parseOfx(Buffer.from(ofx)).transactions[0];
    expect(tx?.amount).toBe(-42.5);
  });

  it('decodes a cp1252 (OFX 1.x CHARSET:1252) label without mojibake', () => {
    // A real French OFX 1.x export: accented bytes in windows-1252
    // (É = 0xC9, € = 0x80 — the latter is not even representable in latin1).
    const header = Buffer.from(
      'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nENCODING:USASCII\nCHARSET:1252\n\n',
      'ascii',
    );
    const body = Buffer.concat([
      Buffer.from(
        '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>' +
          '<STMTTRN><DTPOSTED>20260203<TRNAMT>-9.90<FITID>F1<NAME>CAF',
        'ascii',
      ),
      Buffer.from([0xc9]), // É
      Buffer.from(' D', 'ascii'),
      Buffer.from([0xc9]), // É
      Buffer.from('J', 'ascii'),
      Buffer.from([0x80]), // €
      Buffer.from(
        'UNER</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
        'ascii',
      ),
    ]);
    const tx = parseOfx(Buffer.concat([header, body])).transactions[0];
    expect(tx?.label).toBe('CAFÉ DÉJ€UNER');
  });

  it('decodes a UTF-8 (OFX 2.x XML) label without mojibake', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="200" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260203<TRNAMT>-9.90<FITID>F1<NAME>CAFÉ DÉJEUNER €</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const tx = parseOfx(Buffer.from(xml, 'utf-8')).transactions[0];
    expect(tx?.label).toBe('CAFÉ DÉJEUNER €');
  });
});

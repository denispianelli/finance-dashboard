import { describe, it, expect } from 'vitest';
import { readIdentifier, extractIbanFromText } from '../../../src/main/import/accountIdentifier';

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260504<TRNAMT>2500.00<FITID>SAL<NAME>SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2500.00<DTASOF>20260504</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('extractIbanFromText', () => {
  it('finds and normalizes a spaced French IBAN', () => {
    expect(extractIbanFromText('Titulaire IBAN FR76 3000 6000 0112 3456 7890 189 RIB')).toBe(
      'FR7630006000011234567890189',
    );
  });
  it('returns null when no IBAN is present', () => {
    expect(extractIbanFromText('Relevé de compte — aucune référence ici')).toBeNull();
  });
  it('is idempotent on an already-stripped IBAN', () => {
    const once = extractIbanFromText('FR7630006000011234567890189');
    expect(extractIbanFromText(once ?? '')).toBe(once);
  });
});

describe('readIdentifier — OFX', () => {
  it('builds the ofx:<bankid>:<acctid> key and reads the org', async () => {
    const r = await readIdentifier(Buffer.from(OFX), 'statement.ofx');
    expect(r).toEqual({ identifier: 'ofx:30002:00012345', sourceType: 'ofx', detectedBank: 'LCL' });
  });
});

import { describe, it, expect } from 'vitest';
import { parseOfx } from '../../../../src/main/import/ofx/parseOfx';

const OFX = `<OFX>
<SIGNONMSGSRSV1><SONRS><FI><ORG>LCL</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>30002<ACCTID>00012345<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260504<TRNAMT>2500.00<FITID>SAL<NAME>SALAIRE</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>2500.00<DTASOF>20260504</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('parseOfx — account id', () => {
  it('captures ACCTID', () => {
    const parsed = parseOfx(Buffer.from(OFX));
    expect(parsed.acctId).toBe('00012345');
    expect(parsed.bankId).toBe('30002');
  });
});

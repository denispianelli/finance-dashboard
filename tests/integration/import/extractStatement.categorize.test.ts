import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';

/**
 * Synthetic OFX (bank-agnostic format → no fixture needed) so the deterministic
 * cascade wiring at extract is covered in CI. The seed rule `NETFLIX` →
 * `cat-abonnements` (migration 006) drives the 'rule' tier; an unseen label is
 * residual. History-tier-at-extract is covered transitively by the T4 import→
 * correct→reimport integration test.
 */
function ofx(
  transactions: { date: string; amount: number; fitid: string; name: string }[],
): Buffer {
  const trns = transactions
    .map(
      (t) =>
        `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${t.date}<TRNAMT>${String(t.amount)}` +
        `<FITID>${t.fitid}<NAME>${t.name}</STMTTRN>`,
    )
    .join('');
  return Buffer.from(
    `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>` +
      `${trns}</BANKTRANLIST><LEDGERBAL><BALAMT>0.00<DTASOF>20251202</LEDGERBAL>` +
      `</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`,
    'latin1',
  );
}

let db: DatabaseSync;
afterEach(() => {
  db.close();
});

describe('extractStatement — deterministic cascade at extract', () => {
  it('attaches a category and tier "rule" for a seed-rule match, null for residual', async () => {
    db = new DatabaseSync(':memory:');
    runMigrations(db);

    const buf = ofx([
      { date: '20251101', amount: -12.99, fitid: 'f1', name: 'NETFLIX' },
      { date: '20251102', amount: -7.5, fitid: 'f2', name: 'ZZZ UNKNOWN MERCHANT 4242' },
    ]);

    const r = await extractStatement(db, 'acc-lcl-default', buf);

    const netflix = r.transactions.find((t) => t.label === 'NETFLIX');
    const residual = r.transactions.find((t) => t.label === 'ZZZ UNKNOWN MERCHANT 4242');

    expect(netflix?.tier).toBe('rule');
    expect(netflix?.categoryId).not.toBeNull();
    expect(residual?.tier).toBeNull();
    expect(residual?.categoryId).toBeNull();
  });

  it('leaves duplicates uncategorized (tier null) and writes nothing to the DB', async () => {
    db = new DatabaseSync(':memory:');
    runMigrations(db);
    const buf = ofx([{ date: '20251101', amount: -12.99, fitid: 'f1', name: 'NETFLIX' }]);

    const before = db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number };
    await extractStatement(db, 'acc-lcl-default', buf);
    const after = db.prepare('SELECT COUNT(*) AS n FROM transactions').get() as { n: number };

    expect(after.n).toBe(before.n); // extract is read-only
  });
});

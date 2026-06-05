import { describe, it, expect, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations } from '../../../src/main/db/migrate';
import { extractStatement } from '../../../src/main/import/extractStatement';
import { insertStatement } from '../../../src/main/import/insertStatement';

/**
 * Fixture-free implicit-learning proof (synthetic OFX). Import statement A,
 * confirm with a `categories` override that categorizes an otherwise-residual
 * label (userModified:false — a non-user LLM/suggestion overlay). Re-extract a
 * NEW OFX with the SAME label and assert the deterministic cascade now resolves
 * that category via the history tier. Same label text in both files so the
 * normalized label_clean matches (normalizeLabel uppercases).
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

const RESIDUAL_LABEL = 'ZZZ UNKNOWN MERCHANT 4242';

let db: DatabaseSync;
afterEach(() => {
  db.close();
});

describe('insertStatement — implicit learning via validated overlay', () => {
  it('makes a confirmed residual category resolve via the history tier on re-import', async () => {
    db = new DatabaseSync(':memory:');
    runMigrations(db);

    // Statement A: a single residual transaction.
    const bufA = ofx([{ date: '20251101', amount: -7.5, fitid: 'a1', name: RESIDUAL_LABEL }]);

    const extractA = await extractStatement(db, 'acc-lcl-default', bufA);
    const residual = extractA.transactions.find((t) => t.label === RESIDUAL_LABEL);
    expect(residual?.tier).toBeNull();
    expect(residual?.categoryId).toBeNull();

    await insertStatement(db, 'acc-lcl-default', bufA, {
      acknowledgedCannotVerify: true,
      categories: [
        { tx_hash: residual?.tx_hash ?? '', categoryId: 'cat-loisirs', userModified: false },
      ],
    });

    const storedA = db
      .prepare('SELECT category_id, user_modified FROM transactions WHERE tx_hash = ?')
      .get(residual?.tx_hash ?? '') as { category_id: string | null; user_modified: number };
    expect(storedA.category_id).toBe('cat-loisirs');
    expect(storedA.user_modified).toBe(0);

    // Statement B: a brand-new file (different date/fitid → different tx_hash)
    // carrying the SAME label.
    const bufB = ofx([{ date: '20251205', amount: -9.0, fitid: 'b1', name: RESIDUAL_LABEL }]);
    const extractB = await extractStatement(db, 'acc-lcl-default', bufB);
    const seen = extractB.transactions.find((t) => t.label === RESIDUAL_LABEL);

    expect(seen?.tier).toBe('history');
    expect(seen?.categoryId).toBe('cat-loisirs');
  });
});

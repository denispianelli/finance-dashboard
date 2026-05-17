import type { DatabaseSync } from 'node:sqlite';
import type { ReviewTransaction, StatementExtraction } from '@shared/types/import';
import type { PdfPage } from './pdf/extract';
import { extractPdfText } from './pdf/extract';
import { extractTransactions } from './pdf/extractTransactions';
import { assignTxHashes } from './txHash';
import { verifyArithmetic } from './verifyArithmetic';
import { checkPeriodOverlap } from './periodOverlap';
import { hashFile } from './hashFile';
import { isAlreadyImported } from './duplicateCheck';
import { detectBank } from './detectBank';
import { ImportError } from './importError';

async function loadPages(content: Buffer): Promise<PdfPage[]> {
  let res: Awaited<ReturnType<typeof extractPdfText>>;
  try {
    res = await extractPdfText(content);
  } catch {
    throw new ImportError('not_pdf');
  }
  if (!res.hasText) throw new ImportError('no_text');
  return res.pages;
}

export async function extractStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
): Promise<StatementExtraction> {
  const fileHash = hashFile(content);
  const alreadyImported = isAlreadyImported(db, fileHash);

  const pages = await loadPages(content);

  const bank = detectBank(db, pages);
  if (bank === null) throw new ImportError('unknown_bank');

  const extracted = extractTransactions(pages, bank.mapping);
  const withHashes = assignTxHashes(accountId, extracted.transactions);
  const arithmetic = verifyArithmetic(
    extracted.transactions,
    extracted.openingBalance,
    extracted.closingBalance,
  );
  const periodOverlap = checkPeriodOverlap(
    db,
    accountId,
    extracted.openingDate,
    extracted.closingDate,
  );

  const existing = new Set(
    (
      db
        .prepare('SELECT tx_hash FROM transactions WHERE account_id = ?')
        .all(accountId) as unknown as { tx_hash: string }[]
    ).map((row) => row.tx_hash),
  );

  const transactions: ReviewTransaction[] = withHashes.map((t) => ({
    date: t.date,
    label: t.label,
    amount: t.amount,
    tx_hash: t.tx_hash,
    isDuplicate: existing.has(t.tx_hash),
  }));

  const duplicateCount = transactions.filter((t) => t.isDuplicate).length;
  const newCount = transactions.length - duplicateCount;

  return {
    transactions,
    arithmetic,
    periodOverlap,
    newCount,
    duplicateCount,
    fileHash,
    alreadyImported,
    dateRangeStart: extracted.openingDate,
    dateRangeEnd: extracted.closingDate,
  };
}

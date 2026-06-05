import type { DatabaseSync } from 'node:sqlite';
import type { ReviewTransaction, StatementExtraction } from '@shared/types/import';
import { detectType } from './detectType';
import { extractPdf } from './extractPdf';
import { extractOfx } from './ofx/extractOfx';
import { assignTxHashes } from './txHash';
import { verifyArithmetic } from './verifyArithmetic';
import { checkPeriodOverlap } from './periodOverlap';
import { hashFile } from './hashFile';
import { isAlreadyImported, findExistingHashes } from './duplicateCheck';
import { ImportError } from './importError';

export async function extractStatement(
  db: DatabaseSync,
  accountId: string,
  content: Buffer,
): Promise<StatementExtraction> {
  const fileHash = hashFile(content);
  const alreadyImported = isAlreadyImported(db, fileHash);

  const detectedType = detectType(content, '');
  if (detectedType !== 'pdf' && detectedType !== 'ofx') {
    throw new ImportError('unsupported_format');
  }
  const type = detectedType;
  const stmt =
    type === 'pdf' ? await extractPdf(db, accountId, content) : extractOfx(db, accountId, content);

  const withHashes = assignTxHashes(accountId, stmt.transactions);
  const arithmetic = verifyArithmetic(stmt.transactions, stmt.openingBalance, stmt.closingBalance);

  // The import's period is the span of the dates it actually carries, not the
  // statement's declared header period. A statement header opens on the prior
  // statement's closing date ("ancien solde au 30/04"), so consecutive monthly
  // statements always share that boundary date even though no transaction is
  // shared. Comparing transaction spans avoids that false "overlap" — adjacent
  // months don't touch; a genuine re-import of the same period still does.
  const txDates = stmt.transactions.map((t) => t.date).sort((a, b) => a.localeCompare(b));
  const dateRangeStart = txDates[0] ?? stmt.openingDate;
  const dateRangeEnd = txDates[txDates.length - 1] ?? stmt.closingDate;

  const periodOverlap = checkPeriodOverlap(db, accountId, dateRangeStart, dateRangeEnd);
  const existing = findExistingHashes(db, accountId);

  const transactions: ReviewTransaction[] = withHashes.map((t) => ({
    date: t.date,
    label: t.label,
    amount: t.amount,
    tx_hash: t.tx_hash,
    fitid: t.fitid,
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
    dateRangeStart,
    dateRangeEnd,
    sourceType: type,
  };
}

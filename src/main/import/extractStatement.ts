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
  const periodOverlap = checkPeriodOverlap(db, accountId, stmt.openingDate, stmt.closingDate);
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
    dateRangeStart: stmt.openingDate,
    dateRangeEnd: stmt.closingDate,
    // Anchor for the real account balance (ADR-014): the stated closing balance
    // and its as-of date (the statement's last transaction date). Null when the
    // source carries no usable balance, so the account simply does not anchor.
    closingBalance: stmt.closingBalance,
    closingBalanceDate: stmt.closingBalance === null ? null : stmt.closingDate,
    sourceType: type,
  };
}

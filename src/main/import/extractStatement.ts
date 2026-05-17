import type { DatabaseSync } from 'node:sqlite';
import type { ReviewTransaction, StatementExtraction } from '@shared/types/import';
import type { PdfPage } from './pdf/extract';
import { extractPdfText } from './pdf/extract';
import { extractTransactions } from './pdf/extractTransactions';
import { assignTxHashes } from './txHash';
import { verifyArithmetic } from './verifyArithmetic';
import { checkPeriodOverlap } from './periodOverlap';
import { hashFile } from './hashFile';
import { isAlreadyImported, findExistingHashes } from './duplicateCheck';
import { detectBank } from './detectBank';
import { ImportError } from './importError';

const PDF_MAGIC = Buffer.from('%PDF-');

async function loadPages(content: Buffer): Promise<PdfPage[]> {
  if (
    content.length < PDF_MAGIC.length ||
    !content.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)
  ) {
    throw new ImportError('not_pdf');
  }
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

  const existing = findExistingHashes(db, accountId);

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

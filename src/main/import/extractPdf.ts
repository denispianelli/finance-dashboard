import type { DatabaseSync } from 'node:sqlite';
import type { NormalizedStatement } from '@shared/types/import';
import type { PdfPage } from './pdf/extract';
import { extractPdfText } from './pdf/extract';
import { extractTransactions } from './pdf/extractTransactions';
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

export async function extractPdf(
  db: DatabaseSync,
  _accountId: string,
  content: Buffer,
): Promise<NormalizedStatement> {
  const pages = await loadPages(content);
  const bank = detectBank(db, pages);
  if (bank === null) throw new ImportError('unknown_bank');

  const extracted = extractTransactions(pages, bank.mapping);
  return {
    transactions: extracted.transactions.map((t) => ({
      date: t.date,
      label: t.label,
      amount: t.amount,
      fitid: null,
    })),
    openingBalance: extracted.openingBalance,
    closingBalance: extracted.closingBalance,
    openingDate: extracted.openingDate,
    closingDate: extracted.closingDate,
    bankId: bank.bankId,
  };
}

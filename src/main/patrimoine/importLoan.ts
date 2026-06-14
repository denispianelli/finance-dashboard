import type { ParseLoanResponse } from '@shared/types/patrimoine';
import { extractPdfText } from '../import/pdf/extract';
import { pageToLines } from './pdfLines';
import { parseLclAmortization } from './parseLclAmortization';

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

export async function importLoanFromPdf(buffer: Buffer): Promise<ParseLoanResponse> {
  if (!isPdf(buffer)) return { ok: false, error: 'not_pdf' };
  const { pages, hasText } = await extractPdfText(buffer);
  if (!hasText) return { ok: false, error: 'no_text' };
  const lines = pages.flatMap(pageToLines);
  try {
    return { ok: true, parsed: parseLclAmortization(lines) };
  } catch {
    return { ok: false, error: 'unrecognized_format' };
  }
}

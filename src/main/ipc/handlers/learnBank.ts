import type { LearnBankInput, LearnBankResponse } from '@shared/types/bank';
import { getDb } from '../../db';
import { extractPdfText } from '../../import/pdf/extract';
import { inferColumnOrder } from '../../import/pdf/inferColumns';
import { learnBankMapping, persistLearnedBank, slugifyBank } from '../../import/pdf/learnBank';
import { readImportFile } from '../../import/readImportFile';
import { getModel, isModelAvailable } from '../../llm/llm';
import { modelsDir } from '../../llm/modelsDir';

const PDF_MAGIC = Buffer.from('%PDF-');

/**
 * Learn an unknown bank's column mapping from a sample PDF (option A: one slow
 * background pass; subsequent imports of that bank are deterministic).
 */
export async function handleBanksLearn(payload: LearnBankInput): Promise<LearnBankResponse> {
  const dir = modelsDir();
  if (!isModelAvailable(dir)) return { ok: false, error: 'model_unavailable' };

  let buffer: Buffer;
  try {
    buffer = readImportFile(payload.path);
  } catch {
    // Disallowed extension / non-file (only a malicious renderer reaches here):
    // learning accepts PDFs only, so surface the existing not_pdf code.
    return { ok: false, error: 'not_pdf' };
  }
  if (buffer.length < PDF_MAGIC.length || !buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return { ok: false, error: 'not_pdf' };
  }

  let pages;
  try {
    const res = await extractPdfText(buffer);
    if (!res.hasText) return { ok: false, error: 'no_text' };
    pages = res.pages;
  } catch {
    return { ok: false, error: 'not_pdf' };
  }

  const model = await getModel(dir);
  const mapping = await learnBankMapping(pages, (text) => inferColumnOrder(model, text));
  if (mapping === null) return { ok: false, error: 'inference_failed' };

  const bankId = slugifyBank(payload.bankName);
  persistLearnedBank(getDb(), {
    bankId,
    name: payload.bankName,
    signature: payload.bankName,
    mapping,
  });
  return { ok: true, bankId };
}

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import type { LearnBankInput, LearnBankResponse } from '@shared/types/bank';
import { getDb } from '../../db';
import { extractPdfText } from '../../import/pdf/extract';
import { inferColumnOrder } from '../../import/pdf/inferColumns';
import { learnBankMapping, persistLearnedBank, slugifyBank } from '../../import/pdf/learnBank';
import { getModel, isModelAvailable, MODEL_FILE } from '../../llm/llm';

const PDF_MAGIC = Buffer.from('%PDF-');

/** Where the GGUF model lives: the repo's models/ in dev, else userData/models. */
function modelsDir(): string {
  const devDir = join(process.cwd(), 'models');
  if (existsSync(join(devDir, MODEL_FILE))) return devDir;
  return join(app.getPath('userData'), 'models');
}

/**
 * Learn an unknown bank's column mapping from a sample PDF (option A: one slow
 * background pass; subsequent imports of that bank are deterministic).
 */
export async function handleBanksLearn(payload: LearnBankInput): Promise<LearnBankResponse> {
  const dir = modelsDir();
  if (!isModelAvailable(dir)) return { ok: false, error: 'model_unavailable' };

  const buffer = readFileSync(payload.path);
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

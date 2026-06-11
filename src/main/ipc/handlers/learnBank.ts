import type {
  LearnBankInput,
  LearnBankResponse,
  PrepareMappingInput,
  PrepareMappingResponse,
} from '@shared/types/bank';
import { getDb } from '../../db';
import { extractPdfText } from '../../import/pdf/extract';
import type { PdfPage } from '../../import/pdf/extract';
import { suggestColumnOrder, validateColumnOrder } from '../../import/pdf/suggestColumns';
import { learnBankMapping, persistLearnedBank, slugifyBank } from '../../import/pdf/learnBank';
import { readImportFile } from '../../import/readImportFile';

const PDF_MAGIC = Buffer.from('%PDF-');

type PdfGuardResult = { ok: true; pages: PdfPage[] } | { ok: false; error: 'not_pdf' | 'no_text' };

/** Shared file guards: allowlisted path, %PDF magic, extractible text. */
async function loadPdfPages(path: string): Promise<PdfGuardResult> {
  let buffer: Buffer;
  try {
    buffer = readImportFile(path);
  } catch {
    return { ok: false, error: 'not_pdf' };
  }
  if (buffer.length < PDF_MAGIC.length || !buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return { ok: false, error: 'not_pdf' };
  }
  try {
    const res = await extractPdfText(buffer);
    if (!res.hasText) return { ok: false, error: 'no_text' };
    return { ok: true, pages: res.pages };
  } catch {
    return { ok: false, error: 'not_pdf' };
  }
}

/** Deterministic pre-fill for the mapping assistant (ADR-019 1b — no LLM). */
export async function handleBanksPrepareMapping(
  payload: PrepareMappingInput,
): Promise<PrepareMappingResponse> {
  const guard = await loadPdfPages(payload.path);
  if (!guard.ok) return guard;
  const suggestion = suggestColumnOrder(guard.pages);
  return {
    ok: true,
    suggested: suggestion?.order ?? null,
    headerTokens: suggestion?.headerTokens ?? [],
  };
}

/**
 * Persist an unknown bank from the user-confirmed column order. Fully
 * deterministic; subsequent imports of that bank are recognized via the stored
 * mapping. A wrong-but-derivable order is caught downstream by the arithmetic
 * check on the review screen.
 */
export async function handleBanksLearn(payload: LearnBankInput): Promise<LearnBankResponse> {
  const guard = await loadPdfPages(payload.path);
  if (!guard.ok) return guard;

  if (!validateColumnOrder(payload.order)) return { ok: false, error: 'invalid_mapping' };
  const mapping = learnBankMapping(guard.pages, payload.order);
  if (mapping === null) return { ok: false, error: 'invalid_mapping' };

  const bankId = slugifyBank(payload.bankName);
  persistLearnedBank(getDb(), {
    bankId,
    name: payload.bankName,
    signature: payload.bankName,
    mapping,
  });
  return { ok: true, bankId };
}
